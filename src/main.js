import * as THREE from 'three';
import gsap from 'gsap';
import { loadParticleSculpture } from './particles/ParticleSculpture.js';
import { createOrbitField } from './particles/OrbitField.js';
import { updateCameraDirector } from './camera/CameraDirector.js';
import './style.css';

const sections = [
 { tag:'01 / WELCOME TO MY WORLD', title:['BUILDING','THE FUTURE'], subtitle:'Creative development, thoughtful technology and a curiosity for everything beyond the ordinary.', action:'Explore the universe', id:'home' },
 { tag:'02 / ABOUT THE MIND', title:['WHO','I AM'], subtitle:'I am LeeQ — a student exploring artificial intelligence, machine vision and the craft of building useful software.', action:'Discover my work', id:'about' },
 { tag:'03 / THE WORK', title:['SELECTED','PROJECTS'], subtitle:'From WebCodex to agent systems and computer vision: experiments that turn research into tools people can actually use.', action:'Get in touch', id:'work' },
 { tag:'04 / CONNECT', title:["LET'S",'CREATE'], subtitle:'Great things begin with a conversation. Open for collaborations, ambitious projects and good ideas.', action:'Back to the beginning', id:'contact' },
];
let reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const app = document.querySelector('#app');
app.innerHTML = `<canvas id="scene" aria-label="Interactive three-dimensional particle art"></canvas><div class="gradient-orb"></div><div class="noise"></div><div class="vignette"></div><div class="fade-overlay"></div>
<header class="header"><a href="#home" class="wordmark" id="homeLink" aria-label="LEEQ home">LEEQ<sup>®</sup></a><div class="header-right"><a href="https://github.com/Corden404" target="_blank" rel="noreferrer">LET'S TALK ↗</a><a href="https://github.com/Corden404?tab=repositories" target="_blank" rel="noreferrer">GITHUB ↗</a><button class="plain-button menu-icon" id="menuBtn" aria-label="Open navigation"><span></span><span></span></button></div></header>
<main class="chapter" id="chapter"><div class="chapter-body"><div class="eyebrow" id="eyebrow"></div><h1 class="heading" id="heading"></h1><div class="section-content"><p class="lede" id="lede"></p><button class="action-link" id="nextAction"><span id="actionLabel"></span><span class="circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16m-7-7 7 7-7 7"/></svg></span></button></div></div></main>
<div class="pager"><button id="prev" aria-label="Previous section"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 15l7-7 7 7"/></svg></button><div class="rail"></div><button id="next" aria-label="Next section"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 9l7 7 7-7"/></svg></button></div>
<div class="motion-status" aria-hidden="true"><i></i> TRAVELING BETWEEN WORLDS</div><footer class="bottom"><div class="index"><strong id="idx">01</strong><span>/ 04</span></div><div class="scroll-tip"><span>SCROLL TO EXPLORE</span><span class="pill"><i></i></span></div></footer><button class="performance" id="qualityBtn" title="Toggle performance">QUALITY : HIGH</button><button class="motion-toggle" id="motionBtn" title="Toggle particle motion">MOTION : ON</button><div class="progress-track"><div class="progress-bar" id="progressBar"></div></div>
<nav class="menu" id="menu" aria-label="Page sections"><button class="close" id="closeBtn">CLOSE ✕</button>${sections.map((s,i)=>`<button data-section="${i}">${s.id==='home'?'HOME':s.id==='about'?'ABOUT':s.id==='work'?'PROJECTS':'CONTACT'}</button>`).join('')}</nav>`;

const canvas = document.getElementById('scene');
const heading = document.getElementById('heading');
const eyebrow = document.getElementById('eyebrow');
const lede = document.getElementById('lede');
const chapter = document.getElementById('chapter');
const progressBar = document.getElementById('progressBar');
const menu = document.getElementById('menu');
const qualityButton = document.getElementById('qualityBtn');
const motionButton = document.getElementById('motionBtn');
motionButton.textContent = reduceMotion ? 'MOTION : OFF' : 'MOTION : ON';
motionButton.setAttribute('aria-pressed', String(!reduceMotion));

