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

## GitHub Pages

Public website: https://corden404.github.io/particle-camera-flight/

The [deployment workflow](.github/workflows/deploy-pages.yml) runs on pushes to `main` (or by manual workflow dispatch). It installs dependencies with Node.js 24, runs tests, builds the Vite site, and publishes only `dist/` to GitHub Pages. Repository Pages settings must use **GitHub Actions** as the build source.

Vite uses `base: './'` so scripts and derived scene assets resolve correctly beneath the `/particle-camera-flight/` project path. Private source archives in `模型/` and local reference files are not part of the deployment.

## Navigation and content

The sequence is **sculpture → NASA 70m antenna → Curiosity rover → Apollo Lunar Module**. Every complete adjacent camera leg lasts five seconds; reverse travel follows the same exported route backwards. A direct menu jump across multiple chapters takes five seconds per crossed leg.

| Action | Result |
| --- | --- |
| Move the pointer across the scene | Push and drag nearby particles; leave a fading wave through the sculpture and background |
| Scroll or swipe vertically | Move one chapter; repeated momentum does not queue extra chapters |
| Background Arrow/Page keys or Space | Chapter navigation |
| Space/Enter on a focused control | That control's native action |
| Large chapter titles | Display-only headings with no click navigation |
| Sound button | Enable or mute ambient sound and interaction tones |
| Menu | Choose a chapter, control sound and reduced motion, change High/Eco quality, open GitHub or asset credits |
| Escape | Close a dismissible panel and restore focus |
| Background M / Q | Toggle motion / quality |

The hero retains the four original two-line titles as plain headings. The right-side progress rail and arrows are removed; scrolling, swiping, keyboard navigation and the menu remain available. The GitHub destination is an explicit menu link.

## Cursor, sound and titles

On fine-pointer devices, the scene uses a small warm dot and a thin following ring. The native pointer is replaced only over the canvas after the custom cursor is ready. Controls, dialogs, keyboard navigation, touch devices, reduced motion and frozen captures use the native pointer. Cursor dimensions, color and follow timing live in `src/ui/scene-cursor.css`.

Sound starts **off** on a first visit. Use the header sound button or the menu control to enable a quiet synthesized ambient chord and short interaction tones. No external audio file is downloaded. The choice is saved under `leeq.audio.v1`; a remembered on preference still waits for a browser-permitted interaction before playback. Sound fades in and out, becomes quieter while a menu is open, and suspends when the page is hidden or the scene is unavailable. The fixed audio graph and click-voice limit are implemented in `src/audio/AmbientAudio.js`.

Each title line enters and leaves through its own clipping mask. `src/interaction/TitleMotion.js` samples both lines from the continuous camera story position. A departing heading remains briefly while its sculpture releases, then rises out of its mask; the incoming heading rises into place as the next sculpture gathers. Reversing travel retraces the same title positions, including short reversals, and long menu flights reveal the intermediate chapter headings.

| Five-second camera leg | Outgoing title fully hidden | Incoming title starts | Both lines fully visible |
| --- | ---: | ---: | ---: |
| Home → About | 1.25 s | 3.20 s | 4.20 s |
| About → Work | 1.10 s | 3.10 s | 4.10 s |
| Work → Contact | 1.40 s | 3.30 s | 4.30 s |

`TITLE_PHASES` contains these per-leg phases, a 0.60-second exit, a 0.90-second entrance and a 0.10-second line stagger. `TITLE_MOTION` sets the initial page entrance (0.92 s per line, 0.08 s stagger, 0.12 s delay) and 104% mask travel. The initial entrance composes with navigation instead of resetting during early input. Reduced motion shows the destination heading immediately. Open dialogs and hidden pages pause both camera travel and the initial entrance. Edit the per-chapter proportions in `src/approved.css` and the continuous desktop/portrait sizing and placement in `src/layout/viewport.js`.

## Approved assets

Original ZIP, BLEND and video sources remain under ignored `模型/camera_flight/`. The browser downloads only derived scene data.

| File | Purpose |
| --- | --- |
| `reference/generated-camera-source/approved-models.glb` | Ignored offline geometry for sampling; never rendered or downloaded by the webpage |
| `public/scene/camera-path.json` | Unmodified 361 camera samples at 24 FPS across 15 seconds |
| `public/scene/surface-points.bin` | Preserved STG1 source: four poses of 36,000 points with position, normal, regional tone and structural edge strength |
| `public/scene/surface-points-aligned.bin` | Browser-loaded STG2 derivative: the same packed records, already aligned for morphing |
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

