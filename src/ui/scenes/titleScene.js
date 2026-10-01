// ui/scenes/titleScene.js — title screen -> hub, plus save transfer.

import { setBackground, go } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { DATA } from '../../shared/data.js';
import { getProfile, resetProfile, exportSave, importSave } from '../../meta/profile.js';
import { loadProfile } from '../../meta/storage.js';
import { play } from '../../audio/music.js';
import { namePrompt } from '../namePrompt.js';

export function titleScene() {
  let transfer = null;      // null | 'export' | 'import'
  let importFailed = false; // show the error line under the import box

  return {
    enter(root) {
      play('title');
      render(root);
      // 0.109: a new player is asked their name first (analytics shows it)
      if (!getProfile().name) namePrompt(() => render(root));
    },
  };

  function render(root) {
    setBackground(DATA.backgrounds.title);
    const p = getProfile();

    // Save transfer block: two quiet buttons under the main row; clicking
    // one expands a textarea. Export is a copy-out code; import pastes in.
    let transferBody = null;
    if (transfer === 'export') {
      const code = exportSave();
      const ta = el('textarea', { class: 'save-code', readonly: true, rows: 4 }, code || 'No save yet — play a run first.');
      transferBody = el('div', {},
        ta,
        el('div', { class: 'save-hint' }, 'Click the code to select it, then copy. Paste it into Import Save on the other site.'));
      // Auto-select for one-click copy.
      setTimeout(() => { ta.focus?.(); ta.select?.(); }, 0);
    } else if (transfer === 'import') {
      const ta = el('textarea', { class: 'save-code', rows: 4, placeholder: 'Paste your save code here…' });
      transferBody = el('div', {},
        ta,
        importFailed ? el('div', { class: 'save-error' }, 'That code doesn’t look like a valid save.') : null,
        el('div', { class: 'btn-row' },
          el('button', {
            class: 'primary',
            onclick: () => {
              if (importSave(ta.value)) { transfer = null; importFailed = false; render(root); }
              else { importFailed = true; render(root); }
            },
          }, 'Load Save')));
      setTimeout(() => ta.focus?.(), 0);
    }

    root.innerHTML = '';
    root.append(
      el('div', { class: 'panel title-panel' },
        el('h1', {}, 'CASTLE OF THE CRIMSON MOON'),
        el('div', { class: 'subtitle' }, 'A roguelite descent into the haunted keep'),
        p.records.runs > 0
          ? el('div', { class: 'subtitle' },
              `Welcome back, ${p.name || 'adventurer'} — ${p.records.runs} runs, ` +
              `${p.records.kills} kills, deepest room ${p.records.bestRoom}.`)
          : el('div', { class: 'subtitle' }, p.name ? `Your first descent awaits, ${p.name}.` : 'Your first descent awaits.'),
        el('div', { class: 'btn-row' },
          el('button', { class: 'primary', key: 'e', onclick: () => go('hub') }, 'Enter the Castle'),
          // Shown only when a save with progress exists: offer to wipe.
          loadProfile() !== null && (p.records.runs > 0 || p.coins > 0 || p.xp > 0)
            ? el('button', {
                class: 'danger',
                key: 'n',
                onclick: () => {
                  if (confirm('Start a new game? Your existing save will be permanently wiped.')) {
                    resetProfile();
                    transfer = null;
                    render(root);
                  }
                },
              }, 'Start a New Game')
            : null),
        p.name
          ? el('div', { class: 'player-name' }, `Playing as ${p.name} · `,
              el('button', { class: 'link-btn', onclick: () => namePrompt(() => render(root)) }, 'change'))
          : null,
        el('div', { class: 'save-transfer' },
          el('button', { onclick: () => { transfer = transfer === 'export' ? null : 'export'; importFailed = false; render(root); } }, 'Export Save'),
          el('button', { onclick: () => { transfer = transfer === 'import' ? null : 'import'; importFailed = false; render(root); } }, 'Import Save')),
        transferBody)
    );
  }
}
