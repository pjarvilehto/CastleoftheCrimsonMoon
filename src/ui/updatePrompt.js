// ui/updatePrompt.js — "a new build is out" (0.094). Testers play the live
// site while builds keep landing; this polls build.json (uncached) every
// few minutes and when the tab comes back into view. When a newer build is
// up it offers a reload, with the changelist of every build since this one
// (build.json `changelog`, written by tools/bump.mjs --note).
//
// Never mid-run: a reload would lose the run in progress, so inside the
// dungeon the prompt waits for the next scene (the run-end screen, after
// the loot is banked). "Later" silences that version for this session —
// the next page load boots the new build anyway.

import { el, currentScene, onSceneChange, setKeyTrap } from '../core/scene.js';
import { DATA } from '../shared/data.js';

const POLL_MS = 3 * 60 * 1000;
const MAX_NOTES = 8;

let pending = null;   // { version, notes } — newer than this build, not yet shown
let dismissed = null; // the version the player put off
let overlay = null;   // the open prompt

// "0.100" vs "0.099": compare the parts as numbers, not as strings.
export function isNewer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

// Notes of every build after `from` up to `to`, newest first, capped.
export function notesSince(changelog, from, to) {
  const versions = Object.keys(changelog ?? {})
    .filter((v) => isNewer(v, from) && !isNewer(v, to))
    .sort((x, y) => (isNewer(x, y) ? -1 : 1));
  const notes = versions.flatMap((v) => changelog[v] ?? []);
  return notes.length > MAX_NOTES ? [...notes.slice(0, MAX_NOTES - 1), `…and ${notes.length - MAX_NOTES + 1} more`] : notes;
}

// One check. Resolves to the pending update (or null); never throws —
// offline or mid-deploy just means "try again later".
export async function checkForUpdate() {
  try {
    const r = await fetch(`assets/data/build.json?check=${Date.now()}`, { cache: 'no-store' });
    const b = await r.json();
    const here = DATA.build?.version;
    if (!here || !isNewer(b.version, here) || b.version === dismissed) return null;
    pending = { version: b.version, notes: notesSince(b.changelog, here, b.version) };
    maybeShow();
    return pending;
  } catch {
    return null;
  }
}

function maybeShow() {
  if (!pending || overlay || currentScene()?.inRun) return;
  showPrompt(pending);
}

function close() {
  overlay?.remove();
  overlay = null;
  setKeyTrap(null);
}

function showPrompt({ version, notes }) {
  const later = () => { dismissed = version; pending = null; close(); };
  const reload = () => globalThis.location.reload();
  const yes = el('button', { class: 'primary active', key: 'y', onclick: reload }, 'Yes, Reload');
  const no = el('button', { key: 'n', onclick: later }, 'No, Later');
  overlay = el('div', { class: 'update-overlay', role: 'dialog', 'aria-label': `Build ${version} available` },
    el('div', { class: 'update-modal' },
      el('h2', { class: 'update-title' }, `Build ${version} Available`),
      notes.length ? el('div', { class: 'update-label' }, 'Changelist') : null,
      notes.length ? el('ul', { class: 'update-notes' }, ...notes.map((n) => el('li', {}, n))) : null,
      el('p', { class: 'update-ask' }, 'Reload to update?'),
      el('div', { class: 'btn-row' }, yes, no)));
  document.body.append(overlay);
  // The prompt owns the keyboard: Y / Enter reload, N / Esc put it off.
  setKeyTrap((k) => {
    if (k === 'y' || k === 'enter') yes.click();
    else if (k === 'n' || k === 'escape') no.click();
    return true;
  });
}

// Registered once from main.js (pollMs 0 = no timer: tests).
export function initUpdateCheck(pollMs = POLL_MS) {
  if (pollMs > 0) setInterval(checkForUpdate, pollMs);
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  onSceneChange(() => maybeShow());
}