The baker allocates the exact point budget across connected surface components. Visible small parts have minimum quotas before area weighting, and roughly 32% of each populated component's dots trace real boundary or sharp-crease edges. These tagged points are stored in a 17-byte record and independently rendered as smaller, less mobile, brighter edge grains, without adding wireframe geometry. Seeded stratified/Halton sampling, interpolated transformed normals and coherent component/material tones preserve repeatability. Rebaking points does not rewrite the approved camera or bounds.

The baker also produces the aligned STG2 derivative. To regenerate only that derivative from the checked-in raw data, without the private GLB:

```powershell
node scripts/align-stage-points.mjs
npm run test:assets
```

STG2 retains the original 17-byte records and 2,448,016-byte file size. Morton ordering and the seeded permutation run offline; the browser directly expands the aligned records. All ten GPU attribute arrays, random values, model bounds and High/Eco subsets remain byte-identical to the approved STG1 runtime. Both files are retained in the build, but normal scene startup requests only STG2. `src/particles/surface-data.js` also retains STG1 decoding for compatibility.

## Composition and artistic controls

The runtime measures the app rectangle and derives one continuous portrait weight from its aspect ratio. Titles, camera framing and sculpture scale share that weight. There is no abrupt 759/760-pixel camera switch. Wide viewports use the original camera route as their base, with damped pointer parallax added while motion is enabled; portrait dock adjustments fade away during travel.

The sculptures use two morphing `THREE.Points` layers sharing 36,000 points in High (84% opaque, alpha-to-coverage depth-tested silhouette and 16% transparent reactive sparkle), with 70% of each layer's draw range in Eco. The atmosphere combines 1,900 colored spatial flecks, 72 near-lens particles and an independent responsive microdot grid. The grid uses 40–300 columns according to viewport width, reduced in Eco. All five draw objects are point clouds, with no solid meshes.

Blue (`#4089dd`) and amber (`#f48c18`) color regions move across each form, blended toward luminance-matched neutral tones for a softer, lower-saturation finish; background flecks and the responsive microdot grid are desaturated separately. The desaturation weights live in `src/particles/sculpture.frag.glsl` and `src/particles/ApprovedParticleFields.js`. Limited silver highlights and crisp varied grains remain. Particle materials bypass ACES tone mapping to retain those colors. The sculpture emits calibrated display colors directly; the ambient materials convert their linear palette to sRGB. Grain diameters account for viewport height, projection, depth and cursor proximity. Opaque structural dots avoid depth-writing translucent holes; a slower and smaller settled rock/drift preserves the authored outline. Stable contour particles also have a one-CSS-pixel 50%-coverage diameter floor and a tighter feather, while their small idle drift is bounded in screen space. This targeted treatment affects the model's settled contour; the atmosphere, point count and approved camera data stay independent.

Each of the three legs has its own scatter, swirl direction, bend, lift and camera-focus envelope. The underlying transition remains chapter-phase driven. Continuous bounded drift, traveling surface waves and gentle rocking are added around the current model center, including when a chapter is settled. The microdot grid has its own moving brightness and displacement waves. Pointer position and velocity drive a shared local force with an eight-sample wake that fades over roughly 1.8 seconds; reduced motion disables these offsets.

### Published visual preset

The public homepage now uses the approved, fixed appearance in `VISUAL_DEFAULTS` (`src/controls/visual-settings.js`). The visual-adjustment icon, slider panel and **V** shortcut are disabled. Older per-browser slider preferences no longer affect the published scene. The model, ambient particles and camera retain their authored appearance. The previous tuner code is retained in `src/ui/VisualControls.js` for reversible future development.

| What to adjust | Active location |
| --- | --- |
| Chapter title text | `src/approved-main.js` |
| Title entrance, exit and camera phase timing | `src/interaction/TitleMotion.js` |
| Scene cursor behavior and appearance | `src/ui/SceneCursor.js`, `src/ui/scene-cursor.css` |
| Ambient chord, click tones, gain and fade durations | `src/audio/AmbientAudio.js` |
| Title sizing, position and continuous layout limits | `src/layout/viewport.js` |
| Line proportions, spacing, grain and panel styling | `src/approved.css` |
| Local font faces and original font files | `src/fonts.css`, `public/fonts/` |
| Dock framing and camera interpolation | `src/camera/ApprovedCamera.js` |
| Per-leg envelopes, palette and display scale | `src/particles/art-direction.js` |
| Sculpture uniforms and draw range | `src/particles/MorphSculpture.js` |
| Packed point decoding and offline pose alignment | `src/particles/surface-data.js`, `scripts/align-stage-points.mjs` |
| Sculpture drift, rocking, moving color regions, particle size and transit geometry | `src/particles/sculpture-morph.vert.glsl` |
| Particle core, halo and final output color | `src/particles/sculpture.frag.glsl` |
| Colored ambient field and animated microdot grid | `src/particles/ApprovedParticleFields.js` |
| Pointer smoothing, velocity and wake lifetime | `src/interaction/PointerField.js` |
| Shared pointer displacement, ripple radius and uniform binding | `src/particles/pointer-field.glsl`, `src/particles/ParticleInteraction.js` |
| Offline sampling weights and distribution | `scripts/point-sampling.mjs` |

