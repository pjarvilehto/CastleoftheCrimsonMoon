// shared/prefs.js — this browser's settings (0.115): music/sound on-off,
// volumes, the music score, ?debug tuning. One place that touches
// localStorage for them, and never throws — private mode, blocked or full
// storage just means the setting isn't remembered. (The save itself goes
// through meta/storage.js.)

const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function getPref(key, fallback = null) {
  try {
    const v = store()?.getItem(key);
    return v === null || v === undefined ? fallback : v;
  } catch { return fallback; }
}

export function setPref(key, value) {
  try { store()?.setItem(key, String(value)); return true; } catch { return false; }
}

export function removePref(key) {
  try { store()?.removeItem(key); } catch { /* nothing to forget */ }
}

export function getJsonPref(key, fallback = null) {
  try { const v = JSON.parse(getPref(key, 'null')); return v ?? fallback; } catch { return fallback; }
}

export const setJsonPref = (key, value) => setPref(key, JSON.stringify(value));

// An on/off setting remembered as '1' / '0' (0.00223: the music, the sound
// effects and the narrator each carried a copy of this). Closures, no
// `this`, so a detached toggle works; `on` as a getter for terse reads.
export function mutePref(key) {
  let on = getPref(key) === '1';
  const set = (v) => { on = !!v; setPref(key, on ? '1' : '0'); return on; };
  return { get on() { return on; }, get: () => on, set, toggle: () => set(!on) };
}
