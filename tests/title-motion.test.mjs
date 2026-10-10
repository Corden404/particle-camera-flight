import test from 'node:test';
import assert from 'node:assert/strict';
import { Navigation } from '../src/interaction/Navigation.js';

const motion = await import('../src/interaction/TitleMotion.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

function implementation() {
  assert.equal(typeof motion.sampleTitleMotion, 'function', 'Missing deterministic title motion sampler');
  return motion.sampleTitleMotion;
}

function assertShown(frame, chapter) {
  assert.equal(frame.chapter, chapter);
  assert.equal(frame.visible, true);
  assert.deepEqual(frame.lines, [{ opacity: 1, yPercent: 0 }, { opacity: 1, yPercent: 0 }]);
}

function assertHidden(frame) {
  assert.equal(frame.visible, false);
  assert.ok(frame.lines.every(line => line.opacity === 0));
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);
}

test('all four camera docks retain fully visible titles and a still platform on both sides', () => {
  const sample = implementation();
  for (let chapter = 0; chapter < 4; chapter++) {
    for (const offset of [-0.01, 0, 0.01]) assertShown(sample(chapter + offset), chapter);
  }
});

test('each leg preserves the central visual focus and the existing staggered mask easing', () => {
  const sample = implementation();
  const windows = [
    { exitEnd: 0.25, enterStart: 0.64, secondsHidden: 1.95 },
    { exitEnd: 0.22, enterStart: 0.62, secondsHidden: 2.00 },
    { exitEnd: 0.28, enterStart: 0.66, secondsHidden: 1.90 },
  ];
  windows.forEach(({ exitEnd, enterStart, secondsHidden }, leg) => {
    for (const phase of [exitEnd, 0.499999, 0.5, enterStart]) assertHidden(sample(leg + phase));
    assert.equal(sample(leg + exitEnd - 0.002).visible, true);
    assert.equal(sample(leg + enterStart + 0.002).visible, true);
    close((enterStart - exitEnd) * 5, secondsHidden);
    assert.equal(sample(leg + 0.499999).chapter, leg);
    assert.equal(sample(leg + 0.5).chapter, leg + 1);
  });
  const leaving = sample(0.17).lines;
  close(leaving[0].opacity, 0.875);
  close(leaving[0].yPercent, -13);
  assert.ok(leaving[0].opacity < leaving[1].opacity);
  const arriving = sample(0.73).lines;
  close(arriving[0].opacity, 0.9375);
  close(arriving[0].yPercent, 6.5);
  assert.ok(arriving[0].opacity > arriving[1].opacity);
});

test('short reversals restore the current title without replaying a complete disappearance', () => {
  const sample = implementation();
  for (const turnAt of [0.03, 0.19]) {
    const navigation = new Navigation();
    navigation.goTo(1);
    navigation.story = turnAt;
    let previous = sample(navigation.story);
    const returning = navigation.step(-1);
    close(returning.duration, turnAt * 5);
    assert.deepEqual(sample(navigation.story), previous, 'reversing cannot change a pose at the same camera position');
    for (const fraction of [0.75, 0.5, 0.25, 0]) {
      navigation.story = turnAt * fraction;
      const current = sample(navigation.story);
      assert.equal(current.chapter, 0);
      assert.equal(current.visible, true);
      current.lines.forEach((line, index) => {
        assert.ok(line.opacity >= previous.lines[index].opacity);
        assert.ok(Math.abs(line.yPercent) <= Math.abs(previous.lines[index].yPercent));
      });
      previous = current;
    }
    assertShown(previous, 0);
  }
});

test('a fifteen-second menu flight shows intermediate chapters and retraces the same poses after retargeting', () => {
  const sample = implementation();
  const navigation = new Navigation();
  assert.equal(navigation.goTo(3).duration, 15);
  const positions = [0, 0.17, 0.45, 0.73, 0.99, 1, 1.01, 1.5, 1.73, 1.99, 2, 2.01, 2.5, 2.77, 3];
  const forward = positions.map(story => {
    navigation.story = story;
    return sample(story);
  });
  for (const chapter of [1, 2]) {
    for (const offset of [-0.01, 0, 0.01]) assertShown(sample(chapter + offset), chapter);
  }
  navigation.story = 2.77;
  const beforeRetarget = sample(navigation.story);
  navigation.goTo(0);
  assert.deepEqual(sample(navigation.story), beforeRetarget);
  const reusable = {};
  for (let index = positions.length - 1; index >= 0; index--) {
    navigation.story = positions[index];
    assert.deepEqual(sample(navigation.story, reusable), forward[index]);
  }
});

test('reusing a target preserves its array and both line objects while replacing every sampled value', () => {
  const sample = implementation();
  const target = { lines: [{}, {}] };
  const lines = target.lines;
  const first = lines[0];
  const second = lines[1];
  for (const story of [0.17, 2.77, 1.5, 3, 0.73, 0]) {
    const expected = sample(story);
    assert.equal(sample(story, target), target);
    assert.equal(target.lines, lines);
    assert.equal(target.lines[0], first);
    assert.equal(target.lines[1], second);
    assert.deepEqual(target, expected);
  }
});

test('story inputs are bounded and all sampled styles remain finite', () => {
  const sample = implementation();
  assertShown(sample(-20), 0);
  assertShown(sample(20), 3);
  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, '2']) assertShown(sample(invalid), 0);
  for (let step = 0; step <= 300; step++) {
    const frame = sample(step / 100);
    assert.ok(Number.isInteger(frame.chapter) && frame.chapter >= 0 && frame.chapter <= 3);
    assert.equal(typeof frame.visible, 'boolean');
    assert.equal(frame.lines.length, 2);
    for (const line of frame.lines) {
      assert.ok(Number.isFinite(line.opacity) && line.opacity >= 0 && line.opacity <= 1);
      assert.ok(Number.isFinite(line.yPercent) && Math.abs(line.yPercent) <= 104);
    }
  }
});
