import './scene-cursor.css';

const SCENE_ZONE = '#approved-scene, [data-scene-cursor-zone]';
const NATIVE_ZONE = [
  'a', 'button', 'input', 'textarea', 'select', 'label', 'summary',
  'dialog', '[role="dialog"]', '[role="button"]', '[role="link"]',
  '[contenteditable]:not([contenteditable="false"])', '[tabindex]',
  '[data-modal]', '#visual-controls', '.visual-controls'
].join(', ');

/** A scene-only mouse cursor. The caller enables it after the scene is ready. */
export function createSceneCursor({ root, disabled = false } = {}) {
  const noop = { setEnabled() {}, dispose() {} };
  const doc = root?.ownerDocument;
  const win = doc?.defaultView;
  if (!root || !win?.matchMedia || !win.requestAnimationFrame) return noop;

  const finePointer = win.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(win.location.search);
  const frozenCapture = ['capture', 'captureTime'].some((key) => {
    const value = params.get(key);
    return value !== null && Number.isFinite(Number(value));
  });
  const dot = doc.createElement('div');
  const ring = doc.createElement('div');
  dot.className = 'scene-cursor-dot';
  ring.className = 'scene-cursor-ring';
  dot.setAttribute('aria-hidden', 'true');
  ring.setAttribute('aria-hidden', 'true');
  // Inline hiding protects the initial DOM insertion before the CSS is ready.
  dot.style.visibility = 'hidden';
  ring.style.visibility = 'hidden';
  root.append(dot, ring);

  let enabled = !disabled;
  let disposed = false;
  let active = false;
  let frame = null;
  let x = 0;
  let y = 0;
  const cleanups = [];

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  function hide() {
    active = false;
    root.classList.remove('scene-cursor-active');
    dot.style.visibility = 'hidden';
    ring.style.visibility = 'hidden';
    ring.classList.remove('is-pressed');
    if (frame !== null) {
      win.cancelAnimationFrame(frame);
      frame = null;
    }
  }

  function allowed() {
    return enabled && !disposed && !frozenCapture && finePointer.matches
      && !reducedMotion.matches && !doc.hidden && root.isConnected;
  }

  function sceneTarget(event) {
    const target = event.target;
    if (!target?.closest || !root.contains(target)) return false;
    const path = event.composedPath?.() || [target];
    if (path.some((node) => node?.matches?.(NATIVE_ZONE))) return false;
    const zone = target.closest(SCENE_ZONE);
    return Boolean(zone && root.contains(zone));
  }

  function stylesReady() {
    return [dot, ring].every((node) =>
      win.getComputedStyle(node).getPropertyValue('--scene-cursor-ready').trim() === '1'
    );
  }

  function place(node) {
    node.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
  }

  function move(event) {
    if (!event.isTrusted || event.pointerType !== 'mouse' || !allowed()
      || !sceneTarget(event) || !Number.isFinite(event.clientX)
      || !Number.isFinite(event.clientY)) {
      hide();
      return;
    }
    x = event.clientX;
    y = event.clientY;
    try {
      if (!active) {
        if (!stylesReady()) return;
        place(dot);
        // Seed the ring at the pointer before its first following transition.
        ring.style.transition = 'none';
        place(ring);
        ring.getBoundingClientRect();
        ring.style.removeProperty('transition');
        dot.style.visibility = 'visible';
        ring.style.visibility = 'visible';
        root.classList.add('scene-cursor-active');
        active = true;
      } else {
        // The dot stays at the actual mouse; the subtle ring follows per frame.
        place(dot);
      }
      if (frame === null) {
        frame = win.requestAnimationFrame(() => {
          frame = null;
          try {
            if (!allowed()) hide();
            else if (active) place(ring);
          } catch {
            hide();
          }
        });
      }
    } catch {
      // A failed decoration must never leave a page without its native cursor.
      hide();
    }
  }

  function press(event) {
    if (event.pointerType !== 'mouse') {
      hide();
      return;
    }
    move(event);
    if (active && event.button === 0) ring.classList.add('is-pressed');
  }

  function release(event) {
    ring.classList.remove('is-pressed');
    if (event.type === 'pointercancel' || event.pointerType !== 'mouse') hide();
  }

  function leave(event) {
    if (!event.relatedTarget || !root.contains(event.relatedTarget)
      || event.relatedTarget.closest?.(NATIVE_ZONE)) hide();
  }

  const passiveCapture = { passive: true, capture: true };
  listen(root, 'pointermove', move, { passive: true });
  listen(root, 'pointerover', move, { passive: true });
  listen(root, 'pointerout', leave, { passive: true });
  listen(root, 'pointerleave', hide, { passive: true });
  listen(doc, 'pointerdown', (event) => {
    if (root.contains(event.target)) press(event);
    else hide();
  }, passiveCapture);
  listen(doc, 'pointerup', release, passiveCapture);
  listen(doc, 'pointercancel', release, passiveCapture);
  listen(doc, 'touchstart', hide, passiveCapture);
  listen(doc, 'keydown', (event) => {
    if (event.key === 'Tab') hide();
  }, true);
  listen(win, 'blur', hide);
  listen(doc, 'visibilitychange', hide);

  for (const media of [finePointer, reducedMotion]) {
    if (media.addEventListener) listen(media, 'change', hide);
    else {
      media.addListener(hide);
      cleanups.push(() => media.removeListener(hide));
    }
  }

  return {
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) hide();
    },
    dispose() {
      if (disposed) return;
      hide();
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      dot.remove();
      ring.remove();
    }
  };
}
