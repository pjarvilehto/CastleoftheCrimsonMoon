// ui/changelog.js — the CHANGELIST corner button (0.113): every build's
// release notes, newest first, in a scrolling dialog styled like the
// combat log. assets/data/changelog.json holds the whole history
// (tools/bump.mjs --note writes it); it grows with every build, so it is
// fetched only when the dialog opens, never at boot. Offline it falls back
// to the recent builds in build.json.
//
// The dialog owns the keyboard while open (Esc / Enter / C close it) and
// gives back whatever key trap was active before, so it can sit over
// another dialog without releasing that one's keys.

import { el, setKeyTrap, currentKeyTrap } from '../core/scene.js';
import { DATA } from '../shared/data.js';

let overlay = null;
let opening = false;

const num = (v) => String(v).split('.').map(Number).reduce((a, x) => a * 10000 + x, 0);

export async function loadChangelog() {
  try {
    const r = await fetch('assets/data/changelog.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`changelog ${r.status}`);
    return await r.json();
  } catch {
    return DATA.build?.changelog ?? {};
  }
}

export const changelogOpen = () => !!overlay;

export function closeChangelog() {
  if (!overlay) return;
  overlay.remove();
  setKeyTrap(overlay.prevTrap ?? null);
  overlay = null;
}

// load: () => Promise<{ version: [notes] }> (tests pass the file directly)
export async function openChangelog(load = loadChangelog) {
  if (overlay || opening) return;
  opening = true;
  const log = await load().finally(() => { opening = false; });
  const here = DATA.build?.version;
  const versions = Object.keys(log ?? {}).sort((a, b) => num(b) - num(a));
  const builds = versions.map((v) => el('div', { class: 'changelog-build' },
    el('div', { class: 'changelog-version' }, `Build ${v}`,
      v === here ? el('span', { class: 'changelog-here' }, ' — this build') : null),
    el('ul', { class: 'changelog-notes' }, ...(log[v] ?? []).map((n) => el('li', {}, String(n))))));
  const close = el('button', { class: 'primary', key: 'c', onclick: closeChangelog }, 'Close');
  overlay = el('div', {
    class: 'update-overlay changelog-overlay', role: 'dialog', 'aria-label': 'Changelist',
    onclick: (e) => { if (e?.target === overlay) closeChangelog(); }, // a click outside closes it
  },
  el('div', { class: 'update-modal changelog-modal' },
    el('h2', { class: 'update-title' }, 'Changelist'),
    el('div', { class: 'changelog-log' },
      ...(builds.length ? builds : [el('div', { class: 'changelog-empty' }, 'No release notes found.')])),
    el('div', { class: 'btn-row' }, close)));
  overlay.prevTrap = currentKeyTrap();
  document.body.append(overlay);
  setKeyTrap((k) => {
    if (k === 'c' || k === 'escape' || k === 'enter') closeChangelog();
    return true;
  });
}

export function changelogToggle() {
  return el('button', {
    class: 'debug-toggle changelog-toggle',
    onclick: () => (overlay ? closeChangelog() : openChangelog()),
  }, 'CHANGELIST');
}
