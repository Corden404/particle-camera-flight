// STG1: original independently sampled poses. STG2: the same 17-byte
// records in the approved Morton + seeded permutation order. Both formats
// retain Float32 positions and every original normal/tone/edge byte.
export const SURFACE_GROUP_COUNT = 4;
const STRIDE = 17;
const HEADER_BYTES = 16;

function randomGenerator() {
  let state = 0xC0FFEE;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function readPackedSurface(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) :
    ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
  if (!bytes) throw new TypeError('Surface data must be an ArrayBuffer or typed array');
  if (bytes.byteLength < HEADER_BYTES) throw Error('Unknown particle asset header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = String.fromCharCode(...bytes.subarray(0, 4));
  if (format !== 'STG1' && format !== 'STG2') throw Error('Unknown particle asset header');
  const groups = view.getUint32(4, true);
  const count = view.getUint32(8, true);
  const stride = view.getUint32(12, true);
  if (groups !== SURFACE_GROUP_COUNT || count < 2000 || count > 60000 ||
      stride !== STRIDE || bytes.byteLength !== HEADER_BYTES + groups * count * stride) {
    throw Error('Invalid approved sculpture point data');
  }

  const positions = Array.from({ length: groups }, () => new Float32Array(count * 3));
  const shades = Array.from({ length: groups }, () => new Float32Array(count * 4));
  const edges = new Float32Array(count * groups);
  const centers = [], spans = [];
  for (let stage = 0; stage < groups; stage++) {
    const position = positions[stage], shade = shades[stage];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const offset = HEADER_BYTES + (stage * count + i) * stride;
      const x = view.getFloat32(offset, true);
      const y = view.getFloat32(offset + 4, true);
      const z = view.getFloat32(offset + 8, true);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw Error('Non-finite geometry');
      }
      const p = i * 3, s = i * 4;
      position[p] = x; position[p + 1] = y; position[p + 2] = z;
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
      shade[s] = view.getInt8(offset + 12) / 127;
      shade[s + 1] = view.getInt8(offset + 13) / 127;
      shade[s + 2] = view.getInt8(offset + 14) / 127;
      shade[s + 3] = view.getUint8(offset + 15) / 255;
      edges[i * groups + stage] = view.getUint8(offset + 16) / 255;
    }
    centers.push([(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5]);
    spans.push([maxX - minX, maxY - minY, maxZ - minZ]);
  }
  return { bytes, format, count, centers, spans, attrs: { positions, shades, edges } };
}

function part1By2(value) {
  let n = value & 1023;
  n = (n | n << 16) & 0x30000ff;
  n = (n | n << 8) & 0x300f00f;
  n = (n | n << 4) & 0x30c30c3;
  n = (n | n << 2) & 0x9249249;
  return n;
}

function mortonSortOrder(position, center, span, count) {
  const keys = new Uint32Array(count);
  function normalize(x, axis) {
    const half = span[axis] * 0.5;
    const normalized = ((x - center[axis]) / Math.max(0.01, half) + 1.0) * 0.5;
    return Math.min(1023, Math.max(0, Math.floor(normalized * 1023)));
  }
  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const x = normalize(position[p], 0);
    const y = normalize(position[p + 1], 1);
    const z = normalize(position[p + 2], 2);
    keys[i] = ((part1By2(x) << 2) | (part1By2(y) << 1) | part1By2(z)) >>> 0;
  }
  // Stable ties are part of the approved particle correspondence.
  const order = Array.from({ length: count }, (_, i) => i);
  order.sort((a, b) => keys[a] - keys[b]);
  return order;
}

function alignmentOrder(data, random) {
  const { count, attrs, centers, spans } = data;
  const stageOrders = attrs.positions.map((position, stage) =>
    mortonSortOrder(position, centers[stage], spans[stage], count));
  const permutation = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }
  return { stageOrders, permutation };
}

function alignAttributes(data, order) {
  const { count, attrs } = data;
  const positions = attrs.positions.map(() => new Float32Array(count * 3));
  const shades = attrs.shades.map(() => new Float32Array(count * 4));
  const edges = new Float32Array(count * SURFACE_GROUP_COUNT);
  for (let i = 0; i < count; i++) {
    const rank = order.permutation[i];
    for (let stage = 0; stage < SURFACE_GROUP_COUNT; stage++) {
      const source = order.stageOrders[stage][rank];
      for (let axis = 0; axis < 3; axis++) {
        positions[stage][i * 3 + axis] = attrs.positions[stage][source * 3 + axis];
        shades[stage][i * 4 + axis] = attrs.shades[stage][source * 4 + axis];
      }
      shades[stage][i * 4 + 3] = attrs.shades[stage][source * 4 + 3];
      edges[i * SURFACE_GROUP_COUNT + stage] = attrs.edges[source * SURFACE_GROUP_COUNT + stage];
    }
  }
  return { positions, shades, edges };
}

export function decodeSurfaceData(input) {
  const data = readPackedSurface(input);
  const random = randomGenerator();
  let attrs = data.attrs;
  if (data.format === 'STG1') {
    attrs = alignAttributes(data, alignmentOrder(data, random));
  } else {
    // STG2 has already consumed the same Fisher-Yates ordering offline.
    // Preserve its PRNG state so sparkle and the High/Eco subsets stay exact.
    for (let i = data.count - 1; i > 0; i--) random();
  }
  attrs.misc = new Float32Array(data.count * 2);
  for (let i = 0; i < attrs.misc.length; i++) attrs.misc[i] = random();
  return { count: data.count, centers: data.centers, spans: data.spans, attrs };
}

export function encodeAlignedSurfaceData(input) {
  const data = readPackedSurface(input);
  if (data.format !== 'STG1') throw Error('Alignment requires legacy STG1 source data');
  const { stageOrders, permutation } = alignmentOrder(data, randomGenerator());
  const output = new Uint8Array(data.bytes.byteLength);
  output.set(data.bytes.subarray(0, HEADER_BYTES));
  output[3] = '2'.charCodeAt(0);
  for (let stage = 0; stage < SURFACE_GROUP_COUNT; stage++) {
    for (let i = 0; i < data.count; i++) {
      const source = HEADER_BYTES + (stage * data.count + stageOrders[stage][permutation[i]]) * STRIDE;
      const target = HEADER_BYTES + (stage * data.count + i) * STRIDE;
      // Copy packed records verbatim; never re-quantize an approved value.
      output.set(data.bytes.subarray(source, source + STRIDE), target);
    }
  }
  return output;
}
