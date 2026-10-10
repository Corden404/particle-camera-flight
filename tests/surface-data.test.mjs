import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { decodeLegacySurfaceData } from './fixtures/legacy-surface-data.mjs';

const generator = await import('../scripts/align-stage-points.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

const api = await import('../src/particles/surface-data.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const raw = readFileSync(new URL('../public/scene/surface-points.bin', import.meta.url));
const legacy = decodeLegacySurfaceData(raw);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytesOf = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const RAW_SHA256 = 'e79ceb9e226d124b757c352628476cdc8f1860815581c39608de05fada1a2b01';
// Normalize line endings only so the frozen source check also works on CI.
const LEGACY_FUNCTIONS_SHA256 = '2c7f0ef3172508dfe0b03e761bb2d4468529b3a8024fe1f113842772d28fa1a0';
const GOLDEN_ATTRIBUTES = Object.freeze({
  position: '28a4a5793a86c3e1cdbcd2db4aae0f626219aaf7386d2d43572140a6a96ca250',
  aPose1: 'a5d452d48f3ce56bb45492e05f523c8247f1f9d8cf9107fac57691c65e5eca88',
  aPose2: '1696032b0d41b47a15e5275ccb976e93f7466033f68f1e1e4082a083677d1830',
  aPose3: '2d9fdb2ac74b9ba29c8f8a28bcfb298c4a6d1fa0c4e43828f01c29640ddcf121',
  aShade0: '062d648c779ccf15c04663c48cc00c846f9c564a3bb28f4ccbcc250915fc92b1',
  aShade1: '49fa5aecc8a31df0cfdb39377b0e395e5aec3afc83210db1737491b7b124ba53',
  aShade2: '855e3cb6e61a90b0def406890766d4c0305636cdc90c500382515a3828dda590',
  aShade3: '57c38a72f6d77aba9d828b03bd49984a58b58ab12d4061616fb8bb183c5c4211',
  aEdges: '166d63e2f58350d4d1e74181c0c7c301d3aa794e1cad1e4a39a9d0b68d179525',
  aRandom: '9311cf9d21fa9fca52a6e4764f85c84b6cf85b293fcc078a4cebb01e0fbb2a4e',
});
const GOLDEN_CENTERS = [
  [14.000369548797607, -0.000044345855712890625, -7.99954080581665],
  [27.99992561340332, 0.000036597251892089844, -20.00000286102295],
  [42, 0.0020812153816223145, -31.998770713806152],
  [55.99904251098633, -0.0005118846893310547, -44.00012969970703],
];
const GOLDEN_SPANS = [
  [5.1987504959106445, 5.014505386352539, 1.7832155227661133],
  [5.999847412109375, 5.605019807815552, 5.983617782592773],
  [4.2312164306640625, 3.3651756048202515, 5.983743667602539],
  [5.997962951660156, 4.678104400634766, 5.996269226074219],
];
function namedArrays(attrs) {
  return {
    position: attrs.positions[0], aPose1: attrs.positions[1],
    aPose2: attrs.positions[2], aPose3: attrs.positions[3],
    aShade0: attrs.shades[0], aShade1: attrs.shades[1],
    aShade2: attrs.shades[2], aShade3: attrs.shades[3],
    aEdges: attrs.edges, aRandom: attrs.misc,
  };
}
function available() {
  assert.equal(typeof api.decodeSurfaceData, 'function', 'STG1/STG2 surface parser is implemented');
  assert.equal(typeof api.encodeAlignedSurfaceData, 'function', 'offline STG2 encoder is implemented');
}
function compareAttributes(actual, expected) {
  const reference = namedArrays(expected);
  for (const [name, array] of Object.entries(namedArrays(actual))) {
    assert.deepEqual(bytesOf(array), bytesOf(reference[name]), name + ' must be byte-identical');
  }
}
function makeTiedPoints() {
  const count = 2000;
  const data = Buffer.alloc(16 + 4 * count * 17);
  data.write('STG1'); data.writeUInt32LE(4, 4);
  data.writeUInt32LE(count, 8); data.writeUInt32LE(17, 12);
  for (let stage = 0; stage < 4; stage++) {
    for (let i = 0; i < count; i++) {
      const offset = 16 + (stage * count + i) * 17;
      // Repeated coordinates force stable Morton ties; Y has zero span.
      data.writeFloatLE(stage * 7 + (i % 7) / 4, offset);
      data.writeFloatLE(stage - 2, offset + 4);
      data.writeFloatLE((i % 13) / 8, offset + 8);
      data.writeInt8(i % 255 - 127, offset + 12);
      data.writeInt8((i * 3) % 255 - 127, offset + 13);
      data.writeInt8((i * 7) % 255 - 127, offset + 14);
      data.writeUInt8(i % 256, offset + 15);
      data.writeUInt8([0, 209, 255][i % 3], offset + 16);
    }
  }
  return data;
}

test('the frozen pre-optimization algorithm and approved raw asset match their gold standards', () => {
  const text = readFileSync(new URL('./fixtures/legacy-surface-data.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const functions = text.split('// BEGIN LEGACY FUNCTIONS\n')[1].split('// END LEGACY FUNCTIONS')[0];
  assert.equal(hash(functions), LEGACY_FUNCTIONS_SHA256);
  assert.equal(hash(raw), RAW_SHA256);
  assert.equal(legacy.count, 36000);
  for (const [name, array] of Object.entries(namedArrays(legacy.attrs))) {
    assert.equal(hash(bytesOf(array)), GOLDEN_ATTRIBUTES[name], name);
  }
  assert.deepEqual(legacy.centers, GOLDEN_CENTERS);
  assert.deepEqual(legacy.spans, GOLDEN_SPANS);
});

test('legacy STG1 decoding retains every original GPU attribute byte', () => {
  available();
  const decoded = api.decodeSurfaceData(raw);
  assert.equal(decoded.count, legacy.count);
  compareAttributes(decoded.attrs, legacy.attrs);
  assert.deepEqual(decoded.centers, legacy.centers);
  assert.deepEqual(decoded.spans, legacy.spans);
});

test('offline alignment creates deterministic STG2 records without changing the source bytes', () => {
  available();
  const aligned = Buffer.from(api.encodeAlignedSurfaceData(raw));
  assert.equal(aligned.subarray(0, 4).toString('ascii'), 'STG2');
  assert.equal(aligned.readUInt32LE(4), 4);
  assert.equal(aligned.readUInt32LE(8), 36000);
  assert.equal(aligned.readUInt32LE(12), 17);
  assert.equal(aligned.length, raw.length);
  assert.deepEqual(aligned, Buffer.from(api.encodeAlignedSurfaceData(raw)));
  assert.equal(hash(raw), RAW_SHA256, 'encoding must not mutate its STG1 input');
});

test('STG2 decoding matches the independently frozen ten GPU attributes and random sequence', () => {
  available();
  const decoded = api.decodeSurfaceData(api.encodeAlignedSurfaceData(raw));
  compareAttributes(decoded.attrs, legacy.attrs);
  for (const [name, array] of Object.entries(namedArrays(decoded.attrs))) {
    assert.equal(hash(bytesOf(array)), GOLDEN_ATTRIBUTES[name], name);
  }
});

test('prealignment preserves the original model centers and bounding spans exactly', () => {
  available();
  const decoded = api.decodeSurfaceData(api.encodeAlignedSurfaceData(raw));
  assert.equal(decoded.count, 36000);
  assert.deepEqual(decoded.centers, GOLDEN_CENTERS);
  assert.deepEqual(decoded.spans, GOLDEN_SPANS);
});

test('High and Eco stable/living draw subsets keep the same per-particle correspondence', () => {
  available();
  const actual = namedArrays(api.decodeSurfaceData(api.encodeAlignedSurfaceData(raw)).attrs);
  const expected = namedArrays(legacy.attrs);
  const stable = Math.floor(legacy.count * 0.84);
  for (const ratio of [1, 0.70]) {
    for (const [start, count] of [[0, Math.floor(stable * ratio)],
      [stable, Math.floor((legacy.count - stable) * ratio)]]) {
      for (const name of Object.keys(actual)) {
        const width = actual[name].length / legacy.count;
        assert.deepEqual(bytesOf(actual[name].subarray(start * width, (start + count) * width)),
          bytesOf(expected[name].subarray(start * width, (start + count) * width)),
          name + ' at ratio ' + ratio + ' and start ' + start);
      }
    }
  }
});

test('STG1 and STG2 reject unsupported versions, headers, counts, strides and exact-size mismatches', () => {
  available();
  for (const version of ['STG1', 'STG2']) {
    const source = Buffer.from(raw); source.write(version);
    for (const bad of [Buffer.alloc(0), source.subarray(0, 15),
      source.subarray(0, source.length - 1), Buffer.concat([source, Buffer.alloc(1)])]) {
      assert.throws(() => api.decodeSurfaceData(bad), /header|data/i);
    }
    for (const [groups, count, stride] of [[3, 36000, 17], [4, 1999, 17],
      [4, 60001, 17], [4, 36000, 16]]) {
      // Matching payload lengths isolate each header constraint from the size check.
      const bad = Buffer.alloc(16 + groups * count * stride);
      bad.write(version); bad.writeUInt32LE(groups, 4);
      bad.writeUInt32LE(count, 8); bad.writeUInt32LE(stride, 12);
      assert.throws(() => api.decodeSurfaceData(bad), /data/i);
    }
  }
  const badVersion = Buffer.from(raw); badVersion.write('STG9');
  assert.throws(() => api.decodeSurfaceData(badVersion), /header/i);
});

test('both formats reject a non-finite coordinate before exposing GPU arrays', () => {
  available();
  for (const version of ['STG1', 'STG2']) {
    for (const value of [NaN, Infinity, -Infinity]) {
      for (let axis = 0; axis < 3; axis++) {
        const bad = Buffer.from(raw); bad.write(version);
        bad.writeFloatLE(value, 16 + ((3 * 36000 + 35999) * 17) + axis * 4);
        assert.throws(() => api.decodeSurfaceData(bad), /non-finite/i);
      }
    }
  }
});

test('alignment rejects an already aligned input instead of permuting it again', () => {
  available();
  const aligned = api.encodeAlignedSurfaceData(raw);
  assert.throws(() => api.encodeAlignedSurfaceData(aligned), /STG1|legacy/i);
});

test('typed-array byte offsets are respected without reading adjacent bytes', () => {
  available();
  const aligned = Buffer.from(api.encodeAlignedSurfaceData(raw));
  const padded = Buffer.concat([Buffer.alloc(23, 0xa5), aligned, Buffer.alloc(19, 0x5a)]);
  const input = new Uint8Array(padded.buffer, padded.byteOffset + 23, aligned.length);
  compareAttributes(api.decodeSurfaceData(input).attrs, legacy.attrs);
  assert.ok(padded.subarray(0, 23).every(value => value === 0xa5));
  assert.ok(padded.subarray(padded.length - 19).every(value => value === 0x5a));
});

test('the generator refuses to replace its raw source file', t => {
  assert.equal(typeof generator.writeAlignedSurfaceFile, 'function', 'independent aligned asset generator is implemented');
  const directory = mkdtempSync(join(tmpdir(), 'leeq-surface-data-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'surface-points.bin');
  // A failed guard must never turn this negative test into a write to the golden asset.
  writeFileSync(source, raw);
  assert.throws(() => generator.writeAlignedSurfaceFile(source, source), /different|source/i);
  assert.equal(hash(readFileSync(source)), RAW_SHA256);
});

test('the checked-in STG2 asset is reproducible from the unchanged approved source', () => {
  available();
  const target = new URL('../public/scene/surface-points-aligned.bin', import.meta.url);
  assert.ok(existsSync(target), 'the standalone generator produces the separate STG2 asset');
  const shipped = readFileSync(target);
  assert.deepEqual(shipped, Buffer.from(api.encodeAlignedSurfaceData(raw)));
  compareAttributes(api.decodeSurfaceData(shipped).attrs, legacy.attrs);
});

test('Morton ties and zero-span axes retain the original stable sorting order', () => {
  available();
  const source = makeTiedPoints();
  const reference = decodeLegacySurfaceData(source);
  const decoded = api.decodeSurfaceData(api.encodeAlignedSurfaceData(source));
  compareAttributes(decoded.attrs, reference.attrs);
  assert.deepEqual(decoded.centers, reference.centers);
  assert.deepEqual(decoded.spans, reference.spans);
});
