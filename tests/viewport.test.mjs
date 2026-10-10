import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { loadApprovedCamera } from '../src/camera/ApprovedCamera.js';

const originalFetch = globalThis.fetch;
let rig;
try {
  globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve('public', String(url)), 'utf8')) });
  rig = await loadApprovedCamera();
} finally {
  globalThis.fetch = originalFetch;
}
function pose(story, weight, width = 1422, height = 804) {
  const camera = new THREE.PerspectiveCamera(40, width / height, .03, 300);
  rig.sample(camera, story, weight);
  return camera;
}
test('original camera asset content survives platform line-ending conversion', () => {
  // Git can normalize the final CRLF to LF on Linux. Hash canonical LF bytes
  // so the authored camera data is verified without a host-specific newline.
  const source = fs.readFileSync('public/scene/camera-path.json', 'utf8').replace(/\r\n/g, '\n');
  const digest = crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(digest, '1cfe707e62d4bb8f79f2447ebfa72e951ea54c8ae72c2a3b87564dd21b05dcce');
});
test('wide viewports use the authored camera samples', () => {
  for (const frame of [0, 30, 60, 120, 180, 240, 300, 360]) {
    const camera = pose(frame / 120, 0);
    const expected = rig.data.samples[frame];
    assert.ok(camera.position.distanceTo(new THREE.Vector3(...expected.slice(0, 3))) < 1e-9);
    assert.ok(camera.quaternion.toArray().every((value, i) => Math.abs(value - expected[i + 3]) < 1e-12));
  }
});
test('framing is genuinely continuous rather than treating every nonzero weight as portrait', () => {
  const wide = pose(0, 0, 759, 900);
  const portrait = pose(0, 1, 759, 900);
  const middle = pose(0, .5, 759, 900);
  const expected = wide.position.clone().lerp(portrait.position, .5);
  assert.ok(middle.position.distanceTo(expected) < 1e-8, 'half framing weight must produce the midpoint camera position');
  assert.ok(middle.fov > Math.min(wide.fov, portrait.fov) && middle.fov < Math.max(wide.fov, portrait.fov));
});
test('portrait framing leaves the travel midpoint on the original spatial route', () => {
  for (const story of [.5, 1.5, 2.5]) {
    const wide = pose(story, 0);
    const portrait = pose(story, 1);
    assert.ok(wide.position.distanceTo(portrait.position) < 1e-9);
    assert.ok(wide.quaternion.toArray().every((value, i) => Math.abs(value - portrait.quaternion.toArray()[i]) < 1e-12));
  }
});
test('layout remains continuous across the former 759/760 boundary', async () => {
  const { getViewportLayout } = await import('../src/layout/viewport.js');
  const a = getViewportLayout(759, 900), b = getViewportLayout(760, 900);
  assert.ok(Math.abs(a.portraitWeight - b.portraitWeight) < .01);
  assert.ok(Math.abs(a.titleTop - b.titleTop) < 2);
  assert.ok(Math.abs(a.titleSize - b.titleSize) < 2);
  assert.ok(pose(0, a.portraitWeight, 759, 900).position.distanceTo(pose(0, b.portraitWeight, 760, 900).position) < .05);
});
test('layout uses aspect ratio and keeps title space inside short and narrow canvases', async () => {
  const { getViewportLayout } = await import('../src/layout/viewport.js');
  assert.ok(getViewportLayout(740, 1000).portraitWeight > .95);
  assert.equal(getViewportLayout(740, 400).portraitWeight, 0);
  for (const [width, height] of [[320, 568], [390, 844], [759, 900], [760, 900], [768, 1024], [1024, 400], [1422, 804], [1920, 1080]]) {
    const layout = getViewportLayout(width, height);
    assert.equal(layout.width, width);
    assert.equal(layout.height, height);
    assert.ok(Object.values(layout).every(v => typeof v === 'boolean' || Number.isFinite(v)));
    assert.ok(layout.titleWidth > 0 && layout.gutter + layout.titleWidth <= width - 12);
    assert.ok(layout.titleTop - layout.titleSize * 1.35 >= 0);
    assert.ok(layout.titleTop + layout.titleSize * 1.35 <= height);
  }
});
test('projection cache is scoped to the camera instance', () => {
  pose(0, 1, 390, 844);
  const camera = pose(0, 1, 390, 844);
  const expected = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
  assert.deepEqual(camera.projectionMatrix.elements, expected.projectionMatrix.elements);
});

