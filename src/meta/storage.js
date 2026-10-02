// meta/storage.js — persistence boundary. Nothing outside this file
// touches localStorage, so swapping to a file/API save later is trivial.

const KEY = 'castle-roguelike-profile-v1';

// A refused write (storage full, blocked, strict private mode) must not
// break the game mid-transaction (0.097): the in-memory profile stays
// valid, only this write is lost. Returns whether it saved.
export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // corrupted save -> fresh start, game never crashes
  }
}

export function wipeProfile() {
  try { localStorage.removeItem(KEY); } catch { /* refused storage (0.00197): the fresh profile still takes over in memory */ }
}

// ---- save transfer ----
// The save lives in origin-bound localStorage, so a new deploy URL means
// a fresh save. Export/import moves it: base64-wrapped JSON, portable as
// a copy-paste code string. (unescape/escape pair keeps non-ASCII safe.)

// The in-memory profile, not the stored one: a refused write (above) must
// not hand out a stale code.
export function exportProfile(profile) {
  return profile ? btoa(unescape(encodeURIComponent(JSON.stringify(profile)))) : null;
}

// Parse + lightly validate a save code. Returns the profile object, or
// null on any garbage input — a bad paste must never crash the game.
export function importProfile(code) {
  try {
    const raw = decodeURIComponent(escape(atob(String(code).trim())));
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (typeof data.coins !== 'number' || typeof data.xp !== 'number') return null;
    if (!data.stats || !data.equipment || !data.records) return null;
    return data;
  } catch {
    return null;
  }
}
