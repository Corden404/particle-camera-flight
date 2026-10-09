import { Matrix3, Vector3 } from 'three';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
function hash(text) {
  let value = 2166136261;
  for (const letter of text) value = Math.imul(value ^ letter.charCodeAt(0), 16777619);
  return value >>> 0;
}
function generator(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value,1664525)+1013904223)>>>0) / 4294967296);
}
function radicalInverse(index, base) {
  let result = 0, fraction = 1/base;
  while(index>0) { result += (index%base)*fraction; index=Math.floor(index/base); fraction/=base; }
  return result;
}
function normalize(normal, fallback) {
  const length = Math.hypot(...normal);
  return length>1e-12 && Number.isFinite(length) ? normal.map(x=>x/length) : [...fallback];
}

export function transformVertexNormals(normals, transform) {
  if (!normals) return undefined;
  const matrix = new Matrix3().getNormalMatrix(transform);
  const output = new Float32Array(normals.length), vector = new Vector3();
  for(let i=0;i<normals.length;i+=3) {
    vector.fromArray(normals,i).applyMatrix3(matrix);
    const length=vector.length();
    if(Number.isFinite(length) && length>1e-12) vector.multiplyScalar(1/length);
    else vector.set(0,0,0);
    vector.toArray(output,i);
  }
  return output;
}

