precision highp float;

uniform vec3 uChapterPalette;
varying float vTone;
varying float vBand;
varying float vLight;
varying float vAlpha;
varying float vGlint;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float radius = length(centered);
  if (radius > 0.5) discard;

  // A readable circular core carries thin rods and structural planes. The
  // short, low-energy halo preserves discrete points without a diffuse coat.
  float core = 1.0 - smoothstep(0.055, 0.31, radius);
  float halo = 1.0 - smoothstep(0.22, 0.49, radius);
  float intensity = core * 0.90 + halo * 0.10;

  // All reflectances below are authored in linear RGB. Three applies the
  // renderer's tone mapping and output transfer function exactly once below.
  vec3 silver = vec3(0.50, 0.56, 0.64);
  vec3 steelBlue = vec3(0.19, 0.28, 0.39);
  vec3 champagne = vec3(0.58, 0.44, 0.28);
  vec3 lilac = vec3(0.32, 0.28, 0.40);
  float warmRegion = smoothstep(0.62, 0.84, vTone);
  float coolWeight = uChapterPalette.x * (0.28 + 0.35 * (1.0 - warmRegion));
  float warmWeight = uChapterPalette.y * (0.14 + 0.62 * warmRegion);
  float lilacWeight = uChapterPalette.z * (1.0 - warmRegion);
  vec3 color = silver * (1.0 - coolWeight - warmWeight - lilacWeight) +
    steelBlue * coolWeight + champagne * warmWeight + lilac * lilacWeight;
  // Darker material regions remain legible without turning into a bright coat.
  float materialValue = mix(0.68, 1.0, smoothstep(0.10, 0.43, vTone));
  color *= materialValue * vLight * (0.94 + 0.06 * vBand);
  color += silver * vGlint * 0.52;

  float opacity = intensity * vAlpha;
  if (opacity < 0.003) discard;
  gl_FragColor = vec4(color, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
