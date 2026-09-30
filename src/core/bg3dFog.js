// core/bg3dFog.js — pure math for the background fog (0.099; 0.101 puffs).
// The fog lives INSIDE the scene, from the depth map:
//   - haze: farther pixels are mistier (depth 0 = far) — per vertex in the
//     background shader (core/bg3dGL.js);
//   - puffs: large soft mist sprites drifting through the scene volume
//     (core/bg3dPuffs.js, drawn by core/bg3dPuffGL.js).
// How much fog: backgrounds.json parallax `fog` (default) and per-file
// overrides; the colour comes from the scene's own distance. No DOM or
// WebGL here — the smoke suite tests it in Node.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable fractal value noise, size x size bytes (0..255): three octaves
// on wrapping lattices, so the texture repeats seamlessly (REPEAT wrap).
export function fogNoise(size = 128, seed = 7) {
  const rnd = mulberry32(seed);
  const octaves = [[4, 0.55], [8, 0.3], [16, 0.15]]; // [cells per tile, weight]
  const lattices = octaves.map(([n]) => Float32Array.from({ length: n * n }, rnd));
  const smooth = (t) => t * t * (3 - 2 * t);
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    octaves.forEach(([n, w], o) => {
      const L = lattices[o];
      const fx = (x / size) * n, fy = (y / size) * n;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const at = (i, j) => L[((j % n) + n) % n * n + ((i % n) + n) % n];
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      v += w * (top * (1 - ty) + bot * ty);
    });
    out[y * size + x] = Math.round(Math.min(1, Math.max(0, v)) * 255);
  }
  return out;
}

// Fog colour from the scene itself: the HUE of its far pixels (depth <
// farDepth), at a fixed mist brightness and softened toward grey — real
// mist is lighter than a dark scene (the art's own far colour made a dark
// veil). rgba: RGBA bytes of the art at w x h; depthAt(u, v) -> 0 (far).
export function fogColor(rgba, w, h, depthAt, { farDepth = 0.3, brightness = 0.42, soften = 0.35 } = {}) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (depthAt((x + 0.5) / w, (y + 0.5) / h) > farDepth) continue;
    const i = (y * w + x) * 4;
    r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++;
  }
  if (!n) return [brightness, brightness, brightness];
  const avg = [r, g, b].map((c) => c / n / 255);
  const lum = 0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2];
  const k = lum > 0.002 ? brightness / lum : 0;
  return avg.map((c) => Math.min(1, (lum > 0.002 ? c * k : brightness) * (1 - soften) + brightness * soften));
}
