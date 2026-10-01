// ui/volumePanel.js — VOLUME corner toggle (0.107): Master / Music / Effects
// sliders under the MUSIC / FULLSCREEN / SOUND toggles. Moves apply live
// and persist in this browser (audio/mixer.js). The on/off toggles stay
// separate: muting keeps the slider positions. 0.114: a Score row picks
// the music (new dark ambient score / classic beds, audio/music.js).

import { el } from '../core/scene.js';
import { panelToggle } from './cornerToggles.js';
import { getVolumes, setVolume } from '../audio/mixer.js';
import { sfx } from '../audio/sfx.js';
import { scores, scoreId, setScore } from '../audio/music.js';

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
  return el('div', { class: 'volume-panel' }, el('div', { class: 'volume-title' }, 'VOLUME'), ...rows, scoreRow());
}

// Score (0.114): the dark ambient score or the classic beds, switched live.
function scoreRow() {
  const ids = Object.keys(scores());
  if (ids.length < 2) return null;
  const buttons = ids.map((id) => el('button', {
    class: `score-btn${id === scoreId() ? ' on' : ''}`,
    'aria-pressed': String(id === scoreId()),
    onclick: () => {
      setScore(id);
      for (const [i, btn] of buttons.entries()) {
        btn.classList.toggle('on', ids[i] === scoreId());
        btn.setAttribute('aria-pressed', String(ids[i] === scoreId()));
      }
    },
  }, scores()[id].label ?? id));
  return el('div', { class: 'volume-row volume-score' }, el('span', {}, 'Score'), el('div', { class: 'score-btns' }, ...buttons));
}
