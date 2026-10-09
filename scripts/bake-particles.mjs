import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Matrix4, Vector3, Quaternion } from 'three';

const SOURCES = [
  ['Astronaut — floating', '模型/02_宇航员/v5_参考真实EVA_自然漂浮/astronaut-v5.glb', 5.95],
  ['Aureole — ribbon', '模型/03_抽象雕塑/v2_无底座/sculpture.glb', 5.2],
  ['Kestrel — satellite', '模型/01_星网探测器/probe.glb', 6.85],
  ['Astronaut — return', '模型/02_宇航员/astronaut.glb', 5.9],
];
// Intentional sparse presentation: the sculpture should read as individual points, not a glowing solid.
const COUNT = Number(process.env.PARTICLE_COUNT || 28000);
if (!Number.isInteger(COUNT) || COUNT < 2000 || COUNT > 150000) throw Error('PARTICLE_COUNT must be 2000..150000');
const QUANT_RANGE = 6.0; // All standardized poses fit within [-6,6].
const rand = (() => { let x = 724943; return () => ((x = Math.imul(x,1664525) + 1013904223 >>> 0) / 4294967296); })();

function readGLB(fileName) {
  const buffer = readFileSync(resolve(fileName));
  if (buffer.toString('ascii', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2) throw Error('Expected GLB v2: ' + fileName);
  const declared = buffer.readUInt32LE(8);
  if (declared !== buffer.length) throw Error('Incorrect GLB size: ' + fileName);
  let json, bin; let offset = 12;
  while (offset < buffer.length) {
    const len = buffer.readUInt32LE(offset), tag = buffer.readUInt32LE(offset+4);
    const data = buffer.subarray(offset+8, offset+8+len);
    if (tag === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    if (tag === 0x004e4942) bin = data;
    offset += 8 + len;
  }
  if (!json || !bin) throw Error('Missing JSON or BIN: ' + fileName);
  if ((json.buffers || []).length !== 1 || json.extensionsRequired?.length) {
    throw Error('Model needs unsupported glTF extension/external buffer: ' + fileName);
  }
  return { json, bin };
}
function typedRead(bin, offset, type) {
  if (type===5126) return bin.readFloatLE(offset);
  if (type===5125) return bin.readUInt32LE(offset);
  if (type===5123) return bin.readUInt16LE(offset);
  if (type===5121) return bin.readUInt8(offset);
  if (type===5122) return bin.readInt16LE(offset);
  throw Error('Unsupported accessor componentType: ' + type);
}
function loadAccessor(gltf, index) {
  const {json,bin}=gltf, a=json.accessors[index];
  if(a.sparse) throw Error('Sparse accessors require separate decoding');
  if(a.bufferView===undefined) throw Error('Missing accessor bufferView');
  const v=json.bufferViews[a.bufferView];
  const channels={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const bytes={5126:4,5125:4,5123:2,5121:1,5122:2}[a.componentType];
  if(!channels || !bytes) throw Error('Unsupported accessor ' + index);
  const stride=v.byteStride || bytes*channels;
  const start=(v.byteOffset||0)+(a.byteOffset||0);
  const result=new Float32Array(a.count*channels);
  for(let i=0;i<a.count;i++) for(let j=0;j<channels;j++) result[i*channels+j]=typedRead(bin,start+i*stride+j*bytes,a.componentType);
  return {data:result,count:a.count,channels};
}
function findRootNodes(json) {
  if(json.scenes?.length) return json.scenes[json.scene || 0].nodes || [];
  const children=new Set(json.nodes.flatMap(n=>n.children || []));
  return json.nodes.map((_,i)=>i).filter(i=>!children.has(i));
}
function getMatrix(n) {
  if(n.matrix) return new Matrix4().fromArray(n.matrix);
  return new Matrix4().compose(
    new Vector3(...(n.translation||[0,0,0])),
    new Quaternion(...(n.rotation||[0,0,0,1])),
    new Vector3(...(n.scale||[1,1,1]))
  );
}
function materialTone(m) {
  const title=(m?.name || '').toLowerCase();
  if(/gold|champagne|brass|thermal|copper|inlay|visor rim|pale gold/.test(title)) return .96;
  if(/blue|solar|cyan|optical|glass|display|sensor/.test(title)) return .08;
  return .48;
}
function gather(file) {
  const gltf=readGLB(file), {json}=gltf;
  const primitives=[], bboxMin=[Infinity,Infinity,Infinity],bboxMax=[-Infinity,-Infinity,-Infinity];
  let triangleCount=0, allWeight=0;
  function processNode(id, parent) {
    const node=json.nodes[id],matrix=parent.clone().multiply(getMatrix(node));
    if(node.mesh!==undefined) {
      const mesh=json.meshes[node.mesh];
      for(const p of mesh.primitives || []) {
        if((p.mode ?? 4)!==4 || p.attributes?.POSITION===undefined) continue;
        const raw=loadAccessor(gltf,p.attributes.POSITION);
        const positions=new Float32Array(raw.data.length);
        const tmp=new Vector3();
        for(let v=0;v<raw.count;v++){
          tmp.fromArray(raw.data,v*3).applyMatrix4(matrix);
          const j=v*3;positions[j]=tmp.x;positions[j+1]=tmp.y;positions[j+2]=tmp.z;
          for(let k=0;k<3;k++){bboxMin[k]=Math.min(bboxMin[k],positions[j+k]);bboxMax[k]=Math.max(bboxMax[k],positions[j+k]);}
        }
        const ids=p.indices!==undefined ? loadAccessor(gltf,p.indices).data : Float32Array.from({length:raw.count},(_,i)=>i);
        const triCount=Math.floor(ids.length/3);
        const cdf=new Float64Array(triCount);
        const primName=(node.name||'')+' '+(mesh.name||'');
        const mat=json.materials?.[p.material||0];
        const boost=/helmet|visor|eye|antenna|optical|lens|hand|glove|ribbon|indicator|bezel|frame|edge|trim|sensor|solar/i.test(primName) ? 1.24 : 1;
        let weight=0;
        for(let i=0;i<triCount;i++){
          const ai=ids[i*3]*3,bi=ids[i*3+1]*3,ci=ids[i*3+2]*3;
          const ax=positions[bi]-positions[ai],ay=positions[bi+1]-positions[ai+1],az=positions[bi+2]-positions[ai+2];
          const bx=positions[ci]-positions[ai],by=positions[ci+1]-positions[ai+1],bz=positions[ci+2]-positions[ai+2];
          const cx=ay*bz-az*by,cy=az*bx-ax*bz,cz=ax*by-ay*bx;
          const area=.5*Math.hypot(cx,cy,cz);
          weight+=Math.max(area*boost,1e-10);
          cdf[i]=weight;
        }
        if(weight>0){allWeight+=weight;primitives.push({positions,ids,cdf,weight,total:allWeight,boost,tone:materialTone(mat)});triangleCount+=triCount;}
      }
    }
    for(const child of node.children||[])processNode(child,matrix);
  }
  const identity=new Matrix4();
  for(const root of findRootNodes(json))processNode(root,identity);
  if(primitives.length===0)throw Error('No valid triangle primitives in '+file);
  return {primitives,total:allWeight,bboxMin,bboxMax,triangleCount};
}
function upperBound(array, v, field){
 let l=0,r=array.length;
 while(l<r){const m=(l+r)>>>1;const value=field?array[m][field]:array[m];if(value<v)l=m+1;else r=m;}
 return Math.min(l,array.length-1);
}
function normalizeSampler(source,targetSize) {
  const center=source.bboxMin.map((x,j)=>(x+source.bboxMax[j])/2);
  const dimension=source.bboxMin.map((x,j)=>source.bboxMax[j]-x);
  const scale=targetSize / Math.max(...dimension);
  return {center,dimension,scale};
}
function sample(source,targetSize){
 const norm=normalizeSampler(source,targetSize);
 const xyz=new Float32Array(COUNT*3), normals=new Int8Array(COUNT*3),tones=new Uint8Array(COUNT);
 const {primitives,total}=source;
 for(let i=0;i<COUNT;i++){
   const prim=primitives[upperBound(primitives,rand()*total,'total')];
   const id=upperBound(prim.cdf,rand()*prim.weight);
   const {positions,ids}=prim;
   const a=ids[id*3]*3,b=ids[id*3+1]*3,c=ids[id*3+2]*3;
   const u=Math.sqrt(rand()),v=rand(),w0=1-u,w1=u*(1-v),w2=u*v;
   const o=i*3;
   for(let axis=0;axis<3;axis++){
     const value=positions[a+axis]*w0+positions[b+axis]*w1+positions[c+axis]*w2;
     xyz[o+axis]=(value-norm.center[axis])*norm.scale;
   }
   const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
   const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
   let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
   const nl=Math.hypot(nx,ny,nz)||1;
   normals[o]=Math.round(nx/nl*127);normals[o+1]=Math.round(ny/nl*127);normals[o+2]=Math.round(nz/nl*127);
   tones[i]=Math.round(Math.max(0,Math.min(1,prim.tone))*255);
 }
 return {xyz,normals,tones,...norm};
}
function expand10(x){
 x &=1023; x=(x|(x<<16))&0x30000ff;x=(x|(x<<8))&0x300f00f;x=(x|(x<<4))&0x30c30c3;x=(x|(x<<2))&0x9249249;return x;
}
function morton(x,y,z){
 const q=v=>Math.min(1023,Math.max(0,Math.floor((v/QUANT_RANGE*.5+.5)*1023)));
 return ((expand10(q(x))<<2)|(expand10(q(y))<<1)|expand10(q(z)))>>>0;
}
function sortSample(s){
 const ids=Array.from({length:COUNT},(_,i)=>i);
 const keys=new Uint32Array(COUNT);
 for(let i=0;i<COUNT;i++)keys[i]=morton(s.xyz[i*3],s.xyz[i*3+1],s.xyz[i*3+2]);
 ids.sort((a,b)=>keys[a]-keys[b]);
 const xyz=new Float32Array(COUNT*3), normals=new Int8Array(COUNT*3),tones=new Uint8Array(COUNT);
 for(let i=0;i<COUNT;i++){
   const a=ids[i]*3,b=i*3;
   xyz.set(s.xyz.subarray(a,a+3),b);normals.set(s.normals.subarray(a,a+3),b);tones[i]=s.tones[ids[i]];
 }
 return {...s,xyz,normals,tones};
}
function makePermutation(){
 // Every initial prefix is spatially dispersed, so the ECO drawRange still covers the entire sculpture.
 const ids=Array.from({length:COUNT},(_,i)=>i);
 for(let i=COUNT-1;i>0;i--){const j=Math.floor(rand()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
 return ids;
}
function quantize(v){return Math.round(Math.max(-1,Math.min(1,v/QUANT_RANGE))*32767);}
function bake() {
 const poses=[], summaries=[];
 for(const [name,file,target] of SOURCES){
  const src=gather(file);const sampled=sortSample(sample(src,target));
  poses.push(sampled);
  summaries.push({name,source:file,primitives:src.primitives.length,triangles:src.triangleCount,sourceBounds:{min:src.bboxMin,max:src.bboxMax},normalizedScale:sampled.scale,normalizedSize:sampled.dimension.map(v=>+(v*sampled.scale).toFixed(3))});
  console.log('Sampled '+name+': '+src.triangleCount+' triangles; '+src.primitives.length+' primitives; '+COUNT+' particles; size '+sampled.dimension.map(v=>(v*sampled.scale).toFixed(2)).join(' × '));
 }
 const permutation=makePermutation();
 const header=16, poseBytes=COUNT*10;
 const out=Buffer.allocUnsafe(header+SOURCES.length*poseBytes);
 out.write('PCL2',0,4,'ascii');out.writeUInt32LE(COUNT,4);out.writeUInt32LE(SOURCES.length,8);out.writeFloatLE(QUANT_RANGE,12);
 let cursor=header;
 for(const p of poses){
  for(let i=0;i<COUNT;i++){
   const k=permutation[i]*3;
   for(let a=0;a<3;a++)out.writeInt16LE(quantize(p.xyz[k+a]),cursor+(i*3+a)*2);
  }
  cursor+=COUNT*6;
  for(let i=0;i<COUNT;i++){const k=permutation[i]*3;out.writeInt8(p.normals[k],cursor+i*3);out.writeInt8(p.normals[k+1],cursor+i*3+1);out.writeInt8(p.normals[k+2],cursor+i*3+2);}
  cursor+=COUNT*3;
  for(let i=0;i<COUNT;i++)out[cursor+i]=p.tones[permutation[i]];
  cursor+=COUNT;
 }
 const asset=resolve('public/particles/sculptures.bin');
 mkdirSync(dirname(asset),{recursive:true});writeFileSync(asset,out);
 writeFileSync(resolve('public/particles/sculptures-meta.json'),JSON.stringify({version:2,count:COUNT,quantRange:QUANT_RANGE,order:'position float16 quantization as signed int16, normals signed int8, tone uint8; all sorted by Morton code then identically shuffled',poses:summaries},null,2)+'\n');
 console.log('Wrote '+asset+' ('+(out.length/1048576).toFixed(2)+' MB), '+SOURCES.length+' poses.');
}
bake();
