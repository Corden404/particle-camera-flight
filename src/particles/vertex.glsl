precision highp float;
uniform float uTime;
uniform float uStory;
uniform float uPixelRatio;
uniform float uMotion;
uniform float uTrail;
uniform vec2 uMouse;
attribute vec3 aPose1;
attribute vec3 aPose2;
attribute vec3 aPose3;
attribute vec4 aShade0;
attribute vec4 aShade1;
attribute vec4 aShade2;
attribute vec4 aShade3;
attribute vec2 aMisc;
varying vec3 vWorld;
varying float vHighlight;
varying float vTone;
varying float vFade;
varying float vGlint;
const float PI = 3.14159265359;
float ease01(float a) { return a * a * (3.0 - 2.0 * a); }
vec2 rotate2(vec2 p, float a) { float c=cos(a), s=sin(a); return vec2(p.x*c-p.y*s,p.x*s+p.y*c); }

void main() {
  float chapter=clamp(uStory,0.0,3.0);
  float leg=min(2.0,floor(chapter));
  float phase=clamp(chapter-leg,0.0,1.0);
  vec3 start=position, finish=aPose1;
  vec4 shadeStart=aShade0, shadeEnd=aShade1;
  if(leg>=1.0) { start=aPose1;finish=aPose2;shadeStart=aShade1;shadeEnd=aShade2; }
  if(leg>=2.0) { start=aPose2;finish=aPose3;shadeStart=aShade2;shadeEnd=aShade3; }

  // Individual delay: a coordinated wave of particles, not a simultaneous point lerp.
  float delayed=clamp((phase-aMisc.x*0.21)/0.79,0.0,1.0);
  float k=ease01(delayed);
  vec3 p=mix(start,finish,k);
  vec3 n=normalize(mix(shadeStart.xyz,shadeEnd.xyz,k)+vec3(0.0001));
  float tone=mix(shadeStart.w,shadeEnd.w,k);
  float burst=pow(max(0.0,sin(PI*phase)),1.42);
  // Particle tornado during travel: wide break-up, rotate, then condense to new shape.
  p.xz=rotate2(p.xz,burst*(1.6+aMisc.x*1.9));
  p.xy+=vec2(sin(aMisc.x*14.0+uTime*0.37),cos(aMisc.x*19.0-uTime*0.28))*burst*0.68;
  p+=normalize(p+vec3(0.1,0.2,0.3))*burst*(0.45+aMisc.x*1.38);

  // Surface currents never stop, even while the camera is parked on a chapter.
  vec3 tangent=normalize(cross(n,vec3(0.34,0.87,0.27))+vec3(0.0001));
  vec3 tangent2=normalize(cross(tangent,n)+vec3(0.0001));
  float stream=p.y*2.4+p.x*0.74+aMisc.x*13.0;
  float pulse=sin(uTime*2.65+stream);
  float pulse2=cos(uTime*1.85-stream*1.32);
  p+=(tangent*(pulse*0.14+pulse2*0.06)
     +tangent2*sin(uTime*1.34+stream*0.63)*0.085
     +n*sin(uTime*2.07+aMisc.x*26.0+p.y)*0.052)*uMotion;

  if(uTrail>0.5) {
    p-=tangent*(0.32+0.48*burst)*uMotion;
    p+=tangent2*pulse2*0.20*uMotion;
  }
  vec4 eye=modelViewMatrix*vec4(p,1.0);
  vec4 proj=projectionMatrix*eye;
  vec2 screen=proj.xy/max(proj.w,0.0001);
  float influence=1.0-smoothstep(0.02,0.36,distance(screen,uMouse));
  eye.xy+=normalize(screen-uMouse+vec2(0.0001))*influence*(0.55+aMisc.x*0.26)*uMotion;
  gl_Position=projectionMatrix*eye;
  float px=(2.40+1.65*aMisc.y)*uPixelRatio*(13.8/max(1.0,-eye.z));
  gl_PointSize=clamp(px*(uTrail>0.5?0.82:1.0),1.0,7.8*uPixelRatio);
  vWorld=p;
  vTone=tone;
  vHighlight=clamp(0.33+0.55*abs(n.z)+0.13*abs(n.y),0.0,1.0);
  vGlint=smoothstep(0.7,1.0,sin(uTime*3.35+p.y*3.1+p.x*2.3+aMisc.x*4.8)*0.5+0.5);
  vFade=mix(1.0,0.67,burst)*(uTrail>0.5?mix(0.075,0.14,burst):1.0);
}