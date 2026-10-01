// explore/lut.js — the colour grade as a lookup table (0.147). Each depth
// tier has a grade (explore.json post.grade, tiers[].grade): lift / gamma /
// gain per channel (as colourists set them), contrast about mid-grey and
// saturation. It is baked into a 32³ table (a 1024 x 32 strip: 32 slices
// of blue side by side, red across each, green down) that the paint pass
// looks up as its last grade — the same table a colourist could export
// from Photoshop or Resolve and drop in. gradeTable is pure (tested in Node).

export const LUT_N = 32;

// one colour (0..1 display space) through the grade
export function gradeColor([r, g, b], G) {
  const c = [r, g, b].map((v, i) => {
    let x = v * G.gain[i] + G.lift[i] * (1 - v);            // lift raises the blacks, gain the whites
    x = Math.pow(Math.max(x, 0), 1 / G.gamma[i]);           // gamma bends the mids
    return (x - 0.5) * G.contrast + 0.5;                    // contrast about mid-grey
  });
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return c.map((v) => Math.min(1, Math.max(0, l + (v - l) * G.saturation)));
}

// the strip, RGBA bytes: texel (b * N + r, g)
export function gradeTable(G, N = LUT_N) {
  const out = new Uint8Array(N * N * N * 4);
  for (let g = 0; g < N; g++) for (let b = 0; b < N; b++) for (let r = 0; r < N; r++) {
    const c = gradeColor([r / (N - 1), g / (N - 1), b / (N - 1)], G), k = (g * N * N + b * N + r) * 4;
    out[k] = Math.round(c[0] * 255); out[k + 1] = Math.round(c[1] * 255); out[k + 2] = Math.round(c[2] * 255); out[k + 3] = 255;
  }
  return out;
}

// GLSL: look a colour up in the strip (two slices, blended along blue)
export const LUT_GLSL = `
vec3 gradeLut(sampler2D lut, vec3 c) {
  float n = ${LUT_N}.0;
  c = clamp(c, 0.0, 1.0);
  float b = c.b * (n - 1.0), b0 = floor(b), b1 = min(b0 + 1.0, n - 1.0);
  vec2 uv = vec2((c.r * (n - 1.0) + 0.5) / (n * n), (c.g * (n - 1.0) + 0.5) / n);
  return mix(texture2D(lut, uv + vec2(b0 / n, 0.0)).rgb, texture2D(lut, uv + vec2(b1 / n, 0.0)).rgb, b - b0);
}`;
