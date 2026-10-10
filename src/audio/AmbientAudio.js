const STORAGE_KEY = 'leeq.audio.v1';

// Gentle, consonant key changes. No sample files, random pitches or autoplay.
const PIANO_NOTES = Object.freeze({
  scene: Object.freeze([392.0, 440.0, 523.25, 440.0]),
  ui: Object.freeze([523.25, 587.33, 523.25])
});
const PIANO_PARTIALS = Object.freeze([
  { ratio: 1, level: 1, tail: 1 },
  { ratio: 2.003, level: 0.36, tail: 0.73 },
  { ratio: 3.012, level: 0.14, tail: 0.46 },
  { ratio: 4.027, level: 0.06, tail: 0.27 }
]);

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

function browserContextFactory() {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  return typeof Context === 'function' ? () => new Context({ latencyHint: 'interactive' }) : null;
}

/**
 * A quiet, locally synthesized sound bed. No context exists before an explicit
 * unlock; a remembered preference is intent, never permission to autoplay.
 * The optional browser adapters keep lifecycle races testable without hardware.
 */
export function createAmbientAudio({
  disabled = false,
  onChange = () => {},
  contextFactory = browserContextFactory(),
  storage = browserStorage(),
  scheduler = {
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: id => globalThis.clearTimeout(id)
  }
} = {}) {
  const supported = typeof contextFactory === 'function';
  let enabled = false;
  try { enabled = !disabled && storage?.getItem(STORAGE_KEY) === 'on'; } catch { /* Storage is optional. */ }
  let locked = true, playing = false, visible = !globalThis.document?.hidden;
  let ready = false, ducked = false, disposed = false, error;
  let context, master, bed, effects, suspendTimer, pendingResume, pendingSuspend;
  let pauseRevision = 0, lastClickAt = -Infinity, lastNotification;
  const noteSteps = { scene: 0, ui: 0 };
  const nodes = new Set();
  const sources = new Set();
  const clicks = new Set();
  const ramps = new WeakMap();

  const wantsPlayback = () => enabled && ready && visible && !disabled && !disposed;
  function snapshot() {
    return {
      enabled, playing: playing && wantsPlayback() && context?.state === 'running',
      locked, supported, ...(error ? { error } : {})
    };
  }
  function notify() {
    const state = snapshot();
    const key = JSON.stringify(state);
    if (key === lastNotification) return;
    lastNotification = key;
    // Audio availability must never be able to interrupt the visual experience.
    try { onChange(state); } catch { /* A consumer callback cannot block cleanup. */ }
  }
  function remember() {
    try { storage?.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* Private contexts still play. */ }
  }
  function cancelPause() {
    pauseRevision++;
    if (suspendTimer !== undefined) scheduler.clearTimeout(suspendTimer);
    suspendTimer = undefined;
  }
  function ramp(parameter, target, seconds) {
    if (!context) return;
    const now = context.currentTime;
    const previous = ramps.get(parameter);
    const fraction = previous ? Math.max(0, Math.min(1, (now - previous.start) / Math.max(0.001, previous.duration))) : 1;
    const from = previous ? previous.from + (previous.target - previous.from) * fraction : parameter.value;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(from, now);
    parameter.linearRampToValueAtTime(target, now + seconds);
    ramps.set(parameter, { from, target, start: now, duration: seconds });
  }
  function releaseClick(click) {
    if (!clicks.delete(click)) return;
    for (const source of click.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* It may already have ended. */ }
    }
    for (const node of click.nodes) node.disconnect();
  }
  function clearClicks() {
    for (const click of [...clicks]) releaseClick(click);
    lastClickAt = -Infinity;
  }
  function onContextState() {
    if (disposed) return;
    if (context?.state === 'running') {
      // The browser can recover from an interruption without our resume promise.
      // Reconcile both sound and controls with the visitor's latest intent.
      locked = false;
      error = undefined;
      if (wantsPlayback()) fadeIn();
      else quiet();
      return;
    }
    playing = false;
    if (context?.state === 'interrupted' || context?.state === 'closed') locked = true;
    notify();
  }

  function makeGraph() {
    if (context) return true;
    if (!supported || disposed || disabled) return false;
    try {
      context = contextFactory();
      const own = node => { nodes.add(node); return node; };
      master = own(context.createGain());
      master.gain.value = 0;
      master.connect(context.destination);
      bed = own(context.createGain());
      bed.gain.value = ducked ? 0.32 : 1;
      const warmth = own(context.createBiquadFilter());
      warmth.type = 'lowpass';
      warmth.frequency.value = 850;
      warmth.Q.value = 0.35;
      warmth.connect(bed);
      bed.connect(master);
      effects = own(context.createBiquadFilter());
      effects.type = 'lowpass';
      effects.frequency.value = 3100; // Preserve the soft hammer overtones.
      effects.Q.value = 0.35;
      effects.connect(master);

      // Three warm, consonant sine voices breathe at different slow rates.
      // The graph is fixed: no interval, sequencer, audio download, or new drone
      // is created when the visitor changes chapters or returns to the tab.
      for (const [frequency, volume, pan, rate] of [
        [130.81, 0.017, -0.42, 0.051],
        [196.00, 0.010, 0.38, 0.037],
        [261.63, 0.006, -0.08, 0.029]
      ]) {
        const tone = own(context.createOscillator());
        const gain = own(context.createGain());
        const breath = own(context.createOscillator());
        const depth = own(context.createGain());
        tone.type = breath.type = 'sine';
        tone.frequency.value = frequency;
        gain.gain.value = volume;
        breath.frequency.value = rate;
        depth.gain.value = volume * 0.19;
        breath.connect(depth);
        depth.connect(gain.gain);
        tone.connect(gain);
        if (typeof context.createStereoPanner === 'function') {
          const stereo = own(context.createStereoPanner());
          stereo.pan.value = pan;
          gain.connect(stereo);
          stereo.connect(warmth);
        } else gain.connect(warmth);
        sources.add(tone);
        sources.add(breath);
        tone.start();
        breath.start();
      }
      context.addEventListener('statechange', onContextState);
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Audio could not be initialized.';
      teardown();
      notify();
      return false;
    }
  }

  function fadeIn() {
    cancelPause();
    if (!wantsPlayback() || locked) return;
    if (!playing) ramp(master.gain, 1, 1.15);
    ramp(bed.gain, ducked ? 0.32 : 1, 0.6);
    playing = true;
    notify();
  }

  function quiet(seconds = 0.24) {
    cancelPause();
    playing = false;
    notify();
    if (!context || !master || disposed) return;
    ramp(master.gain, 0, seconds);
    const current = context;
    const revision = pauseRevision;
    // AudioParam automation reaches zero even if a background tab throttles
    // this timer. Suspension follows the fade and releases short-lived voices.
    suspendTimer = scheduler.setTimeout(() => {
      suspendTimer = undefined;
      if (disposed || context !== current || revision !== pauseRevision || wantsPlayback()) return;
      clearClicks();
      if (current.state === 'closed' || (current.state === 'suspended' && !pendingResume)) return;
      let request;
      try { request = current.suspend(); } catch { return; }
      const operation = Promise.resolve(request).catch(() => {}).finally(() => {
        if (pendingSuspend === operation) pendingSuspend = undefined;
        if (disposed || context !== current) return;
        // A suspend already submitted to the browser cannot be cancelled.
        // Reconcile it with the latest intent, rather than its old caller.
        if (wantsPlayback() && !locked) void resumeAudio();
        else notify();
      });
      pendingSuspend = operation;
    }, (seconds + 0.04) * 1000);
  }

  function resumeAudio(fromGesture = false) {
    if (!context || !wantsPlayback() || (!fromGesture && locked)) return Promise.resolve(snapshot());
    cancelPause();
    if (pendingResume) return pendingResume;
    if (context.state === 'running' && !pendingSuspend) {
      locked = false;
      error = undefined;
      fadeIn();
      return Promise.resolve(snapshot());
    }
    const current = context;
    let request;
    try {
      // Keep resume inside the activation call stack, before the first await.
      request = current.resume();
    } catch (cause) {
      locked = true;
      error = cause instanceof Error ? cause.message : 'Audio playback is unavailable.';
      quiet();
      return Promise.resolve(snapshot());
    }
    const operation = Promise.resolve(request).then(() => {
      if (disposed || context !== current) return snapshot();
      locked = current.state !== 'running';
      error = locked ? 'Audio is paused. Use the sound button to resume.' : undefined;
      if (wantsPlayback() && !locked) fadeIn();
      else quiet();
      return snapshot();
    }).catch(cause => {
      if (disposed || context !== current) return snapshot();
      locked = true;
      error = cause instanceof Error ? cause.message : 'Audio playback is unavailable.';
      quiet();
      return snapshot();
    }).finally(() => {
      if (pendingResume === operation) pendingResume = undefined;
    });
    pendingResume = operation;
    return operation;
  }

  function reconcile(seconds) {
    if (wantsPlayback()) {
      if (context && !locked) void resumeAudio();
      else notify();
    } else quiet(seconds);
  }

  function unlock() {
    if (!wantsPlayback() || !supported) return Promise.resolve(snapshot());
    if (!makeGraph()) return Promise.resolve(snapshot());
    return resumeAudio(true);
  }

  function teardown() {
    const current = context;
    context = undefined;
    clearClicks();
    for (const source of sources) {
      try { source.stop(); } catch { /* Already stopped or not started. */ }
    }
    for (const node of nodes) node.disconnect();
    sources.clear();
    nodes.clear();
    master = bed = effects = undefined;
    if (current) {
      current.removeEventListener('statechange', onContextState);
      try { Promise.resolve(current.close()).catch(() => {}); } catch { /* Audio may already be closed. */ }
    }
  }

  const controller = {
    get state() { return snapshot(); },
    setEnabled(value) {
      if (disposed || disabled || !supported) return Promise.resolve(snapshot());
      enabled = Boolean(value);
      remember();
      notify();
      if (enabled) return unlock();
      quiet();
      return Promise.resolve(snapshot());
    },
    unlock,
    playClick(kind = 'scene') {
      if (!wantsPlayback() || locked || !playing || context?.state !== 'running') return false;
      const now = context.currentTime;
      if (now - lastClickAt < 0.085 || clicks.size >= 4) return false;
      const key = kind === 'ui' ? 'ui' : 'scene';
      const notes = PIANO_NOTES[key];
      const frequency = notes[noteSteps[key] % notes.length];
      const duration = key === 'ui' ? 0.43 : 0.68;
      const volume = key === 'ui' ? 0.024 : 0.033;
      const click = { nodes: [], sources: [], finished: 0 };
      clicks.add(click);
      try {
        // One struck piano-like key, not a simultaneous two-note notification.
        // Slightly stretched overtones emulate stiff strings; each upper
        // partial dies sooner than the fundamental for a warm natural decay.
        PIANO_PARTIALS.forEach(({ ratio, level, tail }, index) => {
          const tone = context.createOscillator();
          const gain = context.createGain();
          click.nodes.push(tone, gain);
          click.sources.push(tone);
          tone.type = 'sine';
          tone.frequency.value = frequency * ratio;
          const peak = volume * level;
          const attack = index === 0 ? 0.006 : 0.003;
          const end = duration * tail;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(peak, now + attack);
          gain.gain.exponentialRampToValueAtTime(peak * 0.5, now + 0.062);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + end);
          tone.connect(gain);
          gain.connect(effects);
          tone.onended = () => {
            tone.onended = null;
            click.finished++;
            if (click.finished === PIANO_PARTIALS.length) releaseClick(click);
          };
          tone.start(now);
          tone.stop(now + end + 0.02);
        });
        noteSteps[key]++;
        lastClickAt = now;
        return true;
      } catch {
        releaseClick(click);
        return false;
      }
    },
    setVisible(value) {
      if (disposed) return;
      visible = Boolean(value);
      reconcile(0.10);
    },
    setReady(value) {
      if (disposed) return;
      ready = Boolean(value);
      reconcile(0.16);
    },
    setDucked(value) {
      if (disposed) return;
      ducked = Boolean(value);
      if (bed) ramp(bed.gain, ducked ? 0.32 : 1, 0.6);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      playing = false;
      cancelPause();
      teardown();
      notify();
    }
  };
  notify();
  return controller;
}
