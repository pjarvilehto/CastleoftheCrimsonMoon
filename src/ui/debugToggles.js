// ui/debugToggles.js — the ?debug tools in the corner column (moved out of
// main.js, 0.115): INVULNERABLE (0.079), background evaluation — HIDE
// FOREGROUND, BG VIEW (3D / FLAT / DEPTH), NEXT BG, BG TUNING (0.083/0.084)
// — FORCE CRITS / FORCE MEGA CRITS (0.105), LABS (0.168: the menu of the
// testing pages, labs/index.html — a card per labs/<name>/ folder, kept in
// step by the suite — in a new tab) and
// BENCHMARK (0.131, ui/benchmark.js). 0.00242 (the owner's call): DEBUG
// MODE ON/OFF, the last item of the SETTINGS menu, shows them — remembered
// in this browser, so testers need no ?debug in the address (?debug still
// turns it on for the visit; the headless checks use it).

import { setBackground } from '../core/scene.js';
import { el } from '../core/dom.js';
import { isBg3dActive, bgView, setBgView } from '../core/bg3d.js';
import { DATA } from '../shared/data.js';
import { DEBUG } from '../shared/debug.js';
import { onOffToggle, menuHead } from './cornerToggles.js';
import { getPref, setPref } from '../shared/prefs.js';
import { bgTunerToggle } from './bgTuner.js';
import { benchmarkButton } from './benchmark.js';

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
      viewBtn.sync();
    },
  }, 'BG VIEW: 3D');
  viewBtn.sync = () => { viewBtn.textContent = `BG VIEW: ${bgView().toUpperCase()}`; };
  const b = DATA.backgrounds;
  const all = [...new Set([b.title, b.hub, ...b.bosses, b.death, b.shrine, ...b.rooms, ...b.treasure])];
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
  const labs = el('button', { class: 'debug-toggle labs-link', onclick: () => globalThis.open?.('labs/', '_blank', 'noopener') }, 'LABS');
  return [fg, viewBtn, next, bgTunerToggle(),
    flag('forceCrit', 'FORCE CRITS', 'crit-toggle'), flag('forceMegaCrit', 'FORCE MEGA CRITS', 'megacrit-toggle'), labs, benchmarkButton()];
}

// DEBUG MODE (0.00242): ?debug in the address, else this browser's last choice.
const MODE_KEY = 'castle-debug-mode';
export const debugFromUrl = () => new URLSearchParams(globalThis.location?.search ?? '').has('debug');
let modeOn = null;
export const debugModeOn = () => (modeOn ??= debugFromUrl() || getPref(MODE_KEY) === '1');

// The toggle and the tools it shows (each marked .dbg: styles.css hides
// them until the corner carries .debug-on). OFF puts every testing switch
// back — honest combat, the foreground shown, the 3D view.
export function debugMenu() {
  const items = [menuHead('Debug tools'), invulnerableToggle(), ...debugToggles()];
  items.forEach((n) => n.classList.add('dbg'));
  const apply = (on) => {
    document.querySelector?.('.corner-bar')?.classList.toggle('debug-on', on);
    document.body?.classList?.toggle('debug', on);
  };
  const toggle = onOffToggle('DEBUG MODE', {
    cls: 'debug-mode-toggle',
    get: debugModeOn,
    flip: () => {
      modeOn = !debugModeOn();
      setPref(MODE_KEY, modeOn ? '1' : '0');
      if (!modeOn) {
        Object.keys(DEBUG).forEach((k) => { DEBUG[k] = false; });
        document.body?.classList?.remove('fg-hidden');
        if (isBg3dActive() && bgView() !== '3d') setBgView('3d');
        items.forEach((b) => b.sync?.());
      }
      apply(modeOn);
      return modeOn;
    },
  });
  return { toggle, items, apply };
}
