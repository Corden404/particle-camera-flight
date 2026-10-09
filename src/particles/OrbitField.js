import * as THREE from 'three';

// Sparse asymmetric, depth-positioned orbit currents visible between clicks.
export function createOrbitField(renderer) {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 2);
  let n = 386028;
  const random = () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296);

  for (let i = 0; i < count; i++) {
    const band = i % 4;
    const angle = random() * Math.PI * 2;
    const radius = [3.15, 3.75, 4.40, 2.75][band] + (random() - 0.5) * 0.65;
    const height = (band - 1.5) * 0.61 + (random() - 0.5) * 1.8;
    const j = i * 3;
    positions[j] = angle;
    positions[j + 1] = radius;
    positions[j + 2] = height;
    seeds[i * 2] = random();
    seeds[i * 2 + 1] = random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aParticle', new THREE.BufferAttribute(seeds, 2));

  const uniforms = {
    uTime: { value: 0 },
    uStory: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uMotion: { value: 1 }
  };

  const vertexShader = [
    'precision highp float;',
    'uniform float uTime; uniform float uStory; uniform float uPixelRatio; uniform float uMotion;',
    'attribute vec2 aParticle;',
    'varying float vGolden; varying float vOpacity;',
    'void main(){',
    '  float segment=fract(min(uStory,2.999));',
    '  float burst=pow(max(0.0,sin(3.14159265*segment)),1.2);',
    '  float t=position.x+uTime*(0.17+0.16*aParticle.x)*uMotion;',
    '  float radius=position.y*(1.0+0.22*burst);',
    '  radius+=sin(t*3.7+aParticle.y*6.28+uTime*0.22)*0.13;',
    '  vec3 p=vec3(cos(t)*radius, position.z+sin(t*1.75+aParticle.x*5.0)*0.49, sin(t)*radius*0.63);',
    '  vec4 mv=modelViewMatrix*vec4(p,1.0);',
    '  gl_Position=projectionMatrix*mv;',
    '  gl_PointSize=clamp((0.65+0.95*aParticle.y)*uPixelRatio*(15.0/max(1.0,-mv.z)),1.0,3.2*uPixelRatio);',
    '  vGolden=0.5+0.5*sin(t*1.1+position.z*1.7+uTime*0.35);',
    '  vOpacity=(0.055+0.080*aParticle.x)*(1.0-0.36*burst);',
    '}'
  ].join('\n');
  const fragmentShader = [
    'precision highp float;',
    'varying float vGolden; varying float vOpacity;',
    'void main(){',
    '  float r=length(gl_PointCoord-vec2(0.5));',
    '  if(r>=0.5)discard;',
    '  float alpha=(1.0-smoothstep(0.13,0.5,r))*vOpacity;',
    '  vec3 c=mix(vec3(0.46,0.53,0.57),vec3(0.66,0.61,0.55),smoothstep(0.53,0.90,vGolden));',
    '  gl_FragColor=vec4(c,alpha);',
    '}'
  ].join('\n');

  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  function setQuality(low) {
    geometry.setDrawRange(0, low ? Math.floor(count * 0.33) : count);
    uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  return { points, uniforms, setQuality, dispose() { geometry.dispose(); material.dispose(); } };
}
