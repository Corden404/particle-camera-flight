import * as THREE from 'three';
import gsap from 'gsap';
import { loadApprovedCamera } from './camera/ApprovedCamera.js';
import { createFreeAmbientParticles } from './particles/ApprovedParticleFields.js';
import { createMorphSculpture } from './particles/MorphSculpture.js';
import { getViewportLayout } from './layout/viewport.js';
import { Navigation, WheelIntent, getKeyIntent, isInteractiveTarget } from './interaction/Navigation.js';
import { createModalController } from './ui/overlays.js';
import { PointerField } from './interaction/PointerField.js';
import { createVisualControls } from './ui/VisualControls.js';
import { createSceneCursor } from './ui/SceneCursor.js';
import { createAmbientAudio } from './audio/AmbientAudio.js';
import './approved.css';

// The four approved Blender stops. Only these big titles appear on the hero.
const chapters = [
  { id: 'home', lines: ['SCULPTING', 'IDEAS'] },
  { id: 'about', lines: ['A CURIOUS', 'MIND'] },
  { id: 'work', lines: ['BUILDING', "WHAT'S NEXT"] },
  { id: 'contact', lines: ['MAKE', 'CONTACT'] },
];
const TITLE_MOTION = Object.freeze({ exit: 0.28, enter: 0.78, stagger: 0.08, travel: 104 });
const closeIcon = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.4' aria-hidden='true'><path d='M5 5 19 19M19 5 5 19'/></svg>";
const app = document.querySelector('#app');
app.innerHTML = [
  "<canvas id='approved-scene' role='img' aria-label='Interactive three-dimensional sculptures and flowing particles'></canvas>",
  "<div class='approved-vignette' aria-hidden='true'></div>",
  "<div class='approved-grain' aria-hidden='true'></div>",
  "<header class='approved-header'>",
  "<button type='button' class='approved-sound-button' id='sound-button' data-sound-toggle lang='zh-CN' aria-label='开启声音' aria-pressed='false' title='开启声音'>",
  "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.25' stroke-linecap='round' aria-hidden='true'><path d='M5 10v4m4-8v12m4-14v16m4-13v10m4-6v2'/></svg><span class='approved-sound-label' aria-hidden='true'>OFF</span></button>",
  "<button type='button' class='approved-visual-toggle' id='visual-button' lang='zh-CN' aria-label='打开视觉调节' aria-controls='visual-controls' aria-expanded='false' title='视觉调节'>",
  "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.25' stroke-linecap='round'><path d='M4 7h16M4 12h16M4 17h16'/><circle cx='9' cy='7' r='2.1' fill='#080b0d'/><circle cx='16' cy='12' r='2.1' fill='#080b0d'/><circle cx='11' cy='17' r='2.1' fill='#080b0d'/></svg></button>",
  "<button type='button' class='approved-menu-button' id='menu-button' aria-label='Open navigation' aria-controls='approved-overlay-menu' aria-haspopup='dialog' aria-expanded='false'>",
  "<span></span><span></span></button></header>",
  "<main class='approved-chapter'><h1 class='approved-title' id='approved-title'></h1></main>",
  "<aside class='visual-controls' id='visual-controls' lang='zh-CN' role='region' aria-labelledby='visual-controls-title' hidden inert>",
  "<div class='visual-controls-head'><div><p class='visual-controls-eyebrow'>LIVE TUNING / 01</p><h2 id='visual-controls-title'>视觉调节</h2></div>",
  "<button type='button' class='visual-controls-close' data-visual-close aria-label='关闭视觉调节'>" + closeIcon + "</button></div>",
  "<p class='visual-controls-intro'>拖动滑块，立即查看效果。100% 为当前设计默认值。</p>",
  "<div class='visual-controls-body' data-visual-groups></div>",
  "<div class='visual-controls-footer'><div class='visual-controls-actions'>",
  "<button type='button' data-visual-reset>恢复默认</button>",
  "<button type='button' data-visual-copy>复制参数</button></div>",
  "<p class='visual-controls-status' data-visual-status role='status' aria-live='polite'>调整会自动保存在本机</p></div></aside>",
  "<div class='approved-overlay-menu' id='approved-overlay-menu' role='dialog' aria-modal='true' aria-labelledby='approved-menu-title' aria-hidden='true' tabindex='-1' data-modal hidden inert>",
  "<h2 class='approved-sr-only' id='approved-menu-title'>Choose a chapter</h2>",
  "<button type='button' id='close-menu' class='approved-menu-close' aria-label='Close navigation' data-close-panel data-initial-focus>" + closeIcon + "</button>",
  chapters.map((chapter, index) => "<button type='button' class='approved-menu-item' data-chapter='" + index + "'><span>" + chapter.lines.join(' ') + "</span></button>").join(''),
  "<div class='approved-menu-preferences' role='group' aria-label='Display and sound preferences'>",
  "<button type='button' id='motion-toggle' aria-pressed='false'>Reduce motion: Off</button>",
  "<button type='button' id='quality-toggle' aria-pressed='true'>Quality: High</button>",
  "<button type='button' id='menu-sound-toggle' data-sound-toggle lang='zh-CN' aria-pressed='false'>声音：关闭</button></div>",
  "<div class='approved-external-icons'>",
  "<a href='https://github.com/Corden404' target='_blank' rel='noopener noreferrer' aria-label='GitHub profile' title='GitHub'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.3' aria-hidden='true'><path d='M8 19c-5-1-5-5-5-7a9 9 0 0 1 2-6l-.2-3L8 4a10 10 0 0 1 8 0l3-1-.2 3a9 9 0 0 1 2 6c0 2-1 6-5 7M9 21v-4c0-1-1-2-2-2M15 21v-4c0-1 1-2 2-2'/></svg></a>",
  "<a href='./scene/ASSET_CREDITS.txt' target='_blank' rel='noopener noreferrer' aria-label='Model credits and licenses' title='Asset credits'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.3' aria-hidden='true'><circle cx='12' cy='12' r='9'/><path d='M12 11v6M12 7h.01'/></svg></a></div></div>",
  "<p class='approved-sr-only' id='approved-announcement' role='status' aria-live='polite' aria-atomic='true'></p>",
  "<section class='approved-loader' id='approved-loader' role='dialog' aria-modal='true' aria-labelledby='scene-status-title' aria-describedby='scene-status-copy' aria-hidden='true' tabindex='-1' data-modal hidden inert>",
  "<div class='approved-loader-content'><span class='approved-loader-mark' aria-hidden='true'></span>",
  "<h2 class='approved-loader-title' id='scene-status-title' tabindex='-1' data-initial-focus>Loading scene</h2>",
  "<p class='approved-loader-copy' id='scene-status-copy'>Preparing the camera flight.</p>",
  "<div class='approved-loader-actions'><button type='button' id='retry-scene' hidden>Retry</button>",
  "<a class='approved-panel-link' href='https://github.com/Corden404' target='_blank' rel='noopener noreferrer'>Visit GitHub</a></div></div></section>"
].join('');

