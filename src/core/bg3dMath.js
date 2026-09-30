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
