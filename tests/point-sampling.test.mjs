import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Matrix4 } from 'three';
const api = await import('../scripts/point-sampling.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const triangle = (scale = 1) => ({
  points: new Float32Array([0,0,0, scale,0,0, 0,scale,0]),
  ids: new Uint32Array([0,1,2]),
  normals: new Float32Array([0,0,1, 0,1,1, 1,0,1]),
  region: 'neutral panel',
});
const available = () => assert.equal(typeof api.prepareSurfaceParts, 'function', 'structure-aware sampler is implemented');
test('sampling is deterministic and returns the exact requested count', () => {
  available();
  const parts = api.prepareSurfaceParts([triangle()]);
  const a = api.sampleSurfaceParts(parts, 257, 91);
  assert.deepEqual(a, api.sampleSurfaceParts(parts, 257, 91));
  assert.equal(a.length, 257);
  assert.notDeepEqual(a, api.sampleSurfaceParts(parts, 257, 92));
});
test('low discrepancy barycentric samples stay inside triangles with unit normals', () => {
  available();
  const samples = api.sampleSurfaceParts(api.prepareSurfaceParts([triangle()]), 400, 8);
  for (const sample of samples) {
    assert.ok(sample.position.every(Number.isFinite));
    assert.ok(sample.barycentric.every(x => x >= 0 && x <= 1));
    assert.ok(Math.abs(sample.barycentric.reduce((a,b) => a+b,0)-1) < 1e-12);
    assert.ok(Math.abs(Math.hypot(...sample.normal)-1) < 1e-12);
    assert.ok(sample.position[0]>=0 && sample.position[1]>=0 && sample.position[0]+sample.position[1]<=1+1e-7);
  }
  assert.ok(samples.some(s => s.normal[0] > .1 && s.normal[1] > .1), 'interpolates smooth vertex normals');
});
test('part importance is positive finite and tiny parts have capped density', () => {
  available();
  const large = triangle(10), small = triangle(.02);
  small.points = Float32Array.from(small.points, (x,i) => x + (i%3===0 ? 20 : 0));
  small.region = 'small rod';
  const parts = api.prepareSurfaceParts([large,small]);
  assert.equal(parts.length,2);
  for(const p of parts) {
    assert.ok(p.area>0 && Number.isFinite(p.weight));
    assert.ok(p.weight/p.area>=1 && p.weight/p.area<=6+1e-12);
  }
  assert.ok(parts[1].weight/parts[1].area > parts[0].weight/parts[0].area);
  const samples = api.sampleSurfaceParts(parts, 1000, 1);
  assert.equal(samples.length,1000);
  assert.ok(samples.filter(s=>s.position[0]>15).length<10, 'tiny detail cannot displace the body');
});
test('welded topology retains disconnected structures and joins duplicated seams', () => {
  available();
  const geometry = {points:Float32Array.from([0,0,0, 1,0,0, 0,1,0, 1,0,0, 1,1,0, 0,1,0, 3,0,0, 4,0,0, 3,1,0]),ids:Uint32Array.from([0,1,2,3,4,5,6,7,8]),region:'joined panel'};
  const parts=api.prepareSurfaceParts([geometry]);
  assert.equal(parts.length,2);
  assert.equal(parts[0].triangles.length,2);
  assert.equal(parts[1].triangles.length,1);
});
test('zero area faces are ignored and empty geometry fails explicitly', () => {
  available();
  const zero = triangle(0);
  const parts = api.prepareSurfaceParts([zero,triangle()]);
  assert.equal(parts.length,1);
  assert.equal(api.sampleSurfaceParts(parts,30,7).length,30);
  assert.throws(()=>api.sampleSurfaceParts(api.prepareSurfaceParts([zero]),30,7),/surface/i);
});
test('regional tones are bounded, stable and varied on neutral single material geometry', () => {
  available();
  const samples=api.sampleSurfaceParts(api.prepareSurfaceParts([triangle()]),300,7);
  assert.ok(samples.every(s => Number.isInteger(s.tone) && s.tone>=32 && s.tone<=220));
  assert.ok(new Set(samples.map(s=>s.tone)).size>5);
  const gold=triangle(); gold.region='Champagne-gold inlay';
  const dark=triangle(); dark.region='Recessed graphite hairline';
  assert.ok(api.sampleSurfaceParts(api.prepareSurfaceParts([gold]),10,1).every(s=>s.tone>=190));
  assert.ok(api.sampleSurfaceParts(api.prepareSurfaceParts([dark]),10,1).every(s=>s.tone<70));
});
test('normal transforms use the inverse transpose under nonuniform scaling', () => {
  available();
  const input=Float32Array.from([Math.SQRT1_2,Math.SQRT1_2,0]);
  const normals=api.transformVertexNormals(input,new Matrix4().makeScale(2,1,.5));
  const expected=[1/Math.sqrt(5),2/Math.sqrt(5),0];
  normals.forEach((n,i)=>assert.ok(Math.abs(n-expected[i])<1e-7));
});
test('missing and invalid vertex normals fall back to finite unit face normals', () => {
  available();
  for (const normals of [undefined,new Float32Array(9)]) {
    const geometry=triangle(); geometry.normals=normals;
    const samples=api.sampleSurfaceParts(api.prepareSurfaceParts([geometry]),25,3);
    samples.forEach(s=>assert.deepEqual(s.normal,[0,0,1]));
  }
});
test('very tiny positive surfaces retain finite capped weight without inventing area', () => {
  available();
  const parts=api.prepareSurfaceParts([triangle(),triangle(1e-10)]);
  assert.equal(parts.length,2);
  assert.ok(parts[1].area>0 && parts[1].area<1e-19);
  assert.ok(Number.isFinite(parts[1].weight) && parts[1].weight/parts[1].area<=6);
});
test('duplicated hard edge vertices retain their authored face normals', () => {
  available();
  const geometry={
    points:Float32Array.from([0,0,0, 1,0,0, 0,1,0, 0,0,0, 0,1,0, 0,0,1]),
    ids:Uint32Array.from([0,1,2,3,4,5]),
    normals:Float32Array.from([0,0,1, 0,0,1, 0,0,1, 1,0,0, 1,0,0, 1,0,0]),
    region:'two hard faces',
  };
  const samples=api.sampleSurfaceParts(api.prepareSurfaceParts([geometry]),100,2);
  assert.ok(samples.some(s=>s.normal[0]===1));
  assert.ok(samples.some(s=>s.normal[2]===1));
  assert.ok(samples.every(s=>s.normal[0]===1 || s.normal[2]===1));
});
test('visible disconnected structural parts keep point coverage without flooding subpixel fragments', () => {
  const body=triangle(10);
  const strut=triangle(0.5);
  strut.points=Float32Array.from(strut.points,(x,i)=>x+(i%3===0?15:0));
  strut.region='visible support strut';
  const micro=triangle(0.00001);
  micro.points=Float32Array.from(micro.points,(x,i)=>x+(i%3===0?17:0));
  micro.region='subpixel bolt';
  const samples=api.sampleSurfaceParts(api.prepareSurfaceParts([body,strut,micro]),1000,87);
  assert.equal(samples.length,1000);
  const strutCount=samples.filter(p=>p.position[0]>14.9 && p.position[0]<16).length;
  const microCount=samples.filter(p=>p.position[0]>16.9).length;
  assert.ok(strutCount>=12,'structural piece receives a reserved minimum');
  assert.ok(microCount<=5,'tiny pieces do not crowd out the body');
});
test('true seams and creases are explicitly sampled but triangulation diagonals are not', () => {
  const geometry={
    points:Float32Array.from([0,0,0, 1,0,0, 0,1,0, 0,0,0, 0,1,0, 0,0,1]),
    ids:Uint32Array.from([0,1,2,3,4,5]),
    normals:Float32Array.from([0,0,1, 0,0,1, 0,0,1, 1,0,0, 1,0,0, 1,0,0]),
    region:'crease panels'
  };
  const parts=api.prepareSurfaceParts([geometry]);
  assert.equal(parts.length,1);
  assert.equal(parts[0].featureEdges.length,5,'4 open borders and 1 shared hard edge');
  assert.ok(parts[0].featureEdges.some(edge=>edge.faces===2 && edge.minDot<0.1));
  const samples=api.sampleSurfaceParts(parts,1000,4);
  const crease=samples.filter(s=>s.position[0]===0 && s.position[2]===0);
  assert.ok(crease.length>=20,'the real 90-degree crease receives stable contour points');
});
test('edge flags distinguish crease/border points from interior with stable coverage', () => {
  const points=api.sampleSurfaceParts(api.prepareSurfaceParts([triangle()]),1000,28);
  assert.equal(points.filter(p=>p.edge===0.82).length,320,'boundary samples use 32% budget');
  assert.equal(points.filter(p=>p.edge===0).length,680,'interior samples remain well represented');
  const folded={
    points:Float32Array.from([0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,1]),
    ids:Uint32Array.from([0,1,2,3,4,5]),
    region:'crease fold'
  };
  const foldedSamples=api.sampleSurfaceParts(api.prepareSurfaceParts([folded]),1000,29);
  assert.ok(foldedSamples.some(p=>p.edge===1),'sharp creases retain a distinct flag');
  assert.ok(foldedSamples.some(p=>p.edge===0.82),'true open boundaries retain a distinct flag');
  assert.ok(foldedSamples.some(p=>p.edge===0),'face interiors remain visible');
});
test('shipped points preserve all four source bounds and valid quantized normals', () => {
  const binary=readFileSync(new URL('../public/scene/surface-points.bin',import.meta.url));
  const bounds=JSON.parse(readFileSync(new URL('../public/scene/model-bounds.json',import.meta.url),'utf8'));
  assert.equal(binary.toString('ascii',0,4),'STG1');
  assert.equal(binary.readUInt32LE(4),4);
  assert.equal(binary.readUInt32LE(8),36000);
  assert.equal(binary.readUInt32LE(12),17);
  assert.equal(binary.length,16+4*36000*17);
  Object.values(bounds).forEach((source,group)=>{
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],tones=new Set(),edges=new Set();
    let edgeCount=0;
    for(let index=0;index<36000;index++) {
      const offset=16+(group*36000+index)*17;
      for(let axis=0;axis<3;axis++) {
        const value=binary.readFloatLE(offset+axis*4);
        assert.ok(Number.isFinite(value));
        assert.ok(value>=source.min[axis]-1e-5 && value<=source.max[axis]+1e-5,'point stays inside source bounds');
        min[axis]=Math.min(min[axis],value); max[axis]=Math.max(max[axis],value);
      }
      const length=Math.hypot(binary.readInt8(offset+12)/127,binary.readInt8(offset+13)/127,binary.readInt8(offset+14)/127);
      assert.ok(length>.99 && length<1.01,'quantized normal stays normalized');
      const tone=binary[offset+15]; tones.add(tone);
      assert.ok(tone>=32 && tone<=220);
      const edge=binary[offset+16]; edges.add(edge);
      assert.ok([0,209,255].includes(edge),'valid edge intensity');
      if(edge>0)edgeCount++;
    }
    for(let axis=0;axis<3;axis++) {
      assert.ok(Math.abs(min[axis]-source.min[axis])<source.maxDimension*.005,'sample reaches the source silhouette minimum');
      assert.ok(Math.abs(max[axis]-source.max[axis])<source.maxDimension*.005,'sample reaches the source silhouette maximum');
      assert.ok(Math.abs((min[axis]+max[axis])*.5-source.center[axis])<source.maxDimension*.001,'model center is preserved');
    }
    assert.ok(tones.size>10,'each model has regional tone variance');
    assert.ok(edgeCount>36000*0.15&&edgeCount<36000*0.4,'edge density remains useful but bounded');
    assert.ok(edges.has(0)&&[209,255].some(level=>edges.has(level)),'edge metadata survives baking');
  });
});