let canvas = document.getElementById('approved-scene');
let canvasNeedsReplacement = false;
const loader = document.getElementById('approved-loader');
const loaderTitle = document.getElementById('scene-status-title');
const loaderCopy = document.getElementById('scene-status-copy');
const retryButton = document.getElementById('retry-scene');
const title = document.getElementById('approved-title');
const soundButton = document.getElementById('sound-button');
const menuSoundButton = document.getElementById('menu-sound-toggle');
const menuButton = document.getElementById('menu-button');
const menu = document.getElementById('approved-overlay-menu');
const announcement = document.getElementById('approved-announcement');
const motionButton = document.getElementById('motion-toggle');
const qualityButton = document.getElementById('quality-toggle');
const visualPanel = document.getElementById('visual-controls');
const visualButton = document.getElementById('visual-button');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030507);
const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 300);
const urlParams = new URLSearchParams(location.search);
const idToIndex = Object.fromEntries(chapters.map((chapter, index) => [chapter.id, index]));
const initialIndex = idToIndex[location.hash.slice(1)] ?? 0;
const capture = urlParams.get('capture');
const captureStory = capture !== null && Number.isFinite(Number(capture))
  ? THREE.MathUtils.clamp(Number(capture), 0, 3) : null;
const captureTime = urlParams.get('captureTime');
const timeOverride = captureTime !== null && Number.isFinite(Number(captureTime)) ? Number(captureTime) : null;
const frozenCapture = captureStory !== null || timeOverride !== null;
const state = new Navigation({ initial: captureStory ?? initialIndex });
const wheelIntent = new WheelIntent();
const pointerField = new PointerField();
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let motionOverride = null;
let reducedMotion = motionPreference.matches;
let highQuality = !(matchMedia('(pointer:coarse)').matches || (navigator.deviceMemory || 8) < 4);
let layout = getViewportLayout(1, 1);
let renderer, cameraPath, surfaces, ambientField;
let ready = false;
let initializing = false;
let loadGeneration = 0;
let loadTimeout;
let runningTween;
let frameId = 0;
let frameCount = 0;
let startedAt;
let lastError = null;
const visualControls = createVisualControls({
  panel: visualPanel,
  trigger: visualButton,
  onChange: settings => {
    ambientField?.setDensity(settings.ambientDensity);
    requestFrame();
  }
});
const tuning = visualControls.settings;
const sceneCursor = createSceneCursor({ root: app, disabled: true });
const audio = createAmbientAudio({ disabled: frozenCapture, onChange: syncSoundControls });
audio.setVisible(!document.hidden);

