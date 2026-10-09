import fs from 'node:fs';
import assert from 'node:assert/strict';
const points=fs.readFileSync('public/scene/surface-points.bin');
assert.equal(points.subarray(0,4).toString('ascii'),'STG1');
const groups=points.readUInt32LE(4), count=points.readUInt32LE(8), stride=points.readUInt32LE(12);
assert.equal(groups,4);
assert.equal(stride,16);
assert.ok(count>3000&&count<=60000);
assert.equal(points.length,16+groups*count*stride);
for(let i=0;i<groups*count;i+=43){
  const offset=16+i*stride;
  for(let j=0;j<3;j++)assert.ok(Number.isFinite(points.readFloatLE(offset+j*4)));
}
assert.ok(!fs.existsSync('public/scene/approved-models.glb'),'No solid geometry should be shipped to the browser');
const buffer=fs.readFileSync('reference/generated-camera-source/approved-models.glb');
assert.equal(buffer.subarray(0,4).toString('ascii'),'glTF');
assert.equal(buffer.readUInt32LE(4),2);
assert.equal(buffer.readUInt32LE(8),buffer.length);
const json=JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));
const rootNames=json.scenes[0].nodes.map(i=>json.nodes[i].name);
assert.deepEqual(rootNames,['Model_Root_Sculpture','Model_Root_Dish70M','Model_Root_Curiosity','Model_Root_Apollo_Lm']);
assert.equal(json.meshes.length,137);
assert.ok(!json.images&&!json.textures&&!json.animations,'Compact GLB should not ship source textures/unused animations');
assert.ok(fs.readFileSync('public/scene/ASSET_CREDITS.txt','utf8').includes('NASA'));
console.log('PASS 4 approved model groups:',json.meshes.length,'meshes;',count,'surface points per model;', (points.length/1048576).toFixed(2),'MiB points');
console.log('Offline mesh only:',(buffer.length/1048576).toFixed(2),'MiB, excluded from public deployment');
