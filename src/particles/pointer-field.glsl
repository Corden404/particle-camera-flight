uniform vec4 uPointer;
uniform float uPointerEnergy;
uniform float uAspect;
uniform vec4 uPointerTrail[8];
uniform vec4 uClickRipple;

// Disturb in projected coordinates, then return to view space. A close particle
// and a distant particle respond under the same screen-space brush.
vec3 disturbParticles(inout vec4 view, float response) {
  vec4 projected = projectionMatrix * view;
  if (projected.w <= 0.001) return vec3(0.0);
  vec2 screen = projected.xy / projected.w;
  vec2 metric = vec2(uAspect, 1.0);
  vec2 delta = (screen - uPointer.xy) * metric;
  float distanceToPointer = length(delta);
  vec2 direction = delta / max(0.008, distanceToPointer);
  float influence = (1.0 - smoothstep(0.025, 0.62, distanceToPointer)) * uPointerEnergy;
  vec2 flow = uPointer.zw * metric;
  flow *= min(1.0, 3.0 / max(0.001, length(flow)));
  vec2 offset = direction * influence * influence * 0.115;
  offset += flow * influence * 0.018;

  float rippleLight = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 trailPoint = uPointerTrail[i];
    if (trailPoint.w > 0.001 && trailPoint.z < 1.8) {
      vec2 ringDelta = (screen - trailPoint.xy) * metric;
      float radius = length(ringDelta);
      float front = 0.035 + trailPoint.z * 0.52;
      float width = 0.060 + trailPoint.z * 0.034;
      float band = (radius - front) / width;
      float envelope = exp(-band * band) * exp(-trailPoint.z * 2.1) * trailPoint.w;
      float wave = sin((radius - front) * 32.0 - 0.4) * envelope;
      offset += ringDelta / max(0.015, radius) * wave * 0.035;
      rippleLight += abs(wave);
    }
  }
  // Single click: one visible outgoing ring, distinct from pointer travel.
  if (uClickRipple.w > 0.001 && uClickRipple.z < 1.65) {
    vec2 clickDelta = (screen - uClickRipple.xy) * metric;
    float radius = length(clickDelta);
    float front = 0.02 + uClickRipple.z * 0.76;
    float width = 0.092 + uClickRipple.z * 0.030;
    float band = (radius - front) / width;
    float ring = exp(-band * band) * exp(-uClickRipple.z * 1.55) * uClickRipple.w;
    float wave = sin((radius - front) * 23.0 + 0.5) * ring;
    offset += clickDelta / max(0.012, radius) * wave * 0.091;
    rippleLight += ring * 1.75;
  }
  float amount = length(offset);
  offset *= min(1.0, 0.15 / max(0.001, amount));
  vec2 ndcOffset = offset / metric * response;
  float depth = max(0.001, -view.z);
  view.xy += ndcOffset * depth / vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
  return vec3(influence, min(1.0, rippleLight), min(1.0, length(flow) * influence));
}
