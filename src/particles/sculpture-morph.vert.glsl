precision highp float;

uniform float uTime;
uniform float uStory;
uniform float uMotion;
uniform vec4 uModelControls; // saturation, brightness, size, motion
uniform float uTwinkleIntensity;
uniform float uLayer;
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
attribute vec4 aEdges;
attribute vec2 aRandom;

varying float vTone;
varying float vBand;
varying float vLight;
varying float vAlpha;
varying float vGlint;
varying float vSilver;
varying float vResponse;
varying float vTwinkle;
varying float vEdge;
varying float vContour;

#include <particle_interaction>

const float TAU = 6.28318530718;

vec3 twistY(vec3 p, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
}

vec3 twistZ(vec3 p, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}

float sculptureHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float sculptureNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(sculptureHash(cell), sculptureHash(cell + vec3(1.0, 0.0, 0.0)), f.x),
      mix(sculptureHash(cell + vec3(0.0, 1.0, 0.0)),
        sculptureHash(cell + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(sculptureHash(cell + vec3(0.0, 0.0, 1.0)),
        sculptureHash(cell + vec3(1.0, 0.0, 1.0)), f.x),
      mix(sculptureHash(cell + vec3(0.0, 1.0, 1.0)),
        sculptureHash(cell + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

void main() {
  float story = clamp(uStory, 0.0, 3.0);
  float leg = min(2.0, floor(story));
  float phase = clamp(story - leg, 0.0, 1.0);

  vec3 start = position;
  vec3 end = aPose1;
  vec4 shadeStart = aShade0;
  vec4 shadeEnd = aShade1;
  float edgeStart = aEdges.x;
  float edgeEnd = aEdges.y;
  vec3 fromCenter = uCenter0;
  vec3 toCenter = uCenter1;
  if (leg >= 1.0) {
    start = aPose1; end = aPose2;
    shadeStart = aShade1; shadeEnd = aShade2;
    edgeStart = aEdges.y; edgeEnd = aEdges.z;
    fromCenter = uCenter1; toCenter = uCenter2;
  }
  if (leg >= 2.0) {
    start = aPose2; end = aPose3;
    shadeStart = aShade2; shadeEnd = aShade3;
    edgeStart = aEdges.z; edgeEnd = aEdges.w;
    fromCenter = uCenter2; toCenter = uCenter3;
  }

  float departureCue = clamp(aRandom.x * 0.48 +
    (1.0 - shadeStart.w) * 0.26 + abs(shadeStart.y) * 0.26, 0.0, 1.0);
  float targetAnchor = clamp(shadeEnd.w * 0.56 +
    abs(shadeEnd.y) * 0.26 + aRandom.y * 0.18, 0.0, 1.0);
  float t = smoothstep(uTiming.x + departureCue * uTiming.z,
    uTiming.y - targetAnchor * 0.075, phase);
  vEdge = clamp(mix(edgeStart,edgeEnd,t),0.0,1.0);
  vec4 transit = uTransit * uMotion;
  // The luminous outer grains scatter farther than the more stable shell.
  transit.x *= mix(0.90, 1.25, uLayer);
  transit.z *= mix(0.94, 1.05, uLayer);
  vec3 stream = uStream * uMotion;

  vec3 center = mix(fromCenter, toCenter, t);
  center = mix(center, uFlightFocus, transit.z * (0.78 + 0.22 * aRandom.y));
  vec3 localStart = (start - fromCenter) * uModelScale;
  vec3 localEnd = (end - toCenter) * uModelScale;
  vec3 local = mix(localStart, localEnd, t);
  vec3 surfaceLocal = local;
  vec3 blendedNormal = mix(shadeStart.xyz, shadeEnd.xyz, t);
  vec3 normal = dot(blendedNormal, blendedNormal) > 0.00000001 ?
    normalize(blendedNormal) : normalize(shadeStart.xyz + vec3(0.00001));

  // Authored creases and the current view's grazing surfaces share one
  // continuous coverage weight. Keep it separate from material/color edges.
  vec4 anchorView = modelViewMatrix * vec4(center + local, 1.0);
  vec3 anchorNormal = normalize(normalMatrix * normal);
  float anchorFacing = dot(anchorNormal, normalize(-anchorView.xyz));
  float silhouette = 1.0 - smoothstep(0.08, 0.30, abs(anchorFacing));
  vContour = max(smoothstep(0.25, 0.80, vEdge), silhouette) * (1.0 - transit.w);

  // The settled surface stays alive: a slow coherent wave passes through it,
  // while individual grains drift by at most a small fraction of its silhouette.
  float life = uTime * uMotion;
  float wave = sin(dot(surfaceLocal, vec3(0.73, 1.19, 0.58)) - life * 1.22 * uModelControls.w);
  float crossWave = sin(dot(surfaceLocal, vec3(-0.38, 0.46, 1.11)) + life * 0.91 * uModelControls.w);
  float grainPhase = aRandom.x * TAU;
  float grainScale = mix(0.003 + 0.006 * aRandom.y,
    0.028 + 0.086 * aRandom.y, uLayer);
  vec3 grainDrift = vec3(
    sin(life * uModelControls.w + grainPhase + surfaceLocal.y * 0.24),
    cos(life * 0.93 * uModelControls.w + aRandom.y * TAU + surfaceLocal.x * 0.20),
    sin(life * 0.77 * uModelControls.w + grainPhase + surfaceLocal.z * 0.31)
  ) * grainScale;
  vec3 livingOffset = normal * (wave * 0.055 + crossWave * 0.026) *
    mix(0.08, 1.0, uLayer) + grainDrift;
  livingOffset *= min(1.0, mix(0.012, 0.16, uLayer) /
    max(0.0001, length(livingOffset)));
  // Preserve the interior flow; contour grains move by a fraction of a CSS
  // pixel at this depth, even when the authored model is close to the camera.
  vec3 surfaceOffset = livingOffset *
    mix(1.0, 0.24, vEdge * (1.0 - transit.w));
  float worldPerCssPixel = 2.0 * max(0.001, -anchorView.z) /
    max(1.0, uViewportHeight * projectionMatrix[1][1]);
  float contourDrift = worldPerCssPixel * mix(0.18, 0.45, uLayer);
  vec3 contourOffset = surfaceOffset * min(1.0, contourDrift /
    max(0.0001, length(surfaceOffset)));
  local += mix(surfaceOffset, contourOffset, vContour) * uMotion *
    uModelControls.w * (1.0 - transit.w * 0.38);

  // Rock about the current sculpture center, so distant world-space chapters
  // stay framed while the form catches changing blue, amber and white bands.
  float rockY = sin(life * 0.50 * uModelControls.w) * 0.06 * uMotion * uModelControls.w;
  float rockZ = sin(life * 0.50 * uModelControls.w + 0.60) * 0.045 * uMotion * uModelControls.w;
  local = twistZ(twistY(local, rockY), rockZ);
  normal = twistZ(twistY(normal, rockY), rockZ);

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
  // Full-particle spread is larger during flight, but exactly zero at stops.
  p += radial * transit.x * (0.44 + 0.88 * aRandom.y);
  p += vec3(sin(phaseNoise * 1.13), sin(phaseNoise * 0.71 + 2.1),
    cos(phaseNoise * 0.89)) * transit.w * (0.20 + 0.37 * aRandom.y);
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
  vec3 response = vec3(0.0);
  if (uMotion > 0.5) response = disturbParticles(view,
    mix(1.0, 0.68, vEdge * (1.0 - transit.w)) + transit.w * 0.40);
  gl_Position = projectionMatrix * view;
  float depth = -view.z;
  float rare = smoothstep(0.970, 0.997, aRandom.x);
  float projectionScale = uViewportHeight / 900.0 *
    projectionMatrix[1][1] / 2.74747742 * uModelScale / 1.14;

  // Small, crisp grains dominate; a few larger grains and the cursor wake
  // provide the irregular sparkle seen in the reference rather than a fine net.
  // Independently timed scintillation: lots of fine stable grains and a few
  // brighter moving grains, not one synchronized on/off flash.
  float pulse = 0.5 + 0.5 * sin(life * (1.6 + 4.1 * aRandom.y) + grainPhase);
  float shimmer = pow(0.5 + 0.5 * sin(life * (0.55 + 2.3 * aRandom.x) +
    aRandom.y * TAU * 3.0), 3.0);
  float naturalTwinkle = mix(0.58, 0.94, pulse) + shimmer * mix(0.035, 0.23, uLayer);
  vTwinkle = 1.0 + (naturalTwinkle - 1.0) * uTwinkleIntensity *
    (1.0 - 0.72 * vEdge);
  float sprite = mix(2.30 + 3.20 * pow(aRandom.y, 1.65),
    4.6 + 9.0 * pow(aRandom.y, 2.0) + rare * 2.4, uLayer);
  // Denser, smaller and steadier grains read as fine contour strokes.
  sprite *= (0.86 + 0.24 * vTwinkle) * mix(1.0, 0.84, vEdge);
  float px = sprite * uPixelRatio * projectionScale * (14.0 / max(3.0, depth));
  px += response.x * mix(2.4, 7.5, uLayer) * uPixelRatio;
  float basePointSize = clamp(px * uModelControls.z * (1.0 + transit.w * 0.10),
    mix(mix(2.0, 1.65, vEdge), 2.8, uLayer) * uPixelRatio * uModelControls.z,
    mix(15.0, 26.0, uLayer) * uPixelRatio * uModelControls.z);
  // The fragment's 50%-coverage diameter is edgeStart + edgeEnd. Protect
  // one CSS pixel only along stable contours; larger/interior grains retain
  // their original size, and the sparkle layer never becomes a solid shell.
  float coreDiameter = mix(0.53 + 0.009 * vEdge,
    0.578 - 0.022 * vEdge, vContour);
  float contourPointSize = max(basePointSize, uPixelRatio / coreDiameter);
  gl_PointSize = mix(basePointSize, contourPointSize, vContour * (1.0 - uLayer));

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
    dot(viewNormal, normalize(keyDirection + toEye))), 48.0);
  float depthShade = mix(1.0, 0.88, smoothstep(8.0, 32.0, depth));

  // Spatial color fields move independently of the geometry. Broad saturated
  // regions remain readable, with small grain-to-grain variations along edges.
  vec3 colorFlow = vec3(life * 0.066, -life * 0.095, life * 0.049) * uModelControls.w;
  float colorNoise = sculptureNoise(surfaceLocal * 0.49 + colorFlow);
  float colorWave = sin(dot(surfaceLocal, vec3(0.48, 0.67, 0.32)) +
    colorNoise * 4.2 - life * 0.31 * uModelControls.w);
  float silverNoise = sculptureNoise(surfaceLocal * 0.65 -
    colorFlow * 1.17 + vec3(5.1, 2.3, 8.4));

  vTone = mix(shadeStart.w, shadeEnd.w, t);
  // Material-region tone anchors large color areas; moving noise is secondary.
  vBand = clamp(0.5 + colorWave * 0.28 + (vTone - 0.5) * 0.36 +
    (aRandom.x - 0.5) * 0.09, 0.0, 1.0);
  // Concentrate silver at glints instead of washing broad color fields white.
  vSilver = clamp(smoothstep(0.68, 0.85, silverNoise) * 0.62 +
    specular * 0.72 + rare * 0.15 + rim * 0.10, 0.0, 0.94);
  // Stable, independent grain values break up continuous midtone panels.
  // The normal-based key and rim still describe thin parts and the silhouette.
  float grainValue = mix(0.22, 1.60, pow(aRandom.x, 1.5));
  vLight = (0.19 + pow(key, 1.35) * 1.60 + fill * 0.09 + rim * 0.40) *
    mix(0.50, 1.0, front) * depthShade * grainValue;
  vGlint = (rare * 1.35 + specular * 1.05) * (0.16 + 0.84 * front) *
    (0.55 + 0.55 * vTwinkle);
  vResponse = clamp(response.x * 0.42 + abs(response.y) * 0.57, 0.0, 1.0);
  vAlpha = (0.76 + 0.20 * aRandom.y) *
    mix(mix(0.42, 0.10, uLayer) + transit.w * 0.025, 1.0, front) *
    smoothstep(0.8, 2.8, depth) * (1.0 - transit.w * 0.10);
}
