// ui/fx.js — combat feedback effects.

// Death sequence (0.079): a slow build to 75% red; at the peak, onPeak()
// (the YOU DIED dialog flashes in); then a slow 2s fade back to normal.
// Timings pair with #flash.death-in / .death-out in styles.css.
export function deathFlash(onPeak) {
  const f = document.getElementById('flash');
  if (!f) { onPeak(); return; }
  f.classList.remove('on', 'death-out');
  void f.offsetWidth;
  f.classList.add('death-in');
  setTimeout(() => {
    onPeak();
    f.classList.remove('death-in');
    f.classList.add('death-out');
    setTimeout(() => f.classList.remove('death-out'), 2100);
  }, 900);
}

// Roll a number counter up from `from` to `to` over `ms`.
export function tickUp(el, from, to, ms = 700) {
  if (!el) return;
  if (from === to) { el.textContent = String(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = String(Math.round(from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
