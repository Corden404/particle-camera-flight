# LEEQ — Particle Camera Flight

A personal homepage built with Vite, Three.js and GSAP around the approved Blender camera flight. The hero combines oversized outline/filled chapter titles with four sculptures rendered entirely as particles.

## Run locally

```powershell
cd 'G:\Dev\个人主页'
npm ci
npm run dev
```

Use `npm ci` when setting up a fresh checkout. To inspect the production build:

```powershell
npm test
npm run build
npm run preview
```

The current verification environment uses Node.js 24. The build has relative asset URLs (`base: './'`) and writes to `dist/`.

## Navigation and content

The sequence is **sculpture → NASA 70m antenna → Curiosity rover → Apollo Lunar Module**. Every complete adjacent camera leg lasts five seconds; reverse travel follows the same exported route backwards. A direct menu jump across multiple chapters takes five seconds per crossed leg.

| Action | Result |
| --- | --- |
| Scroll or swipe vertically | Move one chapter; repeated momentum does not queue extra chapters |
| Right-side arrows | Previous/next chapter, bounded at the ends |
| Background Arrow/Page keys or Space | Chapter navigation |
| Space/Enter on a focused control | That control's native action |
| First two large titles | Next chapter |
| Work title | Open the work panel describing this camera-flight study |
| Contact title | Open the contact panel with the existing GitHub profile |
| Menu | Choose a chapter, reduce motion, change High/Eco quality, open GitHub or asset credits |
| Escape | Close a dismissible panel and restore focus |
| Background M / Q | Toggle motion / quality |

The successful hero retains only the four original two-line titles. Supporting content appears in panels. The work and contact destinations use the existing `Corden404` GitHub identity; project-specific repository URLs and email addresses are not fabricated.

## Approved assets

Original ZIP, BLEND and video sources remain under ignored `模型/camera_flight/`. The browser downloads only derived scene data.

| File | Purpose |
| --- | --- |
| `reference/generated-camera-source/approved-models.glb` | Ignored offline geometry for sampling; never rendered or downloaded by the webpage |
| `public/scene/camera-path.json` | Unmodified 361 camera samples at 24 FPS across 15 seconds |
| `public/scene/surface-points.bin` | Four poses of 22,000 sampled points: position, normal and regional tone |
| `public/scene/model-bounds.json` | Original model centers and bounds |
| `public/scene/ASSET_CREDITS.txt` | Model attribution and usage notes |

To regenerate from the preserved source archives:

```powershell
npm run prepare:scene
npm test
npm run build
```

To rebake only particle sampling from the existing ignored GLB:

```powershell
node scripts/bake-stage-points.mjs
npm run test:assets
```

The baker allocates the exact point budget across connected surface components. Bounded weighting gives small and thin structures more representation. Seeded stratified/Halton sampling, interpolated transformed normals and coherent component/material tones preserve repeatability. Rebaking points does not rewrite the approved camera or bounds.

## Composition and artistic controls

The runtime measures the app rectangle and derives one continuous portrait weight from its aspect ratio. Titles, camera framing and sculpture scale share that weight. There is no abrupt 759/760-pixel camera switch. Wide viewports use the original camera positions/quaternions; portrait dock adjustments fade away during travel.

The sculptures use one morphing `THREE.Points` draw object with 22,000 points in High and 70% of that draw range in Eco. No solid mesh is added. The three independent atmospheric layers contain 8,200 distant points, 6,900 midground motes and 320 foreground particles before quality reduction.

Static forms use directional key/fill/rim lighting, signed front/back attenuation, coherent surface tone, and a small set of brighter points. Active fragment shaders operate in linear working color, then apply the renderer's tone mapping and sRGB conversion. Point diameters account for viewport height, projection and depth.

Each of the three legs has its own scatter, swirl direction, bend, lift and camera-focus envelope. Particle paths depend on chapter phase, so reverse travel retraces the same shapes. Motion decays before docking and exact integer story positions use the baked poses with the existing display scale (1.14 on wide layouts, smoothly approaching 1.10 in portrait). Idle motion affects light subtly rather than distorting the model.

