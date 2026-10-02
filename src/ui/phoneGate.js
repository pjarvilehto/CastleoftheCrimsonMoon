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
// behind the browser's bars by accident. The gate is the audio gesture too.

import { el } from '../core/dom.js';
import { standaloneApp } from '../shared/platform.js';

let installPrompt = null; // the browser's deferred install prompt (Chromium only)
let installed = false;
globalThis.addEventListener?.('beforeinstallprompt', (e) => { e.preventDefault?.(); installPrompt = e; });
globalThis.addEventListener?.('appinstalled', () => { installed = true; installPrompt = null; });

const fullscreenOn = (d = document) => !!(d.fullscreenElement || d.webkitFullscreenElement);
const canFullscreen = (d = document) => !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
const isIos = (nav = globalThis.navigator) => /iPhone|iPod/.test(String(nav?.userAgent ?? '')) || (/Macintosh/.test(String(nav?.userAgent ?? '')) && (nav?.maxTouchPoints ?? 0) > 1);

// Request the full screen and the landscape lock; never throws (denied,
// unavailable, or a browser without the orientation API).
export async function goFullscreen(d = document, scr = globalThis.screen) {
  try {
    const root = d.documentElement;
    await (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root);
    await scr?.orientation?.lock?.('landscape');
  } catch { /* fine: the game plays windowed */ }
}

// Mount the gate over the page; resolves when the player taps PLAY. onPlay
// runs on that tap (the audio gesture); the overlay fades off.
export function phoneGate({ onPlay = () => {}, doc = document, nav = globalThis.navigator } = {}) {
  if (standaloneApp()) { onPlay(); return Promise.resolve(false); }
  const ios = isIos(nav), fs = canFullscreen(doc);
  return new Promise((resolve) => {
    const play = el('button', { class: 'primary active', onclick: () => { if (fs) goFullscreen(doc); done(); } }, 'Play');
    const install = installPrompt && !installed ? el('button', { onclick: async () => {
      try { installPrompt.prompt(); const r = await installPrompt.userChoice; if (r?.outcome === 'accepted') installed = true; } catch { /* no sheet */ }
      installPrompt = null; render();
    } }, 'Install the game') : null;
    const hint = installed ? 'The castle is on your home screen — open it from there for the full screen.'
      : ios ? 'For the full screen: tap Share, then Add to Home Screen — or aA, then Hide Toolbar.'
      : fs ? 'Play goes full screen. Install for a home-screen icon that always does.'
      : 'Add the castle to your home screen for the full screen.';
    const card = el('div', { class: 'panel gate-card' });
    const overlay = el('div', { class: 'phone-gate', role: 'dialog', 'aria-label': 'Play' }, card);
    function render() {
      card.innerHTML = '';
      card.append(el('h1', {}, 'CASTLE OF THE CRIMSON MOON'), el('p', { class: 'mobile-sub' }, hint), el('div', { class: 'btn-row' }, play, install));
    }
    function done() { onPlay(); overlay.remove(); resolve(true); }
    render();
    doc.body.append(overlay);
  });
}

// After the first PLAY: Android's back gesture leaves fullscreen — the card
// returns (a second tap goes back in). Not on iOS: there is no fullscreen to
// leave. Returns the unhook.
export function regateOnExit(doc = document, nav = globalThis.navigator) {
  if (isIos(nav) || !canFullscreen(doc) || standaloneApp()) return () => {};
  let open = false;
  const onChange = () => { if (!fullscreenOn(doc) && !open) { open = true; phoneGate({ doc, nav }).then(() => { open = false; }); } };
  doc.addEventListener?.('fullscreenchange', onChange);
  doc.addEventListener?.('webkitfullscreenchange', onChange);
  return () => { doc.removeEventListener?.('fullscreenchange', onChange); doc.removeEventListener?.('webkitfullscreenchange', onChange); };
}
