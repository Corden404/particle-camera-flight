import * as THREE from 'three';

// Frozen reference from MorphSculpture.js at c232445.
// Keep independent of the optimized parser; its function source and outputs
// are pinned by tests/surface-data.test.mjs.
// BEGIN LEGACY FUNCTIONS
const ROOTS = 4;
const STRIDE = 17;

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
    const edge = new Float32Array(count);
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
      edge[index] = view.getUint8(offset + 16) / 255;
    }
    const center = new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    const span = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);
    poses.push({ position, shade, edge, center, span });
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
  // Pack all four chapter-specific edge strengths into one GPU attribute.
  const edges = new Float32Array(count * ROOTS);
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
      edges[i * ROOTS + stage] = sourcePose.edge[sourceIndex];
    }
    misc[i * 2] = random();
    misc[i * 2 + 1] = random();
  }
  return { positions, shades, edges, misc };
}

// END LEGACY FUNCTIONS

export function decodeLegacySurfaceData(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) :
    new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const decoded = decodeSurfaces(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return {
    count: decoded.count,
    centers: decoded.poses.map(pose => pose.center.toArray()),
    spans: decoded.poses.map(pose => pose.span.toArray()),
    attrs: buildAlignedAttributes(decoded),
  };
}
