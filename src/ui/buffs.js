// ui/buffs.js — the bottom-left buff bar (shrine blessings): icon with
// the buff text underneath. Lives outside the panel so per-tick combat
// re-renders can't touch it.

import { el } from '../core/scene.js';

export function createBuffBar() {
  return el('div', { id: 'buffs', style: 'display:none' });
}

// Rebuild the bar from run.buffs ({icon, label}).
// NOTE: never clear via `bar.children = []` — `children` is READ-ONLY on
// real DOM (that exact bug shipped broken in 0.031; the test shim had
// allowed it). innerHTML is the safe clear.
export function updateBuffs(bar, buffs) {
  bar.innerHTML = '';
  for (const b of buffs) {
    bar.append(el('div', { class: 'buff' },
      el('div', { class: 'buff-icon' }, b.icon),
      el('div', { class: 'buff-label' }, b.label)));
  }
  bar.style.display = buffs.length ? 'flex' : 'none';
}
