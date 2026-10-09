import test from 'node:test';
import assert from 'node:assert/strict';
import { Navigation, WheelIntent, normalizeWheelDelta, getKeyIntent, isInteractiveTarget } from '../src/interaction/Navigation.js';

const wheel = (deltaY, extra = {}) => ({ deltaY, deltaMode: 0, ...extra });
const element = (tagName, parentElement = null, attributes = {}) => ({
  tagName, parentElement,
  getAttribute: name => attributes[name] ?? null,
  isContentEditable: attributes.contenteditable === 'true',
});

test('a complete adjacent flight takes exactly five seconds and keeps its settled origin', () => {
  const navigation = new Navigation();
  assert.deepEqual(navigation.goTo(1), { from: 0, to: 1, duration: 5, revision: 1 });
  assert.equal(navigation.settled, 0);
  assert.equal(navigation.target, 1);
  assert.equal(navigation.inflight, true);
});

test('rapid repeated forward intent is coalesced during a flight', () => {
  const navigation = new Navigation();
  navigation.step(1);
  navigation.story = 0.35;
  for (let i = 0; i < 30; i++) assert.equal(navigation.step(1), null);
  assert.equal(navigation.target, 1);
  assert.equal(navigation.settled, 0);
  navigation.settle();
  assert.equal(navigation.story, 1);
  assert.equal(navigation.settled, 1);
  assert.equal(navigation.inflight, false);
});

test('chapter bounds never wrap from contact to home or reverse before home', () => {
  const navigation = new Navigation();
  assert.equal(navigation.step(-1), null);
  navigation.goTo(3, { instant: true });
  assert.equal(navigation.step(1), null);
  assert.equal(navigation.target, 3);
  assert.equal(navigation.story, 3);
});

test('intentional reversal returns along the partial leg with original timing', () => {
  const navigation = new Navigation();
  navigation.goTo(1);
  navigation.story = 0.4;
  assert.deepEqual(navigation.step(-1), { from: 0.4, to: 0, duration: 2, revision: 2 });
  assert.equal(navigation.target, 0);
  assert.equal(navigation.step(-1), null);
  navigation.settle();
  assert.equal(navigation.settled, 0);
});

test('direct menu navigation preserves five seconds per leg and rejects stale completion', () => {
  const navigation = new Navigation();
  assert.deepEqual(navigation.goTo(3), { from: 0, to: 3, duration: 15, revision: 1 });
  navigation.story = 1.5;
  navigation.goTo(1);
  assert.equal(navigation.settle(1), false);
  assert.equal(navigation.target, 1);
  assert.equal(navigation.inflight, true);
  assert.equal(navigation.settle(2), true);
  assert.equal(navigation.story, 1);
});

test('reduced motion settles the requested chapter immediately', () => {
  const navigation = new Navigation({ initial: 1 });
  assert.deepEqual(navigation.step(1, { instant: true }), { from: 1, to: 2, duration: 0, revision: 1 });
  assert.equal(navigation.story, 2);
  assert.equal(navigation.settled, 2);
  assert.equal(navigation.target, 2);
  assert.equal(navigation.inflight, false);
});

test('debug seek clamps finite values and clears an in-flight transition', () => {
  const navigation = new Navigation();
  navigation.goTo(3);
  assert.equal(navigation.seek(1.25), true);
  assert.equal(navigation.story, 1.25);
  assert.equal(navigation.target, 1);
  assert.equal(navigation.inflight, false);
  assert.equal(navigation.seek(Infinity), false);
  assert.equal(navigation.story, 1.25);
});

test('wheel units are normalized for pixel, line and page devices', () => {
  assert.equal(normalizeWheelDelta(wheel(3)), 3);
  assert.equal(normalizeWheelDelta(wheel(3, { deltaMode: 1 })), 48);
  assert.equal(normalizeWheelDelta(wheel(1, { deltaMode: 2 }), 900), 900);
});

test('a wheel gesture emits once until inertia ends at a quiet gap', () => {
  const intent = new WheelIntent();
  assert.equal(intent.push(wheel(20), 0), 0);
  assert.equal(intent.push(wheel(30), 40), 1);
  for (let time = 80; time <= 6000; time += 80) assert.equal(intent.push(wheel(60), time), 0);
  assert.equal(intent.push(wheel(60), 6300), 1);
});

test('opposite wheel input requires deliberate distance before reversing', () => {
  const intent = new WheelIntent();
  assert.equal(intent.push(wheel(100), 0), 1);
  assert.equal(intent.push(wheel(-10), 20), 0);
  assert.equal(intent.push(wheel(8), 40), 0);
  assert.equal(intent.push(wheel(-45), 60), 0);
  assert.equal(intent.push(wheel(-50), 80), -1);
  assert.equal(intent.push(wheel(-100), 100), 0);
});

test('modified or prevented wheel events do not consume a navigation gesture', () => {
  const intent = new WheelIntent();
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'defaultPrevented']) {
    assert.equal(intent.push(wheel(100, { [modifier]: true }), 0), 0);
  }
  assert.equal(intent.push(wheel(100), 0), 1);
});

test('wheel inertia cannot start another flight after the first one settles', () => {
  const navigation = new Navigation();
  const intent = new WheelIntent();
  navigation.step(intent.push(wheel(100), 0));
  navigation.settle();
  for (let time = 80; time <= 5200; time += 80) navigation.step(intent.push(wheel(30), time));
  assert.equal(navigation.target, 1);
  assert.equal(navigation.inflight, false);
});

test('native interactive targets and their children retain keyboard activation', () => {
  const button = element('BUTTON');
  const nested = element('SPAN', button);
  assert.equal(isInteractiveTarget(nested), true);
  for (const target of [button, nested, element('INPUT'), element('A'), element('DIV', null, { contenteditable: 'true' })]) {
    for (const key of [' ', 'Enter', 'ArrowDown', 'q', 'm']) assert.equal(getKeyIntent({ key, target }), null);
  }
});

test('background arrow and page keys navigate but modifiers, repeats and prevention are ignored', () => {
  const target = element('MAIN');
  for (const key of ['ArrowDown', 'ArrowRight', 'PageDown', ' ']) assert.equal(getKeyIntent({ key, target }), 'next');
  for (const key of ['ArrowUp', 'ArrowLeft', 'PageUp']) assert.equal(getKeyIntent({ key, target }), 'previous');
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'repeat', 'defaultPrevented']) {
    assert.equal(getKeyIntent({ key: 'ArrowDown', target, [modifier]: true }), null);
  }
  assert.equal(getKeyIntent({ key: 'Enter', target }), null);
  assert.equal(getKeyIntent({ key: 'Q', target }), 'quality');
  assert.equal(getKeyIntent({ key: 'm', target }), 'motion');
});