| What to adjust | Active location |
| --- | --- |
| Chapter title text and panel content | `src/approved-main.js` |
| Title sizing, position and continuous layout limits | `src/layout/viewport.js` |
| Fonts, line proportions, spacing, grain and panel styling | `src/approved.css` |
| Dock framing and camera interpolation | `src/camera/ApprovedCamera.js` |
| Per-leg envelopes, palette and display scale | `src/particles/art-direction.js` |
| Sculpture uniforms, pose alignment and draw range | `src/particles/MorphSculpture.js` |
| Sculpture lighting, particle size and transit geometry | `src/particles/sculpture-morph.vert.glsl` |
| Particle core, halo and final output color | `src/particles/sculpture.frag.glsl` |
| Independent ambient field | `src/particles/ApprovedParticleFields.js` |
| Offline sampling weights and distribution | `scripts/point-sampling.mjs` |

## Accessibility, loading and rendering

Menus and panels contain keyboard focus, mark the background inert, and restore focus when closed. Controls have visible focus treatment and touch-sized hit areas. Native button key activation is not intercepted by global navigation.

System reduced-motion changes apply live until the visitor chooses an explicit override. Reduced-motion mode moves immediately to the destination and renders on demand. Frozen captures, hidden documents and open panels stop continuous scene rendering. Low-memory or coarse-pointer devices start in Eco; the menu exposes both display preferences.

A failed asset request, WebGL startup failure, a 20-second load timeout or a lost WebGL context opens a visible recovery panel with Retry and the real GitHub link. Retry after context loss replaces the failed canvas before initializing a new renderer. Obsolete asynchronous loads cannot reactivate a failed scene; late particle resources are disposed. Their underlying requests may still finish because the current factories do not accept an AbortSignal.

If the application module fails to load, the static HTML retains the identity, GitHub destination and reload action.

## Verification and deterministic inspection

```powershell
npm run test:unit
npm run test:assets
npm run test:flight
npm test
npm run build
```

The unit suites cover bounded/reversible navigation and wheel intent, native-key exclusions, viewport continuity and original camera poses, deterministic transit envelopes, exact sampling budgets and normalized interpolated normals. The asset and flight checks validate the deployable data contract and authored camera.

For reproducible visual inspection:

- `/?debug=1` enables the diagnostic interface.
- `/?capture=0&captureTime=4` freezes the home dock.
- `/?capture=0.5&captureTime=4` freezes the midpoint of the first leg.
- Use `capture=1`, `2` or `3` for the other docks.
- With a capture query and no explicit time, the frozen time is zero.
- `window.__LEEQ_DEBUG` exposes readiness, story/target, camera, point counts, layout, renderer info, frame count, `goTo()` and `seek()`.

Inspect actual desktop and phone renders when changing light, size or composition. A passing build does not establish visual quality or performance on every device. Local animation callback timings are not field Core Web Vitals or GPU timings.

## Project map and source preservation

- `index.html`: metadata, one font stylesheet request and static fallback.
- `src/approved-main.js`: current application entry, render lifecycle and input integration.
- `src/interaction/Navigation.js`: pure chapter and gesture state.
- `src/ui/overlays.js`: modal lifecycle and focus handling.
- `scripts/prepare-camera-scene.py`: source archives to ignored GLB and derived metadata.
- `scripts/bake-stage-points.mjs`: offline GLB to the public point binary.
- `tests/`: regression suites using the Node built-in test runner.
- `vite.config.js`: relative build paths and separate stable Three/GSAP vendor chunks.

Older procedural and non-morph modules remain for reversible rollback and are not the active page. Original archives, internal references, build output and installed dependencies remain ignored by Git.

Model credits and existing source-usage notes remain in `public/scene/ASSET_CREDITS.txt`. The abstract sculpture's provenance still needs review before publication; NASA-source attribution does not imply endorsement.