const modals = createModalController({
  root: app,
  dialogs: app.querySelectorAll('[data-modal]'),
  fallbackFocus: menuButton,
  onChange(dialog) {
    menuButton.setAttribute('aria-expanded', String(dialog === menu));
    sceneCursor.setEnabled(ready && !dialog && !reducedMotion && !frozenCapture);
    audio.setDucked(Boolean(dialog));
    if (dialog) {
      visualControls.close({ restoreFocus: false });
      stopFrames();
    } else requestFrame();
  }
});

function announce(message) {
  announcement.textContent = message;
}

function syncNavigationControls() {
  menu.querySelectorAll('[data-chapter]').forEach(button => {
    if (Number(button.dataset.chapter) === state.target) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function syncSoundControls(status) {
  const label = !status.supported ? '声音不可用' : status.enabled && status.locked
    ? '恢复声音' : status.enabled ? '关闭声音' : '开启声音';
  for (const button of [soundButton, menuSoundButton]) {
    button.disabled = !status.supported || frozenCapture;
    button.setAttribute('aria-pressed', String(status.enabled));
    button.setAttribute('aria-label', frozenCapture ? '截图模式下声音已关闭' : label);
    button.title = label;
  }
  soundButton.dataset.playing = String(status.playing);
  soundButton.querySelector('.approved-sound-label').textContent =
    status.enabled && status.locked ? 'START' : status.enabled ? 'ON' : 'OFF';
  menuSoundButton.textContent = !status.supported ? '声音：不可用' :
    status.enabled && status.locked ? '声音：点击恢复' : '声音：' + (status.enabled ? '开启' : '关闭');
}

function renderTitle(index) {
  const chapter = chapters[index];
  if (!title.children.length) {
    title.replaceChildren(...chapter.lines.map((line, lineIndex) => {
      const mask = document.createElement('span');
      mask.className = 'title-line';
      mask.setAttribute('aria-hidden', 'true');
      const ink = document.createElement('span');
      ink.className = 'title-ink ' + (lineIndex === 0 ? 'outline' : 'filled');
      mask.append(ink);
      return mask;
    }));
  }
  title.querySelectorAll('.title-ink').forEach((ink, lineIndex) => {
    ink.textContent = chapter.lines[lineIndex];
  });
  title.setAttribute('aria-label', chapter.lines.join(' '));
  app.dataset.chapter = chapter.id;
  syncNavigationControls();
  if (location.hash !== '#' + chapter.id) history.replaceState(null, '', '#' + chapter.id);
}

function resetTitle(visible = true) {
  gsap.set(title, { opacity: visible ? 1 : 0 });
  gsap.set(title.querySelectorAll('.title-ink'), { opacity: 1, yPercent: 0 });
}

function refreshResolution() {
  const rect = app.getBoundingClientRect();
  layout = getViewportLayout(rect.width, rect.height);
  app.dataset.layout = layout.compact ? 'compact' : 'wide';
  app.style.setProperty('--title-top', layout.titleTop + 'px');
  app.style.setProperty('--title-width', layout.titleWidth + 'px');
  app.style.setProperty('--title-size', layout.titleSize + 'px');
  app.style.setProperty('--page-gutter', layout.gutter + 'px');
  app.style.setProperty('--portrait-weight', String(layout.portraitWeight));
  camera.aspect = layout.aspect;
  camera.updateProjectionMatrix();
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, highQuality ? 1.55 : 1));
    renderer.setSize(layout.width, layout.height, false);
    surfaces?.quality(!highQuality);
    surfaces?.setViewportScale(layout.portraitWeight);
    ambientField?.quality(!highQuality);
  }
  requestFrame();
}

