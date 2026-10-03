// core/bg3dLights.js — pure math for the background flashes (0.100): a
// crit, a potion or a revive puts a short-lived light INTO the 3D scene,
// just in front of the character involved. The shader (core/bg3dGL.js)
// lights each pixel by its true 3D distance to it — from the depth map —
// so nearby surfaces flare, the far wall barely catches it, and the mist
// around it glows. Tuning: backgrounds.json parallax `lights`. No DOM or
// WebGL here — the smoke suite tests it in Node.

export const MAX_LIGHTS = 2;

// Distance in front of the camera, reach (world units), and per-kind
// colour / strength / timing (s). backgrounds.json parallax `lights` wins.

// Where a screen point (CSS px) sits in the scene at distance `dist` along
// its camera ray (rest pose: the camera sway is a degree or two — close
// enough for a flash). Same frame as the mesh: the focal plane is z = -1.
export function screenToWorld(x, y, w, h, fovDeg, dist) {
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  const nx = (x / w) * 2 - 1, ny = 1 - (y / h) * 2;
  return [nx * tan * (w / h) * dist, ny * tan * dist, -dist];
}

// A new flash of `kind` for a card's screen rect (CSS px) on a w x h
// canvas, a little above the card's middle (the chest); null when lights
// are off, the kind is unknown or there is no rect.
export function flashAt(kind, rect, w, h, fovDeg, lights, now) {
  const k = lights?.[kind];
  if (!lights?.enabled || !k || !rect) return null;
  const pos = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height * 0.45, w, h, fovDeg, lights.dist);
  return { t0: now, pos, color: k.color, strength: k.strength, rise: lights.rise, fade: k.fade, life: k.life };
}

// Brightness over time: a quick rise, then an exponential fade.
// t in seconds; 0 once the light is spent. rise / fade / life come with the
// light (parallax.lights; 0.00197: no default copies of them here).
// hold (s, 0.00319): a light that stays at full strength that long (a find
// card's flight) before its fade; without it the fade starts at the peak.
export function envelope(t, { rise, fade, life, hold }) {
  if (t < 0 || t > life) return 0;
  const top = Math.max(rise, hold ?? 0);
  return t < rise ? t / rise : t < top ? 1 : Math.exp(-(t - top) / fade);
}

// The lights to draw this frame: the MAX_LIGHTS brightest live ones, as
// flat uniform arrays (unused slots dark). lights: [{ t0 (ms), pos,
// color: [r,g,b], strength, fade, life }].
const NONE = { pos: new Float32Array(MAX_LIGHTS * 3), col: new Float32Array(MAX_LIGHTS * 3), count: 0 }; // the usual frame
export function activeLights(lights, now) {
  if (!lights.length) return NONE;
  const lit = lights
    .map((L) => ({ L, k: L.strength * envelope((now - L.t0) / 1000, L) }))
    .filter((x) => x.k > 0.002)
    .sort((a, b) => b.k - a.k)
    .slice(0, MAX_LIGHTS);
  const pos = new Float32Array(MAX_LIGHTS * 3), col = new Float32Array(MAX_LIGHTS * 3);
  lit.forEach(({ L, k }, i) => {
    pos.set(L.pos, i * 3);
    col.set(L.color.map((c) => c * k), i * 3);
  });
  return { pos, col, count: lit.length };
}
