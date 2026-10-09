import * as THREE from 'three';
import vertexShader from './sculpture-morph.vert.glsl?raw';
import fragmentShader from './sculpture.frag.glsl?raw';
import pointerField from './pointer-field.glsl?raw';
import { createInteractionUniforms, updateInteractionUniforms } from './ParticleInteraction.js';
import { sampleChapterPalette, sampleLegEnvelope, viewportModelScale } from './art-direction.js';

// Four separately approved models, encoded as independently sampled surfaces.
// Runtime correspondence is spatially sorted per model and then equally shuffled.
// No original mesh or GLB is ever downloaded or rendered.
const ROOTS = 4;
const STRIDE = 16;

function randomGenerator() {
  let state = 0xC0FFEE;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function decodeSurfaces(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 16 ||
    String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'STG1') {
    throw Error('Unknown particle asset header');
  }
  const groupCount = view.getUint32(4, true);
  const count = view.getUint32(8, true);
  const stride = view.getUint32(12, true);
  if (groupCount !== ROOTS || count < 2000 || count > 60000 ||
    stride !== STRIDE || view.byteLength !== 16 + count * groupCount * stride) {
    throw Error('Invalid approved sculpture point data');
  }

  const poses = [];
  for (let stage = 0; stage < ROOTS; stage++) {
    const position = new Float32Array(count * 3);
    const shade = new Float32Array(count * 4);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let index = 0; index < count; index++) {
      const offset = 16 + (stage * count + index) * stride;
      const px = view.getFloat32(offset, true);
      const py = view.getFloat32(offset + 4, true);
      const pz = view.getFloat32(offset + 8, true);
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
        throw Error('Non-finite geometry');
      }
      const p = index * 3;
      const s = index * 4;
      position[p] = px; position[p + 1] = py; position[p + 2] = pz;
      minX = Math.min(minX, px); minY = Math.min(minY, py); minZ = Math.min(minZ, pz);
      maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); maxZ = Math.max(maxZ, pz);
      shade[s] = view.getInt8(offset + 12) / 127;
      shade[s + 1] = view.getInt8(offset + 13) / 127;
      shade[s + 2] = view.getInt8(offset + 14) / 127;
      // A continuous material/structure code, not an integer part identifier.
      shade[s + 3] = view.getUint8(offset + 15) / 255;
    }
    const center = new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    const span = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);
    poses.push({ position, shade, center, span });
  }
  return { poses, count };
}

function part1By2(value) {
  let n = value & 1023;
  n = (n | n << 16) & 0x30000ff;
  n = (n | n << 8) & 0x300f00f;
  n = (n | n << 4) & 0x30c30c3;
  n = (n | n << 2) & 0x9249249;
  return n;
}

function mortonSortOrder(pose, count) {
  const keys = new Uint32Array(count);
  const {position, center, span} = pose;
  function normalize(x, axis) {
    const c = center.getComponent(axis);
    const half = span.getComponent(axis) * 0.5;
    const normalized = ((x - c) / Math.max(0.01, half) + 1.0) * 0.5;
    return Math.min(1023, Math.max(0, Math.floor(normalized * 1023)));
  }
  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const x = normalize(position[base], 0);
    const y = normalize(position[base + 1], 1);
    const z = normalize(position[base + 2], 2);
    keys[i] = ((part1By2(x) << 2) | (part1By2(y) << 1) | part1By2(z)) >>> 0;
  }
  const order = Array.from({ length: count }, (_, i) => i);
  order.sort((a, b) => keys[a] - keys[b]);
  return order;
}

function buildAlignedAttributes(decoded) {
  const {poses, count} = decoded;
  const stageOrders = poses.map(p => mortonSortOrder(p, count));
  const permutation = Array.from({length: count}, (_, i) => i);
  const random = randomGenerator();
  // Same pseudo-random permutation across every pose keeps ECO uniformly dense.
  for (let i = permutation.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }
  const positions = poses.map(() => new Float32Array(count * 3));
  const shades = poses.map(() => new Float32Array(count * 4));
  const misc = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const rank = permutation[i];
    for (let stage = 0; stage < ROOTS; stage++) {
      const sourceIndex = stageOrders[stage][rank];
      const sourcePose = poses[stage];
      const sourcePosition = sourceIndex * 3;
      const targetPosition = i * 3;
      const sourceShade = sourceIndex * 4;
      const targetShade = i * 4;
      for (let axis = 0; axis < 3; axis++) {
        positions[stage][targetPosition + axis] = sourcePose.position[sourcePosition + axis];
        shades[stage][targetShade + axis] = sourcePose.shade[sourceShade + axis];
      }
      shades[stage][targetShade + 3] = sourcePose.shade[sourceShade + 3];
    }
    misc[i * 2] = random();
    misc[i * 2 + 1] = random();
  }
  return { positions, shades, misc };
}

