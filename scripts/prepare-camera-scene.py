"""Prepare only the user-approved cinematic scene from camera_flight/*.zip.

Keeps world transforms and camera samples intact. The compact GLB omits texture
payloads and unused vertex attributes, because the approved Workbench preview
uses neutral clay materials. Source ZIP/BLEND/GLB archives are never altered.
"""
from pathlib import Path
import json, zipfile, struct, hashlib

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'模型'/'camera_flight'
TARGET=ROOT/'public'/'scene'
TARGET.mkdir(parents=True,exist_ok=True)
# The 3D mesh is only an offline sampling intermediate, never a public asset.
MODEL_SOURCE=ROOT/'reference'/'generated-camera-source'
MODEL_SOURCE.mkdir(parents=True,exist_ok=True)
MODELS=['Model_Root_Sculpture','Model_Root_Dish70M','Model_Root_Curiosity','Model_Root_Apollo_Lm']

def parse_glb(blob):
    assert blob[:4]==b'glTF', 'invalid GLB header'
    assert struct.unpack_from('<II',blob,4)==(2,len(blob)), 'invalid GLB length'
    j=None;b=None;o=12
    while o<len(blob):
        n,tag=struct.unpack_from('<II',blob,o)
        data=blob[o+8:o+8+n]
        if tag==0x4e4f534a:j=json.loads(data)
        if tag==0x004e4942:b=data
        o+=n+8
    assert j and b
    return j,b

def palette(material):
    name=material.get('name','').lower()
    if any(s in name for s in ('glass','rubber','carbon','black','graphite','shadow','dark')):
        return [0.33,0.35,0.37,1.0], 0.15
    if any(s in name for s in ('gold','copper','brass','bronze','thermal','champagne')):
        return [0.67,0.63,0.56,1.0], 0.32
    if any(s in name for s in ('silver','steel','metal','titanium','aluminium','chrome')):
        return [0.71,0.73,0.73,1.0],0.32
    return [0.67,0.68,0.69,1.0],0.17

with zipfile.ZipFile(SOURCE/'camera_flight_additional_web.zip') as z:
    original=z.read('camera_flight_additional.glb')
    json_data, buffer=parse_glb(original)

# Rebuild the binary, copying only geometry accessors and their backing views.
old_views=json_data['bufferViews']
old_acc=json_data['accessors']
new_views=[];new_accessors=[];packed=bytearray()
view_map={};acc_map={}
def copy_view(index):
    if index in view_map:return view_map[index]
    view=old_views[index]
    assert view.get('buffer',0)==0
    start=view.get('byteOffset',0);length=view['byteLength']
    pad=(-len(packed))%4
    if pad:packed.extend(b'\x00'*pad)
    offset=len(packed)
    packed.extend(buffer[start:start+length])
    assert len(packed)-offset==length
    new_v={key:value for key,value in view.items() if key not in ('buffer','byteOffset','extensions')}
    new_v.update(buffer=0,byteOffset=offset)
    view_map[index]=len(new_views)
    new_views.append(new_v)
    return view_map[index]
def copy_accessor(index):
    if index in acc_map:return acc_map[index]
    acc=dict(old_acc[index])
    assert not acc.get('sparse'),'sparse geometry requires dedicated conversion'
    acc['bufferView']=copy_view(acc['bufferView'])
    acc.pop('extensions',None)
    acc_map[index]=len(new_accessors)
    new_accessors.append(acc)
    return acc_map[index]
all_materials=json_data.get('materials',[])
material_palette=[]
for m in all_materials:
    color,metal=palette(m)
    material_palette.append({
      'name':m.get('name','Clay')+' / neutral preview',
      'doubleSided':True,
      'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':metal,'roughnessFactor':0.78},
      'alphaMode':'OPAQUE'
    })
if not material_palette:material_palette=[{'pbrMetallicRoughness':{'baseColorFactor':[0.68,0.69,0.70,1],'metallicFactor':0.2,'roughnessFactor':0.75},'doubleSided':True}]
meshes=[]
for mesh in json_data['meshes']:
    primitives=[]
    for p in mesh['primitives']:
        assert p.get('mode',4)==4
        attrs={key:copy_accessor(val) for key,val in p['attributes'].items() if key in ('POSITION','NORMAL')}
        assert 'POSITION' in attrs
        q={'attributes':attrs,'mode':4,'material':p.get('material',0)}
        if 'indices' in p:q['indices']=copy_accessor(p['indices'])
        primitives.append(q)
    meshes.append({'name':mesh.get('name','mesh'),'primitives':primitives})
