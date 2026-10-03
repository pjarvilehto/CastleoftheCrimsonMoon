// ui/fx.js — combat feedback effects.

// Death sequence (0.079): a slow build to 75% red; at the peak, onPeak()
// (the YOU DIED dialog flashes in); then a slow 2s fade back to normal.
// Timings pair with #flash.death-in / .death-out in styles.css.
// DEATH_PEAK_MS is the look (the flash's build), exported so the death
// hit's loudest moment lands with the dialog (dungeonScene, 0.00297).
export const DEATH_PEAK_MS = 900;
export function deathFlash(onPeak) {
  const f = document.getElementById('flash');
  if (!f) { onPeak(); return; }
  f.classList.remove('death-out');
  void f.offsetWidth;
  f.classList.add('death-in');
  setTimeout(() => {
    onPeak();
    f.classList.remove('death-in');
    f.classList.add('death-out');
    setTimeout(() => f.classList.remove('death-out'), 2100);
  }, DEATH_PEAK_MS);
}

// A number that just changed glows and grows for a moment (0.00216, the
// developer's ask: XP and coins in combat, the hall's rows): one element.animate,
// transform and a text glow — never a loop.
export function pulseNumber(el, ms = 820) {
  el?.animate?.([
    { transform: 'scale(1)', color: 'inherit', textShadow: 'none' },
    { transform: 'scale(1.18)', color: '#fff4d0', textShadow: '0 0 14px rgba(232,196,92,1), 0 0 28px rgba(232,196,92,0.6)', offset: 0.25 },
    { transform: 'scale(1.08)', color: '#fff4d0', textShadow: '0 0 10px rgba(232,196,92,0.8)', offset: 0.6 },
    { transform: 'scale(1)', color: 'inherit', textShadow: 'none' },
  ], { duration: ms, easing: 'ease-out' });
}

// Roll a number counter up from `from` to `to` over `ms`, with the pulse above.
export function tickUp(el, from, to, ms = 700) {
  if (!el) return;
  if (from === to) { el.textContent = String(to); return; }
  pulseNumber(el, ms + 120);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = String(Math.round(from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
