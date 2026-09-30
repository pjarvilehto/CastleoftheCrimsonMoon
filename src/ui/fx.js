// ui/fx.js — combat feedback effects.

// Red vignette flash — the death moment.
export function flashRed() {
  const f = document.getElementById('flash');
  if (!f) return;
  f.classList.remove('on');
  void f.offsetWidth; // restart the animation if already flashing
  f.classList.add('on');
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
