precision highp float;

uniform float uTime;
uniform float uStory;
uniform float uMotion;
uniform float uPixelRatio;
uniform float uModelScale;
uniform vec3 uCenter0;
uniform vec3 uCenter1;
uniform vec3 uCenter2;
uniform vec3 uCenter3;
uniform vec3 uFlightFocus;

attribute vec3 aPose1;
attribute vec3 aPose2;
attribute vec3 aPose3;
attribute vec4 aShade0;
attribute vec4 aShade1;
attribute vec4 aShade2;
attribute vec4 aShade3;
attribute vec2 aRandom;

varying float vTone;
varying float vBand;
varying float vLight;
varying float vAlpha;
varying float vGlint;

const float PI = 3.14159265;

vec3 twistY(vec3 p, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
}
float hermite(float x) { return x * x * (3.0 - 2.0 * x); }

void main() {
  float story = clamp(uStory, 0.0, 3.0);
  float leg = min(2.0, floor(story));
  float phase = clamp(story - leg, 0.0, 1.0);

  vec3 start = position;
  vec3 end = aPose1;
  vec4 shadeStart = aShade0;
  vec4 shadeEnd = aShade1;
  vec3 fromCenter = uCenter0;
  vec3 toCenter = uCenter1;

  if (leg >= 1.0) {
    start = aPose1; end = aPose2;
    shadeStart = aShade1; shadeEnd = aShade2;
    fromCenter = uCenter1; toCenter = uCenter2;
  }
  if (leg >= 2.0) {
    start = aPose2; end = aPose3;
    shadeStart = aShade2; shadeEnd = aShade3;
    fromCenter = uCenter2; toCenter = uCenter3;
  }

  // Slightly different departure times; each chunk peels away separately.
  float departure = aRandom.x * 0.14;
  float t = hermite(smoothstep(0.11, 0.87, phase - departure + 0.07));
  float release = smoothstep(0.07, 0.34, phase);
  float gather = 1.0 - smoothstep(0.63, 0.95, phase);
  float disarray = release * gather * uMotion;

  vec3 center = mix(fromCenter, toCenter, t);
  // During the flythrough, let the scattered sculpture cross the actual
  // camera's viewing volume. Its world-space home/target locations remain
  // unchanged at the endpoints, preserving Blender shot compositions.
  float flyby = smoothstep(0.06, 0.31, phase) *
    (1.0 - smoothstep(0.70, 0.97, phase)) * uMotion;
  center = mix(center, uFlightFocus, flyby * 0.91);
  vec3 localStart = (start - fromCenter) * uModelScale;
  vec3 localEnd = (end - toCenter) * uModelScale;
  vec3 local = mix(localStart, localEnd, t);

  // Expansion, azimuthal spin, and flowing eddies are strongest mid-flight.
  float angle = (1.90 + aRandom.x * 3.0) * disarray;
  vec3 swirl = twistY(local, angle);
  float sourceRadius = length(local.xz);
  vec3 radial = normalize(local + vec3(0.21, 0.13, 0.33));
  float fluctuation = sin(uTime * 1.1 + local.y * 0.57 + aRandom.y * 31.0);
  float scatter = disarray * (1.25 + 1.20 * aRandom.y);
  swirl += radial * scatter * (0.60 + 0.4 * fluctuation);
  swirl.xz += vec2(
    sin(uTime * 0.42 + aRandom.x * 20.0 + local.y * 0.35),
    cos(uTime * 0.48 - aRandom.y * 17.0 + local.x * 0.29)
  ) * disarray * (0.60 + 0.75 * aRandom.x);
  swirl.y += disarray * sin(uTime * 0.8 + sourceRadius * 0.78 + aRandom.y * 17.0) * 0.74;

  vec3 p = center + swirl;
  vec3 normal = normalize(mix(shadeStart.xyz, shadeEnd.xyz, t) + vec3(0.00001));
  vec3 tangent = normalize(cross(normal, vec3(0.26, 0.78, 0.40)) + vec3(0.00001));
  vec3 binormal = normalize(cross(normal, tangent) + vec3(0.00001));
  float current = uTime * 1.55 + dot(local, vec3(0.36, 0.62, 0.18)) + aRandom.x * 25.0;
  float restless = 1.0 + disarray * 2.0;
  p += (tangent * sin(current) * 0.07 +
    binormal * cos(current * 0.66) * 0.05 +
    normal * sin(current * 0.87) * 0.028) * restless * uMotion;

  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;

  // Intentionally discrete, larger particles that never render solid triangles.
  float px = (2.6 + 3.15 * aRandom.y) * uPixelRatio * (14.0 / max(3.0, -view.z));
  gl_PointSize = clamp(px * (1.0 + disarray * 0.17), 1.9 * uPixelRatio, 10.5 * uPixelRatio);

  vec3 viewNormal = normalize(normalMatrix * normal);
  float facing = 0.50 + 0.50 * abs(viewNormal.z);
  float twinkle = 0.85 + 0.15 * sin(uTime * 2.1 + aRandom.y * 24.0);
  vTone = mix(shadeStart.w, shadeEnd.w, t);
  vBand = 0.5 + 0.5 * sin(local.y * 0.93 + p.z * 0.18 +
    local.x * 0.29 - uTime * 0.24 + aRandom.y * 3.0);
  vLight = facing;
  vGlint = smoothstep(0.977, 0.999, aRandom.x) *
    (0.45 + 0.55 * sin(uTime * 2.4 + aRandom.y * 19.0));
  vAlpha = (0.57 + 0.16 * (1.0 - disarray)) *
    (0.70 + 0.30 * aRandom.y) * twinkle *
    (0.68 + 0.32 * facing);
}