## Accessibility, loading and rendering

Modal menus and dialogs contain keyboard focus, mark the background inert, and restore focus when closed. Controls have visible focus treatment and touch-sized hit areas. Native button key activation is not intercepted by global navigation.

System reduced-motion changes apply live until the visitor chooses an explicit override. Reduced-motion mode moves immediately to the destination and renders on demand. Frozen captures, hidden documents and open modal panels stop continuous scene rendering. Low-memory or coarse-pointer devices start in Eco; the menu exposes both display preferences.

The HTML preloads both primary Latin font files and all three scene resources, so their downloads can start while JavaScript is loading. Oswald v57 and DM Sans v17 are served locally using the same WOFF2 files, weight ranges and Unicode subsets as the previous Google Fonts response. `public/fonts/README.txt` records their source URLs; the original OFL licenses are included. No external font stylesheet or font server is required.

A failed asset request, WebGL startup failure, a 20-second load timeout or a lost WebGL context opens a visible recovery panel with Retry and the real GitHub link. Retry after context loss replaces the failed canvas before initializing a new renderer. Camera, bounds and particle fetches share an AbortSignal, and failure or replacement cancels their consumers. A preload may already be complete or remain browser-managed. Generation checks prevent obsolete asynchronous loads from reactivating a failed scene; late particle resources are disposed.

If the application module fails to load, the static HTML retains the identity, GitHub destination and reload action.

## Verification and deterministic inspection

```powershell
npm run test:unit
npm run test:assets
npm run test:flight
npm test
npm run build
```

The unit suites cover bounded/reversible navigation and wheel intent, title phase continuity and intermediate chapters, native-key exclusions, viewport continuity and original camera poses, deterministic transit envelopes, exact sampling budgets, normalized interpolated normals, cancellable camera loading, and audio consent, fades, lifecycle and asynchronous state races. Surface-data tests compare all GPU attributes with both a frozen pre-optimization decoder and fixed byte hashes. The asset and flight checks validate reproducible aligned data and the authored camera.

For reproducible visual inspection:

- `/?debug=1` enables the diagnostic interface.
- `/?capture=0&captureTime=4` freezes the home dock.
- `/?capture=0.5&captureTime=4` freezes the midpoint of the first leg.
- Use `capture=1`, `2` or `3` for the other docks.
- With a capture query and no explicit time, the frozen time is zero.
- `window.__LEEQ_DEBUG` exposes readiness, story/target, camera, point counts, layout, renderer info, frame count, live `interaction`, `sound` state, startup measurements, `goTo()` and `seek()`.
- On `?debug=1`, startup also writes one `LEEQ startup` console record. `moduleReadyMs`, `initializeStartedMs`, `assetsReadyMs` and `readyMs` are page-relative `performance.now()` timestamps; `firstFrameMs` is the synchronous first-render duration. These diagnostics are disabled on ordinary visits.
- Use a live `/?debug=1` page without capture parameters to assess idle movement and mouse response over several seconds. Frozen frames cannot verify these effects.

Inspect actual desktop and phone renders when changing light, size or composition. A passing build does not establish visual quality or performance on every device. Local animation callback timings are not field Core Web Vitals or GPU timings.

## Project map and source preservation

- `index.html`: metadata, font/scene preload hints and static fallback.
- `src/fonts.css`, `public/fonts/`: local, licensed Oswald and DM Sans files.
- `src/approved-main.js`: current application entry, render lifecycle and input integration.
- `src/interaction/Navigation.js`: pure chapter and gesture state.
- `src/interaction/TitleMotion.js`: title styles sampled from camera story position.
- `src/ui/overlays.js`: modal lifecycle and focus handling.
- `scripts/prepare-camera-scene.py`: source archives to ignored GLB and derived metadata.
- `scripts/bake-stage-points.mjs`: offline GLB sampling and both public point binaries.
- `scripts/align-stage-points.mjs`: standalone STG1-to-STG2 derivation.
- `tests/`: regression suites using the Node built-in test runner.
- `vite.config.js`: relative build paths and separate stable Three/GSAP vendor chunks.

Older procedural and non-morph modules remain for reversible rollback and are not the active page. Original archives, internal references, build output and installed dependencies remain ignored by Git.

Model credits and existing source-usage notes remain in `public/scene/ASSET_CREDITS.txt`. The abstract sculpture's provenance still needs review before publication; NASA-source attribution does not imply endorsement.
