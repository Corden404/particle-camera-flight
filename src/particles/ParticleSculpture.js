import * as THREE from 'three';
import vertexShader from './vertex.glsl?raw';
import fragmentShader from './fragment.glsl?raw';

const BIN_PATH = './particles/sculptures.bin';

function decodePose(view, offset, count, scale) {
  const position = new Float32Array(count * 3);
  const normalTone = new Float32Array(count * 4);
  for (let i = 0; i < count * 3; i++) {
    position[i] = view.getInt16(offset + i * 2, true) / 32767 * scale;
  }
  offset += count * 6;
  for (let i = 0; i < count; i++) {
    normalTone[i * 4] = view.getInt8(offset + i * 3) / 127;
    normalTone[i * 4 + 1] = view.getInt8(offset + i * 3 + 1) / 127;
    normalTone[i * 4 + 2] = view.getInt8(offset + i * 3 + 2) / 127;
  }
  offset += count * 3;
  for (let i = 0; i < count; i++) normalTone[i * 4 + 3] = view.getUint8(offset + i) / 255;
  offset += count;
  return { position, normalTone, nextOffset: offset };
}

export function parseParticleBinary(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 16) throw Error('Particle file is incomplete');
  if (String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'PCL2') throw Error('Unsupported particle file version');
  const count = view.getUint32(4, true), poses = view.getUint32(8, true), scale = view.getFloat32(12, true);
  if (poses !== 4 || count < 2000 || count > 150000 || !Number.isFinite(scale) || scale <= 0) throw Error('Invalid particle metadata');
  if (view.byteLength !== 16 + count * 10 * poses) throw Error('Particle data size does not match header');
  const samples = [];
  let offset = 16;
  for (let i = 0; i < poses; i++) {
    const pose = decodePose(view, offset, count, scale);
    samples.push(pose);
    offset = pose.nextOffset;
  }
  return { count, samples };
}

export async function loadParticleSculpture(renderer) {
  const response = await fetch(BIN_PATH);
  if (!response.ok) throw Error('Failed to fetch particle sculpture (' + response.status + ')');
  const { count, samples } = parseParticleBinary(await response.arrayBuffer());
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(samples[0].position, 3));
  for (let i = 1; i < 4; i++) geometry.setAttribute('aPose' + i, new THREE.BufferAttribute(samples[i].position, 3));
  for (let i = 0; i < 4; i++) geometry.setAttribute('aShade' + i, new THREE.BufferAttribute(samples[i].normalTone, 4));

  const misc = new Float32Array(count * 2);
  let seed = 318041;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  for (let i = 0; i < count; i++) {
    misc[i * 2] = random();
    misc[i * 2 + 1] = random();
  }
  geometry.setAttribute('aMisc', new THREE.BufferAttribute(misc, 2));

  const uniforms = {
    uTime: { value: 0 },
    uStory: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uMouse: { value: new THREE.Vector2(-10, -10) },
    uMotion: { value: 1 },
    uTrail: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  // A second low-opacity, spatially displaced cloud adds visible particle streamlines.
  const trailUniforms = { ...uniforms, uTrail: { value: 1 } };
  const trailMaterial = new THREE.ShaderMaterial({
    uniforms: trailUniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const trails = new THREE.Points(geometry, trailMaterial);
  trails.frustumCulled = false;
  const rig = new THREE.Group();
  rig.add(trails, points);

  function setQuality(low) {
    geometry.setDrawRange(0, low ? Math.round(count * 0.60) : count);
    uniforms.uPixelRatio.value = renderer.getPixelRatio();
    trails.visible = !low;
  }
  return {
    rig,
    uniforms,
    count,
    setQuality,
    dispose() { geometry.dispose(); material.dispose(); trailMaterial.dispose(); },
  };
}
