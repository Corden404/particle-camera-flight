import * as THREE from 'three';
import gsap from 'gsap';
import { loadApprovedCamera } from './camera/ApprovedCamera.js';
import { createFreeAmbientParticles } from './particles/ApprovedParticleFields.js';
import { createMorphSculpture } from './particles/MorphSculpture.js';
import './approved.css';

// The four approved Blender stops. Only these big titles are displayed.
const chapters = [
  { id: 'home', lines: ['SCULPTING', 'IDEAS'] },
  { id: 'about', lines: ['A CURIOUS', 'MIND'] },
  { id: 'work', lines: ['BUILDING', "WHAT'S NEXT"] },
  { id: 'contact', lines: ['MAKE', 'CONTACT'] },
];

const app = document.querySelector('#app');
app.innerHTML = [
  "<canvas id='approved-scene' aria-label='Interactive three-dimensional sculptures and flowing particles'></canvas>",
  "<div class='approved-vignette'></div>",
  "<div class='approved-grain' aria-hidden='true'></div>",
  "<header class='approved-header'>",
  "<button type='button' class='approved-menu-button' id='menu-button' aria-label='Open navigation' aria-expanded='false'>",
  "<span></span><span></span></button>",
  "</header>",
  "<main class='approved-chapter'>",
  "<button type='button' class='approved-title-button' id='title-button' aria-label='Move to next chapter'>",
  "<h1 id='approved-title' aria-live='polite'></h1>",
  "</button></main>",
  "<nav class='approved-steps' aria-label='Chapter navigation'>",
  "<button type='button' id='approved-prev' aria-label='Previous chapter'>",
  "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.35' aria-hidden='true'><path d='m6 15 6-6 6 6'/></svg></button>",
  "<div class='approved-steps-rail' aria-hidden='true'><i></i></div>",
  "<button type='button' id='approved-next' aria-label='Next chapter'>",
  "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.35' aria-hidden='true'><path d='m6 9 6 6 6-6'/></svg></button>",
  "</nav>",
  "<nav class='approved-overlay-menu' id='approved-overlay-menu' aria-label='Select a chapter' aria-hidden='true'>",
  "<button type='button' id='close-menu' class='approved-menu-close' aria-label='Close navigation'>",
  "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.4' aria-hidden='true'><path d='M5 5 19 19M19 5 5 19'/></svg></button>",
  chapters.map((chapter, index) => "<button type='button' class='approved-menu-item' data-chapter='"+index+"'><span>"+chapter.lines.join(' ')+"</span></button>").join(''),
  "<div class='approved-external-icons'>",
  "<a href='https://github.com/Corden404' target='_blank' rel='noreferrer' aria-label='GitHub profile' title='GitHub'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.3' aria-hidden='true'><path d='M8 19c-5-1-5-5-5-7a9 9 0 0 1 2-6l-.2-3L8 4a10 10 0 0 1 8 0l3-1-.2 3a9 9 0 0 1 2 6c0 2-1 6-5 7M9 21v-4c0-1-1-2-2-2M15 21v-4c0-1 1-2 2-2'/></svg></a>",
  "<a href='./scene/ASSET_CREDITS.txt' target='_blank' rel='noreferrer' aria-label='Model credits and licenses' title='Asset credits'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.3' aria-hidden='true'><circle cx='12' cy='12' r='9'/><path d='M12 11v6M12 7h.01'/></svg></a>",
  "</div>",
  "</nav>",
  "<div class='approved-loader' id='approved-loader' role='status' aria-label='Loading the 3D scene'><span class='approved-loader-mark'></span></div>"
].join('');

const canvas = document.getElementById('approved-scene');
const loader = document.getElementById('approved-loader');
const title = document.getElementById('approved-title');
const titleButton = document.getElementById('title-button');
const menuButton = document.getElementById('menu-button');
const overlay = document.getElementById('approved-overlay-menu');
const rail = document.querySelector('.approved-steps-rail');
overlay.inert = true;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x030507, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.99;
  renderer.debug.onShaderError = (gl, program, vert, frag) => {
    console.error('Particle shader failed:', gl.getShaderInfoLog(vert), gl.getShaderInfoLog(frag));
  };
} catch (error) {
  loader.setAttribute('aria-label', 'This page requires WebGL and hardware acceleration');
  console.error('WebGL failed to initialize:', error);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030507);
