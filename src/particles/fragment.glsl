precision highp float;
uniform float uTime;
varying vec3 vWorld;
varying float vHighlight;
varying float vTone;
varying float vFade;
varying float vGlint;
void main() {
  vec2 uv=gl_PointCoord-vec2(0.5);
  float r=length(uv);
  if(r>0.5) discard;
  float core=1.0-smoothstep(0.035,0.245,r);
  float halo=1.0-smoothstep(0.14,0.5,r);
  // Traveling bands: color moves across the sculpture in world space.
  float wave=sin(vWorld.y*1.3+sin(vWorld.x*0.9+uTime*0.53)+vWorld.z*0.71)*0.55
            +sin(vWorld.x*0.63-vWorld.y*0.8-uTime*0.35)*0.28;
  // Restrained near-monochrome palette: subtle steel-blue and pale champagne only.
  float warmth=smoothstep(0.11,0.72,0.31+wave*0.62+vTone*0.21);
  vec3 pearl=vec3(0.92,0.93,0.94);
  vec3 cool=vec3(0.76,0.81,0.85);
  vec3 warm=vec3(0.88,0.84,0.79);
  vec3 accents=mix(cool,warm,warmth);
  vec3 rgb=mix(pearl,accents,0.35);
  rgb*=mix(0.77,1.06,vHighlight);
  rgb+=vec3(0.14,0.14,0.14)*vGlint*0.13;
  float alpha=(core*0.95+halo*0.15)*(0.69+0.31*vHighlight)*vFade;
  gl_FragColor=vec4(rgb,alpha);
}