function stopFrames() {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
}

function requestFrame() {
  if (!ready || document.hidden || modals.active || frameId) return;
  frameId = requestAnimationFrame(frame);
}

function renderScene() {
  const time = timeOverride ?? (frozenCapture ? 0 : (performance.now() - startedAt) / 1000);
  const interaction = pointerField.update(performance.now() / 1000, !reducedMotion);
  cameraPath.sample(camera, state.story, layout.portraitWeight);
  // Local parallax overlays the original Blender pose; the camera samples
  // remain unchanged. Pointer X, Y and velocity all contribute to dolly depth.
  const parallax = reducedMotion ? 0 : interaction.energy * tuning.cameraSway *
    (1 - layout.portraitWeight * 0.55) * (state.inflight ? 0.46 : 1);
  camera.translateX(interaction.pointer.x * parallax * 1.05);
  camera.translateY(interaction.pointer.y * parallax * 0.65);
  camera.translateZ(THREE.MathUtils.clamp((
    -interaction.pointer.y * 1.38 + interaction.pointer.x * 0.92 +
    interaction.velocity.x * 0.13 + interaction.velocity.y * 0.11
  ) * parallax, -0.90, 0.90));
  surfaces.update(time, state.story, !reducedMotion, camera, interaction, tuning);
  ambientField.update(time, state.story, !reducedMotion, camera, interaction, tuning);
  renderer.render(scene, camera);
  frameCount++;
}

function frame() {
  frameId = 0;
  if (!ready || document.hidden || modals.active) return;
  try {
    renderScene();
  } catch (error) {
    failRuntime(error, 'The 3D scene was interrupted. You can retry or visit GitHub.');
    return;
  }
  if (!reducedMotion && !frozenCapture) requestFrame();
}

function applyTransition(transition) {
  if (!transition) return;
  runningTween?.kill();
  runningTween = null;
  const inks = title.querySelectorAll('.title-ink');
  gsap.killTweensOf([title, ...inks]);
  syncNavigationControls();
  if (transition.duration === 0) {
    renderTitle(transition.to);
    app.classList.remove('is-travelling');
    resetTitle();
    announce(chapters[transition.to].lines.join(' '));
    requestFrame();
    return;
  }
  const { duration, revision } = transition;
  const direction = Math.sign(transition.to - state.story) || 1;
  const exitDuration = Math.min(TITLE_MOTION.exit, duration * 0.15);
  const enterDuration = Math.min(TITLE_MOTION.enter, duration * 0.5);
  const stagger = Math.min(TITLE_MOTION.stagger, duration * 0.08);
  const reveal = duration - enterDuration - stagger;
  app.classList.add('is-travelling');
  runningTween = gsap.timeline({
    paused: document.hidden,
    onUpdate: requestFrame,
    onComplete() {
      if (!state.settle(revision)) return;
      runningTween = null;
      renderTitle(transition.to);
      app.classList.remove('is-travelling');
      resetTitle();
      announce(chapters[transition.to].lines.join(' '));
      requestFrame();
    }
  });
  runningTween.to(inks, {
    opacity: 0, yPercent: -direction * TITLE_MOTION.travel,
    duration: exitDuration, stagger, ease: 'power2.in'
  }, 0);
  runningTween.set(title, { opacity: 0 }, exitDuration + stagger);
  // Each complete adjacent leg preserves the original five-second camera route.
  runningTween.to(state, { story: transition.to, duration, ease: 'none' }, 0);
  runningTween.call(() => {
    if (revision === state.revision) renderTitle(transition.to);
  }, [], reveal);
  runningTween.set(title, { opacity: 1 }, reveal);
  runningTween.set(inks, { yPercent: direction * TITLE_MOTION.travel, opacity: 0 }, reveal);
  runningTween.to(inks, {
    opacity: 1, yPercent: 0, duration: enterDuration, stagger, ease: 'power3.out'
  }, reveal);
  requestFrame();
}

function goTo(index) {
  if (ready) applyTransition(state.goTo(Number(index), { instant: reducedMotion }));
}
function step(direction) {
  if (ready) applyTransition(state.step(direction, { instant: reducedMotion }));
}

