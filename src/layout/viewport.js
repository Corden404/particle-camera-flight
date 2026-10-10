const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, weight) => a + (b - a) * weight;
function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Shared geometry for the DOM, camera framing and particle display scale.
 * Width/height are the canvas container's CSS pixels, never screen dimensions.
 */
export function getViewportLayout(width, height) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const aspect = w / h;
  // A wide short phone and a tall tablet need different compositions.
  // No device-width branch: adjacent pixels always produce adjacent poses.
  const portraitWeight = 1 - smoothstep(.92, 1.4, aspect);
  const sideGutter = clamp(w * .057, 24, 96);
  const portraitGutter = clamp(w * .0615, 20, 56);
  const gutter = mix(sideGutter, portraitGutter, portraitWeight);
  const available = Math.max(1, w - gutter * 2);
  const titleWidth = Math.min(available, mix(w * .43, available, portraitWeight));
  const wideSize = Math.min(150, w * .073, h * .145);
  const portraitSize = Math.min(94, w * .125, h * .088, available / 5.3);
  const titleSize = Math.max(1, mix(wideSize, portraitSize, portraitWeight));
  const titleTop = mix(h * .505, h * .755, portraitWeight);
  return { width: w, height: h, aspect, portraitWeight, titleTop, titleWidth, titleSize, gutter, compact: portraitWeight >= .5 };
}