const loading = document.createElement('div');
loading.className = 'particle-loading';
loading.setAttribute('role', 'status');
loading.innerHTML = '<div class="particle-loading__inner"><span class="particle-loading__eyebrow">LEEQ / SCULPTED IN LIGHT</span><strong class="particle-loading__title">ENTER THE<br>UNIVERSE<span>.</span></strong><span class="particle-loading__message" id="loadMessage">Preparing the particle world…</span><span class="particle-loading__line"></span></div>';
app.appendChild(loading);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: false, powerPreference: 'high-performance'});
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
} catch (error) {
  console.error('WebGL could not initialize:', error);
  document.getElementById('loadMessage').textContent = 'This experience needs WebGL. Try enabling hardware acceleration in your browser.';
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const starPositions = new Float32Array(1500 * 3);
let starSeed = 274192;
function random() { starSeed = (Math.imul(starSeed,1664525) + 1013904223) >>> 0; return starSeed / 4294967296; }
for (let i = 0; i < starPositions.length; i += 3) {
  starPositions[i] = (random() - 0.5) * 34;
  starPositions[i + 1] = (random() - 0.5) * 23;
  starPositions[i + 2] = -3 - random() * 24;
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3));
const starMaterial = new THREE.PointsMaterial({color: 0x60646a, size: 0.013, transparent: true, opacity: 0.24, depthWrite: false});
const stars = new THREE.Points(starGeometry,starMaterial);
scene.add(stars);

const pointer = new THREE.Vector2(-10,-10);
const params = new URLSearchParams(location.search);
const sectionsById = Object.fromEntries(sections.map((s, i) => [s.id, i]));
const initialScene = Object.hasOwn(sectionsById,location.hash.slice(1)) ? sectionsById[location.hash.slice(1)] : 0;
const captureParam = params.get('capture');
const captureStory = captureParam !== null && Number.isFinite(Number(captureParam)) ? THREE.MathUtils.clamp(Number(captureParam),0,3) : null;
const state = {story: captureStory ?? initialScene};
let targetScene = initialScene;
let sculpture = null;
let orbitField = null;
let tween = null;
let currentTicket = 0;
let wheelLocked = false;
let lowQuality = matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory || 8) < 4;

function renderText(i) {
  const s = sections[i];
  eyebrow.textContent = s.tag;
  heading.replaceChildren();
  for (let j = 0; j < s.title.length; j++) {
    const span = document.createElement('span');
    span.className = j === 0 ? 'line outline' : 'line';
    span.textContent = s.title[j];
    heading.appendChild(span);
  }
  heading.classList.toggle('small', s.title[0].length > 7);
  lede.textContent = s.subtitle;
  document.getElementById('actionLabel').textContent = s.action;
  document.getElementById('idx').textContent = String(i + 1).padStart(2,'0');
  document.getElementById('prev').disabled = i === 0;
  document.getElementById('next').disabled = i === sections.length - 1;
  progressBar.style.transform = 'scaleX(' + i / (sections.length - 1) + ')';
  if (location.hash !== '#' + s.id) history.replaceState(null,'','#'+s.id);
}
renderText(captureStory === null ? initialScene : Math.round(captureStory));
if (captureStory !== null && Math.abs(captureStory - Math.round(captureStory)) > 0.012) {
  app.classList.add('is-travelling');
  gsap.set(chapter, { opacity: 0 });
}

function resize() {
  if(!renderer) return;
  const dpr = Math.min(devicePixelRatio || 1, lowQuality ? 1.0 : 1.65);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  sculpture?.setQuality(lowQuality);
  orbitField?.setQuality(lowQuality);
}
function refreshQuality() {
  if (!sculpture) return;
  qualityButton.textContent = lowQuality ? 'QUALITY : ECO' : 'QUALITY : HIGH';
  qualityButton.setAttribute('aria-pressed', String(!lowQuality));
  resize();
}
function navigateTo(index) {
  if (!sculpture) return;
  const to = Math.min(sections.length - 1, Math.max(0,index));
  if(to === targetScene && Math.abs(state.story - to) < 0.0001) return;
  targetScene = to;
  const ticket = ++currentTicket;
  tween?.kill();
  gsap.killTweensOf(chapter);

  if (reduceMotion) {
    state.story = to;
    renderText(to);
    gsap.set(chapter,{opacity: 1, y: 0});
    return;
  }

  const duration = Math.min(12, Math.max(4.1, Math.abs(to - state.story) * 4.1));
  const hideDuration = 0.32;
  const revealTime = duration * 0.77;
  app.classList.add('is-travelling');
  tween = gsap.timeline({onComplete:()=>app.classList.remove('is-travelling')});
  tween.to(chapter, {opacity: 0, y: -26, duration: hideDuration, ease:'power2.in'}, 0);
  tween.to(state, {story: to, duration, ease:'none'},0);
  tween.call(() => {
    if(ticket !== currentTicket) return;
    renderText(to);
    gsap.set(chapter, {y:28});
  }, [], revealTime);
  tween.to(chapter, {opacity:1, y:0, duration:0.7,ease:'power2.out'},revealTime + 0.05);
}

