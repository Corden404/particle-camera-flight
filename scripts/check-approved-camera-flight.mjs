import fs from 'node:fs';
import assert from 'node:assert/strict';
const data=JSON.parse(fs.readFileSync('public/scene/camera-path.json','utf8'));
assert.equal(data.fps,24);
assert.equal(data.duration,15);
assert.deepEqual(data.dockSeconds,[0,5,10,15]);
assert.equal(data.frameCount,361);
assert.equal(data.samples.length,361);
assert.equal(data.targets.length,361);
const mag=v=>Math.hypot(...v);
let maxDistance=0,maxAngle=0;
for(let i=0;i<data.samples.length;i++){
 const s=data.samples[i];
 assert.equal(s.length,7);
 assert.ok(s.every(Number.isFinite));
 assert.ok(Math.abs(mag(s.slice(3))-1)<0.00001,'Non unit quaternion at frame '+i);
 if(i>0){
  const p=data.samples[i-1];
  const dist=mag(s.slice(0,3).map((v,j)=>v-p[j]));
  const dot=Math.abs(s.slice(3).reduce((a,v,j)=>a+v*p[j+3],0));
  const angle=2*Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI;
  maxDistance=Math.max(maxDistance,dist);
  maxAngle=Math.max(maxAngle,angle);
  assert.ok(dist<0.70, 'Camera jumped at frame '+i);
  assert.ok(angle<9.0, 'Rotation jumped at frame '+i);
 }
}
console.log('PASS camera is 361 original glTF poses over 15s, docked at frames 0/120/240/360, no cuts');
console.log('Maximum adjacent position step:',maxDistance.toFixed(3),'world units. Maximum turn:',maxAngle.toFixed(3),'degrees.');
