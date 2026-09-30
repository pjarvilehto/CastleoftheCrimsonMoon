// ui/confirmPrompt.js — a small yes/no dialog over the current scene
// (0.102; same look as the update prompt). It owns the keyboard while open:
// the yes button's key / Enter confirms, the no button's key / Esc cancels.

import { el, setKeyTrap } from '../core/scene.js';

// { title, lines: [text], yes: [label, key], no: [label, key], onYes, onNo }
export function confirmPrompt({ title, lines = [], yes, no, onYes, onNo }) {
  let overlay = null;
  const close = () => { overlay?.remove(); overlay = null; setKeyTrap(null); };
  const yesBtn = el('button', { class: 'primary', key: yes[1], onclick: () => { close(); onYes?.(); } }, yes[0]);
  const noBtn = el('button', { class: 'active', key: no[1], onclick: () => { close(); onNo?.(); } }, no[0]);
  overlay = el('div', { class: 'update-overlay', role: 'dialog', 'aria-label': title },
    el('div', { class: 'update-modal' },
      el('h2', { class: 'update-title' }, title),
      ...lines.map((t) => el('p', { class: 'update-ask' }, t)),
      el('div', { class: 'btn-row' }, yesBtn, noBtn)));
  document.body.append(overlay);
  setKeyTrap((k) => {
    if (k === yes[1] || k === 'enter') yesBtn.click();
    else if (k === no[1] || k === 'escape') noBtn.click();
    return true;
  });
  return { close, yes: yesBtn, no: noBtn };
}
