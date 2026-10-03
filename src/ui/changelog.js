// ui/changelog.js — the CHANGELIST corner button (0.113): every build's
// release notes, newest first, in a scrolling dialog styled like the
// combat log. assets/data/changelog.json holds the whole history
// (tools/bump.mjs --note writes it); it grows with every build, so it is
// fetched only when the dialog opens, never at boot. Offline it falls back
// to the recent builds in build.json.
//
// The dialog owns the keyboard while open (Esc / Enter / C close it;
// ui/dialog.js), and hands it back to whatever was below.

import { el } from '../core/dom.js';
import { openDialog } from './dialog.js';
import { DATA, buildQuery } from '../shared/data.js';
import { compareVersions } from '../shared/version.js';

let dialog = null;
let opening = false;

async function loadChangelog() {
  try {
    const r = await fetch(`assets/data/changelog.json${buildQuery()}`, { cache: 'no-cache' }); // under the build (0.00197): the CDN's copy could lack this build's own notes
    if (!r.ok) throw new Error(`changelog ${r.status}`);
    return await r.json();
  } catch {
    return DATA.build?.changelog ?? {};
  }
}

export const changelogOpen = () => !!dialog?.isOpen();

export function closeChangelog() {
  dialog?.close();
}

// load: () => Promise<{ version: [notes] }> (tests pass the file directly)
export async function openChangelog(load = loadChangelog) {
  if (changelogOpen() || opening) return;
  opening = true;
  const log = await load().finally(() => { opening = false; });
  const here = DATA.build?.version;
  const versions = Object.keys(log ?? {}).sort(compareVersions).reverse();
  const builds = versions.map((v) => el('div', { class: 'changelog-build' },
    el('div', { class: 'changelog-version' }, `Build ${v}`,
      v === here ? el('span', { class: 'changelog-here' }, ' — this build') : null),
    el('ul', { class: 'changelog-notes' }, ...(log[v] ?? []).map((n) => el('li', {}, String(n))))));
  dialog = openDialog({
    label: 'Changelist', backdropCloses: true, // a click outside closes it
    overlayClass: 'update-overlay changelog-overlay', modalClass: 'update-modal changelog-modal',
    children: [
      el('h2', { class: 'update-title' }, 'Changelist'),
      el('div', { class: 'changelog-log' },
        ...(builds.length ? builds : [el('div', { class: 'changelog-empty' }, 'No release notes found.')])),
      el('div', { class: 'btn-row' }, el('button', { class: 'primary', key: 'c', onclick: closeChangelog }, 'Close')),
    ],
    closeKeys: ['c'],
  });
}

export function changelogToggle() {
  return el('button', {
    class: 'debug-toggle changelog-toggle',
    onclick: () => (changelogOpen() ? closeChangelog() : openChangelog()),
  }, 'CHANGELIST');
}
