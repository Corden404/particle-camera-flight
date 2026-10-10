import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VISUAL_GROUPS, VISUAL_DEFAULTS, VISUAL_STORAGE_KEY,
  normalizeVisualSettings, readVisualSettings, writeVisualSettings
} from '../src/controls/visual-settings.js';

test('all displayed live controls use unique, bounded multiplier values', () => {
  const controls = VISUAL_GROUPS.flatMap(group => group.controls);
  assert.equal(controls.length, 13);
  assert.equal(new Set(controls.map(item => item.key)).size, controls.length);
  for (const control of controls) {
    const defaultValue = VISUAL_DEFAULTS[control.key];
    assert.ok(Number.isFinite(defaultValue));
    assert.ok(control.min <= defaultValue && control.max >= defaultValue);
    assert.ok(control.max > control.min);
  }
});

test('saved values clamp to safe shader ranges and quantize to slider precision', () => {
  const state = normalizeVisualSettings({
    modelSaturation: -200,
    modelBrightness: 1000,
    modelTwinkle: 1.2345,
    ambientDensity: 0.175,
    pointerStrength: Number.NaN,
    scatter: Infinity,
    unexpectedKey: 900
  });
  assert.equal(state.modelSaturation, 0);
  assert.equal(state.modelBrightness, 1.8);
  assert.equal(state.modelTwinkle, 1.25);
  assert.equal(state.ambientDensity, 0.2);
  assert.equal(state.pointerStrength, VISUAL_DEFAULTS.pointerStrength);
  assert.equal(state.scatter, VISUAL_DEFAULTS.scatter);
  assert.ok(!Object.hasOwn(state, 'unexpectedKey'));
});

test('invalid or outdated storage never prevents the website from loading', () => {
  const bad = { getItem: () => '{bad JSON' };
  assert.deepEqual(readVisualSettings(bad), VISUAL_DEFAULTS);
  assert.deepEqual(readVisualSettings({ getItem() { throw Error('blocked'); } }), VISUAL_DEFAULTS);
  assert.deepEqual(readVisualSettings({ getItem: () => '{"modelSize":0.8,"oldKey":9}' }),
    { ...VISUAL_DEFAULTS, modelSize: 0.8 });
});

test('persisted visual settings round-trip without changing original defaults', () => {
  const data = new Map();
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  };
  const original = { ...VISUAL_DEFAULTS, modelSaturation: 0.55, ambientDensity: 0,
    cameraSway: 1.5 };
  assert.equal(writeVisualSettings(storage, original), true);
  assert.ok(data.has(VISUAL_STORAGE_KEY));
  assert.deepEqual(readVisualSettings(storage), original);
  assert.equal(VISUAL_DEFAULTS.modelSaturation, 1);
  assert.equal(writeVisualSettings(null, original), false);
  assert.equal(writeVisualSettings({ setItem() { throw Error('quota'); } }, original), false);
});
