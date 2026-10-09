// Art direction is sampled from story phase, never wall-clock time. These same
// envelopes drive the sculpture and the independent atmospheric field.
const LEGS = [
  {
    releaseStart: 0.045, releaseEnd: 0.25, gatherStart: 0.43, gatherEnd: 0.80,
    focusStart: 0.055, focusEnd: 0.29, focusGatherStart: 0.46, focusGatherEnd: 0.84,
    scatter: 1.38, swirl: 0.64, focus: 0.52, bend: -0.72, lift: 0.65, lane: 0.72,
    travelStart: 0.035, travelEnd: 0.79, stagger: 0.15, calm: 0.44
  },
  {
    releaseStart: 0.035, releaseEnd: 0.22, gatherStart: 0.39, gatherEnd: 0.76,
    focusStart: 0.04, focusEnd: 0.26, focusGatherStart: 0.43, focusGatherEnd: 0.82,
    scatter: 1.56, swirl: -0.48, focus: 0.62, bend: 0.85, lift: -0.32, lane: 1.0,
    travelStart: 0.025, travelEnd: 0.78, stagger: 0.18, calm: 0.62
  },
  {
    releaseStart: 0.06, releaseEnd: 0.28, gatherStart: 0.45, gatherEnd: 0.82,
    focusStart: 0.07, focusEnd: 0.30, focusGatherStart: 0.48, focusGatherEnd: 0.86,
    scatter: 1.22, swirl: 0.38, focus: 0.46, bend: 0.50, lift: 0.82, lane: 0.62,
    travelStart: 0.045, travelEnd: 0.81, stagger: 0.13, calm: 0.48
  }
];

// Cool metal, champagne, and a deliberately small lilac contribution.
// These are mixing weights; fragment-shader reflectances are linear RGB.
const CHAPTERS = [
  { cool: 0.62, warm: 0.14, lilac: 0.012 },
  { cool: 0.30, warm: 0.58, lilac: 0.020 },
  { cool: 0.76, warm: 0.10, lilac: 0.010 },
  { cool: 0.42, warm: 0.43, lilac: 0.016 }
];

function clampFinite(value, low, high) {
  return Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
}

function smoothstep(low, high, value) {
  const t = clampFinite((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}

export function viewportModelScale(weight = 0) {
  const t = clampFinite(typeof weight === 'boolean' ? Number(weight) : weight, 0, 1);
  return 1.14 + (1.10 - 1.14) * t;
}

// Pass a reusable target in animation loops to avoid allocating every frame.
export function sampleLegEnvelope(legIndex, phase, target = {}) {
  const leg = Math.floor(clampFinite(legIndex, 0, 2));
  const p = clampFinite(phase, 0, 1);
  const config = LEGS[leg];
  const release = smoothstep(config.releaseStart, config.releaseEnd, p);
  const gather = 1 - smoothstep(config.gatherStart, config.gatherEnd, p);
  const envelope = release * gather;
  const focus = smoothstep(config.focusStart, config.focusEnd, p) *
    (1 - smoothstep(config.focusGatherStart, config.focusGatherEnd, p));

  target.leg = leg;
  target.phase = p;
  target.transit = envelope;
  target.scatter = config.scatter * envelope;
  target.swirl = envelope === 0 ? 0 : config.swirl * envelope;
  target.focus = config.focus * focus;
  target.bend = envelope === 0 ? 0 : config.bend * envelope;
  target.lift = envelope === 0 ? 0 : config.lift * envelope;
  target.lane = config.lane * envelope;
  target.travelStart = config.travelStart;
  target.travelEnd = config.travelEnd;
  target.stagger = config.stagger;
  target.ambientAlpha = 1 - config.calm * 0.5 * envelope;
  target.ambientMotion = 1 - config.calm * envelope;
  return target;
}

export function sampleChapterPalette(story, target = {}) {
  const position = clampFinite(story, 0, 3);
  const from = Math.min(2, Math.floor(position));
  const t = smoothstep(0, 1, position - from);
  const a = CHAPTERS[from];
  const b = CHAPTERS[from + 1];
  target.cool = a.cool + (b.cool - a.cool) * t;
  target.warm = a.warm + (b.warm - a.warm) * t;
  target.lilac = a.lilac + (b.lilac - a.lilac) * t;
  return target;
}
