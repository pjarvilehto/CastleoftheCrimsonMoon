// core/bg3dMath.js — pure math for the 3D backgrounds (core/bg3d.js):
// CSS-cover mapping, depth sampling, the sway, the mesh grid, and the
// camera matrix. No DOM or WebGL here, so the smoke suite tests it in Node.

// CSS `background-size: cover; background-position: center`, as a scale on
// uv around the image centre: uv = 0.5 + (screen - 0.5) * scale.
export function coverScale(viewW, viewH, imgW, imgH) {
  const av = viewW / viewH;
  const ai = imgW / imgH;
  return av > ai ? [1, ai / av] : [av / ai, 1];
}

// Bilinear depth lookup, uv clamped to the image; 0 = far .. 1 = near.
export function sampleDepth(d, u, v) {
  const x = Math.min(Math.max(u, 0), 1) * (d.w - 1);
  const y = Math.min(Math.max(v, 0), 1) * (d.h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, d.w - 1), y1 = Math.min(y0 + 1, d.h - 1);
  const fx = x - x0, fy = y - y0;
  const r0 = y0 * d.w, r1 = y1 * d.w;
  const top = d.data[r0 + x0] * (1 - fx) + d.data[r0 + x1] * fx;
  const bot = d.data[r1 + x0] * (1 - fx) + d.data[r1 + x1] * fx;
  return (top * (1 - fy) + bot * fy) / 255;
}

// The slow sway: two sines with unrelated periods, so it never visibly
// loops. Both are 0 at t = 0 — the rest pose, pixel-identical to the flat
// CSS image, which makes the CSS -> 3D handover invisible.
export function orbit(t, c) {
  const rad = Math.PI / 180;
  return {
    yaw: c.yawDeg * rad * Math.sin((2 * Math.PI * t) / c.yawPeriodS),
    pitch: c.pitchDeg * rad * Math.sin((2 * Math.PI * t) / c.pitchPeriodS),
  };
}

// Screen-space grid, [-overscan, 1 + overscan] on both axes: the margin is
// a skirt that swings into view at the sway extremes instead of a black edge.
export function buildGrid(gx, gy, m) {
  const g = new Float32Array((gx + 1) * (gy + 1) * 2);
  let k = 0;
  for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
    g[k++] = -m + ((1 + 2 * m) * i) / gx;
    g[k++] = -m + ((1 + 2 * m) * j) / gy;
  }
  const idx = new Uint16Array(gx * gy * 6);
  k = 0;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const a = j * (gx + 1) + i, b = a + 1, c = a + gx + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  return { g, idx };
}

// ---- column-major mat4 helpers (WebGL layout) ----
const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
};
const translateZ = (z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1]);
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
// Rotate the scene about the pivot plane's centre (0,0,-1) = the camera
// orbiting it; at yaw = pitch = 0 this is the plain projection.
export function mvp(yaw, pitch, fovY, aspect) {
  const view = mul(translateZ(-1), mul(rotX(pitch), mul(rotY(yaw), translateZ(1))));
  return mul(perspective(fovY, aspect, 0.05, 10), view);
}

// JS mirror of the vertex shader (core/bg3dGL.js VS): where a grid vertex at
// screen coords (gx, gy) with the given depth lands, in NDC.
export function projectVertex(M, gx, gy, depth, aspect, c) {
  const fov = (c.fovDeg * Math.PI) / 180;
  const tx = Math.tan(fov / 2);
  const k = Math.max(0.4, 1 + c.depthScale * (c.pivot - depth)); // same floor as the shader
  const p = [(gx * 2 - 1) * tx * aspect * k, (1 - gy * 2) * tx * k, -k, 1];
  const o = [0, 1, 2, 3].map((r) => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r] * p[3]);
  return [o[0] / o[3], o[1] / o[3]];
}

// How far the skirt at overscan m stays OUTSIDE the screen at the sway
// extremes, over all depths (NDC units; negative = a black edge shows).
export function edgeMargin(c, aspect, m) {
  const fov = (c.fovDeg * Math.PI) / 180;
  const rad = Math.PI / 180;
  let worst = Infinity;
  for (const ys of [-1, 1]) for (const ps of [-1, 1]) {
    const M = mvp(ys * c.yawDeg * rad, ps * c.pitchDeg * rad, fov, aspect);
    for (let i = 0; i <= 20; i++) {
      const s = -m + ((1 + 2 * m) * i) / 20;
      for (const d of [0, 0.5, 1]) {
        worst = Math.min(worst,
          -projectVertex(M, -m, s, d, aspect, c)[0] - 1, projectVertex(M, 1 + m, s, d, aspect, c)[0] - 1,
          projectVertex(M, s, -m, d, aspect, c)[1] - 1, -projectVertex(M, s, 1 + m, d, aspect, c)[1] - 1);
      }
    }
  }
  return worst;
}

// Smallest skirt that keeps the screen covered for these settings (the
// ?debug sliders can ask for far more sway than the shipped defaults).
export function requiredOverscan(c, aspect) {
  for (let m = 0.02; m < 0.6; m += 0.01) if (edgeMargin(c, aspect, m) > 0.01) return Math.round(m * 100) / 100;
  return 0.6;
}

// ---- camera jolts (0.088): big hits kick the background camera ----
// Each jolt is a fast damped wobble: amp * e^(-t/0.15s) * cos(2πt/0.16s),
// gone after ~0.6s. Strength is capped at JOLT_MAX, and the edge skirt
// reserves room for that much extra swing (withJoltReserve).
export const JOLT_MAX = 1.5;
export const JOLT_LIFE_MS = 600;

export function joltOffset(jolts, now) {
  let yaw = 0, pitch = 0;
  for (const j of jolts) {
    const t = (now - j.t0) / 1000;
    if (t < 0 || t * 1000 > JOLT_LIFE_MS) continue;
    const v = j.amp * Math.exp(-t / 0.15) * Math.cos((2 * Math.PI * t) / 0.16);
    yaw += v * j.dir;
    pitch += v * 0.5;
  }
  return { yaw, pitch };
}

// ---- big-hit sways (0.092; a rotation since 0.093) ----
// The heaviest blows rock the scene about its depth centre (the pivot,
// like the slow sway). Directional, unlike a jolt: dir +1 swings the near
// art right (the knight's blows travel left -> right), -1 left (a
// crushing hit on the knight). A damped swing, amp * e^(-t/0.3s) *
// sin(2πt/0.6s): starts at rest, goes with the blow (peak ~0.64 amp at
// 0.12s), rebounds a third as far, settles. Returns extra yaw (radians).
export const SWAY_MAX = 1.5;
export const SWAY_LIFE_MS = 1200;

export function swayOffset(sways, now) {
  let yaw = 0;
  for (const s of sways) {
    const t = (now - s.t0) / 1000;
    if (t < 0 || t * 1000 > SWAY_LIFE_MS) continue;
    yaw += s.amp * s.dir * Math.exp(-t / 0.3) * Math.sin((2 * Math.PI * t) / 0.6);
  }
  return yaw;
}

// The sway settings plus the largest possible jolt and big-hit sway, for
// overscan sizing (generous: two overlapping sways still fit).
export function withJoltReserve(c) {
  const extra = c.joltDeg * JOLT_MAX;
  return { ...c, yawDeg: c.yawDeg + extra + c.swayDeg * SWAY_MAX, pitchDeg: c.pitchDeg + extra * 0.5 };
}
