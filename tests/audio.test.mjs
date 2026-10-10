import test from 'node:test';
import assert from 'node:assert/strict';

const { createAmbientAudio } = await import('../src/audio/AmbientAudio.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

function clock() {
  let now = 0, next = 0;
  const tasks = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) { const id = ++next; tasks.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    advance(ms) {
      now += ms;
      for (let due; (due = [...tasks].find(([, task]) => task.at <= now));) {
        tasks.delete(due[0]);
        due[1].fn();
      }
    }
  };
}

function param(value = 0) {
  return {
    value, events: [],
    setValueAtTime(value, at) { this.value = value; this.events.push({ value, at, kind: 'set' }); },
    linearRampToValueAtTime(value, at) { this.value = value; this.events.push({ value, at, kind: 'ramp' }); },
    exponentialRampToValueAtTime(value, at) { this.value = value; this.events.push({ value, at, kind: 'exponential' }); },
    setTargetAtTime(value, at) { this.value = value; this.events.push({ value, at, kind: 'target' }); },
    cancelScheduledValues() {}
  };
}

class AudioContextDouble {
  constructor(timer, { deferredResume = false, deferredSuspend = false } = {}) {
    this.timer = timer;
    this.deferredResume = deferredResume;
    this.deferredSuspend = deferredSuspend;
    this.state = 'suspended';
    this.nodes = [];
    this.listeners = new Set();
    this.resumes = [];
    this.suspends = [];
    this.destination = {};
    this.resumeCalls = 0;
    this.suspendCalls = 0;
    this.closeCalls = 0;
  }
  get currentTime() { return this.timer.now() / 1000; }
  change(state) { this.state = state; for (const listener of this.listeners) listener(); }
  addEventListener(type, listener) { if (type === 'statechange') this.listeners.add(listener); }
  removeEventListener(type, listener) { if (type === 'statechange') this.listeners.delete(listener); }
  resume() {
    this.resumeCalls++;
    if (this.state === 'closed') return Promise.reject(new Error('Context closed'));
    if (this.deferredResume) return new Promise((resolve, reject) => this.resumes.push({
      resolve: () => { if (this.state !== 'closed') this.change('running'); resolve(); }, reject
    }));
    this.change('running');
    return Promise.resolve();
  }
  suspend() {
    this.suspendCalls++;
    if (this.deferredSuspend) return new Promise(resolve => this.suspends.push(() => {
      if (this.state !== 'closed') this.change('suspended');
      resolve();
    }));
    this.change('suspended');
    return Promise.resolve();
  }
  close() { this.closeCalls++; this.change('closed'); return Promise.resolve(); }
  node(source = false) {
    const context = this;
    const node = {
      gain: param(1), frequency: param(), detune: param(), pan: param(), Q: param(),
      source, started: false, ended: false, disconnected: false, connections: [],
      connect(target) { this.connections.push(target); return target; },
      disconnect() { this.disconnected = true; this.connections = []; },
      start() { this.started = true; },
      stop(at = context.currentTime) {
        context.timer.setTimeout(() => { this.ended = true; this.onended?.(); }, Math.max(0, (at - context.currentTime) * 1000));
      }
    };
    this.nodes.push(node);
    return node;
  }
  createGain() { return this.node(); }
  createOscillator() { return this.node(true); }
  createBiquadFilter() { return this.node(); }
  createStereoPanner() { return this.node(); }
  get liveSources() { return this.nodes.filter(node => node.source && node.started && !node.ended && !node.disconnected).length; }
}

