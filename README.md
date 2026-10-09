# LEEQ — Approved Camera Flight

An interactive 3D personal homepage using the user-approved Blender `camera_flight` assets. The approved 15-second camera trajectory is the source of truth, not the previous programmatic spline. There is no astronaut anywhere in the deployable scene.

## Run

```powershell
cd 'G:\Dev\个人主页'
npm install
npm run dev
```

The visible landing page contains **only the four oversized chapter titles**. All captions, biography paragraphs, top labels, footer text, and visible quality/motion buttons have been removed. Click the large title, use the right-side arrows, scroll, swipe, or use arrow keys to move. Open the icon-only menu for large-title chapter selection and icon links to GitHub / source credits. The flight sequence remains **sculpture → NASA 70m antenna → Curiosity rover → Apollo Lunar Module**, with 5 seconds of Blender-authored camera movement per leg. Returning follows the same frames backwards; the world never reloads.

## Approved source files

The original source ZIP and video remain untouched in `模型/camera_flight/`: `camera_flight_additional_web.zip`, `camera_flight_additional_data.zip`, and `camera_preview_additional.mp4`. The native Blender project is preserved in `camera_flight_additional_native.zip`.

Only their derived web representations are published:

| Asset | Usage |
| --- | --- |
| `reference/generated-camera-source/approved-models.glb` | **Ignored, build-time only** compact GLB; sampled locally, never downloaded or rendered in the browser |
| `public/scene/camera-path.json` | Original 361 camera positions/quaternions at 24 FPS, 15 seconds |
| `public/scene/surface-points.bin` | 22,000 actual, visible sculpture particles per model (world-space position, normal, color tone); this replaces any solid geometry |
| `public/scene/model-bounds.json` | Exact model centers for portrait-mode framing |
| `public/scene/ASSET_CREDITS.txt` | Attribution for the NASA-source models |

To regenerate from the original ZIP sources:

```powershell
npm run prepare:scene
npm run test:assets
npm run test:flight
npm run build
```

Desktop uses the exported camera poses directly, with simple quaternion slerp between samples and no second easing. Portrait devices apply a small smooth framing adjustment near camera docks so the sculptures remain visible in a narrow viewport. During travel, the camera retains the original Blender spatial route.

The original model meshes and textures are not redistributed. The public website ships only baked surface-particle positions, not the offline GLB sampling asset. The abstract sculpture's provenance still needs to be checked before any publication. NASA-origin model credits do not imply NASA endorsement. Review the credits and relevant usage guidance before deployment.

## Artistic direction and performance

**The website contains no visible solid 3D mesh.** The four approved Blender models are used strictly as offline geometry for GPU particle sampling. One continuous GPU point cloud (22,000 visible particles) now **scatters, spirals, travels, then reassembles** into the next approved model when the visitor navigates. Each of the four samples uses Morton-ordered spatial correspondence with a shared shuffle, staggered release and a timed turbulence envelope. During the 5-second camera flight, the disintegrating cloud crosses the physical camera's field of view; at both dock endpoints it is precisely centered on the original approved model position with the existing 14% desktop / 10% portrait enlargement. Reversing a chapter plays this choreography backwards. The restrained palette remains silver, muted blue/gray, soft champagne and rare lilac. The original 361-frame Blender camera route stays exactly as authored. A set of **three independent GPU particle layers** forms the environment: 8,200 distant galactic-haze points, 6,900 free-floating midground motes, and 320 soft foreground bokeh particles. Their positions are generated inside actual Blender camera viewing volumes, then remain independent in world space. They drift continuously and move more energetically during each flight without ever becoming a model. The palette remains understated silver, cool gray-blue, and pale champagne; there is no generated background picture or video.

**Sculpture display scale:** Each point-cloud sculpture now appears about **14% larger on widescreen desktops** and **10% larger in portrait/mobile layouts**, scaled around its own world-space bounding-box center. To adjust, change `setViewportScale()` in `src/particles/ApprovedParticleFields.js`. The actual GLSL transformation is in `src/particles/sculpture.vert.glsl`. On narrower non-portrait windows, `src/camera/ApprovedCamera.js` expands the vertical field of view to preserve the Blender 16:9 horizontal composition without cutting off the models; the original 361 camera positions/quaternions remain unchanged. The separate atmospheric particles are never scaled with the sculptures.

Rendering automatically defaults to ECO on low-memory or coarse-pointer devices. Hidden keyboard shortcuts allow manual toggling: **Q** = HIGH/ECO particle density and resolution; **M** = motion on/off, including when the OS requests reduced motion. Chapter copy is edited in `src/approved-main.js`.

`npm run build` emits the Github Pages-compatible `dist/` directory. Only publish the build after you review the model licenses; keep the ZIP and BLEND sources under ignored `模型/` and `reference/`.

## Project map

- `scripts/prepare-camera-scene.py`: source ZIP → **ignored offline sampling GLB**, camera JSON, credits; never exposes the solid model under `public/`.
- `scripts/bake-stage-points.mjs`: GLB → world-space surface point data.
- `src/camera/ApprovedCamera.js`: samples exact Blender frames.
- `src/particles/ApprovedParticleFields.js`: pure point-cloud sculpture draw calls and independent ambient particle shaders.
- `src/particles/MorphSculpture.js`: one continuous 4-pose spatially matched GPU sculpture with dynamic camera-facing scatter/reassembly, efficient High/ECO draw ranges.
- `src/particles/sculpture-morph.vert.glsl`: staggered particle break-up, vortex, moving scattering center, reassembly and exact endpoint positions.
- `src/particles/sculpture.frag.glsl`: restrained per-particle illumination reused by the morph engine.
- `reference/gpu-morph-restored-v2/sequence.jpg`: actual browser snapshots at 0%, 20%, 40%, 56%, 77%, and 100% of the first flight. Previous non-morph source is retained for rollback.
- `src/particles/sculpture.vert.glsl` and `sculpture.frag.glsl`: world-space GPU dots, animated point motion, optical glow and subtle color mixing.
- `src/approved-main.js`: real-time scene, navigation and text.
- `src/approved.css`: responsive cinematic UI.

The older V4/V5 procedural project modules remain in the repository for reversible rollback, but are no longer the running page.
