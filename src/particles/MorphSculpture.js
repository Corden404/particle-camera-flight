import * as THREE from 'three';
import vertexShader from './sculpture-morph.vert.glsl?raw';
import fragmentShader from './sculpture.frag.glsl?raw';
import pointerField from './pointer-field.glsl?raw';
import { createInteractionUniforms, updateInteractionUniforms } from './ParticleInteraction.js';
import { sampleChapterPalette, sampleLegEnvelope, viewportModelScale } from './art-direction.js';
import { decodeSurfaceData, SURFACE_GROUP_COUNT as ROOTS } from './surface-data.js';

// Four approved models remain pure particles. STG2 stores the exact original
// Morton + seeded correspondence so startup only expands the packed records.
export async function createMorphSculpture(renderer, { signal } = {}) {
  const response = await fetch('./scene/surface-points-aligned.bin', { signal });
  if (!response.ok) throw Error('Missing baked particle models');
  const { count, centers, attrs } = decodeSurfaceData(await response.arrayBuffer());

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(attrs.positions[0], 3));
  for (let stage = 1; stage < ROOTS; stage++) {
    geometry.setAttribute('aPose' + stage, new THREE.BufferAttribute(attrs.positions[stage], 3));
  }
  for (let stage = 0; stage < ROOTS; stage++) {
    geometry.setAttribute('aShade' + stage, new THREE.BufferAttribute(attrs.shades[stage], 4));
  }
  geometry.setAttribute('aEdges', new THREE.BufferAttribute(attrs.edges, ROOTS));
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(attrs.misc, 2));

  const art = sampleLegEnvelope(0, 0);
  const palette = sampleChapterPalette(0);
  const makeUniforms = layer => ({
    ...createInteractionUniforms(),
    uLayer: { value: layer },
    uTime: { value: 0 },
    uStory: { value: 0 },
    uMotion: { value: 1 },
    uModelControls: { value: new THREE.Vector4(1, 1, 1, 1) },
    uTwinkleIntensity: { value: 1 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uModelScale: { value: viewportModelScale(0) },
    uViewportHeight: { value: renderer.domElement.clientHeight || 900 },
    uTransit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uTiming: { value: new THREE.Vector3(art.travelStart, art.travelEnd, art.stagger) },
    uStream: { value: new THREE.Vector3() },
    uChapterPalette: { value: new THREE.Vector3(palette.cool, palette.warm, palette.lilac) },
    uFlightFocus: { value: new THREE.Vector3() },
    uFlightForward: { value: new THREE.Vector3(0, 0, -1) },
    uCenter0: { value: new THREE.Vector3(...centers[0]) },
    uCenter1: { value: new THREE.Vector3(...centers[1]) },
    uCenter2: { value: new THREE.Vector3(...centers[2]) },
    uCenter3: { value: new THREE.Vector3(...centers[3]) }
  });
  const stableUniforms = makeUniforms(0);
  const livingUniforms = makeUniforms(1);
  const uniformSets = [stableUniforms, livingUniforms];

  // Reuse the original pose attributes for both particle passes. No solid mesh:
  // 84% of the sampled geometry forms an opaque, depth-tested dotted shell.
  // The separate 16% sparkling grains never punch holes through its outline.
  const stableCount = Math.floor(count * 0.84);
  geometry.setDrawRange(0, stableCount);
  const livingGeometry = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    livingGeometry.setAttribute(name, geometry.getAttribute(name));
  }
  livingGeometry.setDrawRange(stableCount, count - stableCount);
  const sharedVertexShader = vertexShader.replace('#include <particle_interaction>', pointerField);
  const stableMaterial = new THREE.ShaderMaterial({
    uniforms: stableUniforms, vertexShader: sharedVertexShader, fragmentShader,
    transparent: false, depthTest: true, depthWrite: true,
    alphaToCoverage: true, toneMapped: false
  });
  const livingMaterial = new THREE.ShaderMaterial({
    uniforms: livingUniforms, vertexShader: sharedVertexShader, fragmentShader,
    transparent: true, depthTest: true, depthWrite: false,
    blending: THREE.NormalBlending, toneMapped: false
  });
  const stablePoints = new THREE.Points(geometry, stableMaterial);
  const livingPoints = new THREE.Points(livingGeometry, livingMaterial);
  stablePoints.renderOrder = 1;
  livingPoints.renderOrder = 2;
  stablePoints.frustumCulled = livingPoints.frustumCulled = false;
  stablePoints.name = 'Stable depth-writing recognizable particle shell';
  livingPoints.name = 'Responsive surface grains, color waves and sparkle';
  const group = new THREE.Group();
  group.name = 'Two pure point-cloud passes; no solid model mesh';
  group.add(stablePoints, livingPoints);

  const forward = new THREE.Vector3();  return {
    group,
    count,
    morphing: true,
    setViewportScale(weight) {
      for (const uniforms of uniformSets) uniforms.uModelScale.value = viewportModelScale(weight);
    },
    update(time, story, moving, camera, interaction, settings) {
      const currentStory = Number.isFinite(story) ? Math.min(3, Math.max(0, story)) : 0;
      const leg = Math.min(2, Math.floor(currentStory));
      sampleLegEnvelope(leg, currentStory - leg, art);
      sampleChapterPalette(currentStory, palette);
      if (camera) {
        forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
      }
      for (const uniforms of uniformSets) {
        uniforms.uTime.value = moving && Number.isFinite(time) ? time : 0;
        uniforms.uStory.value = currentStory;
        uniforms.uMotion.value = moving ? 1 : 0;
        uniforms.uViewportHeight.value = renderer.domElement.clientHeight || 900;
        uniforms.uTransit.value.set(art.scatter * (settings?.scatter ?? 1),
          art.swirl, art.focus, art.transit);
        uniforms.uModelControls.value.set(settings?.modelSaturation ?? 1,
          settings?.modelBrightness ?? 1, settings?.modelSize ?? 1,
          settings?.modelMotion ?? 1);
        uniforms.uTwinkleIntensity.value = settings?.modelTwinkle ?? 1;
        uniforms.uTiming.value.set(art.travelStart, art.travelEnd, art.stagger);
        uniforms.uStream.value.set(art.bend, art.lift, art.lane);
        uniforms.uChapterPalette.value.set(palette.cool, palette.warm, palette.lilac);
        updateInteractionUniforms(uniforms, moving ? interaction : null, camera, settings);
        if (camera) {
          // Camera-flight positions remain authored; these parameters only
          // modulate the particle motion inside the scene.
          uniforms.uFlightFocus.value.copy(camera.position).addScaledVector(forward, 12.0);
          uniforms.uFlightForward.value.copy(forward);
        }
      }
    },
    quality(low) {
      const ratio = low ? 0.70 : 1;
      geometry.setDrawRange(0, Math.floor(stableCount * ratio));
      livingGeometry.setDrawRange(stableCount, Math.floor((count - stableCount) * ratio));
      for (const uniforms of uniformSets) uniforms.uPixelRatio.value = renderer.getPixelRatio();
    },
    dispose() {
      geometry.dispose();
      livingGeometry.dispose();
      stableMaterial.dispose();
      livingMaterial.dispose();
    }
  };
}