import { readFileSync, writeFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { prepareSurfaceParts, sampleSurfaceParts, transformVertexNormals } from './point-sampling.mjs';

const COUNT = 36000;
// Float32 xyz, signed normal bytes, material tone and one feature-edge byte.
const STRIDE = 17;
const started = performance.now();
// The mesh only exists locally as an ignored build input; runtime ships points only.
const buffer=readFileSync('reference/generated-camera-source/approved-models.glb');
if(buffer.toString('ascii',0,4)!=='glTF')throw Error('GLB expected');
let gltf,bin;
for(let o=12;o<buffer.length;){
 const size=buffer.readUInt32LE(o),tag=buffer.readUInt32LE(o+4);
 if(tag===0x4e4f534a)gltf=JSON.parse(buffer.toString('utf8',o+8,o+8+size));
 if(tag===0x004e4942)bin=buffer.subarray(o+8,o+8+size);
 o+=8+size;
}
if(!gltf||!bin)throw Error('Missing glTF chunks');
const attrs=gltf.accessors,views=gltf.bufferViews;
const components={5121:1,5123:2,5125:4,5126:4};
function accessor(index){
 const a=attrs[index],v=views[a.bufferView],count=a.count;
 const size=components[a.componentType],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
 if(!size||!n||a.sparse)throw Error('Unrecognized component type or sparse view');
 const bytes=bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0);
 const stride=v.byteStride||size*n;
 const view=new DataView(bin.buffer,bytes);
 const out=new Float32Array(count*n);
 for(let i=0;i<count;i++)for(let j=0;j<n;j++){
   const off=i*stride+j*size;
   out[i*n+j]=a.componentType===5126 ? view.getFloat32(off,true) :
     a.componentType===5123 ? view.getUint16(off,true) :
     a.componentType===5125 ? view.getUint32(off,true) : view.getUint8(off);
 }
 return out;
}
const cache=new Map();
function cached(index){if(!cache.has(index))cache.set(index,accessor(index));return cache.get(index);}
function matrix(n){
 if(n.matrix)return new Matrix4().fromArray(n.matrix);
 return new Matrix4().compose(
   new Vector3(...(n.translation||[0,0,0])),
   new Quaternion(...(n.rotation||[0,0,0,1])),
   new Vector3(...(n.scale||[1,1,1])));
}
const labels=['Model_Root_Sculpture','Model_Root_Dish70M','Model_Root_Curiosity','Model_Root_Apollo_Lm'];
const sceneRoots=gltf.scenes[gltf.scene||0].nodes;
const rootIDs=Object.fromEntries(sceneRoots.map(i=>[gltf.nodes[i].name,i]));
const out=Buffer.allocUnsafe(16+labels.length*COUNT*STRIDE);
out.write('STG1',0,4,'ascii');out.writeUInt32LE(labels.length,4);out.writeUInt32LE(COUNT,8);out.writeUInt32LE(STRIDE,12);
let cursor=16;

for(let group=0;group<labels.length;group++){
 const name=labels[group],root=rootIDs[name];
 if(root===undefined)throw Error('Missing root '+name);
 const primitives=[],min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
 function visit(i,parent){
   const node=gltf.nodes[i];
   const transform=parent.clone().multiply(matrix(node));
   if(node.mesh!==undefined){
     const mesh=gltf.meshes[node.mesh];
     for(const primitive of mesh.primitives){
       if((primitive.mode??4)!==4||primitive.attributes.POSITION===undefined)continue;
       const positions=cached(primitive.attributes.POSITION),length=positions.length/3;
       const ids=primitive.indices!==undefined?cached(primitive.indices):Uint32Array.from({length},(_,i)=>i);
       const points=new Float32Array(positions.length),v=new Vector3();
       for(let k=0;k<length;k++){
         v.fromArray(positions,k*3).applyMatrix4(transform);
         v.toArray(points,k*3);
         min.min(v);max.max(v);
       }
       const normals=primitive.attributes.NORMAL===undefined?undefined:
         transformVertexNormals(cached(primitive.attributes.NORMAL),transform);
       // These are actual exported names, including generic tex/blinn labels.
       // Topology/dimensions supply structural importance; names only tag tone.
       const material=gltf.materials[primitive.material]?.name||'neutral';
       primitives.push({points,ids,normals,region:material+' / '+(node.name||mesh.name||'mesh')});
     }
   }
   for(const child of node.children||[])visit(child,transform);
 }
 visit(root,new Matrix4());
 const parts=prepareSurfaceParts(primitives);
 const samples=sampleSurfaceParts(parts,COUNT,39143721+group*1013);
  let toneMin=255,toneMax=0,edgeCount=0;
  for(const sample of samples){
    for(let axis=0;axis<3;axis++){
      if(!Number.isFinite(sample.position[axis]))throw Error('Nonfinite sampled point '+name);
      out.writeFloatLE(sample.position[axis],cursor+axis*4);
      out.writeInt8(Math.round(sample.normal[axis]*127),cursor+12+axis);
    }
    out.writeUInt8(sample.tone,cursor+15);
    out.writeUInt8(Math.round(sample.edge*255),cursor+16);
    toneMin=Math.min(toneMin,sample.tone);toneMax=Math.max(toneMax,sample.tone);
    if(sample.edge>0)edgeCount++;
    cursor+=STRIDE;
  }
  const center=min.clone().add(max).multiplyScalar(.5);
  console.log(name,JSON.stringify({
    count:COUNT,edgePoints:edgeCount,sourcePrimitives:primitives.length,connectedParts:parts.length,
    center:center.toArray().map(x=>+x.toFixed(4)),
    sourceMin:min.toArray(),sourceMax:max.toArray(),toneRange:[toneMin,toneMax],
    densityBoostRange:[Math.min(...parts.map(p=>p.weight/p.area)),Math.max(...parts.map(p=>p.weight/p.area))].map(x=>+x.toFixed(3)),
  }));
}
if(cursor!==out.length)throw Error('Unexpected position end');
// Camera and original model-bounds are authoritative and deliberately read-only.
writeFileSync('public/scene/surface-points.bin',out);
console.log('Wrote',out.length,'bytes of world-space points in',((performance.now()-started)/1000).toFixed(3),'seconds');