function updatePreferences() {
  app.dataset.reducedMotion = String(reducedMotion);
  motionButton.textContent = 'Reduce motion: ' + (reducedMotion ? 'On' : 'Off');
  motionButton.setAttribute('aria-pressed', String(reducedMotion));
  qualityButton.textContent = 'Quality: ' + (highQuality ? 'High' : 'Eco');
  qualityButton.setAttribute('aria-pressed', String(highQuality));
}

function setReducedMotion(value, explicit = true) {
  if (explicit) motionOverride = Boolean(value);
  reducedMotion = Boolean(value);
  if (reducedMotion) {
    stopFrames();
    if (state.inflight) applyTransition(state.goTo(state.target, { instant: true }));
    else {
      runningTween?.kill();
      runningTween = null;
      resetTitle();
    }
  }
  sceneCursor.setEnabled(ready && !modals.active && !reducedMotion && !frozenCapture);
  updatePreferences();
  announce('Reduced motion ' + (reducedMotion ? 'on.' : 'off.'));
  requestFrame();
}
function toggleQuality() {
  highQuality = !highQuality;
  updatePreferences();
  refreshResolution();
  announce('Quality set to ' + (highQuality ? 'high.' : 'eco.'));
}

menuButton.addEventListener('click', () => {
  if (ready) {
    visualControls.close({ restoreFocus: false });
    modals.open(menu, { trigger: menuButton });
  }
});
app.querySelectorAll('[data-close-panel]').forEach(button => {
  button.addEventListener('click', () => modals.close());
});
menu.querySelectorAll('[data-chapter]').forEach(button => {
  button.addEventListener('click', () => {
    modals.close();
    goTo(Number(button.dataset.chapter));
  });
});
function toggleSound() {
  if (audio.state.enabled && audio.state.locked) void audio.unlock();
  else void audio.setEnabled(!audio.state.enabled);
}
soundButton.addEventListener('click', toggleSound);
menuSoundButton.addEventListener('click', toggleSound);
// A click follows a completed tap, so dragging or swiping never triggers sound.
app.addEventListener('click', async event => {
  if (!event.isTrusted || !ready || frozenCapture || !audio.state.enabled ||
    event.target.closest('[data-sound-toggle]') || visualPanel.contains(event.target)) return;
  if (audio.state.locked) await audio.unlock();
  audio.playClick(isInteractiveTarget(event.target) ? 'ui' : 'scene');
});
motionButton.addEventListener('click', () => setReducedMotion(!reducedMotion));
qualityButton.addEventListener('click', toggleQuality);
motionPreference.addEventListener('change', event => {
  if (motionOverride === null) setReducedMotion(event.matches, false);
});

addEventListener('keydown', event => {
  if (!ready || modals.active) return;
  if (visualControls.isOpen) {
    if (event.key === 'Escape') { event.preventDefault(); visualControls.close(); }
    return; // Slider arrow keys never navigate the story.
  }
  if (event.key?.toLowerCase() === 'v' && !event.ctrlKey && !event.metaKey &&
    !event.altKey && !event.shiftKey && !event.repeat && !isInteractiveTarget(event.target)) {
    event.preventDefault();
    visualControls.toggle();
    return;
  }
  const intent = getKeyIntent(event);
  if (!intent) return;
  event.preventDefault();
  if (intent === 'next') step(1);
  else if (intent === 'previous') step(-1);
  else if (intent === 'quality') toggleQuality();
  else if (intent === 'motion') setReducedMotion(!reducedMotion);
});
addEventListener('wheel', event => {
  if (!ready || modals.active || visualPanel.contains(event.target)) return;
  const direction = wheelIntent.push(event, performance.now(), layout.height);
  if (direction) step(direction);
}, { passive: true });

// Listen above the canvas as the title and navigation occupy part of the scene.
app.addEventListener('pointermove', event => {
  if (!ready || modals.active || reducedMotion || visualPanel.contains(event.target)) return;
  const rect = app.getBoundingClientRect();
  pointerField.move(
    (event.clientX - rect.left) / rect.width * 2 - 1,
    1 - (event.clientY - rect.top) / rect.height * 2,
    performance.now() / 1000
  );
  requestFrame();
}, { passive: true });
app.addEventListener('pointerleave', () => pointerField.leave(), { passive: true });
// Mouse left button fires exactly one expanding ripple without requiring a drag.
app.addEventListener('pointerdown', event => {
  if (!ready || reducedMotion || modals.active || event.button !== 0 ||
    isInteractiveTarget(event.target) || visualPanel.contains(event.target)) return;
  const rect = app.getBoundingClientRect();
  pointerField.click(
    (event.clientX - rect.left) / rect.width * 2 - 1,
    1 - (event.clientY - rect.top) / rect.height * 2,
    performance.now() / 1000
  );
  requestFrame();
}, { passive: true });
addEventListener('blur', () => pointerField.leave());

