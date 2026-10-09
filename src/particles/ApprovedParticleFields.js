import * as THREE from 'three';
import sculptureVert from './sculpture.vert.glsl?raw';
import sculptureFrag from './sculpture.frag.glsl?raw';

function seeded() {
  let state=624831;
  return () => ((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
}
const vertexStage = sculptureVert;
const fragmentStage = sculptureFrag;
function decodeSurfacePoints(buffer) {
 const view=new DataView(buffer);
 if(String.fromCharCode(...new Uint8Array(buffer,0,4))!=='STG1')throw Error('Unsupported point data');
 const groups=view.getUint32(4,true),count=view.getUint32(8,true),stride=view.getUint32(12,true);
 if(groups!==4||stride!==16||count<2000||count>60000||view.byteLength!==16+groups*count*stride)
   throw Error('Inconsistent surface particle data');
 const result=[];
 for(let g=0;g<groups;g++){
  const pos=new Float32Array(count*3),norm=new Float32Array(count*3),tone=new Float32Array(count),random=new Float32Array(count*2);
  const rng=seeded();
  for(let i=0;i<count;i++){
   const offset=16+(g*count+i)*16;
   for(let j=0;j<3;j++){
    pos[i*3+j]=view.getFloat32(offset+j*4,true);
    norm[i*3+j]=view.getInt8(offset+12+j)/127;
   }
   tone[i]=view.getUint8(offset+15)/255;
   random[i*2]=rng();random[i*2+1]=rng();
  }
  result.push({pos,norm,tone,random});
 }
 return {groups:result,count};
}

export async function createSurfaceParticles(renderer) {
 const response=await fetch('./scene/surface-points.bin');
 if(!response.ok)throw Error('Surface sample file unavailable');
 const data=decodeSurfacePoints(await response.arrayBuffer());
 const objects=[],uniformSets=[];
 for(let stage=0;stage<4;stage++){
   const pose=data.groups[stage],geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.BufferAttribute(pose.pos,3));
   geometry.setAttribute('aNormal',new THREE.BufferAttribute(pose.norm,3));
   geometry.setAttribute('aTone',new THREE.BufferAttribute(pose.tone,1));
   geometry.setAttribute('aRandom',new THREE.BufferAttribute(pose.random,2));
   geometry.computeBoundingBox();
   const worldCenter = geometry.boundingBox.getCenter(new THREE.Vector3());
   const uniforms={
     uTime:{value:0},uStory:{value:0},uStage:{value:stage},
     uMotion:{value:1},uPixelRatio:{value:renderer.getPixelRatio()},
     uModelCenter:{value:worldCenter},uModelScale:{value:1.14}
   };
   const material=new THREE.ShaderMaterial({uniforms,vertexShader:vertexStage,fragmentShader:fragmentStage,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
   const points=new THREE.Points(geometry,material);
   points.frustumCulled=false;
   objects.push(points);
   uniformSets.push(uniforms);
 }
 const group=new THREE.Group();group.name='Pure particle sculptures — zero solid mesh geometry';group.add(...objects);
 return {
   group,count:data.count,
   setViewportScale(portrait){
     // Keep a consistent 14% larger point-cloud silhouette on desktops.
     // Portrait remains 10% larger; narrow desktop framing is handled by FOV.
     const scale=portrait?1.10:1.14;
     for(const u of uniformSets)u.uModelScale.value=scale;
   },
   update(time,story,moving){for(const u of uniformSets){u.uTime.value=moving?time:0;u.uStory.value=story;u.uMotion.value=moving?1:0;}},
   quality(low){for(let i=0;i<objects.length;i++){
     objects[i].geometry.setDrawRange(0,low?Math.floor(data.count*0.70):data.count);
     uniformSets[i].uPixelRatio.value=renderer.getPixelRatio();
   }},
   dispose(){objects.forEach(o=>{o.geometry.dispose();o.material.dispose();});}
 };
}

export function createFreeAmbientParticles(renderer, cameraData) {
  // The star field is created inside the APPROVED Blender camera view volumes,
  // not attached to a model, a screen overlay, or a skybox. Every point has an
  // independent world-space position and motion, so camera parallax is genuine.
  if (!cameraData?.samples || cameraData.samples.length !== 361) {
    throw Error('Camera flight frames are required for atmospheric placement');
  }
  const rng = seeded();
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(1e-6,rng()))) * Math.cos(rng() * Math.PI * 2);
  const aspect = Math.max(1.18, renderer.domElement.clientWidth / Math.max(1,renderer.domElement.clientHeight));
  const halfFov = Math.tan(THREE.MathUtils.degToRad(cameraData.verticalFov*0.5));
  const cameraPosition = new THREE.Vector3();
  const cameraRotation = new THREE.Quaternion();
  const world = new THREE.Vector3();
  const stops = [0,120,240,360];
  const layers = [
    { name:'Subtle diagonal galactic haze', count:8200, mode:0 },
    { name:'Independent drifting spatial dust', count:6900, mode:1 },
    { name:'Soft near-lens parallax particles', count:320, mode:2 }
  ];

  const vertexShader = [
    'precision highp float;',
    'uniform float uTime; uniform float uStory; uniform float uMotion; uniform float uPixelRatio; uniform float uLayer;',
    'attribute vec3 aSeed;',
    'varying float vAlpha; varying float vColor; varying float vLayer;',
    'void main(){',
    ' float phase=fract(clamp(uStory,0.0,2.999));',
    ' float flight=pow(max(0.0,sin(3.14159265*phase)),1.4);',
    ' float time=uTime*uMotion;',
    ' vec3 p=position;',
    ' float wind=time*(0.28+0.23*aSeed.x);',
    ' vec3 flow=vec3(',
    '   sin(p.y*0.14+p.z*0.083+wind+aSeed.x*6.283),',
    '   cos(p.x*0.10-p.z*0.069-wind*0.85+aSeed.y*6.283),',
    '   sin(p.x*0.12+p.y*0.17+wind*0.71+aSeed.z*6.283));',
    ' float scale=uLayer<0.5?0.85:(uLayer<1.5?1.22:0.73);',
    ' p+=flow*scale*(0.88+1.95*flight)*uMotion;',
    ' p+=vec3(-0.8,0.26,0.75)*flight*(0.5+aSeed.x)*1.16*uMotion;',
    ' vec4 mv=modelViewMatrix*vec4(p,1.0);',
    ' gl_Position=projectionMatrix*mv;',
    ' float depth=-mv.z;',
    ' float size=uLayer<0.5?(2.1+aSeed.x*1.7):(uLayer<1.5?(2.5+aSeed.x*2.0):(10.0+aSeed.x*10.0));',
    ' size=size*uPixelRatio*(15.0/max(1.0,depth));',
    ' gl_PointSize=clamp(size,1.05,uLayer<1.5?6.9*uPixelRatio:35.0*uPixelRatio);',
    ' float depthFade=smoothstep(1.4,4.6,depth)*(1.0-smoothstep(65.0,105.0,depth));',
    ' float layerStrength=uLayer<0.5?0.43:(uLayer<1.5?0.64:0.21);',
    ' float twinkle=0.84+0.16*sin(time*(0.7+aSeed.y)+aSeed.x*17.0);',
    ' vAlpha=layerStrength*depthFade*twinkle*(0.64+0.36*aSeed.y)*(1.0+0.14*flight);',
    ' vColor=aSeed.z;',
    ' vLayer=uLayer;',
    '}'
  ].join('\n');
  const fragmentShader = [
    'precision highp float;',
    'varying float vAlpha; varying float vColor; varying float vLayer;',
    'void main(){',
    ' float r=length(gl_PointCoord-vec2(0.5));',
    ' if(r>=0.50)discard;',
    ' float core=1.0-smoothstep(0.015,0.19,r);',
    ' float haze=1.0-smoothstep(0.06,0.50,r);',
    ' float bokeh=exp(-14.0*r*r);',
    ' float shape=vLayer<0.5?haze*0.35:(vLayer<1.5?core*0.75+haze*0.30:bokeh*0.58);',
    ' vec3 pearl=vec3(0.88,0.90,0.94);',
    ' vec3 cool=vec3(0.54,0.64,0.74);',
    ' vec3 warm=vec3(0.76,0.69,0.59);',
    ' vec3 tint=mix(cool,warm,smoothstep(0.22,0.88,vColor));',
    ' vec3 rgb=mix(pearl,tint,vLayer<0.5?0.25:0.41);',
    ' gl_FragColor=vec4(rgb,shape*vAlpha);',
    '}'
  ].join('\n');
  const group = new THREE.Group();
  group.name = 'World-space free-flowing cosmic particles';
  const uniformsList=[], pointsList=[];
  for (const layer of layers) {
    const positions = new Float32Array(layer.count*3);
    const seeds = new Float32Array(layer.count*3);
    for (let i=0;i<layer.count;i++) {
      // The original 15s camera flight gives us a continuous world-space volume.
      // Most dust is distributed around the four viewing stations, the rest
      // along the entire flight, so transitions also have particles to pass by.
      const strongWeight=layer.mode===0?0.80:layer.mode===1?0.70:0.88;
      const selectedFrame=rng()<strongWeight?stops[Math.floor(rng()*4)]:Math.floor(rng()*361);
      const pose=cameraData.samples[selectedFrame];
      cameraPosition.fromArray(pose,0);
      cameraRotation.fromArray(pose,3);
      let u,v,depth;
      if (layer.mode===0) {
        u=(rng()-.5)*2.7;
        v=0.32*u+gaussian()*0.29;
        depth=17+rng()*25;
      } else if(layer.mode===1) {
        u=(rng()-.5)*2.75;
        v=(rng()-.5)*2.4;
        depth=6.2+rng()*27;
      } else {
        u=(rng()-.5)*2.4;
        v=(rng()-.5)*2.15;
        depth=2.8+rng()*10.5;
      }
      world.set(u*depth*halfFov*aspect, v*depth*halfFov,-depth);
      world.applyQuaternion(cameraRotation).add(cameraPosition);
      const j=i*3;
      positions[j]=world.x;
      positions[j+1]=world.y;
      positions[j+2]=world.z;
      seeds[j]=rng();
      seeds[j+1]=rng();
      seeds[j+2]=rng();
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,3));
    const uniforms={
      uTime:{value:0},uStory:{value:0},uMotion:{value:1},
      uPixelRatio:{value:renderer.getPixelRatio()},uLayer:{value:layer.mode}
    };
    const material=new THREE.ShaderMaterial({
      uniforms,vertexShader,fragmentShader,
      transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending
    });
    const points=new THREE.Points(geometry,material);
    points.frustumCulled=false;
    points.name=layer.name;
    group.add(points);
    pointsList.push(points);
    uniformsList.push(uniforms);
  }
  return {
    group,
    count:layers.reduce((total,l)=>total+l.count,0),
    update(time,story,motion){
      for(const uniforms of uniformsList){
        uniforms.uTime.value=time;
        uniforms.uStory.value=story;
        uniforms.uMotion.value=motion?1:0;
      }
    },
    quality(low){
      pointsList.forEach((obj,i)=>{
        obj.geometry.setDrawRange(0,Math.floor(layers[i].count*(low?i===2?0.34:0.54:1.0)));
        uniformsList[i].uPixelRatio.value=renderer.getPixelRatio();
      });
    },
    dispose(){pointsList.forEach(obj=>{obj.geometry.dispose();obj.material.dispose();});}
  };
}