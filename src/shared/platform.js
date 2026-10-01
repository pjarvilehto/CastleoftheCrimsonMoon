// shared/platform.js — is this a phone or tablet? (0.125) The game is
// built for a keyboard and a landscape screen; on mobile, main.js shows a
// "not supported yet" notice instead of booting. ?desktop in the URL skips
// the check (testing, or a tablet with a keyboard).
//
// Signals, any one of which counts: the browser's own answer
// (navigator.userAgentData.mobile, Chromium), a phone/tablet user agent,
// or iPadOS — which reports itself as a Mac, but a Mac has no touch screen.

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i;

export function isMobile(nav = globalThis.navigator, search = globalThis.location?.search ?? '') {
  if (new URLSearchParams(search).has('desktop')) return false;
  if (!nav) return false;
  if (nav.userAgentData?.mobile) return true;
  const ua = String(nav.userAgent ?? '');
  if (MOBILE_UA.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}
