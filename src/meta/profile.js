// meta/profile.js — the persistent player profile (meta state): coins,
// XP, permanent stat levels, equipment, records; its lifecycle (load, new,
// reset, import/export) and saving. 0.116: the save's version steps live in
// meta/migrations.js, what the profile adds up to (derived combat stats,
// level, taper) in meta/stats.js, names in meta/names.js.

import { loadProfile, saveProfile, wipeProfile, exportProfile, importProfile } from './storage.js';
import { DATA } from '../shared/data.js';
import { startingEquipment } from './equipment.js';
import { newPlayerId } from './history.js';
import { SAVE_VERSION, migrateProfile } from './migrations.js';
import { cleanName, NAME_MAX } from './names.js';

export { SAVE_VERSION, cleanName, NAME_MAX };

const DEFAULTS = {
  coins: 0,
  xp: 0,
  stats: { power: 0, vitality: 0, fortune: 0, precision: 0, endurance: 0 },
  alchemy: { potency: 0, efficiency: 0, infusion: 0 },
  forged: {}, // itemId -> enhancement level (The Forge)
  equipment: null, // one item per slot (meta/equipment.js); freshProfile fills it
  // 0.080: potions persist between runs (unused ones come home at run end)
  // and are capped by the satchel; alchemy sells potions and satchel room.
  // (Kept at 2/4: the 0.080 migration reads them for saves that predate
  // potions. A new profile takes potions.startCount/startCap from the data.)
  potions: 2,
  potionCap: 4,
  records: { kills: 0, bestRoom: 0, runs: 0, deaths: 0 },
  history: [], // 0.095: one record per finished run (meta/history.js)
  name: '',     // 0.109: what the player calls themselves (title screen prompt; analytics)
};

let profile = null;

// A brand-new profile at the current save version (0.116: new players used
// to start as a "version 0" save and run every migration). The same person
// keeps their id and name through a reset (analytics, 0.095 / 0.109).
function freshProfile(playerId = newPlayerId(), name = '') {
  const pc = DATA.difficulty.potions;
  return {
    ...structuredClone(DEFAULTS), saveVersion: SAVE_VERSION, playerId, name,
    equipment: startingEquipment(), potions: pc.startCount, potionCap: pc.startCap,
  };
}

export function getProfile() {
  if (!profile) {
    const saved = loadProfile();
    if (saved) {
      profile = { ...structuredClone(DEFAULTS), ...saved };
      migrateProfile(profile, DEFAULTS);
    } else profile = freshProfile();
  }
  return profile;
}

export function persist() {
  saveProfile(profile);
}

// ---- save transfer (title screen) ----

export function exportSave() {
  persist(); // flush in-memory state so the code is current
  return exportProfile();
}

// Accept a pasted save code. On success the in-memory profile is
// replaced (merged over defaults, migrated) and persisted.
export function importSave(code) {
  const data = importProfile(code);
  if (!data) return false;
  profile = { ...structuredClone(DEFAULTS), ...data };
  migrateProfile(profile, DEFAULTS);
  persist();
  return true;
}

// Wipe the save and start over (same id and name).
export function resetProfile() {
  const id = profile?.playerId;
  const name = profile?.name ?? '';
  wipeProfile();
  profile = freshProfile(id ?? newPlayerId(), name);
  persist();
}

export function setPlayerName(n) {
  const p = getProfile();
  p.name = cleanName(n);
  persist();
  return p.name;
}
