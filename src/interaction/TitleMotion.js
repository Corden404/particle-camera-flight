// Intro values are seconds; travel retains the approved per-line clipping mask.
export const TITLE_MOTION = Object.freeze({
  travel: 104,
  intro: 0.92,
  introStagger: 0.08,
  introDelay: 0.12,
});

// Navigation values are fractions of each original five-second camera leg.
// The last line leaves at particle releaseEnd and arrives at focusGatherEnd.
export const TITLE_PHASES = Object.freeze({
  exit: 0.12,
  enter: 0.18,
  stagger: 0.02,
  legs: Object.freeze([
    Object.freeze({ exitStart: 0.11, enterStart: 0.64 }),
    Object.freeze({ exitStart: 0.08, enterStart: 0.62 }),
    Object.freeze({ exitStart: 0.14, enterStart: 0.66 }),
  ]),
});

function phaseProgress(phase, start, duration) {
  const progress = (phase - start) / duration;
  // Subtracting a leg from fractional story can round an exact endpoint slightly.
  if (progress <= 1e-9) return 0;
  if (progress >= 1 - 1e-9) return 1;
  return progress;
}

/**
 * Sample the two title lines from authored camera position, in either direction.
 * Reuse target to retain its array and line objects without per-frame allocations.
 * Integer docks have still platforms; chapter changes occur only while hidden.
 */
export function sampleTitleMotion(story, target = {}) {
  const position = Math.max(0, Math.min(3, Number.isFinite(story) ? story : 0));
  const leg = Math.min(2, Math.floor(position));
  const phase = position - leg;
  const chapter = Math.round(position);
  const leaving = chapter === leg;
  const config = TITLE_PHASES.legs[leg];
  const lines = target.lines ?? (target.lines = []);
  lines.length = 2;
  target.chapter = chapter;
  target.visible = false;

  for (let index = 0; index < 2; index++) {
    const line = lines[index] ?? (lines[index] = {});
    const stagger = index * TITLE_PHASES.stagger;
    if (leaving) {
      const progress = phaseProgress(phase, config.exitStart + stagger, TITLE_PHASES.exit);
      const hidden = progress ** 3; // GSAP power2.in.
      line.opacity = 1 - hidden;
      line.yPercent = hidden === 0 ? 0 : -TITLE_MOTION.travel * hidden;
    } else {
      const progress = phaseProgress(phase, config.enterStart + stagger, TITLE_PHASES.enter);
      const hidden = (1 - progress) ** 4; // GSAP power3.out.
      line.opacity = 1 - hidden;
      line.yPercent = TITLE_MOTION.travel * hidden;
    }
    if (line.opacity > 0) target.visible = true;
  }
  return target;
}
