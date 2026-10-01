// ui/namePrompt.js — "Enter your name" (0.109). Asked once, on the title
// screen, when the save has no name yet; the title's "Playing as …" line
// reopens it to change the name. The name travels with the save and the
// play stats (meta/telemetry.js), so the /analytics/ dashboard shows it.
// While open it owns the keyboard (ui/dialog.js): typing goes to the field,
// Enter confirms; Esc closes only when changing an existing name.

import { el } from '../core/dom.js';
import { openDialog } from './dialog.js';
import { getProfile, setPlayerName } from '../meta/profile.js';
import { cleanName, NAME_MAX } from '../meta/names.js';

// Centre the CAPITALS in the field (0.111): text-box trimming (what the
// buttons use) doesn't apply to an input's text, and each OS reads this
// font's vertical metrics differently — so measure the real ones (canvas)
// and move the text by the gap between the caps' middle and the line's.
export function centerCaps(input) {
  const cs = globalThis.getComputedStyle?.(input);
  const c = globalThis.document?.createElement?.('canvas')?.getContext?.('2d');
  if (!cs || !c) return 0;
  c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = c.measureText('HOMS');
  const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent, cap = m.actualBoundingBoxAscent;
  if (!(asc > 0) || !(cap > 0)) return 0;
  const low = (asc - desc - cap) / 2; // px the caps' middle sits below the line's middle
  const top = parseFloat(cs.paddingTop) || 0, bottom = parseFloat(cs.paddingBottom) || 0;
  input.style.paddingTop = `${Math.max(0, top - low)}px`;
  input.style.paddingBottom = `${Math.max(0, bottom + low)}px`;
  return low;
}

export function namePrompt(onDone = () => {}) {
  const current = getProfile().name;
  let dlg = null;
  const input = el('input', {
    class: 'name-input', type: 'text', maxlength: NAME_MAX, value: current, placeholder: 'Your name',
    autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Your name',
  });
  const close = () => dlg.close();
  const submit = () => {
    if (!cleanName(input.value)) { input.focus?.(); return; }
    setPlayerName(input.value);
    close();
    onDone();
  };
  const ok = el('button', { class: 'primary active', onclick: submit }, current ? 'Save' : 'Enter the Castle');
  const sync = () => { ok.disabled = !cleanName(input.value); };
  input.addEventListener?.('input', sync);
  input.addEventListener?.('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault?.(); submit(); }
    else if (e.key === 'Escape' && current) close();
  });
  sync();
  // Hotkeys stay away while it's open (keys typed in the field never reach
  // them; the key trap catches the rest — e.g. focus moved to the button).
  dlg = openDialog({
    label: 'Enter your name', overlayClass: 'update-overlay name-overlay',
    children: [
      el('h2', { class: 'update-title' }, current ? 'Change Your Name' : 'Enter Your Name'),
      el('p', { class: 'update-ask' }, current ? 'How shall the castle remember you?' : 'Who dares the Castle of the Crimson Moon?'),
      input,
      el('div', { class: 'btn-row' }, ok, current ? el('button', { onclick: close }, 'Cancel') : null),
    ],
    onKey: (k) => {
      if (k === 'enter') submit();
      else if (k === 'escape' && current) close();
    },
  });
  setTimeout(() => { centerCaps(input); input.focus?.(); input.select?.(); }, 0);
  return { close, input, ok };
}