// A particle-only scene has no solid surface materials or scene lights.
// Every visible sculptural point is computed by the custom GPU shader.

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.03, 300);
const urlParams = new URLSearchParams(location.search);
const idToIndex = Object.fromEntries(chapters.map((c, i) => [c.id, i]));
const initialIndex = Object.hasOwn(idToIndex, location.hash.slice(1)) ? idToIndex[location.hash.slice(1)] : 0;
const capture = urlParams.get('capture');
const captureStory = capture !== null && Number.isFinite(Number(capture))
  ? THREE.MathUtils.clamp(Number(capture), 0, 3) : null;
const captureTime = urlParams.get('captureTime');
const timeOverride = captureTime !== null && Number.isFinite(Number(captureTime)) ? Number(captureTime) : null;
const state = { story: captureStory ?? initialIndex };
let targetChapter = initialIndex;
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let highQuality = !(matchMedia('(pointer:coarse)').matches || (navigator.deviceMemory || 8) < 4);
let ready = false;
let cameraPath, surfaces, ambientField, clock;
let runningTween, tweenId = 0, wheelLock = false;

function renderTitle(index) {
  const chapter = chapters[index];
  title.replaceChildren();
  chapter.lines.forEach((line, i) => {
    const element = document.createElement('span');
    element.className = i === 0 ? 'outline' : 'filled';
    element.textContent = line;
    title.appendChild(element);
  });
  document.getElementById('approved-prev').disabled = index === 0;
  document.getElementById('approved-next').disabled = index === 3;
  if (location.hash !== '#' + chapter.id) history.replaceState(null, '', '#' + chapter.id);
}
renderTitle(captureStory === null ? initialIndex : Math.round(captureStory));
if (captureStory !== null && Math.abs(captureStory-Math.round(captureStory)) > 0.02) {
  app.classList.add('is-travelling');
  titleButton.style.opacity = '0';
}
function setMenu(open) {
  overlay.classList.toggle('show', open);
  overlay.inert = !open;
  overlay.setAttribute('aria-hidden', String(!open));
  menuButton.setAttribute('aria-expanded', String(open));
  if (open) document.getElementById('close-menu').focus();
  else menuButton.focus();
}
menuButton.addEventListener('click', () => setMenu(true));
document.getElementById('close-menu').addEventListener('click', () => setMenu(false));
overlay.querySelectorAll('[data-chapter]').forEach(button => {
  button.addEventListener('click', () => {
    setMenu(false);
    goTo(Number(button.dataset.chapter));
  });
});

