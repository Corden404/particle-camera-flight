precision highp float;

varying float vTone;
varying float vBand;
varying float vLight;
varying float vAlpha;
varying float vGlint;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float radius = length(centered);
  if(radius > 0.5) discard;

  // Distinct spark-like center surrounded by a restrained circular halo.
  float core = 1.0 - smoothstep(0.035, 0.235, radius);
  float halo = 1.0 - smoothstep(0.20, 0.49, radius);
  float intensity = core * 0.82 + halo * 0.17;

  vec3 silver = vec3(0.84,0.87,0.92);
  vec3 steelBlue = vec3(0.44,0.60,0.76);
  vec3 paleGold = vec3(0.86,0.72,0.53);
  vec3 lilac = vec3(0.66,0.61,0.76);

  float goldMask = smoothstep(0.47,0.79,vBand*0.74+vTone*0.26);
  float accentStrength = 0.40 + 0.20*abs(vBand-0.5);
  vec3 accent = mix(steelBlue,paleGold,goldMask);
  vec3 color = mix(silver,accent,accentStrength);
  color = mix(color,lilac,0.09*(1.0-goldMask));
  color *= (0.83+0.17*vLight);
  color += vec3(0.14,0.16,0.17) * vGlint;

  float opacity = intensity * vAlpha;
  if (opacity < 0.005) discard;
  gl_FragColor = vec4(color,opacity);
}