let touchStart = null;
app.addEventListener('touchstart', event => {
  if (!ready || modals.active || event.touches.length !== 1 ||
    isInteractiveTarget(event.target) || visualPanel.contains(event.target)) {
    touchStart = null;
    return;
  }
  const touch = event.touches[0];
  touchStart = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
}, { passive: true });
app.addEventListener('touchend', event => {
  const start = touchStart;
  touchStart = null;
  if (!start || modals.active || event.defaultPrevented) return;
  const touch = [...event.changedTouches].find(item => item.identifier === start.id);
  if (!touch) return;
  const dy = start.y - touch.clientY;
  const dx = start.x - touch.clientX;
  if (Math.abs(dy) > 75 && Math.abs(dy) > Math.abs(dx) * 1.25) step(Math.sign(dy));
}, { passive: true });
app.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
addEventListener('hashchange', () => {
  const index = idToIndex[location.hash.slice(1)];
  if (index !== undefined) goTo(index);
});
addEventListener('resize', refreshResolution);
const resizeObserver = new ResizeObserver(refreshResolution);
resizeObserver.observe(app);
document.addEventListener('visibilitychange', () => {
  audio.setVisible(!document.hidden);
  if (document.hidden) {
    stopFrames();
    runningTween?.pause();
  } else {
    runningTween?.resume();
    requestFrame();
  }
});

addEventListener('pagehide', () => audio.setVisible(false));
addEventListener('pageshow', () => audio.setVisible(!document.hidden));

function disposeRuntime() {
  stopFrames();
  for (const resource of [surfaces, ambientField]) {
    if (resource?.group) scene.remove(resource.group);
    resource?.dispose();
  }
  surfaces = ambientField = cameraPath = undefined;
  renderer?.dispose();
  renderer = undefined;
}

function failRuntime(error, message = 'The 3D scene could not be loaded. You can retry or visit GitHub.') {
  loadGeneration++;
  clearTimeout(loadTimeout);
  ready = false;
  audio.setReady(false);
  sceneCursor.setEnabled(false);
  initializing = false;
  lastError = error instanceof Error ? error.message : String(error);
  runningTween?.kill();
  runningTween = null;
  state.seek(Math.round(state.story));
  disposeRuntime();
  loader.classList.add('has-error');
  loader.querySelector('.approved-loader-mark').hidden = true;
  loaderTitle.textContent = 'Scene unavailable';
  loaderCopy.textContent = message;
  retryButton.hidden = false;
  modals.open(loader, { canDismiss: false });
  loaderTitle.focus({ preventScroll: true });
  console.error('Could not display the approved scene:', error);
}

function onContextLost(event) {
  if (event.target !== canvas) return;
  event.preventDefault();
  canvasNeedsReplacement = true;
  if (renderer || initializing) failRuntime(new Error('WebGL context lost'), 'The 3D scene was interrupted. You can retry or visit GitHub.');
}
canvas.addEventListener('webglcontextlost', onContextLost);

