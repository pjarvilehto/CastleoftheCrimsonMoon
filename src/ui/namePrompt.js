// ui/namePrompt.js — "Enter your name" (0.109). Asked once, on the title
// screen, when the save has no name yet; the title's "Playing as …" line
// reopens it to change the name. The name travels with the save and the
// play stats (meta/telemetry.js), so the /analytics/ dashboard shows it.
// While open it owns the keyboard (setKeyTrap): typing goes to the field,
// Enter confirms; Esc closes only when changing an existing name.

import { el, setKeyTrap } from '../core/scene.js';
import { getProfile, setPlayerName, cleanName, NAME_MAX } from '../meta/profile.js';

export function namePrompt(onDone = () => {}) {
  const current = getProfile().name;
  let overlay = null;
  const input = el('input', {
    class: 'name-input', type: 'text', maxlength: NAME_MAX, value: current, placeholder: 'Your name',
    autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Your name',
  });
  const close = () => { overlay?.remove(); overlay = null; setKeyTrap(null); };
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
  overlay = el('div', { class: 'update-overlay name-overlay', role: 'dialog', 'aria-label': 'Enter your name' },
    el('div', { class: 'update-modal' },
      el('h2', { class: 'update-title' }, current ? 'Change Your Name' : 'Enter Your Name'),
      el('p', { class: 'update-ask' }, current ? 'How shall the castle remember you?' : 'Who dares the Castle of the Crimson Moon?'),
      input,
      el('div', { class: 'btn-row' }, ok, current ? el('button', { onclick: close }, 'Cancel') : null)));
  document.body.append(overlay);
  // Hotkeys stay away while it's open (keys typed in the field never reach
  // them; this catches the rest — e.g. focus moved to the button).
  setKeyTrap((k) => {
    if (k === 'enter') submit();
    else if (k === 'escape' && current) close();
    return true;
  });
  setTimeout(() => { input.focus?.(); input.select?.(); }, 0);
  return { close, input, ok };
}