function nextScene() { navigateTo(targetScene === sections.length-1 ? 0 : targetScene+1); }
function previousScene() { navigateTo(targetScene-1); }
function closeMenu() { menu.classList.remove('open'); }
document.getElementById('next').addEventListener('click', nextScene);
document.getElementById('prev').addEventListener('click', previousScene);
document.getElementById('nextAction').addEventListener('click', nextScene);
document.getElementById('homeLink').addEventListener('click',e=>{e.preventDefault();navigateTo(0);});
document.getElementById('menuBtn').addEventListener('click',()=>menu.classList.add('open'));
document.getElementById('closeBtn').addEventListener('click',closeMenu);
menu.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click',()=>{closeMenu();navigateTo(Number(button.dataset.section));}));
qualityButton.addEventListener('click',()=>{lowQuality=!lowQuality;refreshQuality();});
motionButton.addEventListener('click',()=>{
  reduceMotion = !reduceMotion;
  motionButton.textContent = reduceMotion ? 'MOTION : OFF' : 'MOTION : ON';
  motionButton.setAttribute('aria-pressed', String(!reduceMotion));
});
window.addEventListener('keydown',event=>{
  if(menu.classList.contains('open')){if(event.key==='Escape')closeMenu();return;}
  if(['ArrowDown','ArrowRight','PageDown',' '].includes(event.key)){event.preventDefault();nextScene();}
  if(['ArrowUp','ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();previousScene();}
});
window.addEventListener('wheel',event=>{
  if(menu.classList.contains('open') || !sculpture || wheelLocked || Math.abs(event.deltaY) < 15) return;
  wheelLocked = true;
  event.deltaY > 0 ? nextScene() : previousScene();
  setTimeout(()=>{wheelLocked = false;},900);
},{passive:true});
let startY=0;
window.addEventListener('touchstart',e=>{startY=e.touches[0].clientY;},{passive:true});
window.addEventListener('touchend',e=>{
  if(menu.classList.contains('open')) return;
  const dy = startY - e.changedTouches[0].clientY;
  if(Math.abs(dy)>80) dy>0?nextScene():previousScene();
},{passive:true});
window.addEventListener('pointermove',event=>{
  pointer.set(2 * event.clientX/innerWidth-1, 1-2*event.clientY/innerHeight);
},{passive:true});
window.addEventListener('hashchange',()=> {
  const i=sectionsById[location.hash.slice(1)];
  if(i !== undefined) navigateTo(i);
});
window.addEventListener('resize',resize);

async function begin() {
  if(!renderer) return;
  resize();
  try {
    sculpture = await loadParticleSculpture(renderer);
    orbitField = createOrbitField(renderer);
    sculpture.rig.add(orbitField.points);
    scene.add(sculpture.rig);
    refreshQuality();
    const clock = new THREE.Clock();
    const cursor = new THREE.Vector2(-10,-10);
    loading.remove();
    const captureTime = params.get('captureTime');
    const frozenTime = captureTime !== null && Number.isFinite(Number(captureTime)) ? Number(captureTime) : null;
    function frame() {
      requestAnimationFrame(frame);
      const time = frozenTime ?? clock.getElapsedTime();
      sculpture.uniforms.uTime.value = reduceMotion ? 0 : time;
      sculpture.uniforms.uStory.value = state.story;
      orbitField.uniforms.uStory.value = state.story;
      orbitField.uniforms.uTime.value = reduceMotion ? 0 : time;
      orbitField.uniforms.uMotion.value = reduceMotion ? 0 : 1;
      sculpture.uniforms.uMotion.value = reduceMotion ? 0 : 1;
      cursor.lerp(pointer,0.07);
      sculpture.uniforms.uMouse.value.copy(cursor);
      updateCameraDirector(camera,sculpture.rig,state.story,time,innerWidth < 760,reduceMotion);
      stars.rotation.y = reduceMotion ? 0 : time * 0.0018;
      renderer.render(scene,camera);
    }
    frame();
    if(params.has('debug') || captureStory !== null) window.__LEEQ_DEBUG = {
      get state(){return state.story;}, get count(){return sculpture.count;}, get scene(){return targetScene;},
      get camera(){return {position:camera.position.toArray(), rotation:camera.rotation.toArray(), fov:camera.fov};},
      goTo:navigateTo, seek:t=>{t=Number(t);if(Number.isFinite(t))state.story=THREE.MathUtils.clamp(t,0,3);}
    };
  } catch(error) {
    console.error('Particle initialization failed:',error);
    document.getElementById('loadMessage').textContent = 'Could not load particle assets. Run npm run bake and refresh the page.';
  }
}
begin();