export async function createMorphSculpture(renderer) {
  const response = await fetch('./scene/surface-points.bin');
  if (!response.ok) throw Error('Missing baked particle models');
  const decoded = decodeSurfaces(await response.arrayBuffer());
  const { count, poses } = decoded;
  const attrs = buildAlignedAttributes(decoded);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(attrs.positions[0], 3));
  for (let stage = 1; stage < ROOTS; stage++) {
    geometry.setAttribute('aPose' + stage, new THREE.BufferAttribute(attrs.positions[stage], 3));
  }
  for (let stage = 0; stage < ROOTS; stage++) {
    geometry.setAttribute('aShade' + stage, new THREE.BufferAttribute(attrs.shades[stage], 4));
  }
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(attrs.misc, 2));

  const art = sampleLegEnvelope(0, 0);
  const palette = sampleChapterPalette(0);
  const uniforms = {
    ...createInteractionUniforms(),
    uTime: { value: 0 },
    uStory: { value: 0 },
    uMotion: { value: 1 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uModelScale: { value: viewportModelScale(0) },
    uViewportHeight: { value: renderer.domElement.clientHeight || 900 },
    uTransit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uTiming: { value: new THREE.Vector3(art.travelStart, art.travelEnd, art.stagger) },
    uStream: { value: new THREE.Vector3() },
    uChapterPalette: { value: new THREE.Vector3(palette.cool, palette.warm, palette.lilac) },
    uFlightFocus: { value: new THREE.Vector3() },
    uFlightForward: { value: new THREE.Vector3(0, 0, -1) },
    uCenter0: { value: poses[0].center.clone() },
    uCenter1: { value: poses[1].center.clone() },
    uCenter2: { value: poses[2].center.clone() },
    uCenter3: { value: poses[3].center.clone() }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertexShader.replace('#include <particle_interaction>', pointerField),
    fragmentShader, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Single continuous GPU scatter-and-reassemble particle sculpture';
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'One morphing sculpture; no solid mesh';
  group.add(points);

  const forward = new THREE.Vector3();
  return {
    group,
    count,
    morphing: true,
    setViewportScale(weight) { uniforms.uModelScale.value = viewportModelScale(weight); },
    update(time, story, moving, camera, interaction) {
      const currentStory = Number.isFinite(story) ? Math.min(3, Math.max(0, story)) : 0;
      const leg = Math.min(2, Math.floor(currentStory));
      sampleLegEnvelope(leg, currentStory - leg, art);
      sampleChapterPalette(currentStory, palette);
      uniforms.uTime.value = moving && Number.isFinite(time) ? time : 0;
      uniforms.uStory.value = currentStory;
      uniforms.uMotion.value = moving ? 1 : 0;
      uniforms.uViewportHeight.value = renderer.domElement.clientHeight || 900;
      uniforms.uTransit.value.set(art.scatter, art.swirl, art.focus, art.transit);
      uniforms.uTiming.value.set(art.travelStart, art.travelEnd, art.stagger);
      uniforms.uStream.value.set(art.bend, art.lift, art.lane);
      uniforms.uChapterPalette.value.set(palette.cool, palette.warm, palette.lilac);
      updateInteractionUniforms(uniforms, moving ? interaction : null, camera);
      if (camera) {
        // Guide the dissolving cloud through the camera's actual field of view;
        // these are still world-space particles, not a flat screen overlay.
        forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        uniforms.uFlightFocus.value.copy(camera.position).addScaledVector(forward, 12.0);
        uniforms.uFlightForward.value.copy(forward);
      }
    },
    quality(low) {
      geometry.setDrawRange(0, low ? Math.floor(count * 0.70) : count);
      uniforms.uPixelRatio.value = renderer.getPixelRatio();
    },
    dispose() { geometry.dispose(); material.dispose(); }
  };
}
