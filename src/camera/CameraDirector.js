import * as THREE from 'three';

// Each chapter has a fixed stop and a banked 3D flight to the next stop.
// All flight endpoints are shared: no camera teleport, route reset or scene reload.
const STOPS=[
  [0.00,0.00,15.60],
  [-0.90,0.25,15.30],
  [0.72,-0.25,15.80],
  [0.00,0.00,15.50],
];
const CAMERA=[
  [STOPS[0],[1.20,0.20,11.70],[2.40,0.25,7.15],[4.55,0.95,4.15],[6.20,1.42,6.10],[4.60,0.65,10.40],STOPS[1]],
  [STOPS[1],[0.90,-0.65,11.0],[2.60,-0.35,6.30],[4.70,-0.25,3.95],[5.80,1.15,6.10],[3.90,1.20,11.0],STOPS[2]],
  [STOPS[2],[2.05,-0.10,11.9],[3.00,1.75,6.80],[4.65,2.15,4.20],[5.90,1.12,6.40],[3.60,0.50,11.30],STOPS[3]]
];
const FOCUS=[
  [[0,0,0],[1.0,0,0],[2.35,0,-0.1],[2.4,0.2,-0.8],[2.3,0,0],[1.5,0,0],[0,0,0]],
  [[0,0,0],[1.0,0,0],[2.4,0,0],[2.6,0.1,-1.3],[2.2,0,0],[1.7,0,0],[0,0,0]],
  [[0,0,0],[1.2,0,0],[2.4,0,-0.5],[2.2,0.1,-1.2],[2.3,0,0],[1.4,0,0],[0,0,0]]
];
const makeCurve = a => new THREE.CatmullRomCurve3(a.map(p=>new THREE.Vector3(...p)),false,'centripetal');
const paths=CAMERA.map(makeCurve),targets=FOCUS.map(makeCurve);
const ease=t=>t*t*(3-2*t);
const mix=(a,b,t)=>a+(b-a)*t;
const pos=new THREE.Vector3(),look=new THREE.Vector3();

export function sampleCameraState(story,mobile=false,time=0,reduced=false) {
  const s=THREE.MathUtils.clamp(story,0,3);
  const leg=Math.min(2,Math.floor(s));
  const phase=s>=3?1:s-leg;
  const u=ease(phase),fly=Math.sin(Math.PI*phase);
  paths[leg].getPoint(u,pos);
  targets[leg].getPoint(u,look);
  if(mobile){
    pos.x*=0.42;pos.y*=0.60;pos.z+=4.1-0.4*fly;
    look.x*=0.34;look.y+=0.22;
  }
  if(!reduced)pos.y+=Math.sin(time*0.23)*0.045*(1-fly);
  return {
    position:pos.clone(),lookAt:look.clone(),
    fov:mix(39,57,fly)+(mobile?10:0),
    rotationY:mix([-0.28,0.20,-0.16,0.23][leg],[-0.28,0.20,-0.16,0.23][leg+1],u)
      +(reduced?0:Math.sin(time*0.34)*0.075),
    rotationX:0.02+(reduced?0:Math.sin(time*0.21)*0.052),
    phase,flight:fly,distance:pos.distanceTo(new THREE.Vector3(2.38,0.08,0))
  };
}
export function updateCameraDirector(camera,rig,story,time,narrow,reducedMotion){
  const shot=sampleCameraState(story,narrow,time,reducedMotion);
  camera.position.copy(shot.position);
  camera.lookAt(shot.lookAt);
  camera.fov=shot.fov;
  camera.updateProjectionMatrix();
  const aboutWeight = Math.max(0,1-Math.abs(story-1));
  const projectWeight = Math.max(0,1-Math.abs(story-2));
  // Compose models larger in the frame while preserving open space for editorial copy.
  rig.position.set(narrow ? 0 : 2.72, narrow ? 3.08 + 0.17 * aboutWeight + 0.26 * projectWeight : 0.08, 0);
  const clampedStory = THREE.MathUtils.clamp(story,0,3);
  const leg = Math.min(2,Math.floor(clampedStory));
  const segmentT = clampedStory >= 3 ? 1 : ease(clampedStory - leg);
  // Zoom via model scale (rather than jumping the camera) so spline flight stays continuous.
  const sizes = narrow ? [1.10,1.12,0.92,1.10] : [1.41,1.35,1.18,1.37];
  rig.scale.setScalar(mix(sizes[leg], sizes[leg+1], segmentT));
  // Reveal the broad solar-panel faces instead of viewing the probe edge-on.
  rig.rotation.y=shot.rotationY + 0.12 * projectWeight;
  rig.rotation.x=shot.rotationX + 0.68 * projectWeight;
  rig.rotation.z=reducedMotion?0:Math.sin(time*0.12)*0.012;
  return shot;
}