// GPU side of the renderer: draws the lit pixel-art layer, then the atmosphere over it. Beyond the lanterns'
// reach the world sinks into a drifting fog, so nothing ahead shows until light finds it; the fog glows where
// light passes through it, soft god rays stream out from each lantern through the gaps around walls and
// creatures, and bloom, hue/saturation, contrast and a vignette finish the picture.
import {OUT_W, OUT_H, ART, PIXEL, THEME} from "./art.js";

const VS = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0, 1); }`;

const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uBloom, uScene, uLight;
uniform vec2 uOut; uniform float uB, uK; uniform ivec2 uGrid;
uniform vec3 uView0, uView1;  // per player view: screen x, width, x offset in the scene texture
uniform vec2 uOff0, uOff1;    // per view: how far the image slides for sub-pixel scrolling (screen pixels)
uniform vec4 uLamp0, uLamp1;  // each lantern on screen: x, y, reach in screen pixels, brightness (0 = none)
uniform float uContrast, uBloomAmt, uVig, uHurt, uTime, uFog, uRays;
uniform vec3 uFogCol;
uniform mat3 uHS;
out vec4 o;

// a scene pixel: its colour, and in alpha whether it is open floor (walls and creatures are 0)
vec4 sceneAt(vec2 px) {
  vec3 v = px.x < uView0.x + uView0.y + uK ? uView0 : uView1;  // a view may be read one pixel past its edge
  if (px.x < v.x || px.x >= v.x + v.y + uK) return vec4(0);
  ivec2 t = ivec2(int(v.z) + int((px.x - v.x) / uK), int(px.y / uK));
  ivec2 sz = textureSize(uScene, 0);
  if (t.x >= sz.x || t.y >= sz.y) return vec4(0);
  return texelFetch(uScene, t, 0);
}
// the light falling on a spot, smoothed over the block grid (it stretches softly across the screen)
vec3 lightAt(vec2 px) { return texture(uLight, (px / uB) / vec2(uGrid)).rgb; }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = .5, s = 0.; for (int k = 0; k < 4; k++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }

// how close a spot is to a lantern: 1 inside its reach, fading to 0 a little past it
float nearLamp(vec2 px, vec4 l) { return l.w <= 0. ? 0. : 1. - smoothstep(.8, 1.55, length(px - l.xy) / max(l.z, 1.)); }
float aroundLamp(vec2 px, vec4 l) { return l.w <= 0. ? 0. : 1. - smoothstep(1.2, 1.9, length(px - l.xy) / max(l.z, 1.)); }

// soft god rays: walk from this spot toward the lantern, gathering the light the path crosses, so open floor
// between here and the lantern makes a bright shaft and a wall or a creature on the way leaves a dark streak
vec3 rays(vec2 px, vec4 l) {
  if (l.w <= 0.) return vec3(0);
  vec2 d = l.xy - px;
  float dist = length(d);
  if (dist > l.z * 2.6) return vec3(0);
  vec3 acc = vec3(0); float w = 1., tot = 0.;
  float jit = hash(px) * .7;
  for (int i = 0; i < 20; i++) {
    float t = (float(i) + jit) / 20.;
    acc += lightAt(px + d * t) * w; tot += w; w *= .93;
  }
  float ang = atan(d.y, d.x);
  float band = vnoise(vec2(ang * 13., uTime * .22)) * vnoise(vec2(ang * 5. + 4., uTime * .15));
  float shimmer = .25 + 1.1 * band * band * 2.;  // whimsical drifting bands of brighter and fainter rays
  float fall = 1. - smoothstep(.2, 2.6, dist / l.z);
  return acc / tot * shimmer * fall * l.w;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uOut.y - gl_FragCoord.y);
  vec2 q = px + (px.x < uView0.x + uView0.y ? uOff0 : uOff1);  // slide the whole world image
  vec4 sc = sceneAt(q);
  vec3 c = sc.rgb;
  vec3 L = lightAt(q);
  float lum = max(L.r, max(L.g, L.b));
  // what can be seen: whatever is close to a lantern, and strongly lit places a little further out; the rest is fog
  float near = max(nearLamp(px, uLamp0), nearLamp(px, uLamp1));
  float farLit = smoothstep(.35, .8, lum) * max(aroundLamp(px, uLamp0), aroundLamp(px, uLamp1));
  float see = max(near, farLit);
  // drifting fog: close to black, lit from inside only over open floor the light reaches, never over the walls
  vec2 fp = px / uOut.y;
  float n = fbm(fp * 3.2 + vec2(uTime * .025, uTime * .012)) * .65 + fbm(fp * 7. - vec2(uTime * .04, 0.)) * .35;
  vec3 fog = uFogCol * (.3 + 1.5 * n * n * 1.6) + L * (.25 + .5 * n) * uFog * sc.a;
  c = mix(fog, c + fog * .18, see);  // a thin haze hangs even in the light
  // god rays from each lantern: only on open floor the light actually reaches, so they stay inside the hallway or
  // room around the lantern (walls and whatever lies behind them get none), softer where the light is already bright
  float inside = sc.a * smoothstep(.015, .09, lum) * see;
  c += (rays(px, uLamp0) + rays(px, uLamp1)) * uRays * (.35 + .65 * n) * inside * (1. - .65 * smoothstep(.25, .9, lum));
  c += texture(uBloom, (q / uB) / vec2(textureSize(uBloom, 0))).rgb * uBloomAmt * see;  // no glow leaks out of the fog
  c = uHS * c;
  c = clamp(c, 0., 1.);
  c = mix(c, c * c * (3. - 2. * c), uContrast);  // S-curve: brighter lights, deeper shadows
  vec2 dv = (px - uOut * .5) / (uOut * .5);
  c *= clamp(1. - uVig * pow(dot(dv, dv) * .5, 1.2) * 1.6, 0., 1.);
  c.r += uHurt * .35;
  o = vec4(c, 1);
}`;

