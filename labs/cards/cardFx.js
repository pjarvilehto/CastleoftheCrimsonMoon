// labs/cards/cardFx.js — the Card Lab's shader backgrounds: a small WebGL
// canvas inside each card, between the frame art and the portrait, that
// ADDS light (mix-blend-mode: screen over the frame's dark plate, a cut-out
// of the frame art the lab fades with its Plate opacity slider) and is masked
// to the frame's window. Rendered at a third of the card's
// pixels (soft looks need no sharp pixels) at ~30 fps. Looks: fog, blood
// (a pulsing crimson fog), flames, embers (sparks rising through heat),
// ether (ridged violet wisps). One context per card is fine for a lab; in
// the game the same shader would draw every card from ONE shared canvas.

const VS = `attribute vec2 a; varying vec2 v; void main() { v = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
const FS = `
precision mediump float;
varying vec2 v; uniform float uT, uAmt, uLook, uAspect; uniform vec3 uTint;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 19.19)); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.0, w = 0.55; for (int i = 0; i < 4; i++) { a += w * noise(p); p = p * 2.03 + 17.0; w *= 0.5; } return a; }
// the frame's window, in units of the card's height: the art's grey border
// sits 1.3% of the height in from every edge (measured on card_enemy.png and
// card_player.png: 11-14 px of 1106), its corners rounded by 4%; the plate
// behind the portrait reaches the border, so the light must too (0.179: the
// old inset left a dark rim between the border and the lit plate)
float window(vec2 uv) {
  vec2 halfSize = vec2(uAspect, 1.0) * 0.5; float r = 0.04;
  vec2 c = abs(vec2(uv.x * uAspect, uv.y) - halfSize) - (halfSize - 0.013) + r;
  float d = length(max(c, 0.0)) - r;
  return 1.0 - smoothstep(-0.006, 0.003, d);
}
void main() {
  vec2 uv = v; vec2 p = vec2(uv.x * uAspect, uv.y); float t = uT;
  vec3 c = vec3(0.0);
  if (uLook < 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if (uLook < 1.5 || (uLook > 1.5 && uLook < 2.5)) { // fog / blood: two drifting layers, hanging low
    float n = fbm(p * 1.7 + vec2(t * 0.045, -t * 0.02)) * 0.7 + fbm(p * 3.3 - vec2(t * 0.08, t * 0.012)) * 0.3;
    float low = smoothstep(1.05, 0.15, uv.y);
    float a = smoothstep(0.38, 0.86, n) * mix(0.3, 1.0, low);
    if (uLook > 1.5) a *= 0.85 + 0.15 * sin(t * 0.9 + uv.y * 3.0); // blood: a slow pulse, like breathing
    c = uTint * a;
  } else if (uLook < 3.5) { // flames: noise streaming up, a heat ramp from the floor
    vec2 q = vec2(p.x * 2.4, uv.y * 3.2 - t * 1.15);
    float n = fbm(q) * 0.75 + fbm(q * 2.1 + vec2(0.0, -t * 0.7)) * 0.25;
    float base = pow(max(0.0, 1.0 - uv.y), 1.9) * 1.7;
    float f = clamp(n * 1.35 + base - 0.85, 0.0, 1.0) * smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x);
    vec3 heat = mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.42, 0.05), smoothstep(0.0, 0.6, f));
    heat = mix(heat, vec3(1.0, 0.85, 0.35), smoothstep(0.65, 1.0, f));
    c = mix(heat, heat * uTint * 1.6, 0.35) * f;
  } else if (uLook < 4.5) { // embers: sparks rising through a faint heat haze
    float haze = smoothstep(0.4, 0.9, fbm(p * 2.0 + vec2(t * 0.03, -t * 0.09))) * smoothstep(1.0, 0.2, uv.y) * 0.35;
    c = uTint * haze;
    for (int k = 0; k < 2; k++) {
      float layer = float(k);
      vec2 g = vec2(p.x * (7.0 + layer * 3.0), uv.y * (11.0 + layer * 4.0) - t * (0.55 + layer * 0.35));
      vec2 cell = floor(g), f = fract(g), o = hash2(cell + layer * 31.0);
      float lit = step(0.62, hash(cell + 3.3 + layer));
      float d = length((f - o) * vec2(1.0, 1.4));
      float tw = 0.55 + 0.45 * sin(t * (4.0 + 3.0 * o.x) + o.y * 40.0);
      float s = smoothstep(0.075, 0.0, d) * lit * tw * smoothstep(1.0, 0.75, uv.y);
      c += vec3(1.0, 0.6, 0.2) * s;
    }
  } else { // ether: ridged wisps, cool and quick
    vec2 q = vec2(p.x * 1.3, uv.y * 2.6) + vec2(t * 0.05, -t * 0.12);
    float r = 1.0 - abs(2.0 * fbm(q) - 1.0); r = pow(r, 3.2);
    float r2 = 1.0 - abs(2.0 * fbm(q * 1.9 + 5.0 - vec2(0.0, t * 0.2)) - 1.0); r2 = pow(r2, 4.0);
    float a = (r * 0.7 + r2 * 0.5) * smoothstep(1.05, 0.2, uv.y);
    c = uTint * a * 1.3;
  }
  gl_FragColor = vec4(c * uAmt * window(uv), 1.0);
}`;

export const LOOKS = ['none', 'fog', 'blood', 'flames', 'embers', 'ether'];
export const TINTS = { fog: [0.62, 0.66, 0.72], blood: [0.85, 0.12, 0.1], flames: [1.0, 0.5, 0.2], embers: [0.9, 0.35, 0.1], ether: [0.55, 0.45, 1.0], gold: [0.95, 0.75, 0.35] };

const cards = []; // { card, canvas, gl, loc, look, tint, amt, speed }
let running = false, last = 0, tAcc = 0;
const SCALE = 0.34, FPS = 30;

function program(gl) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// Put a shader layer into a card. Returns a setter for its look.
export function attachCardFx(card, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'card-fx';
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: true });
  if (!gl) return { set() {} };
  const prog = program(gl);
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const loc = Object.fromEntries(['uT', 'uAmt', 'uLook', 'uAspect', 'uTint'].map((n) => [n, gl.getUniformLocation(prog, n)]));
  // 0.181: the canvas sits in a plate wrapper that carries the frame's interior
  // (the lab's cut-out card_*_plate.png; the frame art itself is border-only
  // here) so one opacity (--plate-alpha) fades the plate and its light together
  // while the border stays as it is; the plate is a stacking context (opacity),
  // so the screen blend meets the plate, not the room
  const plate = document.createElement('div'); plate.className = 'card-plate'; plate.append(canvas);
  card.prepend(plate); // under the portrait and text (z-index 0 in the lab's CSS), over the border art (-1)
  const entry = { card, canvas, gl, loc, look: 'fog', tint: TINTS.fog, amt: 0.8, speed: 1, ...opts };
  cards.push(entry);
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  return { set(o) { Object.assign(entry, o); } };
}

function tick(now) {
  requestAnimationFrame(tick);
  if (now - last < 1000 / FPS - 2) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const e of cards) {
    const w = Math.max(8, Math.round(e.card.clientWidth * SCALE)), h = Math.max(8, Math.round(e.card.clientHeight * SCALE));
    if (e.canvas.width !== w || e.canvas.height !== h) { e.canvas.width = w; e.canvas.height = h; e.gl.viewport(0, 0, w, h); }
    e.t = (e.t ?? Math.random() * 100) + dt * e.speed;
    const { gl, loc } = e;
    gl.uniform1f(loc.uT, e.t); gl.uniform1f(loc.uAmt, e.look === 'none' ? 0 : e.amt);
    gl.uniform1f(loc.uLook, LOOKS.indexOf(e.look)); gl.uniform1f(loc.uAspect, w / h);
    gl.uniform3fv(loc.uTint, e.tint);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
