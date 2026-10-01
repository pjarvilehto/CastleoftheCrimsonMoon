// ui/volumePanel.js — VOLUME corner toggle (0.107): Master / Music / Effects
// sliders under the MUSIC / FULLSCREEN / SOUND toggles. Moves apply live
// and persist in this browser (audio/mixer.js). The on/off toggles stay
// separate: muting keeps the slider positions. (0.114-0.117 also had a
// Score row; one score since 0.118.)

import { el } from '../core/dom.js';
import { panelToggle } from './cornerToggles.js';
import { getVolumes, setVolume } from '../audio/mixer.js';
import { sfx } from '../audio/sfx.js';

const SLIDERS = [['master', 'Master'], ['music', 'Music'], ['sfx', 'Effects']];
const pct = (v) => `${Math.round(v * 100)}%`;

export const volumeToggle = () => panelToggle('VOLUME', 'volume-toggle', buildPanel);

function buildPanel() {
  const v = getVolumes();
  let previewAt = 0;
  const rows = SLIDERS.map(([kind, label]) => {
    const value = el('span', { class: 'volume-value' }, pct(v[kind]));
    const input = el('input', {
      type: 'range', min: 0, max: 1, step: 0.05, value: v[kind], 'aria-label': `${label} volume`,
      oninput: (e) => {
        setVolume(kind, e.target.value);
        value.textContent = pct(Number(e.target.value));
        // effects: a sample hit at the new level (at most ~3 a second)
        if (kind !== 'music' && Date.now() - previewAt > 300) { previewAt = Date.now(); sfx('attack'); }
      },
    });
    return el('label', { class: 'volume-row' }, el('span', {}, label), input, value);
  });
  return el('div', { class: 'volume-panel' }, el('div', { class: 'volume-title' }, 'VOLUME'), ...rows);
}
