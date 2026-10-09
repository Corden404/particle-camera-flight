precision highp float;

uniform vec3 uChapterPalette;
uniform float uLayer;
uniform vec4 uModelControls; // saturation, brightness, size, motion
varying float vTone;
varying float vBand;
varying float vLight;
varying float vAlpha;
varying float vGlint;
varying float vSilver;
varying float vResponse;
varying float vTwinkle;

void main() {
  float radius = length(gl_PointCoord - vec2(0.5));
  // Fine depth-writing cores preserve the authored surface while leaving
  // visible gaps between grains. A smaller blended core carries the sparkle.
  if (radius > mix(0.30, 0.22, uLayer)) discard;
  float grain = uLayer < 0.5 ? 1.0 - smoothstep(0.23, 0.30, radius) :
    1.0 - smoothstep(0.07, 0.205, radius);

  // Deliberately match the reference's untonemapped sRGB particle palette.
  // These are final display values: applying ACES or another transfer here
  // would wash the saturated blue / amber back into the old silver-only coat.
  vec3 blue = vec3(0.025, 0.58, 1.0);
  vec3 amber = vec3(1.0, 0.57, 0.025);
  vec3 silver = vec3(0.94, 0.975, 1.0);
  float chapterBias = (uChapterPalette.y - uChapterPalette.x) * 0.055;
  float warm = smoothstep(0.42, 0.58, vBand + chapterBias);
  vec3 color = mix(blue, amber, warm);
  color = mix(color, silver, vSilver);
  // Keep the blue/amber accents vivid at the default multiplier; the live
  // saturation control still fades them toward their conserved luminance.
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color,
    clamp((0.94 + uLayer * 0.06) * uModelControls.x, 0.0, 1.0));
  // Body panels, dark recesses and metal details need distinct values.
  float materialValue = mix(0.40, 1.10, smoothstep(0.10, 0.82, vTone));
  color *= materialValue * vLight * (0.86 + 0.25 * vTwinkle) *
    (1.0 + vResponse * 0.24);
  color += silver * vGlint * 0.50;
  color *= uModelControls.y;

  if (uLayer < 0.5) {
    // Opaque depth-writing grains keep nearer structure in front. MSAA
    // alpha-to-coverage feathers their edge without sorting transparent dots.
    if (grain < 0.05) discard;
    gl_FragColor = vec4(color * (0.77 + 0.23 * vAlpha), grain);
  } else {
    float opacity = grain * vAlpha * (0.74 + 0.28 * vTwinkle);
    if (opacity < 0.003) discard;
    gl_FragColor = vec4(color, opacity);
  }
}
