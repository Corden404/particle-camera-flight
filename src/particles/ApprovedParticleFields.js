import * as THREE from 'three';
import sculptureVert from './sculpture.vert.glsl?raw';
import sculptureFrag from './sculpture.frag.glsl?raw';
import { sampleChapterPalette, sampleLegEnvelope, viewportModelScale } from './art-direction.js';
import pointerFieldShader from './pointer-field.glsl?raw';
import { createInteractionUniforms, updateInteractionUniforms } from './ParticleInteraction.js';

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
  if(groups!==4||stride!==17||count<2000||count>60000||view.byteLength!==16+groups*count*stride)
   throw Error('Inconsistent surface particle data');
 const result=[];
 for(let g=0;g<groups;g++){
  const pos=new Float32Array(count*3),norm=new Float32Array(count*3),tone=new Float32Array(count),random=new Float32Array(count*2);
  const rng=seeded();
  for(let i=0;i<count;i++){
   const offset=16+(g*count+i)*stride;
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
 const palette=sampleChapterPalette(0);
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
     uModelCenter:{value:worldCenter},uModelScale:{value:viewportModelScale(0)},
     uChapterPalette:{value:new THREE.Vector3(palette.cool,palette.warm,palette.lilac)}
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
   setViewportScale(weight){
     const scale=viewportModelScale(weight);
     for(const u of uniformSets)u.uModelScale.value=scale;
   },
   update(time,story,moving){
     sampleChapterPalette(story,palette);
     for(const u of uniformSets){
       u.uTime.value=moving?time:0;u.uStory.value=story;u.uMotion.value=moving?1:0;
       u.uChapterPalette.value.set(palette.cool,palette.warm,palette.lilac);
     }
   },
   quality(low){for(let i=0;i<objects.length;i++){
     objects[i].geometry.setDrawRange(0,low?Math.floor(data.count*0.70):data.count);
     uniformSets[i].uPixelRatio.value=renderer.getPixelRatio();
   }},
   dispose(){objects.forEach(o=>{o.geometry.dispose();o.material.dispose();});}
 };
}

