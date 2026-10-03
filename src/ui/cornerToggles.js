// ui/cornerToggles.js — the upper-right corner (0.115; a SETTINGS menu since
// 0.00242): FULLSCREEN beside it, and in the menu AUDIO (MUSIC, SOUND,
// NARRATOR, VOLUME), DISPLAY (BATTERY SAVER), GAME (CHANGELIST) and DEBUG
// MODE, which shows the testing tools under it (ui/debugToggles.js). One
// flex column (.corner-bar), so adding a button is one line in main.js — no
// hand-placed pixel offsets — and a panel a button opens (VOLUME, BG
// TUNING) sits right under its button, pushing the rest down.
//
// Dimmed when off so they never distract players; lit gold when on.

import { el } from '../core/dom.js';

// An ON/OFF button: get() -> current state, flip() -> new state.
export function onOffToggle(label, { get, flip, cls = '' }) {
  const text = (on) => `${label}: ${on ? 'ON' : 'OFF'}`;
  const btn = el('button', {
    class: `debug-toggle ${cls}${get() ? ' on' : ''}`.trim(),
    onclick: () => sync(btn, flip()),
  }, text(get()));
  const sync = (b, on) => { b.classList.toggle('on', !!on); b.textContent = text(on); };
  btn.sync = () => sync(btn, get());
  return btn;
}

// A button that opens a panel under itself: build() -> the panel element.
export function panelToggle(label, cls, build) {
  let panel = null;
  const btn = el('button', {
    class: `debug-toggle ${cls}`,
    onclick: () => {
      if (panel) { panel.remove(); panel = null; btn.classList.remove('on'); return; }
      panel = build();
      btn.after(panel); // in the corner column: right below
      btn.classList.add('on');
    },
  }, label);
  return btn;
}

// A group's small heading inside the menu (0.00242).
export const menuHead = (label) => el('div', { class: 'menu-head' }, label);

// The corner (0.00242, the owner's call — the column had grown to seven
// buttons): one ☰ SETTINGS button whose menu drops down under it, closed by
// a click anywhere else (the click that closes it does nothing else, so it
// never strikes a card underneath). `lead` buttons sit beside SETTINGS and
// stay out of the menu (FULLSCREEN, an icon). A phone shows the same menu
// as ☰ alone (styles.css section 16; 0.00208 folded it there first).
export function cornerBar(items, lead = []) {
  const bar = el('div', { class: 'corner-bar' });
  const setOpen = (on) => { bar.classList.toggle('open', on); menu.classList.toggle('on', on); };
  const menu = el('button', { class: 'debug-toggle menu-toggle', 'aria-label': 'Settings', onclick: () => setOpen(!bar.classList.contains('open')) },
    el('span', { class: 'menu-icon' }, '☰'), el('span', { class: 'menu-label' }, 'Settings'));
  bar.append(el('div', { class: 'corner-top' }, ...lead.filter(Boolean), menu), ...items.filter(Boolean));
  document.addEventListener?.('click', (e) => { // (capture: the click that closes the menu must not also strike a card underneath)
    if (bar.classList.contains('open') && !bar.contains?.(e.target)) { setOpen(false); e.stopPropagation?.(); e.preventDefault?.(); }
  }, true);
  return bar;
}
