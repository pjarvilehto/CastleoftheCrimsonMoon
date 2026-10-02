// labs/cards/cardFx.js — the Card Lab's shader backgrounds: a small WebGL
// canvas inside each card, between the frame art and the portrait, that
// ADDS light (mix-blend-mode: screen over the frame's dark plate, a cut-out
// of the frame art the lab fades with its Plate opacity slider) and is masked
// to the frame's window. Rendered at a third of the card's
// pixels (soft looks need no sharp pixels) at ~30 fps. Looks: fog, blood
// (a pulsing crimson fog), flames, embers (sparks rising through heat),
// ether (ridged violet wisps). The shader itself is the game's (0.182,
// src/ui/cardFx.js: one shared context there); one context per card is fine
// for a lab.

import { VS, FS, LOOKS, TINTS, WINDOW } from '../../src/ui/cardFx.js';
export { LOOKS, TINTS };

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
  const loc = Object.fromEntries(['uT', 'uAmt', 'uLook', 'uAspect', 'uWin', 'uTint'].map((n) => [n, gl.getUniformLocation(prog, n)]));
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
    gl.uniform2f(loc.uWin, WINDOW.frame[0], WINDOW.frame[1]); gl.uniform3fv(loc.uTint, e.tint);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
