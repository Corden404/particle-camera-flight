import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
const data=readFileSync('public/particles/sculptures.bin');
const count=data.readUInt32LE(4), poses=data.readUInt32LE(8), scale=data.readFloatLE(12);
assert.equal(data.subarray(0,4).toString('ascii'),'PCL2');
assert.equal(poses,4);
assert.ok(count>=2000 && count<=150000, 'Sample count is outside supported bounds');
assert.equal(data.length,16+poses*count*10);
assert.ok(Number.isFinite(scale)&&scale>1);
const spreads=[];
for(let p=0;p<poses;p++){
 const offset=16+p*count*10;
 const ranges=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
 let normSamples=0;
 for(let i=0;i<count;i+=73){
  for(let j=0;j<3;j++){
   const x=data.readInt16LE(offset+i*6+j*2)/32767*scale;
   assert.ok(Number.isFinite(x) && Math.abs(x)<=scale);
   ranges[j][0]=Math.min(ranges[j][0],x);ranges[j][1]=Math.max(ranges[j][1],x);
  }
  const tone=data.readUInt8(offset+count*9+i);
  assert.ok(tone>=0&&tone<=255);
  const nx=data.readInt8(offset+count*6+i*3);
  const ny=data.readInt8(offset+count*6+i*3+1);
  const nz=data.readInt8(offset+count*6+i*3+2);
  normSamples+=Math.hypot(nx,ny,nz);
 }
 assert.ok(normSamples>500,'Normals should be non-degenerate');
 const extent=ranges.map(r=>r[1]-r[0]);
 assert.ok(extent.every(v=>v>1.3),'Unexpectedly collapsed geometry in pose '+p);
 spreads.push(extent.map(x=>x.toFixed(2)));
}
console.log('PASS',count,'particles x',poses,'sculpture poses; size',data.length,'bytes');
console.log('Extent by pose:',JSON.stringify(spreads));