// Weld only for topology discovery. Sampling still uses original vertices and
// their authored per-face normals, so a split hard edge remains a hard edge.
// Union-find and spatial keys are linear in input size; no nearest-neighbor scan.
export function prepareSurfaceParts(primitives) {
  const parts=[];
  for(const primitive of primitives) {
    const {points,ids}=primitive, vertices=points.length/3;
    if(!Number.isInteger(vertices)) throw Error('Invalid surface positions');
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<points.length;i++) {
      if(!Number.isFinite(points[i])) throw Error('Nonfinite surface position');
      const axis=i%3; min[axis]=Math.min(min[axis],points[i]); max[axis]=Math.max(max[axis],points[i]);
    }
    if(!vertices) continue;
    const diagonal=Math.hypot(...max.map((x,i)=>x-min[i]));
    const tolerance=Math.max(1e-8,diagonal*1e-6);
    const parent=Int32Array.from({length:vertices},(_,i)=>i),weld=new Map();
    const weldedIndices=new Int32Array(vertices);
    function find(i) {
      let root=i; while(parent[root]!==root) root=parent[root];
      while(parent[i]!==i) { const next=parent[i]; parent[i]=root; i=next; }
      return root;
    }
    function join(a,b) { a=find(a); b=find(b); if(a!==b) parent[b]=a; }
    for(let i=0;i<vertices;i++) {
      const key=[0,1,2].map(a=>Math.round((points[i*3+a]-min[a])/tolerance)).join(',');
      if(weld.has(key)) { weldedIndices[i]=weld.get(key); join(i,weldedIndices[i]); }
      else { weldedIndices[i]=i; weld.set(key,i); }
    }
    const triangles=[];
    for(let i=0;i+2<ids.length;i+=3) {
      const indices=[ids[i],ids[i+1],ids[i+2]];
      if(indices.some(x=>!Number.isInteger(x)||x<0||x>=vertices)) throw Error('Invalid surface index');
      const [a,b,c]=indices.map(x=>x*3);
      const ab=[0,1,2].map(j=>points[b+j]-points[a+j]);
      const ac=[0,1,2].map(j=>points[c+j]-points[a+j]);
      const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      const area=Math.hypot(...cross)*.5;
      if(!(area>0) || !Number.isFinite(area)) continue;
      join(indices[0],indices[1]); join(indices[0],indices[2]);
      const perimeter=Math.hypot(...ab)+Math.hypot(...ac)+Math.hypot(...ab.map((x,j)=>x-ac[j]));
      // Slender triangles often describe rods and contour strips even when a
      // whole antenna or rover was exported as one connected material region.
      const shapeBoost=clamp(perimeter*perimeter/(20.784609690826528*area),1,1.5);
      triangles.push({indices,area,shapeBoost,normal:cross.map(x=>x/(area*2))});
    }
    const components=new Map();
    for(const triangle of triangles) {
      const key=find(triangle.indices[0]);
      if(!components.has(key)) components.set(key,{...primitive,triangles:[],area:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
      const part=components.get(key);
      part.triangles.push(triangle); part.area+=triangle.area;
      for(const i of triangle.indices) for(let a=0;a<3;a++) {
        part.min[a]=Math.min(part.min[a],points[i*3+a]); part.max[a]=Math.max(part.max[a],points[i*3+a]);
      }
    }
    let component=0;
    for(const part of components.values()) {
      part.region=(primitive.region||'surface')+' / component '+component++;
      // Sample actual open boundaries and sharp crease edges, not arbitrary
      // interior triangle borders. Coordinate-welded IDs keep split normals
      // at hard edges without mistaking UV seams for disconnected geometry.
      const edges=new Map();
      for(const triangle of part.triangles) {
        for(const [a,b] of [[0,1],[1,2],[2,0]]) {
          const ia=triangle.indices[a],ib=triangle.indices[b];
          const lo=Math.min(weldedIndices[ia],weldedIndices[ib]);
          const hi=Math.max(weldedIndices[ia],weldedIndices[ib]);
          if(lo===hi) continue;
          const key=lo+','+hi;
          const found=edges.get(key);
          if(found) {
            found.faces++;
            found.minDot=Math.min(found.minDot,
              found.normal.reduce((sum,x,axis)=>sum+x*triangle.normal[axis],0));
          } else {
            const length=Math.hypot(...[0,1,2].map(axis=>
              points[ia*3+axis]-points[ib*3+axis]));
            if(length<=tolerance) continue;
            edges.set(key,{triangle,edgeSlots:[a,b],normal:triangle.normal,
              faces:1,minDot:1,length});
          }
        }
      }
      part.featureEdges=[];
      let cumulative=0;
      for(const edge of edges.values()) {
        if(edge.faces!==1 && edge.minDot>=0.8) continue;
        cumulative+=edge.length*(edge.faces===1?1:1.25);
        part.featureEdges.push({...edge,cumulative});
      }
      part.featureWeight=cumulative;
      part.featureCumulative=Float64Array.from(part.featureEdges,edge=>edge.cumulative);
      parts.push(part);
    }
  }
  const totalArea=parts.reduce((sum,part)=>sum+part.area,0);
  for(const part of parts) {
    const dimensions=part.max.map((x,i)=>x-part.min[i]).sort((a,b)=>b-a);
    const aspect=dimensions[0]/Math.max(dimensions[1],dimensions[0]*.02,1e-12);
    // Small connected pieces get a bounded reserve, slender pieces an aspect
    // boost. The density cap is 6x area-only (4x part * <=1.5x triangle).
    const importance=clamp(1+.28*Math.max(0,aspect-1)+.12*Math.max(0,Math.sqrt(totalArea/part.area)-1),1,4);
    let total=0;
    part.cumulative=Float64Array.from(part.triangles,triangle => total+=triangle.area*triangle.shapeBoost);
    part.triangleWeight=total;
    part.weight=total*importance;
    if(!(part.weight>0) || !Number.isFinite(part.weight)) throw Error('Invalid surface importance');
  }
  return parts;
}

function findTriangle(cumulative,value) {
  let low=0,high=cumulative.length;
  while(low<high) { const middle=(low+high)>>1; if(cumulative[middle]<=value) low=middle+1; else high=middle; }
  return Math.min(low,cumulative.length-1);
}
function regionalTone(part,position,normal) {
  const label=part.region.toLowerCase();
  let base=104+(hash(label)%43),low=82,high=174;
  if(/gold|brass|copper|thermal|champagne/.test(label)) { base=208; low=190; high=220; }
  else if(/black|dark|graphite|rubber|carbon|wheels/.test(label)) { base=46; low=32; high=66; }
  else if(/platinum|chamfer/.test(label)) base=/chamfer/.test(label)?146:126;
  const local=position.map((x,i)=>(x-part.min[i])/Math.max(part.max[i]-part.min[i],1e-9)-.5);
  // Coherent broad surface relief; no independent random color at each point.
  const relief=local[0]*9+local[1]*16+local[2]*7+normal[1]*5;
  return Math.round(clamp(base+relief,low,high));
}

export function sampleSurfaceParts(parts,count,seed=39143721) {
  if(!Number.isInteger(count)||count<1) throw Error('Invalid surface sample count');
  const total=parts.reduce((sum,part)=>sum+part.weight,0);
  if(!(total>0)||!Number.isFinite(total)) throw Error('No valid surface to sample');
  const random=generator(seed);
  const boundsMin=[Infinity,Infinity,Infinity],boundsMax=[-Infinity,-Infinity,-Infinity];
  for(const part of parts) for(let axis=0;axis<3;axis++) {
    boundsMin[axis]=Math.min(boundsMin[axis],part.min[axis]);
    boundsMax[axis]=Math.max(boundsMax[axis],part.max[axis]);
  }
  const sceneDiagonal=Math.max(1e-12,Math.hypot(...boundsMax.map((x,i)=>x-boundsMin[i])));
  // Area weighting alone can assign zero dots to a dish strut, rover arm or
  // lunar-module leg. Reserve a small part budget before area distribution.
  // Tiny subpixel fragments receive just one point; important spans receive
  // more, without letting hundreds of bolts consume the body.
  const quotas=parts.map((part,index)=>{
    const diagonal=Math.hypot(...part.max.map((x,i)=>x-part.min[i]));
    const share=diagonal/sceneDiagonal;
    const desired=share>=0.02?12:share>=0.005?5:1;
    return {part,index,desired,minimum:0};
  });
  const minimumBudget=Math.min(count,Math.floor(count*0.20));
  const desiredTotal=quotas.reduce((sum,q)=>sum+q.desired,0);
  const multiplier=desiredTotal>minimumBudget?minimumBudget/desiredTotal:1;
  let reserved=0;
  for(const quota of quotas) {
    quota.exact=quota.desired*multiplier;
    quota.minimum=Math.floor(quota.exact);
    reserved+=quota.minimum;
  }
  const extra=Math.min(minimumBudget-reserved,Math.ceil(desiredTotal*multiplier)-reserved);
  const byRemainder=[...quotas].sort((a,b)=>
    (b.exact-b.minimum)-(a.exact-a.minimum)||b.part.weight-a.part.weight||a.index-b.index);
  for(let i=0;i<extra;i++) {byRemainder[i].minimum++;reserved++;}
  const free=count-reserved;
  const allocation=quotas.map(quota=>{
    const exact=free*quota.part.weight/total;
    return {part:quota.part,index:quota.index,count:quota.minimum+Math.floor(exact),fraction:exact%1};
  });
  const remaining=count-allocation.reduce((sum,item)=>sum+item.count,0);
  const ranked=[...allocation].sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
  for(let i=0;i<remaining;i++) ranked[i].count++;
  const samples=[];
  for(const {part,count:amount} of allocation) {
    const shiftU=random(),shiftV=random(),offset=1+(hash(part.region)^seed)>>>0;
    const edgeAmount=part.featureWeight>0?Math.floor(amount*0.24):0;
    const interiorAmount=amount-edgeAmount;
    for(let k=0;k<amount;k++) {
      // Near one quarter of dots follow true boundaries/creases, keeping the
      // silhouette intact. The remainder retain stratified surface coverage.
      let triangle,barycentric;
      if(k<edgeAmount) {
        const edge=part.featureEdges[findTriangle(part.featureCumulative,
          (k+0.5)*part.featureWeight/edgeAmount)];
        const t=(radicalInverse((offset%1048576)+k+1,2)+shiftU)%1;
        triangle=edge.triangle;
        barycentric=[0,0,0];
        barycentric[edge.edgeSlots[0]]=1-t;
        barycentric[edge.edgeSlots[1]]=t;
      } else {
        const index=k-edgeAmount;
        triangle=part.triangles[findTriangle(part.cumulative,
          (index+0.5)*part.triangleWeight/interiorAmount)];
        const u=Math.sqrt((radicalInverse((offset%1048576)+index+1,2)+shiftU)%1);
        const v=(radicalInverse((offset%1048576)+index+1,3)+shiftV)%1;
        barycentric=[1-u,u*(1-v),u*v];
      }
      const position=[0,0,0],normal=[0,0,0];
      for(let vertex=0;vertex<3;vertex++) {
        const index=triangle.indices[vertex]*3;
        for(let a=0;a<3;a++) {
          position[a]+=part.points[index+a]*barycentric[vertex];
          if(part.normals) normal[a]+=part.normals[index+a]*barycentric[vertex];
        }
      }
      const unitNormal=normalize(normal,triangle.normal);
      samples.push({position,normal:unitNormal,barycentric,tone:regionalTone(part,position,unitNormal)});
    }
  }
  // Mix parts reproducibly so runtime morphs do not travel as component blocks.
  for(let i=samples.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1)); [samples[i],samples[j]]=[samples[j],samples[i]];
  }
  return samples;
}
