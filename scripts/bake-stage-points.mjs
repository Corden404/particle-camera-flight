import { readFileSync, writeFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';

const COUNT = Number(process.env.STAGE_PARTICLE_COUNT || 22000);
if (!Number.isInteger(COUNT) || COUNT < 3000 || COUNT > 60000) throw Error('Invalid stage particle count');
let randState=39143721;
const random=()=>((randState=(Math.imul(randState,1664525)+1013904223)>>>0)/4294967296);
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
 let out=new Float32Array(count*n);
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
function barycentric(p,a,b,c,u,v){
 return p[a]*(1-u)+p[b]*(u*(1-v))+p[c]*(u*v);
}
const labels=['Model_Root_Sculpture','Model_Root_Dish70M','Model_Root_Curiosity','Model_Root_Apollo_Lm'];
const sceneRoots=gltf.scenes[gltf.scene||0].nodes;
const rootIDs=Object.fromEntries(sceneRoots.map(i=>[gltf.nodes[i].name,i]));
const out=Buffer.allocUnsafe(16+labels.length*COUNT*16);
out.write('STG1',0,4,'ascii');out.writeUInt32LE(labels.length,4);out.writeUInt32LE(COUNT,8);out.writeUInt32LE(16,12);
let cursor=16;const worldBounds={};

for(let group=0;group<labels.length;group++){
 const name=labels[group],root=rootIDs[name];
 if(root===undefined)throw Error('Missing root '+name);
 let primitives=[],sum=0,min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
 function visit(i,parent){
   const n=gltf.nodes[i];
   const transform=parent.clone().multiply(matrix(n));
   if(n.mesh!==undefined){
     for(const primitive of gltf.meshes[n.mesh].primitives){
       if(primitive.mode!==4||primitive.attributes.POSITION===undefined)continue;
       const positions=cached(primitive.attributes.POSITION),length=positions.length/3;
       const ids=primitive.indices!==undefined?cached(primitive.indices):Float32Array.from({length},(_,i)=>i);
       const points=new Float32Array(positions.length),v=new Vector3();
       for(let k=0;k<length;k++){
         v.fromArray(positions,k*3).applyMatrix4(transform);
         points[k*3]=v.x;points[k*3+1]=v.y;points[k*3+2]=v.z;
         min.min(v);max.max(v);
       }
       const numTri=Math.floor(ids.length/3);let total=0;const cumulative=new Float64Array(numTri);
       for(let k=0;k<numTri;k++){
         const a=ids[k*3]*3,b=ids[k*3+1]*3,c=ids[k*3+2]*3;
         const abx=points[b]-points[a],aby=points[b+1]-points[a+1],abz=points[b+2]-points[a+2];
         const acx=points[c]-points[a],acy=points[c+1]-points[a+1],acz=points[c+2]-points[a+2];
         const xx=aby*acz-abz*acy,yy=abz*acx-abx*acz,zz=abx*acy-aby*acx;
         total+=Math.max(1e-10,0.5*Math.hypot(xx,yy,zz));
         cumulative[k]=total;
       }
       const material=gltf.materials[primitive.material||0]?.name.toLowerCase()||'';
       const tone=/gold|brass|copper|thermal|champagne/.test(material)?210:/black|dark|graphite|rubber|carbon/.test(material)?32:116;
       if(total>0){
         sum+=total;
         primitives.push({points,ids,cumulative,total,threshold:sum,tone});
       }
     }
   }
   for(const child of n.children||[])visit(child,transform);
 }
 visit(root,new Matrix4());
 if(!primitives.length||!Number.isFinite(sum))throw Error('Invalid sampling geometry '+name);
 function sampleCDF(a,x,property=null){
   let lo=0,hi=a.length;
   while(lo<hi){const mid=(lo+hi)>>1;const z=property?a[mid][property]:a[mid];if(z<x)lo=mid+1;else hi=mid;}
   return Math.min(a.length-1,lo);
 }
 for(let k=0;k<COUNT;k++){
   const p=primitives[sampleCDF(primitives,random()*sum,'threshold')];
   const idx=sampleCDF(p.cumulative,random()*p.total);
   const ia=p.ids[idx*3]*3,ib=p.ids[idx*3+1]*3,ic=p.ids[idx*3+2]*3;
   const u=Math.sqrt(random()),v=random();
   const x=barycentric(p.points,ia,ib,ic,u,v);
   const y=barycentric(p.points,ia+1,ib+1,ic+1,u,v);
   const z=barycentric(p.points,ia+2,ib+2,ic+2,u,v);
   const ab=new Vector3(p.points[ib]-p.points[ia],p.points[ib+1]-p.points[ia+1],p.points[ib+2]-p.points[ia+2]);
   const ac=new Vector3(p.points[ic]-p.points[ia],p.points[ic+1]-p.points[ia+1],p.points[ic+2]-p.points[ia+2]);
   const normal=ab.cross(ac).normalize();
   out.writeFloatLE(x,cursor);out.writeFloatLE(y,cursor+4);out.writeFloatLE(z,cursor+8);
   out.writeInt8(Math.round(normal.x*127),cursor+12);
   out.writeInt8(Math.round(normal.y*127),cursor+13);
   out.writeInt8(Math.round(normal.z*127),cursor+14);
   out.writeUInt8(p.tone,cursor+15);
   cursor+=16;
 }
 const center=min.clone().add(max).multiplyScalar(.5);
 worldBounds[name]={center:center.toArray(),min:min.toArray(),max:max.toArray(),maxDimension:max.clone().sub(min).length()};
 console.log(name,'sampled',COUNT,'points; visible bounds center:',center.toArray().map(x=>+x.toFixed(2)), 'source primitives',primitives.length);
}
if(cursor!==out.length)throw Error('Unexpected position end');
writeFileSync('public/scene/surface-points.bin',out);
writeFileSync('public/scene/model-bounds.json',JSON.stringify(worldBounds,null,2)+'\n');
console.log('Wrote',out.length,'bytes of world-space points');
