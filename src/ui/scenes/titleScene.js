// ui/scenes/titleScene.js — title screen -> hub, plus save transfer.

import { setBackground, go } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { DATA } from '../../shared/data.js';
import { getProfile, resetProfile, exportSave, importSave } from '../../meta/profile.js';
import { loadProfile } from '../../meta/storage.js';
import { play } from '../../audio/music.js';
import { namePrompt } from '../namePrompt.js';
import { confirmPrompt } from '../confirmPrompt.js';
import { armOnGesture } from '../../audio/narrator.js';
import { openDialog } from '../dialog.js';
import { recordsLine } from '../hubText.js';

export function titleScene() {
  return {
    enter(root) {
      play('title');
      armOnGesture('title_welcome'); // the narrator greets on the session's first click or key (0.161)
      render(root);
    },
  };

  function render(root) {
    setBackground(DATA.backgrounds.title);
    const p = getProfile();

    // Save transfer (0.00209: dialogs, like everything else — the title used
    // to expand a textarea at its foot, under a phone's keyboard). Export is
    // a copy-out code; import pastes in.
    const exportDialog = () => {
      const code = exportSave();
      const ta = el('textarea', { class: 'save-code', readonly: true, rows: 4 }, code || 'No save yet — play a run first.');
      const dlg = openDialog({ label: 'Export Save', children: [
        el('h2', { class: 'update-title' }, 'Export Save'),
        ta,
        el('div', { class: 'save-hint' }, 'Select the code and copy it. Paste it into Import Save on the other site.'),
        el('div', { class: 'btn-row' }, el('button', { class: 'primary', proceed: true, onclick: () => dlg.close() }, 'Done'))] });
      ta.focus?.(); ta.select?.(); // (inside the click's gesture: iOS honours it)
    };
    const importDialog = () => {
      const ta = el('textarea', { class: 'save-code', rows: 4, placeholder: 'Paste your save code here…' });
      const error = el('div', { class: 'save-error' }, '');
      const dlg = openDialog({ label: 'Import Save', children: [
        el('h2', { class: 'update-title' }, 'Import Save'),
        ta, error,
        el('div', { class: 'btn-row' },
          el('button', { class: 'primary', onclick: () => { if (importSave(ta.value)) { dlg.close(); render(root); } else error.textContent = 'That code doesn’t look like a valid save.'; } }, 'Load Save'),
          el('button', { onclick: () => dlg.close() }, 'Cancel'))] });
      ta.focus?.();
    };

    root.innerHTML = '';
    root.append(
      el('div', { class: 'panel title-panel' },
        el('h1', {}, 'CASTLE OF THE CRIMSON MOON'),
        el('div', { class: 'subtitle' }, 'A roguelite descent into the haunted keep'),
        p.records.runs > 0
          ? el('div', { class: 'subtitle' }, `Welcome back, ${p.name || 'adventurer'} — ${recordsLine(p)}`)
          : el('div', { class: 'subtitle' }, p.name ? `Your first descent awaits, ${p.name}.` : 'Your first descent awaits.'),
        el('div', { class: 'btn-row' },
          // 0.00200: a new player is asked their name on the way in (the prompt's button reads Enter the Castle), not over the title before seeing anything
          el('button', { class: 'primary', key: 'e', proceed: true, onclick: () => (getProfile().name ? go('hub') : namePrompt(() => go('hub'))) }, 'Enter the Castle'),
          // Shown only when a save with progress exists: offer to wipe
          // (the game's own yes/no dialog, not the browser's).
          loadProfile() !== null && (p.records.runs > 0 || p.coins > 0 || p.xp > 0)
            ? el('button', {
                class: 'danger',
                key: 'n',
                onclick: () => confirmPrompt({
                  title: 'Start a New Game?',
                  lines: ['Your existing save will be permanently wiped.'],
                  yes: ['Wipe and Start Over', 'w'],
                  no: ['Keep My Save', 'k'],
                  onYes: () => { resetProfile(); render(root); },
                }),
              }, 'Start a New Game')
            : null),
        p.name
          ? el('div', { class: 'player-name' }, `Playing as ${p.name} · `,
              el('button', { class: 'link-btn', onclick: () => namePrompt(() => render(root)) }, 'change'))
          : null,
        el('div', { class: 'save-transfer' },
          el('button', { onclick: exportDialog }, 'Export Save'),
          el('button', { onclick: importDialog }, 'Import Save')))
    );
  }
}
