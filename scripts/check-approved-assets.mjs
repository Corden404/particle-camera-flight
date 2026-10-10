import fs from 'node:fs';
import assert from 'node:assert/strict';
import { decodeSurfaceData, encodeAlignedSurfaceData } from '../src/particles/surface-data.js';
const points=fs.readFileSync('public/scene/surface-points.bin');
assert.equal(points.subarray(0,4).toString('ascii'),'STG1');
const groups=points.readUInt32LE(4), count=points.readUInt32LE(8), stride=points.readUInt32LE(12);
assert.equal(groups,4);
assert.equal(stride,17,'edge strength byte follows regional tone');
assert.ok(count>3000&&count<=60000);
assert.equal(points.length,16+groups*count*stride);
let edgePoints=0;
for(let i=0;i<groups*count;i++){
  const offset=16+i*stride;
  if(i%43===0)for(let j=0;j<3;j++)assert.ok(Number.isFinite(points.readFloatLE(offset+j*4)));
  const edge=points.readUInt8(offset+16);
  assert.ok(edge===0 || edge===209 || edge===255,'only surface / border / crease flags are valid');
  if(edge>0)edgePoints++;
}
assert.ok(edgePoints>count*groups*0.15,'baked edges must survive serialization');
assert.ok(!fs.existsSync('public/scene/approved-models.glb'),'No solid geometry should be shipped to the browser');
assert.ok(fs.readFileSync('public/scene/ASSET_CREDITS.txt','utf8').includes('NASA'));
console.log('PASS', groups, 'public model groups;', count, 'surface points per model;', (points.length/1048576).toFixed(2), 'MiB points');

// The derived STG2 file is shipped separately; the STG1 source stays intact.
const aligned = fs.readFileSync('public/scene/surface-points-aligned.bin');
assert.equal(aligned.subarray(0, 4).toString('ascii'), 'STG2');
assert.equal(aligned.length, points.length);
assert.deepEqual(aligned, Buffer.from(encodeAlignedSurfaceData(points)),
  'aligned records must be reproducible from the approved STG1 source');
const legacyData = decodeSurfaceData(points), alignedData = decodeSurfaceData(aligned);
assert.equal(alignedData.count, count);
assert.deepEqual(alignedData.centers, legacyData.centers);
assert.deepEqual(alignedData.spans, legacyData.spans);
const gpuArrays = data => [
  ...data.attrs.positions, ...data.attrs.shades, data.attrs.edges, data.attrs.misc,
];
const expectedArrays = gpuArrays(legacyData);
gpuArrays(alignedData).forEach((array, index) => {
  const expected = expectedArrays[index];
  assert.deepEqual(Buffer.from(array.buffer, array.byteOffset, array.byteLength),
    Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength),
    'aligned GPU attribute ' + index + ' must remain byte-identical');
});
console.log('PASS aligned STG2 records; all 10 GPU attributes and model bounds unchanged');

// The original GLB is intentionally ignored and absent on GitHub Actions.
// Always validate the shipped derivative data; verify source geometry too
// when the approved offline asset is available on a development machine.
const offlineSource = 'reference/generated-camera-source/approved-models.glb';
if (fs.existsSync(offlineSource)) {
  const buffer = fs.readFileSync(offlineSource);
  assert.equal(buffer.subarray(0,4).toString('ascii'),'glTF');
  assert.equal(buffer.readUInt32LE(4),2);
  assert.equal(buffer.readUInt32LE(8),buffer.length);
  const json = JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));
  const rootNames = json.scenes[0].nodes.map(i=>json.nodes[i].name);
  assert.deepEqual(rootNames,['Model_Root_Sculpture','Model_Root_Dish70M','Model_Root_Curiosity','Model_Root_Apollo_Lm']);
  assert.equal(json.meshes.length,137);
  assert.ok(!json.images&&!json.textures&&!json.animations,'Compact GLB should not ship source textures/unused animations');
  console.log('PASS approved offline geometry:', json.meshes.length, 'meshes;', (buffer.length/1048576).toFixed(2), 'MiB excluded from deployment');
} else {
  console.log('SKIP optional offline GLB inspection (private source not included in checkout)');
}
