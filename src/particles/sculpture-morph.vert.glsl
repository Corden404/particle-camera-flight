precision highp float;

uniform float uTime;
uniform float uStory;
uniform float uMotion;
uniform float uPixelRatio;
uniform float uModelScale;
uniform float uViewportHeight;
uniform vec4 uTransit;
uniform vec3 uTiming;
uniform vec3 uStream;
uniform vec3 uCenter0;
uniform vec3 uCenter1;
uniform vec3 uCenter2;
uniform vec3 uCenter3;
uniform vec3 uFlightFocus;
uniform vec3 uFlightForward;

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

const float TAU = 6.28318530718;

vec3 twistY(vec3 p, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
}

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

  // Material regions and oriented surfaces release in cohorts. Bright structural
  // anchors gather first; every point reaches its target before the final tenth.
  // Tone remains a continuous baked code, never an assumed integer part id.
  float departureCue = clamp(aRandom.x * 0.48 +
    (1.0 - shadeStart.w) * 0.26 + abs(shadeStart.y) * 0.26, 0.0, 1.0);
  float targetAnchor = clamp(shadeEnd.w * 0.56 +
    abs(shadeEnd.y) * 0.26 + aRandom.y * 0.18, 0.0, 1.0);
  float t = smoothstep(uTiming.x + departureCue * uTiming.z,
    uTiming.y - targetAnchor * 0.075, phase);
  vec4 transit = uTransit * uMotion;
  vec3 stream = uStream * uMotion;

  vec3 center = mix(fromCenter, toCenter, t);
  center = mix(center, uFlightFocus, transit.z * (0.78 + 0.22 * aRandom.y));
  vec3 localStart = (start - fromCenter) * uModelScale;
  vec3 localEnd = (end - toCenter) * uModelScale;
  vec3 local = mix(localStart, localEnd, t);
  vec3 blendedNormal = mix(shadeStart.xyz, shadeEnd.xyz, t);
  vec3 normal = dot(blendedNormal, blendedNormal) > 0.00000001 ?
    normalize(blendedNormal) : normalize(shadeStart.xyz + vec3(0.00001));

  // Three authored stream bends replace a full cloud collapse. The original
  // world-space endpoint poses and normals are exact when the envelopes are zero.
  float angle = transit.y * (0.5 + 0.5 * aRandom.x);
  local = twistY(local, angle);
  normal = twistY(normal, angle);
  vec3 direction = normalize(toCenter - fromCenter + vec3(0.0001));
  vec3 across = cross(direction, vec3(0.0, 1.0, 0.0));
  if (dot(across, across) < 0.001) across = vec3(1.0, 0.0, 0.0);
  across = normalize(across);
  vec3 streamUp = normalize(cross(across, direction));
  vec3 radial = normalize(local + vec3(0.21, 0.13, 0.33));
  float lane = aRandom.y * 2.0 - 1.0;
  float phaseNoise = phase * TAU * 1.35 + leg * 1.9 +
    dot(localStart, vec3(0.36, 0.62, 0.18)) + aRandom.x * 25.0;

  vec3 p = center + local;
  p += radial * transit.x * (0.18 + 0.38 * aRandom.y);
  p += across * (stream.x * (0.55 + 0.45 * aRandom.x) +
    transit.x * sin(phaseNoise * 0.71) * 0.22);
  p += streamUp * stream.y * (0.4 + 0.6 * targetAnchor);
  p += uFlightForward * stream.z * lane * 2.8;
  vec3 tangent = normalize(cross(normal, vec3(0.26, 0.78, 0.40)) + vec3(0.00001));
  vec3 binormal = normalize(cross(normal, tangent) + vec3(0.00001));
  p += (tangent * sin(phaseNoise) * 0.10 +
    binormal * cos(phaseNoise * 0.66) * 0.07 +
    normal * sin(phaseNoise * 0.87) * 0.038) * transit.w;

  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  float depth = -view.z;
  float rare = smoothstep(0.970, 0.997, aRandom.x);
  // CSS viewport height and the live projection matrix keep sprite area aligned
  // with the model's projected area as FOV/aspect change. DPR is applied once.
  float projectionScale = uViewportHeight / 900.0 *
    projectionMatrix[1][1] / 2.74747742 * uModelScale / 1.14;
  float px = (2.40 + 1.95 * aRandom.y + 1.15 * rare) * uPixelRatio *
    projectionScale * (14.0 / max(3.0, depth));
  // Retain a readable sampled core at low-DPR portrait sizes; FOV/depth still
  // scale the larger structural points continuously above this coverage floor.
  gl_PointSize = clamp(px * (1.0 + transit.w * 0.09),
    1.60 * uPixelRatio, 8.5 * uPixelRatio);

  // A broad upper-left key, restrained lower-right fill, and a narrow side rim.
  // Signed front/back attenuation lets the far surface fall into a dark interior.
  vec3 viewNormal = normalize(normalMatrix * normal);
  vec3 toEye = normalize(-view.xyz);
  vec3 keyDirection = normalize(vec3(-0.62, 0.72, 0.75));
  vec3 fillDirection = normalize(vec3(0.70, -0.22, 0.46));
  vec3 rimDirection = normalize(vec3(0.62, 0.35, -0.66));
  float facing = clamp(dot(viewNormal, toEye), -1.0, 1.0);
  float front = smoothstep(-0.32, 0.48, facing);
  float key = max(0.0, dot(viewNormal, keyDirection));
  float fill = max(0.0, dot(viewNormal, fillDirection));
  float rim = pow(1.0 - abs(facing), 3.0) *
    smoothstep(-0.1, 0.7, dot(viewNormal, rimDirection));
  float specular = pow(max(0.0,
    dot(viewNormal, normalize(keyDirection + toEye))), 32.0);
  float depthShade = mix(1.0, 0.90, smoothstep(8.0, 32.0, depth));
  float settled = (phase == 0.0 || phase == 1.0) ? 1.0 : 0.0;
  // Idle light breath is intentionally separate from deterministic flight.
  float breath = 1.0 + sin(uTime * 0.62 + aRandom.y * TAU) *
    0.026 * settled * uMotion;

  vTone = mix(shadeStart.w, shadeEnd.w, t);
  vBand = clamp(0.5 + normal.y * 0.3 + vTone * 0.2, 0.0, 1.0);
  vLight = (0.22 + key * 1.02 + fill * 0.20 + rim * 0.30) *
    mix(0.82, 1.0, front) * depthShade;
  vGlint = (rare * 0.55 + specular * 0.30) *
    (0.15 + 0.85 * front) * (0.6 + 0.4 * key) * breath;
  vAlpha = (0.72 + 0.18 * aRandom.y) *
    mix(0.18 + transit.w * 0.035, 1.0, front) *
    smoothstep(0.8, 2.8, depth) * (1.0 - transit.w * 0.13) * breath;
}
