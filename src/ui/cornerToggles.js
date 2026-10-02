// ui/cornerToggles.js — the upper-right column (0.115): MUSIC, FULLSCREEN,
// SOUND, NARRATOR, VOLUME, CHANGELIST, plus the ?debug tools below them. One
// flex column (.corner-bar), so adding a button is one line here — no
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

// The column itself: items in order, falsy ones skipped. On a phone
// (0.00208, styles.css's phone layer) the column is folded: only the ☰
// button shows, and a tap opens the rest as a dropdown under it
// (.corner-bar.open); a tap anywhere else closes it.
export function cornerBar(items) {
  const bar = el('div', { class: 'corner-bar' });
  const menu = el('button', { class: 'menu-toggle', 'aria-label': 'Menu', onclick: () => bar.classList.toggle('open') }, '☰');
  bar.append(menu, ...items.filter(Boolean));
  document.addEventListener?.('click', (e) => { if (bar.classList.contains('open') && !bar.contains?.(e.target)) bar.classList.remove('open'); });
  return bar;
}
