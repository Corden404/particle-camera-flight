precision highp float;

uniform float uTime;
uniform float uStory;
uniform float uMotion;
uniform float uPixelRatio;
uniform float uStage;
uniform vec3 uModelCenter;
uniform float uModelScale;

attribute vec3 aNormal;
attribute float aTone;
attribute vec2 aRandom;

varying float vTone;
varying float vBand;
varying float vLight;
varying float vAlpha;
varying float vGlint;

void main() {
  // Positions were sampled from the original GLB, in its world coordinates.
  // No rasterized GLB or solid surface is rendered on the website.
  // Keep each sculpture anchored to its own world-space center while making
  // it occupy more of the frame. The approved camera flight is unchanged.
  vec3 p = uModelCenter + (position - uModelCenter) * uModelScale;
  vec3 normal = normalize(aNormal + vec3(0.00001));
  vec3 tangent = normalize(cross(normal,vec3(0.26,0.78,0.40)) + vec3(0.00001));
  vec3 bitangent = normalize(cross(normal,tangent) + vec3(0.00001));

  float transit = pow(max(0.0,sin(3.14159265*fract(clamp(uStory,0.0,2.999)))),1.3);
  float current = uTime * 1.45 + dot(p,vec3(0.36,0.62,0.18)) + aRandom.x * 29.0;
  float tangentMotion = sin(current) * (0.065 + 0.090*transit);
  float lateralMotion = cos(current * 0.68) * (0.043 + 0.070*transit);
  float normalMotion = sin(current * 0.73 + aRandom.y*7.0) * (0.030 + 0.060*transit);

  p += (tangent*tangentMotion + bitangent*lateralMotion + normal*normalMotion) * uMotion;

  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;

  // Larger discrete luminous particles; never fill in a triangle between them.
  float px = (2.6 + 3.15 * aRandom.y) * uPixelRatio * (14.0 / max(3.0,-view.z));
  gl_PointSize = clamp(px,1.9*uPixelRatio,9.5*uPixelRatio);

  vec3 viewNormal = normalize(normalMatrix * normal);
  float facing = 0.50 + 0.50 * abs(viewNormal.z);
  float focus = 1.0 - smoothstep(0.0,1.6,abs(uStory-uStage));
  float twinkle = 0.85 + 0.15 * sin(uTime*2.2 + aRandom.y*23.0);

  vTone = aTone;
  vBand = 0.5 + 0.5 * sin(p.y*0.93 + p.z*0.61 + p.x*0.27 - uTime*0.22 + aRandom.y*3.0);
  vLight = facing;
  vGlint = smoothstep(0.977,0.999,aRandom.x) * (0.45 + 0.55 * sin(uTime*2.4 + aRandom.y*19.0));
  vAlpha = (0.37 + 0.39*focus) * (0.75 + 0.25*aRandom.y) * twinkle * (0.68 + 0.32*facing);
}
