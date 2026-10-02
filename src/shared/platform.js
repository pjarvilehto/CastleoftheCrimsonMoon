// shared/platform.js — what kind of device this is (0.125; 0.00205: tablets
// play). A handheld is a touch device by its user agent (iPadOS says
// "Macintosh" but has touch points); phone or tablet is the SCREEN's size:
// the longer side under TABLET_MIN_PX is a phone (390x844, 412x915), at or
// over it a tablet (768x1024 and up). Both play sideways (styles.css
// .rotate-notice in portrait); a phone gets the phone layout (PHONE_MQ: the
// styles.css phone layer and hubScene's phone assembly agree on it) and the
// play / install gate (ui/phoneGate.js, 0.00208 — the "not supported"
// notice from 0.125 is gone). ?desktop skips the check (testers, the
// headless checks).

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i;
export const TABLET_MIN_PX = 1000; // the screen's longer side, CSS px (a layout breakpoint, like the stylesheet's)

// A touch handheld of any size (phone or tablet), by user agent.
export function isMobile(nav = globalThis.navigator, search = globalThis.location?.search ?? '') {
  if (new URLSearchParams(search).has('desktop')) return false;
  if (!nav) return false;
  if (nav.userAgentData?.mobile) return true;
  const ua = String(nav.userAgent ?? '');
  if (MOBILE_UA.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

// 'desktop' | 'tablet' | 'phone'
export function deviceClass(nav = globalThis.navigator, scr = globalThis.screen, search = globalThis.location?.search ?? '') {
  if (!isMobile(nav, search)) return 'desktop';
  const longer = Math.max(Number(scr?.width) || 0, Number(scr?.height) || 0);
  return longer >= TABLET_MIN_PX ? 'tablet' : 'phone';
}
export const isPhone = (...args) => deviceClass(...args) === 'phone';

// The phone layout (0.00208): a sideways screen under 500px tall — the
// iPhone and Android phone, never a tablet (an iPad mini is 744 sideways).
// styles.css's phone layer sits under the same query (a smoke check keeps
// the two in step); hubScene builds its phone assembly when it matches.
export const PHONE_MQ = '(max-height: 500px) and (orientation: landscape)';
export function phoneLayout(mm = globalThis.matchMedia) {
  return typeof mm === 'function' ? !!mm(PHONE_MQ)?.matches : false;
}

// Opened from the home screen (the manifest's fullscreen app, 0.00205) —
// no browser bars, so the play / install gate has nothing to offer.
export function standaloneApp(mm = globalThis.matchMedia, nav = globalThis.navigator) {
  if (nav?.standalone) return true; // iOS Safari's own flag
  return typeof mm === 'function' && ['fullscreen', 'standalone', 'minimal-ui'].some((m) => !!mm(`(display-mode: ${m})`)?.matches);
}
