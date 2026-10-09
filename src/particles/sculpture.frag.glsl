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
  // The silhouette pass uses broad, opaque dots with real depth testing.
  // Reactive specks stay smaller and softly blended above that solid structure.
  if (radius > mix(0.36, 0.255, uLayer)) discard;
  float grain = uLayer < 0.5 ? 1.0 - smoothstep(0.29, 0.36, radius) :
    1.0 - smoothstep(0.09, 0.24, radius);

  // Deliberately match the reference's untonemapped sRGB particle palette.
  // These are final display values: applying ACES or another transfer here
  // would wash the saturated blue / amber back into the old silver-only coat.
  vec3 blue = vec3(0.25098, 0.53725, 0.86667);
  vec3 amber = vec3(0.95686, 0.54902, 0.09412);
  vec3 silver = vec3(0.94, 0.975, 1.0);
  float chapterBias = (uChapterPalette.y - uChapterPalette.x) * 0.055;
  float warm = smoothstep(0.35, 0.65, vBand + chapterBias);
  vec3 color = mix(blue, amber, warm);
  color = mix(color, silver, vSilver);
  // Lower saturation without dimming the form: luminance is conserved, while
  // blue and amber remain distinct. The reactive layer is subtly more colorful.
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color,
    clamp((0.62 + uLayer * 0.04) * uModelControls.x, 0.0, 1.0));
  // Body panels, dark recesses and metal details need distinct values.
  float materialValue = mix(0.58, 1.12, smoothstep(0.10, 0.82, vTone));
  color *= materialValue * vLight * (0.86 + 0.25 * vTwinkle) *
    (1.0 + vResponse * 0.24);
  color += silver * vGlint * 0.34;
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
