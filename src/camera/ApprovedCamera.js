import * as THREE from 'three';

const WORKING_FRAME_RATE = 24;
const STAGE_NAMES = ['Model_Root_Sculpture','Model_Root_Dish70M','Model_Root_Curiosity','Model_Root_Apollo_Lm'];
const _up = new THREE.Vector3();
const _center = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _targetRotation = new THREE.Quaternion();
const _worldUp = new THREE.Vector3(0,1,0);
const _basis = new THREE.Matrix4();

export async function loadApprovedCamera() {
  const [cameraResponse, boundsResponse] = await Promise.all([
    fetch('./scene/camera-path.json'),
    fetch('./scene/model-bounds.json')
  ]);
  if (!cameraResponse.ok || !boundsResponse.ok) {
    throw Error('The approved camera path or model bounds could not be loaded');
  }
  const data = await cameraResponse.json();
  const bounds = await boundsResponse.json();
  if (data.frameCount !== 361 || data.fps !== WORKING_FRAME_RATE ||
      data.samples.length !== 361 || data.dockSeconds.join(',') !== '0,5,10,15') {
    throw Error('The approved animation must be the complete 15s continuation with 361 frames');
  }
  const centers = STAGE_NAMES.map(name => {
    if (!bounds[name]) throw Error('Missing bounding box for ' + name);
    return new THREE.Vector3(...bounds[name].center);
  });
  const pose0 = new THREE.Quaternion(), pose1 = new THREE.Quaternion();
  const from = new THREE.Vector3(), to = new THREE.Vector3();

  function sample(camera, chapterPosition, portrait = false) {
    const story = THREE.MathUtils.clamp(chapterPosition, 0, 3);
    const frame = story * 120;
    const a = Math.min(360, Math.floor(frame));
    const b = Math.min(360, a+1);
    const alpha = frame-a;
    const s0 = data.samples[a],s1=data.samples[b];

    from.fromArray(s0,0);
    to.fromArray(s1,0);
    camera.position.copy(from).lerp(to,alpha);
    pose0.fromArray(s0,3);
    pose1.fromArray(s1,3);
    camera.quaternion.copy(pose0).slerp(pose1,alpha);
    // The Blender route was composed for a 16:9 viewport. Narrow desktop
    // screens need a wider vertical field of view to preserve the same
    // horizontal framing; camera positions and rotations stay untouched.
    const aspect = Math.max(0.7,camera.aspect);
    const authoredAspect = 16/9;
    const vfov = THREE.MathUtils.degToRad(data.verticalFov);
    camera.fov = portrait ? 47 : THREE.MathUtils.radToDeg(
      2*Math.atan(Math.tan(vfov*0.5)*Math.max(1,authoredAspect/aspect))
    );
    camera.near = 0.03;
    camera.far = 300;

    if (portrait) {
      // The authored 16:9 composition is deliberately preserved on desktop.
      // Portrait screens require more camera clearance around broad sculptures.
      // Only near docking poses, smoothly back away and recenter to prevent cropping.
      const stage = Math.round(story);
      const delta = Math.abs(story-stage);
      const weight = Math.pow(1-THREE.MathUtils.smoothstep(delta,0,0.48),2);
      _center.copy(centers[stage]);
      _desired.copy(camera.position).sub(_center).multiplyScalar(1.85).add(_center);
      _targetRotation.setFromRotationMatrix(_basis.lookAt(_desired,_center,_worldUp));
      _up.set(0,1,0).applyQuaternion(_targetRotation);
      _desired.addScaledVector(_up,-2.55);
      camera.position.lerp(_desired,weight);
      camera.quaternion.slerp(_targetRotation,weight);
    }
    camera.updateProjectionMatrix();
    return {
      chapter: story,
      timeSeconds: story*5,
      indexBefore: Math.min(3,Math.floor(story)),
      progressThroughFlight: story%1,
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray()
    };
  }
  return {sample, data, centers};
}