export function createFreeAmbientParticles(renderer, cameraData) {
  if (!cameraData?.samples || cameraData.samples.length !== 361) {
    throw Error('Camera flight frames are required for atmospheric placement');
  }
  const rng = seeded();
  const aspect = Math.max(1.18, renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight));
  const halfFov = Math.tan(THREE.MathUtils.degToRad(cameraData.verticalFov * 0.5));
  const cameraPosition = new THREE.Vector3();
  const cameraRotation = new THREE.Quaternion();
  const world = new THREE.Vector3();
  const stops = [0, 120, 240, 360];
  const layers = [
    { name: 'Blue, amber and silver drifting spatial flecks', count: 1900, mode: 1 },
    { name: 'Near-lens colored grains with pointer parallax', count: 72, mode: 2 }
  ];

  const vertexShader = `
    precision highp float;
    uniform float uTime;
    uniform float uStory;
    uniform float uMotion;
    uniform float uPixelRatio;
    uniform float uViewportHeight;
    uniform float uLayer;
    uniform float uTransit;
    attribute vec3 aSeed;
    varying float vAlpha;
    varying float vColor;
    varying float vWhite;
    varying float vLayer;
    varying float vWake;

    ${pointerFieldShader}

    void main() {
      float clock = uTime * uMotion;
      vec3 p = position;
      // Nearby particles share a field, making its waves visible across space.
      // Time advances directly rather than wobbling an almost stationary phase.
      vec3 flow = vec3(
        sin(p.y * 0.16 + p.z * 0.073 + clock * 0.55),
        cos(p.x * 0.14 - p.z * 0.069 - clock * 0.43),
        sin(p.x * 0.10 + p.y * 0.17 + clock * 0.36));
      flow += vec3(
        cos(p.y * 0.43 - clock * 0.71),
        sin(p.z * 0.36 + clock * 0.62),
        cos(p.x * 0.31 - clock * 0.47)) * 0.21;
      float scale = uLayer < 0.5 ? 0.62 : (uLayer < 1.5 ? 0.35 : 0.10);
      p += flow * scale * (0.82 + aSeed.x * 0.18) * uMotion;
      p += vec3(-0.22, 0.08, 0.17) * uTransit * (0.5 + aSeed.x) * uMotion;

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float response = uLayer < 0.5 ? 0.78 : (uLayer < 1.5 ? 1.0 : 1.14);
      vec3 disturbance = disturbParticles(mv, response * uMotion);
      gl_Position = projectionMatrix * mv;
      float depth = -mv.z;
      float size = uLayer < 1.5 ? (3.6 + aSeed.x * 2.7) : (3.9 + aSeed.x * 6.5);
      float projectionScale = uViewportHeight / 900.0 * projectionMatrix[1][1] / 2.74747742;
      size *= uPixelRatio * projectionScale * (15.0 / max(1.0, depth));
      size *= 1.0 + flow.y * 0.08 * uMotion + clamp(disturbance.z, 0.0, 1.0) * 0.20;
      gl_PointSize = clamp(size, 2.1 * uPixelRatio,
        uLayer < 1.5 ? 8.0 * uPixelRatio : 12.0 * uPixelRatio);
      float depthFade = smoothstep(1.4, 4.6, depth) *
        (1.0 - smoothstep(65.0, 105.0, depth));
      // Crisp distant accents contrast with a few softer near-lens grains.
      // Each fleck keeps its own pulse and brightness, avoiding an even veil.
      float layerStrength = uLayer < 1.5 ? 0.86 : 0.48;
      float twinkle = 0.5 + 0.5 * sin(clock * (1.8 + aSeed.x * 4.4) +
        aSeed.y * 19.0 + position.x * 0.17);
      float pulse = 0.42 + 0.58 * twinkle;
      vAlpha = layerStrength * depthFade * pulse *
        (0.65 + 0.35 * smoothstep(0.58, 0.92, aSeed.y));
      // Blue and amber remain interspersed at every camera stop. A light spatial
      // contribution lets their accents travel without recoloring the whole view.
      vColor = aSeed.z * 0.86 + (0.5 + 0.5 * sin(position.x * 0.055 +
        position.y * 0.10 + position.z * 0.03 + clock * 0.12 + uStory * 0.42)) * 0.14;
      vWhite = smoothstep(0.82, 0.94, aSeed.y);
      vLayer = uLayer;
      vWake = clamp(disturbance.x * 0.35 + abs(disturbance.y) * 0.5, 0.0, 1.0);
    }
  `;
  const fragmentShader = `
    precision highp float;
    uniform vec3 uAmbientControls; // saturation, brightness, grid brightness
    varying float vAlpha;
    varying float vColor;
    varying float vWhite;
    varying float vLayer;
    varying float vWake;

    void main() {
      float r = length(gl_PointCoord - vec2(0.5));
      if (r >= (vLayer < 1.5 ? 0.46 : 0.50)) discard;
      float core = 1.0 - smoothstep(vLayer < 1.5 ? 0.32 : 0.30,
        vLayer < 1.5 ? 0.45 : 0.49, r);
      float bokeh = exp(-8.0 * r * r) * (1.0 - smoothstep(0.36, 0.50, r));
      float shape = vLayer < 1.5 ? core : core * 0.82 + bokeh * 0.18;
      // Linear colors become saturated display accents after conversion below.
      vec3 blue = vec3(0.005, 0.32, 1.0);
      vec3 amber = vec3(1.0, 0.34, 0.003);
      vec3 silver = vec3(0.73, 0.85, 1.0);
      vec3 tint = mix(blue, amber, smoothstep(0.50, 0.60, vColor));
      tint = mix(tint, silver, vWhite * 0.64);
      float neutral = dot(tint, vec3(0.2126, 0.7152, 0.0722));
      tint = mix(vec3(neutral), tint, clamp(0.88 * uAmbientControls.x, 0.0, 1.0)) *
        0.82 * uAmbientControls.y;
      float opacity = shape * vAlpha * (1.0 + vWake * 0.30);
      if (opacity < 0.002) discard;
      gl_FragColor = vec4(tint, min(0.98, opacity));
      #include <colorspace_fragment>
    }
  `;

  const group = new THREE.Group();
  group.name = 'Waving microdot surface and colored spatial flecks';
  const uniformsList = [], pointsList = [];
  const art = sampleLegEnvelope(0, 0);
  for (const layer of layers) {
    const positions = new Float32Array(layer.count * 3);
    const seeds = new Float32Array(layer.count * 3);
    for (let i = 0; i < layer.count; i++) {
      const strongWeight = layer.mode === 1 ? 0.84 : 0.88;
      const selectedFrame = rng() < strongWeight ? stops[Math.floor(rng() * 4)] : Math.floor(rng() * 361);
      const pose = cameraData.samples[selectedFrame];
      cameraPosition.fromArray(pose, 0);
      cameraRotation.fromArray(pose, 3);
      let u, v, depth;
      if (layer.mode === 1) {
        u = (rng() - 0.5) * 2.75;
        v = (rng() - 0.5) * 2.4;
        depth = 6.2 + rng() * 27;
      } else {
        u = (rng() - 0.5) * 2.4;
        v = (rng() - 0.5) * 2.15;
        depth = 2.8 + rng() * 10.5;
      }
      world.set(u * depth * halfFov * aspect, v * depth * halfFov, -depth);
      world.applyQuaternion(cameraRotation).add(cameraPosition);
      const j = i * 3;
      positions[j] = world.x;
      positions[j + 1] = world.y;
      positions[j + 2] = world.z;
      seeds[j] = rng();
      seeds[j + 1] = rng();
      seeds[j + 2] = rng();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    const uniforms = {
      uTime: { value: 0 }, uStory: { value: 0 }, uMotion: { value: 1 },
      uPixelRatio: { value: renderer.getPixelRatio() }, uLayer: { value: layer.mode },
      uViewportHeight: { value: renderer.domElement.clientHeight || 900 }, uTransit: { value: 0 },
      uAmbientControls: { value: new THREE.Vector3(1, 1, 1) },
      ...createInteractionUniforms()
    };
    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader, fragmentShader,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.NormalBlending, toneMapped: false
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = layer.mode === 2 ? 4 : -20 + layer.mode;
    points.name = layer.name;
    group.add(points);
    pointsList.push(points);
    uniformsList.push(uniforms);
  }

  // The reference's fine dot raster spans the viewport independently of the
  // colored world particles. It remains a point surface, with no opaque mesh.
  const gridUniforms = {
    uTime: { value: 0 }, uStory: { value: 0 }, uMotion: { value: 1 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uAmbientControls: { value: new THREE.Vector3(1, 1, 1) },
    ...createInteractionUniforms()
  };
  const gridMaterial = new THREE.ShaderMaterial({
    uniforms: gridUniforms,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.NormalBlending, toneMapped: false,
    vertexShader: `
      precision highp float;
      uniform float uTime;
      uniform float uStory;
      uniform float uMotion;
      uniform float uPixelRatio;
      varying float vAlpha;
      varying float vTint;
      varying float vWake;

      ${pointerFieldShader}

      float gridGrain(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        float clock = uTime * uMotion;
        vec2 q = position.xy * vec2(uAspect, 1.0);
        float wave = sin(q.x * 3.7 + q.y * 1.3 - clock * 0.75);
        float crossWave = sin(q.y * 3.2 - q.x * 1.1 + clock * 0.46);
        vec2 flow = vec2(crossWave, sin(q.x * 2.6 + q.y * 0.6 - clock * 0.40));
        vec2 ndc = position.xy + flow * vec2(1.0 / uAspect, 1.0) * 0.012 * uMotion;
        float depth = 48.0;
        vec4 view = vec4(ndc * depth /
          vec2(projectionMatrix[0][0], projectionMatrix[1][1]), -depth, 1.0);
        vec3 disturbance = disturbParticles(view, 0.65 * uMotion);
        gl_Position = projectionMatrix * view;
        vWake = clamp(disturbance.x * 0.55 + abs(disturbance.y) * 0.60, 0.0, 1.0);
        gl_PointSize = (1.15 + 0.14 * (wave * 0.5 + 0.5) + vWake * 0.18) * uPixelRatio;
        float radial = 1.0 - smoothstep(0.48, 1.42,
          length(position.xy * vec2(0.66, 0.82)));
        float grain = 0.65 + 0.35 * gridGrain(position.xy + floor(clock * 8.0));
        vAlpha = radial * (0.16 + 0.105 * (wave * 0.5 + 0.5) +
          0.035 * (crossWave * 0.5 + 0.5) + vWake * 0.23) * grain;
        vTint = 0.5 + 0.5 * sin(q.x * 1.15 + q.y * 0.75 + clock * 0.09 + uStory * 0.35);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uAmbientControls; // saturation, brightness, grid brightness
      varying float vAlpha;
      varying float vTint;
      varying float vWake;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        if (radius > 0.5) discard;
        float coverage = 1.0 - smoothstep(0.22, 0.5, radius);
        vec3 blue = vec3(0.051, 0.250, 0.723);
        vec3 amber = vec3(0.905, 0.262, 0.009);
        vec3 tint = mix(blue, amber, smoothstep(0.44, 0.69, vTint));
        vec3 color = mix(vec3(0.20), tint * 0.58, 0.13 + vWake * 0.16);
        // A mostly neutral microgrid stays distinct from the colored flecks.
        float neutral = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(neutral), color, clamp(0.72 * uAmbientControls.x, 0.0, 1.0));
        gl_FragColor = vec4(color, vAlpha * coverage * uAmbientControls.z);
        #include <colorspace_fragment>
      }
    `
  });
  const grid = new THREE.Points(new THREE.BufferGeometry(), gridMaterial);
  grid.name = 'Viewport microdot grid with flowing waves and pointer wake';
  grid.frustumCulled = false;
  grid.renderOrder = -1000;
  group.add(grid);
  const gridSize = { width: 0, height: 0, low: false };
  function resizeGrid(force = false) {
    const width = Math.max(1, renderer.domElement.clientWidth || 1);
    const height = Math.max(1, renderer.domElement.clientHeight || 1);
    if (!force && width === gridSize.width && height === gridSize.height) return;
    gridSize.width = width;
    gridSize.height = height;
    let columns = width < 540 ? 40 : width < 768 ? 80 :
      width < 1020 ? 120 : width < 1400 ? 200 : 300;
    if (gridSize.low) columns = Math.min(columns, 160);
    const spacing = width / columns;
    const rows = Math.ceil(height / spacing);
    const margin = 4;
    const positions = new Float32Array((columns + margin * 2) * (rows + margin * 2) * 3);
    let offset = 0;
    for (let y = -margin; y < rows + margin; y++) {
      for (let x = -margin; x < columns + margin; x++) {
        positions[offset++] = (x + 0.5) * spacing / width * 2 - 1;
        positions[offset++] = 1 - (y + 0.5) * spacing / height * 2;
        positions[offset++] = 0;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    grid.geometry.dispose();
    grid.geometry = geometry;
  }
  resizeGrid();
  const allUniforms = [...uniformsList, gridUniforms];
  let density = 1;
  let lowQuality = false;
  function updateDensity() {
    pointsList.forEach((obj, i) => {
      const ratio = lowQuality ? (layers[i].mode === 2 ? 0.55 : 0.75) : 1;
      obj.geometry.setDrawRange(0, Math.floor(layers[i].count * ratio * density));
    });
  }

  return {
    group,
    get count() { return layers.reduce((total, layer) => total + layer.count, 0) + grid.geometry.getAttribute('position').count; },
    update(time, story, motion, camera, interaction, settings) {
      const currentStory = Number.isFinite(story) ? Math.min(3, Math.max(0, story)) : 0;
      const leg = Math.min(2, Math.floor(currentStory));
      sampleLegEnvelope(leg, currentStory - leg, art);
      const viewportHeight = renderer.domElement.clientHeight || 900;
      resizeGrid();
      for (const uniforms of allUniforms) {
        uniforms.uTime.value = Number.isFinite(time) ? time : 0;
        uniforms.uStory.value = currentStory;
        uniforms.uMotion.value = motion ? 1 : 0;
        if (uniforms.uViewportHeight) uniforms.uViewportHeight.value = viewportHeight;
        if (uniforms.uTransit) uniforms.uTransit.value = art.transit;
        uniforms.uAmbientControls.value.set(settings?.ambientSaturation ?? 1,
          settings?.ambientBrightness ?? 1, settings?.gridBrightness ?? 1);
        updateInteractionUniforms(uniforms, motion ? interaction : null, camera, settings);
      }
    },
    setDensity(next) {
      density = Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : 1;
      updateDensity();
    },
    quality(low) {
      lowQuality = low;
      updateDensity();
      for (const uniforms of uniformsList) uniforms.uPixelRatio.value = renderer.getPixelRatio();
      gridUniforms.uPixelRatio.value = renderer.getPixelRatio();
      if (gridSize.low !== low) { gridSize.low = low; resizeGrid(true); }
    },
    dispose() {
      pointsList.forEach(obj => { obj.geometry.dispose(); obj.material.dispose(); });
      grid.geometry.dispose();
      gridMaterial.dispose();
    }
  };
}