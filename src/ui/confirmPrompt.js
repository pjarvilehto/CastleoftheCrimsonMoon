// ui/confirmPrompt.js — a small yes/no dialog over the current scene
// (0.102; same look as the update prompt). It owns the keyboard while open
// (ui/dialog.js): the yes button's key / Enter confirms, the no button's
// key / Esc cancels.

import { el } from '../core/dom.js';
import { openDialog } from './dialog.js';

// { title, lines: [text], yes: [label, key], no: [label, key], onYes, onNo }
export function confirmPrompt({ title, lines = [], yes, no, onYes, onNo }) {
  let dlg = null;
  const yesBtn = el('button', { class: 'primary', key: yes[1], onclick: () => { dlg.close(); onYes?.(); } }, yes[0]);
  const noBtn = el('button', { class: 'active', key: no[1], onclick: () => { dlg.close(); onNo?.(); } }, no[0]);
  dlg = openDialog({
    label: title,
    children: [
      el('h2', { class: 'update-title' }, title),
      ...lines.map((t) => el('p', { class: 'update-ask' }, t)),
      el('div', { class: 'btn-row' }, yesBtn, noBtn),
    ],
    onKey: (k) => {
      if (k === yes[1] || k === 'enter') yesBtn.click();
      else if (k === no[1] || k === 'escape') noBtn.click();
    },
  });
  return { close: dlg.close, yes: yesBtn, no: noBtn };
}