async function initialize(fromRetry = false) {
  if (initializing) return;
  const generation = ++loadGeneration;
  initializing = true;
  ready = false;
  audio.setReady(false);
  sceneCursor.setEnabled(false);
  if (canvasNeedsReplacement) {
    // Disposal cannot restore a lost context. A fresh canvas obtains a new one.
    // Restore background inert state before cloning, then let the loader record
    // the replacement in its next modal background snapshot.
    modals.close({ force: true, restoreFocus: false });
    const replacement = canvas.cloneNode(false);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.replaceWith(replacement);
    canvas = replacement;
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvasNeedsReplacement = false;
  }
  lastError = null;
  loader.classList.remove('has-error');
  loader.querySelector('.approved-loader-mark').hidden = false;
  loaderTitle.textContent = 'Loading scene';
  loaderCopy.textContent = 'Preparing the camera flight.';
  retryButton.hidden = true;
  modals.open(loader, { canDismiss: false });
  loadTimeout = setTimeout(() => {
    if (generation === loadGeneration) failRuntime(new Error('Scene load timed out'), 'Loading took too long. You can retry or visit GitHub.');
  }, 20000);
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance' });
    if (renderer.getContext().isContextLost()) throw new Error('WebGL context is unavailable');
    renderer.setClearColor(0x030507, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.99;
    renderer.debug.onShaderError = (gl, program, vert, frag) => {
      console.error('Particle shader failed:', gl.getShaderInfoLog(vert), gl.getShaderInfoLog(frag));
      throw new Error('Particle shader could not be compiled');
    };
    refreshResolution();
    const currentRenderer = renderer;
    const [path, sculpture] = await Promise.all([
      loadApprovedCamera(),
      createMorphSculpture(currentRenderer).then(resource => {
        if (generation !== loadGeneration) {
          resource.dispose();
          return null;
        }
        surfaces = resource;
        return resource;
      })
    ]);
    if (generation !== loadGeneration) return;
    cameraPath = path;
    surfaces = sculpture;
    ambientField = createFreeAmbientParticles(renderer, cameraPath.data);
    ambientField.setDensity(tuning.ambientDensity);
    scene.add(surfaces.group, ambientField.group);
    refreshResolution();
    startedAt ??= performance.now();
    ready = true;
    renderScene();
    if (generation !== loadGeneration) return;
    clearTimeout(loadTimeout);
    initializing = false;
    audio.setReady(true);
    modals.close({ force: true, restoreFocus: fromRetry });
    renderTitle(Math.round(state.story));
    if (Math.abs(state.story - Math.round(state.story)) > 0.02) {
      app.classList.add('is-travelling');
      resetTitle(false);
    } else {
      app.classList.remove('is-travelling');
      resetTitle();
      if (!reducedMotion && !frozenCapture) {
        runningTween = gsap.timeline({ paused: document.hidden, onComplete() { runningTween = null; } });
        runningTween.fromTo(title.querySelectorAll('.title-ink'),
          { opacity: 0, yPercent: TITLE_MOTION.travel },
          { opacity: 1, yPercent: 0, duration: 0.92, stagger: TITLE_MOTION.stagger, ease: 'power3.out' }, 0.12);
      }
    }
    if (!reducedMotion && !frozenCapture) requestFrame();
  } catch (error) {
    if (generation === loadGeneration) failRuntime(error);
  }
}
retryButton.addEventListener('click', () => initialize(true));

renderTitle(Math.round(state.story));
updatePreferences();
refreshResolution();

if (urlParams.has('debug') || captureStory !== null) window.__LEEQ_DEBUG = {
  get state() { return state.story; },
  get camera() { return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov }; },
  get meshCount() { let count = 0; scene.traverse(object => { if (object.isMesh) count++; }); return count; },
  get particleObjectCount() { let count = 0; scene.traverse(object => { if (object.isPoints) count++; }); return count; },
  get ambientCount() { return ambientField?.count ?? 0; },
  get surfaceCount() { return surfaces?.count ?? 0; },
  get morphing() { return surfaces?.morphing ?? false; },
  get ready() { return ready; },
  get moving() { return state.inflight; },
  get target() { return state.target; },
  get settled() { return state.settled; },
  get layout() { return { ...layout }; },
  get highQuality() { return highQuality; },
  get sound() { return { ...audio.state }; },
  get reducedMotion() { return reducedMotion; },
  get renderer() { return renderer; },
  get rendererInfo() { return renderer?.info ?? null; },
  get frameCount() { return frameCount; },
  get interaction() { return { pointer: pointerField.pointer.toArray(), velocity: pointerField.velocity.toArray(), energy: pointerField.energy, trail: pointerField.trail.map(sample => sample.toArray()) }; },
  get error() { return lastError; },
  goTo,
  seek(value) {
    const story = Number(value);
    if (!Number.isFinite(story)) return;
    runningTween?.kill();
    runningTween = null;
    state.seek(story);
    renderTitle(Math.round(state.story));
    const betweenStops = Math.abs(state.story - Math.round(state.story)) > 0.02;
    app.classList.toggle('is-travelling', betweenStops);
    resetTitle(!betweenStops);
    requestFrame();
  }
};
initialize();