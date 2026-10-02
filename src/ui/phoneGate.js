// ui/phoneGate.js — the phone's way in (0.00208). A phone in a browser tab
// gets one card before the title: PLAY, and the way to the full screen.
// Android (Chrome, Samsung Internet, Edge, Firefox): PLAY requests page
// fullscreen and locks landscape (only possible once fullscreen), and when
// the browser offered to install (beforeinstallprompt, caught at module
// load — it fires before boot is done), INSTALL opens the system's sheet;
// the installed app is fullscreen and landscape by the manifest. iPhone
// Safari has no page fullscreen and no install API for anything but a
// video: the card says how (Share → Add to Home Screen, or aA → Hide
// Toolbar) and PLAY just goes on. Opened from the home screen
// (standaloneApp) there is no card at all. Leaving fullscreen on Android
// (the back gesture) brings the card back, so the game is never played
// behind the browser's bars by accident. 0.00209: a dialog like every
// other (ui/dialog.js — the key trap, anyDialogOpen, closeAllDialogs; the
// gate used to let Space reach Descend underneath), and onPlay is the
// moment of the first gesture: main.js resumes the audio there.

import { el } from '../core/dom.js';
import { openDialog } from './dialog.js';
import { standaloneApp, isIos, canFullscreen, fullscreenOn, enterFullscreen } from '../shared/platform.js';

let installPrompt = null; // the browser's deferred install prompt (Chromium only)
let installed = false;
globalThis.addEventListener?.('beforeinstallprompt', (e) => { e.preventDefault?.(); installPrompt = e; });
globalThis.addEventListener?.('appinstalled', () => { installed = true; installPrompt = null; });

// The full screen and the landscape lock (only possible once fullscreen);
// never throws — a browser without the orientation API just stays as it is.
export async function goFullscreen(d = globalThis.document, scr = globalThis.screen) {
  await enterFullscreen(d);
  try { await scr?.orientation?.lock?.('landscape'); } catch { /* not lockable here */ }
}

// Mount the gate; resolves true when the player taps PLAY (false at once
// for a home-screen app, with onPlay still run — the game goes straight on).
export function phoneGate({ onPlay = () => {}, doc = globalThis.document, nav = globalThis.navigator } = {}) {
  if (standaloneApp(undefined, nav)) { onPlay(); return Promise.resolve(false); }
  const ios = isIos(nav), fs = canFullscreen(doc);
  return new Promise((resolve) => {
    const play = el('button', { class: 'primary active', proceed: true, onclick: () => { if (fs) goFullscreen(doc); onPlay(); dlg.close(); } }, 'Play');
    const card = el('div');
    const render = () => { // (INSTALL and the hint are rebuilt each time: after an install the card says so, and a used prompt is gone)
      const install = installPrompt && !installed ? el('button', { onclick: async () => {
        const prompt = installPrompt; installPrompt = null;
        try { prompt.prompt(); if ((await prompt.userChoice)?.outcome === 'accepted') installed = true; } catch { /* no sheet */ }
        render();
      } }, 'Install the game') : null;
      const hint = installed ? 'The castle is on your home screen — open it from there for the full screen.'
        : ios ? 'For the full screen: tap Share, then Add to Home Screen, and play from the icon.' // (0.00216: no "aA, then Hide Toolbar" — that menu is Safari's own, and the owner tested in Brave)
        : install ? 'Play goes full screen. Install for a home-screen icon that always does.'
        : fs ? 'Play goes full screen.'
        : 'Add the castle to your home screen for the full screen.';
      card.innerHTML = '';
      card.append(el('h1', {}, 'CASTLE OF THE CRIMSON MOON'), el('p', { class: 'mobile-sub' }, hint), el('div', { class: 'btn-row' }, play, install));
    };
    render();
    const dlg = openDialog({ label: 'Play', children: [card], overlayClass: 'phone-gate', modalClass: 'panel gate-card', proceed: play, onClose: () => resolve(true) });
  });
}

// After the first PLAY: Android's back gesture leaves fullscreen — the card
// returns (a second tap goes back in). Not on iOS (no fullscreen to leave)
// and not for a home-screen app. Returns the unhook.
export function regateOnExit(doc = globalThis.document, nav = globalThis.navigator) {
  if (isIos(nav) || !canFullscreen(doc) || standaloneApp(undefined, nav)) return () => {};
  let open = false;
  const onChange = () => { if (!fullscreenOn(doc) && !open) { open = true; phoneGate({ doc, nav }).then(() => { open = false; }); } };
  doc.addEventListener?.('fullscreenchange', onChange);
  doc.addEventListener?.('webkitfullscreenchange', onChange);
  return () => { doc.removeEventListener?.('fullscreenchange', onChange); doc.removeEventListener?.('webkitfullscreenchange', onChange); };
}
