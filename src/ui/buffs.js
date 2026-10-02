// ui/buffs.js — the bottom-left buff bar (shrine blessings): icon with
// a short label underneath (full text on hover). Lives outside the panel
// so per-tick combat re-renders can't touch it. 0.096: compact equal
// cells, and the same boon twice is one icon with a ×2 badge.

import { el } from '../core/dom.js';

export function createBuffBar() {
  return el('div', { id: 'buffs', style: 'display:none' });
}

// A boon's or chest's picture (0.172: painted icons in assets/icons/, the
// same on every machine — the glyph stays as its text alternative).
export const iconArt = (img, glyph) => el('img', { class: 'icon-art', src: img, alt: glyph, draggable: 'false' });

// Rebuild the bar from run.buffs ({icon, label, full?, id?}).
// NOTE: never clear via `bar.children = []` — `children` is READ-ONLY on
// real DOM (that exact bug shipped broken in 0.031; the test shim had
// allowed it). innerHTML is the safe clear.
export function updateBuffs(bar, buffs) {
  bar.innerHTML = '';
  const groups = [];
  for (const b of buffs) {
    const key = b.id ?? b.label;
    const g = groups.find((x) => x.key === key);
    if (g) g.n += 1;
    else groups.push({ key, b, n: 1 });
  }
  for (const { b, n } of groups) {
    bar.append(el('div', { class: 'buff', title: `${b.full ?? b.label}${n > 1 ? ` (x${n})` : ''}` },
      el('div', { class: 'buff-icon' }, b.img ? iconArt(b.img, b.icon) : b.icon, n > 1 ? el('span', { class: 'buff-count' }, `×${n}`) : null),
      el('div', { class: 'buff-label' }, b.label)));
  }
  bar.style.display = groups.length ? 'flex' : 'none';
}
