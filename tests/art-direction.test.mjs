import test from 'node:test';
import assert from 'node:assert/strict';

const art = await import('../src/particles/art-direction.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

function implementation(name) {
  assert.equal(typeof art[name], 'function', `Missing particle art helper: ${name}`);
  return art[name];
}

test('transit offsets vanish at both exact endpoints of every leg', () => {
  const sample = implementation('sampleLegEnvelope');
  for (let leg = 0; leg < 3; leg++) {
    for (const phase of [0, 1]) {
      const state = sample(leg, phase);
      for (const key of ['scatter', 'swirl', 'focus', 'bend', 'lift', 'lane', 'transit']) {
        assert.equal(state[key], 0, `${key} must preserve pose at leg ${leg}, phase ${phase}`);
      }
      assert.equal(state.ambientAlpha, 1);
      assert.equal(state.ambientMotion, 1);
    }
  }
});

test('all three legs remain finite and bounded through release and early gathering', () => {
  const sample = implementation('sampleLegEnvelope');
  for (let leg = 0; leg < 3; leg++) {
    for (let step = 0; step <= 400; step++) {
      const phase = step / 400;
      const state = sample(leg, phase);
      assert.ok(Object.values(state).every(Number.isFinite), `non-finite leg ${leg}, phase ${phase}`);
      assert.ok(state.transit >= 0 && state.transit <= 1);
      assert.ok(state.scatter >= 0 && state.scatter <= 1.6);
      assert.ok(Math.abs(state.swirl) <= 0.85);
      assert.ok(state.focus >= 0 && state.focus <= 0.66);
      assert.ok(Math.abs(state.bend) <= 1.0 && Math.abs(state.lift) <= 1.0);
      assert.ok(state.lane >= 0 && state.lane <= 1.1);
      assert.ok(state.ambientAlpha >= 0.5 && state.ambientAlpha <= 1);
      assert.ok(state.ambientMotion >= 0.35 && state.ambientMotion <= 1);
      assert.ok(state.travelStart >= 0 && state.travelStart < state.travelEnd);
      assert.ok(state.travelEnd < 0.9 && state.stagger >= 0 && state.stagger <= 0.22);
    }
    const recovered = sample(leg, 0.88);
    assert.equal(recovered.transit, 0, 'target silhouette must recover before the last tenth');
    assert.equal(recovered.focus, 0);
    assert.equal(recovered.scatter, 0);
  }
});

test('leg choreography differs and camera-active middles calm the atmosphere', () => {
  const sample = implementation('sampleLegEnvelope');
  const middles = [0, 1, 2].map(leg => sample(leg, 0.42));
  assert.equal(new Set(middles.map(state => [state.scatter, state.swirl, state.focus, state.lift].join(','))).size, 3);
  for (const state of middles) {
    assert.ok(state.transit > 0.65, 'directed release should be visible in the middle');
    assert.ok(state.ambientAlpha < 0.9 && state.ambientMotion < 0.8);
  }
  assert.ok(middles[1].ambientMotion < middles[0].ambientMotion, 'the middle camera leg needs more atmospheric restraint');
});

test('equal leg and phase give identical art state while a reusable target avoids frame allocations', () => {
  const sample = implementation('sampleLegEnvelope');
  const target = {};
  const before = sample(1, 0.37);
  sample(2, 0.95, target);
  assert.equal(sample(1, 0.37, target), target);
  assert.deepEqual(target, before);
  assert.deepEqual(sample(1, 0.37), before);
  for (const phase of [0.001, 0.23, 0.5, 0.77, 0.999]) {
    assert.deepEqual(sample(0, phase), sample(0, phase), 'flight depends on phase, never elapsed wall clock');
  }
});

test('viewport model scale is continuous for fractional weights and clamps invalid input', () => {
  const scale = implementation('viewportModelScale');
  assert.equal(scale(0), 1.14);
  assert.equal(scale(1), 1.10);
  assert.equal(scale(false), scale(0));
  assert.equal(scale(true), scale(1));
  assert.ok(Math.abs(scale(0.5) - 1.12) < 1e-12);
  let previous = scale(0);
  for (let step = 1; step <= 1000; step++) {
    const current = scale(step / 1000);
    assert.ok(current <= previous && previous - current < 0.000041);
    previous = current;
  }
  assert.equal(scale(-1), scale(0));
  assert.equal(scale(2), scale(1));
  assert.equal(scale(Number.NaN), scale(0));
  assert.equal(scale(undefined), scale(0));
});

test('chapter palette interpolates continuously, remains muted, and preserves four distinct stops', () => {
  const sample = implementation('sampleChapterPalette');
  const stops = [0, 1, 2, 3].map(story => sample(story));
  assert.equal(new Set(stops.map(value => [value.cool, value.warm, value.lilac].join(','))).size, 4);
  for (let step = 0; step <= 1200; step++) {
    const palette = sample(step / 400);
    assert.ok(Object.values(palette).every(Number.isFinite));
    assert.ok(palette.cool >= 0 && palette.warm >= 0 && palette.lilac >= 0);
    assert.ok(palette.cool + palette.warm + palette.lilac <= 1);
    assert.ok(palette.lilac <= 0.035, 'lilac must remain a small accent');
  }
  for (const boundary of [1, 2]) {
    const before = sample(boundary - 1e-5);
    const after = sample(boundary + 1e-5);
    for (const key of ['cool', 'warm', 'lilac']) {
      assert.ok(Math.abs(after[key] - before[key]) < 1e-6, `palette jump at chapter ${boundary}`);
    }
  }
  const target = {};
  assert.equal(sample(1.25, target), target);
  assert.deepEqual(target, sample(1.25));
  assert.deepEqual(sample(-1), stops[0]);
  assert.deepEqual(sample(4), stops[3]);
  assert.deepEqual(sample(Number.NaN), stops[0]);
});