function refreshResolution() {
  if (!renderer) return;
  const dpr = Math.min(devicePixelRatio || 1, highQuality ? 1.55 : 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  surfaces?.quality(!highQuality);
  surfaces?.setViewportScale(innerWidth<760);
  ambientField?.quality(!highQuality);
}

function goTo(nextIndex) {
  if (!ready) return;
  const next = THREE.MathUtils.clamp(nextIndex, 0, 3);
  if (next === targetChapter && Math.abs(next - state.story) < 0.001) return;
  targetChapter = next;
  const stamp = ++tweenId;
  runningTween?.kill();
  gsap.killTweensOf(titleButton);
  if (reducedMotion) {
    state.story = next;
    renderTitle(next);
    app.classList.remove('is-travelling');
    gsap.set(titleButton, { opacity: 1, y: 0 });
    return;
  }
  const duration = Math.max(.25, Math.abs(next - state.story) * 5);
  app.classList.add('is-travelling');
  runningTween = gsap.timeline({
    onComplete() { if (stamp === tweenId) app.classList.remove('is-travelling'); }
  });
  runningTween.to(titleButton, { opacity: 0, y: -18, duration: Math.min(.37, duration*.2), ease: 'power2.in' }, 0);
  // Keep Blender's exact authored timing. Do not apply a second ease function.
  runningTween.to(state, { story: next, duration, ease: 'none' }, 0);
  const reveal = Math.max(0, duration - .76);
  runningTween.call(() => {
    if (stamp !== tweenId) return;
    renderTitle(next);
    gsap.set(titleButton, { y: 23 });
  }, [], reveal);
  runningTween.to(titleButton, { opacity: 1, y: 0, duration: .65, ease: 'power2.out' }, reveal + .02);
}
const next = () => goTo(targetChapter === 3 ? 0 : targetChapter + 1);
const previous = () => goTo(Math.max(0, targetChapter-1));
titleButton.addEventListener('click', next);
document.getElementById('approved-next').addEventListener('click', next);
document.getElementById('approved-prev').addEventListener('click', previous);

addEventListener('keydown', event => {
  if (overlay.classList.contains('show')) {
    if (event.key === 'Escape') setMenu(false);
    return;
  }
  if (event.key.toLowerCase() === 'q') { highQuality = !highQuality; refreshResolution(); return; }
  if (event.key.toLowerCase() === 'm') {
    reducedMotion = !reducedMotion;
    if (reducedMotion && runningTween) {
      runningTween.kill();
      state.story = targetChapter;
      renderTitle(targetChapter);
      gsap.set(titleButton, { opacity: 1, y: 0 });
      app.classList.remove('is-travelling');
    }
    return;
  }
  if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); next(); }
  if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); previous(); }
});
addEventListener('wheel', event => {
  if (!ready || overlay.classList.contains('show') || wheelLock || Math.abs(event.deltaY) < 24) return;
  wheelLock = true;
  event.deltaY > 0 ? next() : previous();
  setTimeout(() => wheelLock = false, 750);
}, { passive: true });
let touchY = 0;
addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchend', e => {
  if (overlay.classList.contains('show')) return;
  const d = touchY - e.changedTouches[0].clientY;
  if (Math.abs(d) > 75) d > 0 ? next() : previous();
}, { passive: true });
addEventListener('hashchange', () => {
  const index = idToIndex[location.hash.slice(1)];
  if (index !== undefined) goTo(index);
});
addEventListener('resize', refreshResolution);

async function initialize() {
  if (!renderer) return;
  try {
    refreshResolution();
    [cameraPath, surfaces] = await Promise.all([
      loadApprovedCamera(), createMorphSculpture(renderer)
    ]);
    ambientField = createFreeAmbientParticles(renderer, cameraPath.data);
    // One GPU point cloud now continuously scatters and reforms between
    // all four Blender model shapes, travelling with the approved camera.
    // Environmental particles are a separate GPU field, never model targets.
    scene.add(surfaces.group, ambientField.group);
    refreshResolution();
    ready = true;
    clock = new THREE.Clock();
    loader.remove();
    function frame() {
      requestAnimationFrame(frame);
      const time = timeOverride ?? clock.getElapsedTime();
      cameraPath.sample(camera, state.story, innerWidth < 760);
      surfaces.update(time, state.story, !reducedMotion, camera);
      ambientField.update(time, state.story, !reducedMotion);
      rail.style.setProperty('--progress', (state.story / 3).toFixed(4));
      renderer.render(scene, camera);
    }
    frame();
    if (urlParams.has('debug') || captureStory !== null) window.__LEEQ_DEBUG = {
      get state() { return state.story; },
      get camera() { return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov }; },
      get meshCount() { let count = 0; scene.traverse(v => { if (v.isMesh) count++; }); return count; },
      get particleObjectCount() { let count = 0; scene.traverse(v => { if (v.isPoints) count++; }); return count; },
      get ambientCount() { return ambientField.count; },
      get surfaceCount() { return surfaces.count; },
      get morphing() { return surfaces.morphing; },
      goTo,
      seek(v) { if (Number.isFinite(Number(v))) state.story = THREE.MathUtils.clamp(Number(v), 0, 3); }
    };
  } catch (error) {
    console.error('Could not initialize the approved scene:', error);
    loader.classList.add('has-error');
    loader.setAttribute('aria-label', 'Failed to load 3D assets; check browser developer console');
  }
}
initialize();