function harness({ saved = null, contextOptions, storage, ...options } = {}) {
  assert.equal(typeof createAmbientAudio, 'function', 'Ambient audio controller must be available');
  const timer = clock();
  const contexts = [];
  const values = new Map(saved === null ? [] : [['leeq.audio.v1', saved]]);
  const changes = [];
  const audio = createAmbientAudio({
    contextFactory: () => { const context = new AudioContextDouble(timer, contextOptions); contexts.push(context); return context; },
    storage: storage ?? { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    scheduler: timer,
    onChange: state => changes.push(state),
    ...options
  });
  return { audio, timer, contexts, values, changes };
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('a first visit stays silent until the visitor enables sound', async () => {
  const { audio, contexts } = harness();
  audio.setReady(true);
  assert.equal(audio.state.enabled, false);
  assert.equal(audio.state.locked, true);
  assert.equal(audio.state.playing, false);
  await audio.unlock();
  assert.equal(contexts.length, 0);
  assert.equal(audio.playClick(), false);
  await audio.setEnabled(true);
  assert.equal(contexts.length, 1);
  assert.equal(audio.state.playing, true);
  assert.equal(audio.state.locked, false);
  audio.dispose();
});

test('a saved preference requires a fresh gesture after reload', async () => {
  const original = harness();
  original.audio.setReady(true);
  await original.audio.setEnabled(true);
  assert.equal(original.values.get('leeq.audio.v1'), 'on');
  const restored = harness({ saved: original.values.get('leeq.audio.v1') });
  restored.audio.setReady(true);
  restored.audio.setVisible(true);
  assert.equal(restored.audio.state.enabled, true);
  assert.equal(restored.audio.state.locked, true);
  assert.equal(restored.contexts.length, 0);
  await restored.audio.unlock();
  assert.equal(restored.audio.state.playing, true);
  await restored.audio.setEnabled(false);
  assert.equal(restored.values.get('leeq.audio.v1'), 'off');
  original.audio.dispose();
  restored.audio.dispose();
});

test('capture mode never constructs audio or changes saved preferences', async () => {
  const { audio, contexts, values } = harness({ disabled: true, saved: 'on' });
  audio.setReady(true);
  await audio.setEnabled(true);
  await audio.unlock();
  assert.equal(audio.state.playing, false);
  assert.equal(audio.state.enabled, false);
  assert.equal(contexts.length, 0);
  assert.equal(values.get('leeq.audio.v1'), 'on');
  audio.dispose();
});

test('turning sound off during resume cannot revive playback', async () => {
  const { audio, contexts, timer } = harness({ contextOptions: { deferredResume: true } });
  audio.setReady(true);
  const enabling = audio.setEnabled(true);
  await audio.setEnabled(false);
  contexts[0].resumes[0].resolve();
  await enabling;
  timer.advance(1000);
  await flush();
  assert.equal(audio.state.enabled, false);
  assert.equal(audio.state.playing, false);
  assert.equal(contexts[0].state, 'suspended');
  assert.equal(audio.playClick(), false);
  audio.dispose();
});

test('a pending resume stays silent if the page becomes hidden', async () => {
  const { audio, contexts, timer } = harness({ contextOptions: { deferredResume: true } });
  audio.setReady(true);
  const enabling = audio.setEnabled(true);
  audio.setVisible(false);
  contexts[0].resumes[0].resolve();
  await enabling;
  timer.advance(1000);
  await flush();
  assert.equal(audio.state.playing, false);
  assert.equal(contexts[0].state, 'suspended');
  audio.dispose();
});

test('loading and hidden tabs pause sound and reuse the existing audio graph on recovery', async () => {
  const { audio, contexts, timer } = harness();
  audio.setReady(true);
  await audio.setEnabled(true);
  const count = contexts[0].nodes.length;
  for (const change of ['setVisible', 'setReady']) {
    audio[change](false);
    assert.equal(audio.state.playing, false);
    assert.equal(audio.playClick(), false);
    timer.advance(1000);
    await flush();
    assert.equal(contexts[0].state, 'suspended');
    audio[change](true);
    await flush();
    assert.equal(audio.state.playing, true);
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].nodes.length, count);
  }
  audio.dispose();
});

test('a quick hide and return cancels the obsolete pause', async () => {
  const { audio, contexts, timer } = harness();
  audio.setReady(true);
  await audio.setEnabled(true);
  audio.setVisible(false);
  audio.setVisible(true);
  await flush();
  timer.advance(1000);
  await flush();
  assert.equal(audio.state.playing, true);
  assert.equal(contexts[0].state, 'running');
  audio.dispose();
});

test('an already pending suspend cannot override a newer enable', async () => {
  const { audio, contexts, timer } = harness({ contextOptions: { deferredSuspend: true } });
  audio.setReady(true);
  await audio.setEnabled(true);
  await audio.setEnabled(false);
  timer.advance(1000);
  assert.equal(contexts[0].suspends.length, 1);
  await audio.setEnabled(true);
  contexts[0].suspends[0]();
  await flush();
  assert.equal(audio.state.enabled, true);
  assert.equal(audio.state.playing, true);
  assert.equal(contexts[0].state, 'running');
  audio.dispose();
});

test('browser recovery from an interruption restores playback and the sound controls together', async () => {
  const { audio, contexts, timer, changes } = harness();
  audio.setReady(true);
  await audio.setEnabled(true);
  timer.advance(2000);
  const context = contexts[0];
  const nodeCount = context.nodes.length;
  const resumeCalls = context.resumeCalls;
  context.change('interrupted');
  assert.equal(audio.state.playing, false);
  assert.equal(audio.state.locked, true);
  assert.equal(audio.playClick(), false);

  context.change('running');
  assert.equal(audio.state.playing, true);
  assert.equal(audio.state.locked, false);
  assert.equal(audio.state.error, undefined);
  assert.equal(changes.at(-1).playing, true);
  assert.equal(changes.at(-1).locked, false);
  assert.equal(context.nodes.length, nodeCount);
  assert.equal(context.resumeCalls, resumeCalls);
  assert.equal(audio.playClick('ui'), true);
  timer.advance(1000);
  await flush();
  assert.equal(context.state, 'running');
  assert.equal(context.suspendCalls, 0);
  audio.dispose();
});

