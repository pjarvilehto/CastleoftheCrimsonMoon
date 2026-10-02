// shared/motion.js — the one reduced-motion check (0.00197). Five modules
// used to ask matchMedia for it, one of them thirty times a second; the
// media query is created once here and tracked through its change event.

let mql = null, reduced = false;
function init() {
  if (mql !== null) return;
  mql = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? false;
  if (!mql) return;
  reduced = mql.matches;
  mql.addEventListener?.('change', (e) => { reduced = e.matches; });
}
/** True when the player asked the OS for less motion: no one-shots, no mist, no particles, no card light. */
export function reducedMotion() { init(); return reduced; }
