import { strict as assert } from 'node:assert';
import { sampleCameraState } from '../src/camera/CameraDirector.js';
const sample = (story,mobile=false)=>sampleCameraState(story,mobile,0,true);
const origin=sample(0);
const near=sample(.5);
assert.ok(origin.position.distanceTo(near.position)>10, 'Camera should really travel through the scene');
assert.ok(near.distance < 7, 'Mid-flight camera should be near the sculpture');
assert.ok(near.fov>50, 'FOV should widen during fast dolly motion');
for(const section of [1,2]){
  const justBefore=sample(section-0.00001);
  const justAfter=sample(section+0.00001);
  assert.ok(justBefore.position.distanceTo(justAfter.position)<0.01,'Path must be continuous at section '+section);
  assert.ok(justBefore.lookAt.distanceTo(justAfter.lookAt)<0.01,'LookAt must be continuous at section '+section);
}
for (let phase=0;phase<=3;phase+=0.05){
 const shot=sample(phase);
 assert.ok(Number.isFinite(shot.position.x)&&Number.isFinite(shot.position.y)&&Number.isFinite(shot.position.z));
 assert.ok(shot.position.z>3.0 && shot.position.z<20,'Unexpected camera clipping pose '+phase);
}
const mobile=sample(.5,true);
assert.ok(mobile.position.z>near.position.z,'Mobile should keep a safer camera distance');
console.log('PASS continuous 3-segment camera flight; home-to-about dolly distance',origin.position.distanceTo(near.position).toFixed(2),'world units; closest approach',near.distance.toFixed(2));