for (const pause of ['setEnabled', 'setVisible', 'setReady']) {
  test(`browser recovery respects ${pause}(false) during an interruption`, async () => {
    const { audio, contexts, timer, changes } = harness();
    audio.setReady(true);
    await audio.setEnabled(true);
    timer.advance(2000);
    const context = contexts[0];
    const resumeCalls = context.resumeCalls;
    context.change('interrupted');
    await audio[pause](false);
    timer.advance(1000);
    await flush();
    assert.equal(context.state, 'suspended');
    const suspendCalls = context.suspendCalls;
    changes.length = 0;

    context.change('running');
    assert.equal(audio.state.playing, false);
    assert.equal(audio.playClick(), false);
    assert.ok(changes.every(state => !state.playing));
    assert.equal(context.nodes[0].gain.events.at(-1).value, 0);
    timer.advance(1000);
    await flush();
    assert.equal(context.state, 'suspended');
    assert.equal(context.suspendCalls, suspendCalls + 1);
    assert.equal(context.resumeCalls, resumeCalls);
    audio.dispose();
  });
}

test('rapid clicks are limited and finished sound nodes are released', async () => {
  const { audio, contexts, timer } = harness();
  audio.setReady(true);
  await audio.setEnabled(true);
  const baseline = contexts[0].liveSources;
  assert.equal(audio.playClick('scene'), true);
  for (let i = 0; i < 100; i++) assert.equal(audio.playClick('ui'), false);
  assert.ok(contexts[0].liveSources > baseline);
  timer.advance(2000);
  assert.equal(contexts[0].liveSources, baseline);
  assert.equal(audio.playClick('ui'), true);
  audio.dispose();
  timer.advance(2000);
  assert.equal(contexts[0].liveSources, 0);
  assert.ok(contexts[0].nodes.every(node => node.disconnected));
});

test('menu ducking keeps sound active without allocating more sources', async () => {
  const { audio, contexts } = harness();
  audio.setReady(true);
  await audio.setEnabled(true);
  const count = contexts[0].nodes.length;
  audio.setDucked(true);
  assert.equal(audio.state.playing, true);
  audio.setDucked(false);
  assert.equal(contexts[0].nodes.length, count);
  assert.ok(contexts[0].nodes.some(node => node.gain.events.some(event => event.kind === 'ramp' && event.at > 0)));
  audio.dispose();
});

test('a failed audio unlock can be retried without breaking the page', async () => {
  const { audio, contexts } = harness({ contextOptions: { deferredResume: true } });
  audio.setReady(true);
  const first = audio.setEnabled(true);
  contexts[0].resumes[0].reject(new Error('Playback blocked'));
  await first;
  assert.equal(audio.state.playing, false);
  assert.equal(audio.state.locked, true);
  assert.match(audio.state.error, /Playback blocked/);
  const retry = audio.unlock();
  contexts[0].resumes[1].resolve();
  await retry;
  assert.equal(audio.state.playing, true);
  assert.equal(audio.state.error, undefined);
  assert.equal(contexts.length, 1);
  audio.dispose();
});

test('state notifications never report playback after sound is disabled', async () => {
  const { audio, changes } = harness();
  audio.setReady(true);
  await audio.setEnabled(true);
  changes.length = 0;
  await audio.setEnabled(false);
  assert.ok(changes.length > 0);
  assert.ok(changes.every(state => !state.playing || state.enabled));
  audio.dispose();
});

test('storage restrictions do not prevent explicit playback', async () => {
  const storage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  const { audio } = harness({ storage });
  audio.setReady(true);
  await audio.setEnabled(true);
  assert.equal(audio.state.playing, true);
  audio.dispose();
});

test('unsupported audio leaves all page-facing calls safe', async () => {
  const { audio } = harness({ contextFactory: null });
  audio.setReady(true);
  await audio.setEnabled(true);
  await audio.unlock();
  audio.setDucked(true);
  audio.setVisible(false);
  assert.equal(audio.state.supported, false);
  assert.equal(audio.state.playing, false);
  assert.equal(audio.playClick(), false);
  audio.dispose();
});

test('disposing during resume closes every resource and cannot revive sound', async () => {
  const { audio, contexts, timer } = harness({ contextOptions: { deferredResume: true } });
  audio.setReady(true);
  const enabling = audio.setEnabled(true);
  audio.dispose();
  contexts[0].resumes[0].resolve();
  await enabling;
  await audio.setEnabled(true);
  audio.setReady(true);
  audio.setVisible(true);
  timer.advance(1000);
  await flush();
  assert.equal(audio.state.playing, false);
  assert.equal(contexts[0].state, 'closed');
  assert.equal(contexts[0].closeCalls, 1);
  assert.equal(contexts[0].liveSources, 0);
  assert.ok(contexts[0].nodes.every(node => node.disconnected));
  audio.dispose();
});
