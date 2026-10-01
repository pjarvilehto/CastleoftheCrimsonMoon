// explore/backdrop.js — the painted room behind a fight (0.148). Walking,
// the knight sees the 3D dungeon; when a fight begins (and at the shrine),
// the game's own painting for that kind of room fades in over it — the
// depth-mesh background of core/bg3d.js, swaying and misted, jolted, rocked
// and lit by the blows as in the game, with the game's particles — and
// when the knight walks on it fades out to the dungeon again. Which
// painting: explore.json backdrop.paintings, by the room's theme. While it
// covers the screen the dungeon is not drawn (lab.js); while it is hidden
// the painting is not drawn (pauseBg3d).
// createBackdrop(cfg, root) -> { show(file), hide(), update(dt), prefetch(files), covered(), level }

import { initBg3d, showBackground3d, pauseBg3d, depthUrl } from '../core/bg3d.js';
import { onBackgroundChange, setBackground } from '../core/scene.js';

export function createBackdrop(cfg, root) {
  const B = cfg.backdrop;
  // (software GL allowed: the lab is a ?debug page, like the game in debug mode)
  const live = initBg3d({ allowSoftware: true });
  if (live) { onBackgroundChange(showBackground3d); pauseBg3d(true); }
  let want = 0, k = 0, seq = 0;
  const seen = new Set();

  // a fight begins: its painting, then the fade in (once it is up)
  async function show(file) {
    const n = ++seq;
    await setBackground(file, { instant: k === 0 }); // (hidden: no crossfade from the last painting)
    if (n !== seq) return;
    if (live) pauseBg3d(false);
    want = 1;
  }
  function hide() { seq++; want = 0; }

  function update(dt) {
    k = want ? Math.min(1, k + dt / B.fadeInSecs) : Math.max(0, k - dt / B.fadeOutSecs);
    root.style.opacity = String(k * k * (3 - 2 * k));
    root.style.visibility = k > 0 ? 'visible' : 'hidden';
    if (live && k === 0 && !want) pauseBg3d(true);
  }

  // the floor's paintings into the browser's cache, so a fight never waits for one
  function prefetch(files) {
    for (const f of files) {
      if (seen.has(f)) continue;
      seen.add(f);
      for (const src of [`assets/bg/${f}`, depthUrl(f)]) Object.assign(new Image(), { src });
    }
  }

  update(0);
  return { show, hide, update, prefetch, covered: () => k >= 1, get level() { return k; } };
}
