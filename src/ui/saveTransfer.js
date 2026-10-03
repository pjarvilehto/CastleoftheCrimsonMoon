// ui/saveTransfer.js — EXPORT SAVE and IMPORT SAVE (0.00302, the developer's
// call: items of the SETTINGS menu's GAME group, before CHANGELIST; they were
// two buttons at the title's foot). Dialogs (0.00209), like everything else.
// Export is a copy-out code; import pastes one in and, loaded, returns to the
// title (onLoaded) — the save under every screen just changed. 0.00223: a
// keyboard way out — the dialog's own keys (Esc, Enter, Space through
// `proceed`) and the field's, since the hotkeys ignore a textarea's keys.

import { el } from '../core/dom.js';
import { openDialog } from './dialog.js';
import { exportSave, importSave } from '../meta/profile.js';

export function exportDialog() {
  const code = exportSave();
  const ta = el('textarea', { class: 'save-code', readonly: true, rows: 4 }, code || 'No save yet — play a run first.');
  let dlg;
  const done = el('button', { class: 'primary', proceed: true, onclick: () => dlg.close() }, 'Done');
  dlg = openDialog({ label: 'Export Save', proceed: done, onKey: (k, close) => { if (k === 'escape' || k === 'enter') close(); }, children: [
    el('h2', { class: 'update-title' }, 'Export Save'),
    ta,
    el('div', { class: 'save-hint' }, 'Select the code and copy it. Paste it into Import Save on the other site.'),
    el('div', { class: 'btn-row' }, done)] });
  ta.addEventListener?.('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); dlg.close(); } });
  ta.focus?.(); ta.select?.(); // (inside the click's gesture: iOS honours it)
}

export function importDialog(onLoaded) {
  const ta = el('textarea', { class: 'save-code', rows: 4, placeholder: 'Paste your save code here…' });
  const error = el('div', { class: 'save-error' }, '');
  let dlg;
  const tryLoad = () => { if (importSave(ta.value)) { dlg.close(); onLoaded?.(); } else error.textContent = 'That code doesn’t look like a valid save.'; };
  const load = el('button', { class: 'primary', proceed: true, onclick: tryLoad }, 'Load Save');
  dlg = openDialog({ label: 'Import Save', proceed: load, onKey: (k, close) => { if (k === 'escape') close(); else if (k === 'enter') tryLoad(); }, children: [
    el('h2', { class: 'update-title' }, 'Import Save'),
    ta, error,
    el('div', { class: 'btn-row' }, load, el('button', { onclick: () => dlg.close() }, 'Cancel'))] });
  ta.addEventListener?.('keydown', (e) => { if (e.key === 'Escape') dlg.close(); else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) tryLoad(); }); // (a plain Enter stays a newline)
  ta.focus?.();
}

// The menu's two items (main.js cornerBar).
export const exportSaveToggle = () => el('button', { class: 'debug-toggle export-toggle', onclick: () => exportDialog() }, 'EXPORT SAVE');
export const importSaveToggle = (onLoaded) => el('button', { class: 'debug-toggle import-toggle', onclick: () => importDialog(onLoaded) }, 'IMPORT SAVE');
