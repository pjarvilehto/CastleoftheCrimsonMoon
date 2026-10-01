// ui/debugToggles.js — the ?debug tools in the corner column (moved out of
// main.js, 0.115): INVULNERABLE (0.079), background evaluation — HIDE
// FOREGROUND, BG VIEW (3D / FLAT / DEPTH), NEXT BG, BG TUNING (0.083/0.084)
// — FORCE CRITS / FORCE MEGA CRITS (0.105), and PARTICLE LAB (the particle
// look experiments, particle-lab/, in a new tab). Players never see them.

import { setBackground } from '../core/scene.js';
import { el } from '../core/dom.js';
import { isBg3dActive, bgView, setBgView } from '../core/bg3d.js';
import { DATA } from '../shared/data.js';
import { DEBUG } from '../shared/debug.js';
import { onOffToggle } from './cornerToggles.js';
import { bgTunerToggle } from './bgTuner.js';

const flag = (key, label, cls) => onOffToggle(label, { cls, get: () => DEBUG[key], flip: () => (DEBUG[key] = !DEBUG[key]) });

export const invulnerableToggle = () => flag('invulnerable', 'INVULNERABLE', 'inv-toggle');

export function debugToggles() {
  const fg = onOffToggle('HIDE FOREGROUND', {
    cls: 'bg-fg-toggle',
    get: () => !!document.body?.classList?.contains('fg-hidden'),
    flip: () => document.body.classList.toggle('fg-hidden'),
  });
  const modes = ['3d', 'flat', 'depth'];
  const viewBtn = el('button', {
    class: 'debug-toggle bg-view-toggle',
    onclick: () => {
      if (!isBg3dActive()) { viewBtn.textContent = 'BG VIEW: NO WEBGL'; return; }
      setBgView(modes[(modes.indexOf(bgView()) + 1) % modes.length]);
      viewBtn.textContent = `BG VIEW: ${bgView().toUpperCase()}`;
    },
  }, 'BG VIEW: 3D');
  const b = DATA.backgrounds;
  const all = [...new Set([b.title, b.hub, b.boss, b.death, b.shrine, ...b.rooms])];
  let i = -1;
  const next = el('button', {
    class: 'debug-toggle bg-next-toggle',
    onclick: () => {
      i = (i + 1) % all.length;
      setBackground(all[i]);
      next.textContent = `NEXT BG (${i + 1}/${all.length}: ${all[i].replace(/^castle_|\.jpg$/g, '')})`;
    },
  }, 'NEXT BG');
  // A new tab, so the game (and a run in progress) stays as it is.
  const lab = el('button', { class: 'debug-toggle particle-lab-link', onclick: () => globalThis.open?.('particle-lab/', '_blank', 'noopener') }, 'PARTICLE LAB');
  return [fg, viewBtn, next, bgTunerToggle(),
    flag('forceCrit', 'FORCE CRITS', 'crit-toggle'), flag('forceMegaCrit', 'FORCE MEGA CRITS', 'megacrit-toggle'), lab];
}
