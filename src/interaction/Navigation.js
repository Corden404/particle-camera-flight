const EPSILON = 0.000001;
const clamp = (value, last) => Math.max(0, Math.min(last, value));

// Story is the continuous authored camera position; target is an integer stop.
// Only completion changes settled. Repeated directional intent never queues.
export class Navigation {
  constructor({ initial = 0, count = 4, secondsPerLeg = 5 } = {}) {
    this.last = count - 1;
    this.secondsPerLeg = secondsPerLeg;
    this.story = clamp(Number.isFinite(initial) ? initial : 0, this.last);
    this.settled = this.target = Math.round(this.story);
    this.inflight = false;
    this.revision = 0;
  }

  goTo(index, { instant = false } = {}) {
    if (!Number.isFinite(index)) return null;
    const next = clamp(Math.round(index), this.last);
    const from = this.story;
    const distance = Math.abs(next - from);
    if (next === this.target && (distance < EPSILON || (this.inflight && !instant))) return null;
    this.target = next;
    this.revision++;
    const duration = instant ? 0 : distance * this.secondsPerLeg;
    this.inflight = duration > 0;
    if (!this.inflight) this.settle();
    return { from, to: next, duration, revision: this.revision };
  }

  step(direction, options) {
    if (!Number.isFinite(direction) || direction === 0) return null;
    const sign = Math.sign(direction);
    if (this.inflight && sign === Math.sign(this.target - this.story)) return null;
    const next = sign > 0 ? Math.floor(this.story + EPSILON) + 1 : Math.ceil(this.story - EPSILON) - 1;
    return this.goTo(clamp(next, this.last), options);
  }

  settle(revision = this.revision) {
    if (revision !== this.revision) return false;
    this.story = this.target;
    this.settled = this.target;
    this.inflight = false;
    return true;
  }

  seek(value) {
    if (!Number.isFinite(value)) return false;
    this.story = clamp(value, this.last);
    this.settled = this.target = Math.round(this.story);
    this.inflight = false;
    this.revision++;
    return true;
  }
}

export function normalizeWheelDelta(event, viewportHeight = 800) {
  if (!Number.isFinite(event.deltaY)) return 0;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, viewportHeight) : 1;
  return event.deltaY * unit;
}

// A gesture ends only after silence, not after a timer started by its first tick.
// A substantial opposite movement can reverse immediately without a queue.
export class WheelIntent {
  constructor({ quietGap = 240, threshold = 48, reversalThreshold = 90 } = {}) {
    this.quietGap = quietGap;
    this.threshold = threshold;
    this.reversalThreshold = reversalThreshold;
    this.lastAt = -Infinity;
    this.distance = 0;
    this.direction = 0;
    this.reverseDistance = 0;
  }

  push(event, now, viewportHeight) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return 0;
    const delta = normalizeWheelDelta(event, viewportHeight);
    if (!delta || Math.abs(event.deltaX || 0) > Math.abs(event.deltaY)) return 0;
    if (now - this.lastAt >= this.quietGap) {
      this.distance = this.direction = this.reverseDistance = 0;
    }
    this.lastAt = now;
    if (!this.direction) {
      this.distance += delta;
      if (Math.abs(this.distance) < this.threshold) return 0;
      this.direction = Math.sign(this.distance);
      return this.direction;
    }
    if (Math.sign(delta) === this.direction) {
      this.reverseDistance = 0;
      return 0;
    }
    this.reverseDistance += Math.abs(delta);
    if (this.reverseDistance < this.reversalThreshold) return 0;
    this.direction = Math.sign(delta);
    this.reverseDistance = 0;
    return this.direction;
  }
}

const interactiveTags = new Set(['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SUMMARY', 'LABEL', 'AUDIO', 'VIDEO']);
const interactiveRoles = new Set(['button', 'link', 'textbox', 'slider', 'combobox', 'spinbutton', 'menuitem', 'tab', 'switch', 'checkbox', 'radio']);

export function isInteractiveTarget(target) {
  for (let node = target; node; node = node.parentElement) {
    const tabIndex = node.getAttribute?.('tabindex');
    if (interactiveTags.has(node.tagName?.toUpperCase()) || node.isContentEditable ||
        interactiveRoles.has(node.getAttribute?.('role')) || (tabIndex !== null && tabIndex !== undefined && Number(tabIndex) >= 0)) return true;
  }
  return false;
}

export function getKeyIntent(event) {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || isInteractiveTarget(event.target)) return null;
  if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(event.key)) return 'next';
  if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) return 'previous';
  if (event.key?.toLowerCase() === 'q') return 'quality';
  if (event.key?.toLowerCase() === 'm') return 'motion';
  return null;
}