let gl, prog, U = {}, tex = {};

function makeTex(unit, filter) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return {t, unit, w: 0, h: 0};
}
function shader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export function initGL(canvas) {
  gl = canvas.getContext("webgl2", {antialias: false, preserveDrawingBuffer: true});
  if (!gl) throw new Error("This game needs WebGL2.");
  prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  for (const n of ["uBloom", "uScene", "uLight", "uOut", "uB", "uK", "uGrid", "uView0", "uView1", "uOff0", "uOff1",
    "uLamp0", "uLamp1", "uContrast", "uBloomAmt", "uVig", "uHurt", "uTime", "uFog", "uRays", "uFogCol", "uHS"]) U[n] = gl.getUniformLocation(prog, n);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  tex.bloom = makeTex(0, gl.LINEAR); tex.scene = makeTex(1, gl.NEAREST); tex.light = makeTex(2, gl.LINEAR);
  ["uBloom", "uScene", "uLight"].forEach((n, i) => gl.uniform1i(U[n], i));
  gl.uniform1f(U.uK, PIXEL);
  gl.uniform1f(U.uContrast, THEME.contrast);
  // static uniforms from the locked art settings
  const a = ART.hue * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), sat = ART.saturation;
  const h = [.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928,
    .213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283,
    .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072];
  const lr = .2126 * (1 - sat), lg = .7152 * (1 - sat), lb = .0722 * (1 - sat), m = [lr + sat, lg, lb, lr, lg + sat, lb, lr, lg, lb + sat];
  const hs = new Float32Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) hs[i * 3 + j] = m[i * 3] * h[j] + m[i * 3 + 1] * h[3 + j] + m[i * 3 + 2] * h[6 + j];
  gl.uniformMatrix3fv(U.uHS, true, hs);
  gl.uniform2f(U.uOut, OUT_W, OUT_H); gl.uniform1f(U.uB, ART.block);
  gl.uniform1f(U.uBloomAmt, ART.bloom); gl.uniform1f(U.uVig, ART.vignette);
  gl.uniform3f(U.uFogCol, .04, .05, .044);  // the fog: a deep moss-black that drifts
  gl.uniform1f(U.uFog, .35); gl.uniform1f(U.uRays, 1.1);
  gl.viewport(0, 0, OUT_W, OUT_H);
}

function upload(t, w, h, data, internal, format) {
  gl.activeTexture(gl.TEXTURE0 + t.unit);
  gl.bindTexture(gl.TEXTURE_2D, t.t);
  if (t.w !== w || t.h !== h) { gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data); t.w = w; t.h = h; }
  else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, format, gl.UNSIGNED_BYTE, data);
}

export function uploadLight(light, gw, gh) {
  upload(tex.light, gw, gh, light, gl.RGBA8, gl.RGBA);
  gl.uniform2i(U.uGrid, gw, gh);
}
export function uploadScene(pixels, w, h, views, offs) {
  upload(tex.scene, w, h, pixels, gl.RGBA8, gl.RGBA);
  gl.uniform3fv(U.uView0, views[0]);
  gl.uniform3fv(U.uView1, views[1] || views[0]);
  gl.uniform2fv(U.uOff0, offs[0]);
  gl.uniform2fv(U.uOff1, offs[1] || offs[0]);
}
export function uploadBloom(rgba, w, h) { upload(tex.bloom, w, h, rgba, gl.RGBA8, gl.RGBA); }
// lamps: up to two [x, y, reach, brightness] in screen pixels
export function drawGL(time, hurt, lamps) {
  gl.uniform1f(U.uTime, time); gl.uniform1f(U.uHurt, hurt);
  gl.uniform4fv(U.uLamp0, lamps[0] || [0, 0, 1, 0]);
  gl.uniform4fv(U.uLamp1, lamps[1] || [0, 0, 1, 0]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