camera_ids=[i for i,n in enumerate(json_data['nodes']) if 'camera' in n]
root_ids=json_data['scenes'][json_data.get('scene',0)]['nodes']
roots={json_data['nodes'][i].get('name'):i for i in root_ids}
assert all(n in roots for n in MODELS),f'Missing expected roots: {roots.keys()}'
compact={
 'asset':{'version':'2.0','generator':'LEEQ camera_flight scene mesh exporter (neutral-preview-only)'},
 'scene':0,'scenes':[{'name':'Approved Camera Flight Stages','nodes':[roots[n] for n in MODELS]}],
 'nodes':json_data['nodes'],'meshes':meshes,
 'accessors':new_accessors,'bufferViews':new_views,
 'buffers':[{'byteLength':len(packed)}],'materials':material_palette
}
# Avoid orphan references to the removed camera animation / textures.
for n in compact['nodes']:
    n.pop('extensions',None)
    n.pop('camera',None)
compact['nodes']=[{k:v for k,v in n.items() if k not in ('skin','weights')} for n in compact['nodes']]
# Purge camera nodes from scene roots, but their IDs remain to preserve hierarchy references.
metadata=json.dumps(compact,separators=(',',':'),ensure_ascii=False).encode('utf8')
metadata+=b' ' * ((-len(metadata))%4)
packed.extend(b'\x00' * ((-len(packed))%4))
glb=bytearray(struct.pack('<4sII',b'glTF',2,12+8+len(metadata)+8+len(packed)))
glb+=struct.pack('<II',len(metadata),0x4e4f534a)+metadata
glb+=struct.pack('<II',len(packed),0x004e4942)+packed
j2,b2=parse_glb(glb)
assert len(j2['meshes'])==len(json_data['meshes'])
assert not any(x in j2 for x in ('images','textures','animations','extensionsRequired'))
assert len(b2)==j2['buffers'][0]['byteLength']
mesh_path=MODEL_SOURCE/'approved-models.glb'
mesh_path.write_bytes(glb)

with zipfile.ZipFile(SOURCE/'camera_flight_additional_data.zip') as z:
    path=json.loads(z.read('camera_keyframes_additional.json'))
    frames=path['frames']
    assert (len(frames),path['fps'],path['frameStart'],path['frameEnd'])==(361,24,120,480)
    # Exact floating-point samples from the original JSON: 0,5,10,15 second dock.
    camera_data={
      'schema':'approved-camera-flight/1.0',
      'source':'camera_flight_additional_data.zip/camera_keyframes_additional.json',
      'fps':24,'duration':15,'frameCount':len(frames),
      'dockSeconds':[0,5,10,15],
      'dockIds':['home','about','work','contact'],
      'camera':'Portfolio_Camera',
      'coordinateSystem':'right-handed glTF Y-up',
      'verticalFov':40,
      'samples':[[*f['position'],*f['quaternion']] for f in frames],
      'targets':[f['lookAt'] for f in frames],
      'worldModelRoots':MODELS
    }
    assert all(len(s)==7 for s in camera_data['samples'])
    assert all(len(t)==3 for t in camera_data['targets'])
    (TARGET/'camera-path.json').write_text(json.dumps(camera_data,separators=(',',':'))+'\n',encoding='utf8')
    (TARGET/'ASSET_CREDITS.txt').write_bytes(z.read('ASSET_CREDITS.txt'))
    manifest=json.loads(z.read('scene_manifest.json'))
    (TARGET/'approved-scene-manifest.json').write_text(json.dumps({
       'source':'camera_flight_additional_data.zip/scene_manifest.json',
       'docks':manifest['docks'],
       'models':{key:{'max_dimension':val.get('max_dimension'),'showcase_region_blender':val.get('showcase_region_blender')} for key,val in manifest['models'].items()}
    },ensure_ascii=False,indent=2)+'\n',encoding='utf8')

print('SOURCE GLB',round(len(original)/1e6,2),'MB')
print('OFFLINE SOURCE GLB',round(len(glb)/1e6,2),'MB','(ignored intermediate, not published)')
print('CAMERA JSON',round((TARGET/'camera-path.json').stat().st_size/1024,1),'KiB, 361 samples @24fps')
print('MODEL ROOTS',MODELS)
print('ORIGINALS NOT MODIFIED')
