// meta/migrations.js — the save schema's version history (0.079; split
// out of profile.js in 0.116). APPEND-ONLY: testers' saves have already
// been through every shipped step, so a step is never edited — a format
// change bumps SAVE_VERSION and adds a step at the end.

import { DATA } from '../shared/data.js';
import { equipItems, startingEquipment, emptyEquipment } from './equipment.js';
import { newPlayerId } from './history.js';
import { cleanName } from './names.js';

// ---- save schema versioning (0.079) ----
// Every save carries `saveVersion`. Saves from before 0.079 have none and
// count as version 0. On load, MIGRATIONS[v] upgrades a v save to v+1, in
// order, until SAVE_VERSION. To change the save format: bump SAVE_VERSION
// and APPEND a step — never edit a shipped step (testers' saves have
// already been through it). saveVersion is deliberately NOT in DEFAULTS:
// the load merge would stamp it onto old saves and skip their migrations.
export const SAVE_VERSION = 4;

const MIGRATIONS = [
  // v0 -> v1: everything pre-0.079 builds did on every load.
  (p) => {
    // 0.059: stats.alchemy (single track) -> alchemy.potency; the Scribe's
    // xpExchange is gone.
    if (typeof p.stats.alchemy === 'number') {
      p.alchemy.potency = Math.max(p.alchemy.potency, p.stats.alchemy);
      delete p.stats.alchemy;
    }
    // Pre-equipment saves carried a flat inventory: equip the best of it.
    if (!p.equipment) {
      const oldInventory = p.inventory || [];
      p.equipment = startingEquipment();
      const res = equipItems(p, oldInventory); // dupes/weaker gear salvage into coins
      p.coins += res.coins;
      delete p.inventory;
    }
  },
  // v1 -> v2 (0.080): potions became a persistent, capped stock. Old saves
  // held a permanent per-run count (bought at escalating prices) — it
  // becomes the satchel size (clamped to the cap range) and fills it, so
  // no one loses what they paid for. The old price counter is gone.
  (p) => {
    const pc = DATA.difficulty.potions ?? {};
    const lo = pc.startCap ?? 4;
    const hi = pc.maxCap ?? 10;
    const had = Number.isFinite(p.potions) ? p.potions : (pc.startCount ?? 2);
    p.potionCap = Math.min(hi, Math.max(lo, had));
    p.potions = Math.min(had, p.potionCap);
    delete p.potionsBought;
  },
  // v2 -> v3 (0.095): run history + a stable anonymous player id, so the
  // /analytics/ dashboard can tell testers' save codes apart (and replace
  // an older code from the same player). Runs before 0.095 weren't recorded.
  (p) => {
    if (!Array.isArray(p.history)) p.history = [];
    p.playerId ??= newPlayerId();
  },
  // v3 -> v4 (0.109): the player's name — asked once on the title screen.
  (p) => {
    p.name = cleanName(p.name);
  },
];

export function migrateProfile(p, DEFAULTS) {
  // Forward-compat, every load: the top-level merge is shallow, so an old
  // save's nested objects would otherwise shadow DEFAULTS entirely and lack
  // keys added since (new stats, alchemy tracks, records).
  p.stats = { ...structuredClone(DEFAULTS.stats), ...(p.stats || {}) };
  p.alchemy = { ...structuredClone(DEFAULTS.alchemy), ...(p.alchemy || {}) };
  p.records = { ...structuredClone(DEFAULTS.records), ...(p.records || {}) };
  p.forged = { ...(p.forged || {}) };
  // Versioned, one-time steps. A save from a NEWER build (imported code)
  // is left as-is rather than downgraded.
  let v = Number.isInteger(p.saveVersion) ? p.saveVersion : 0;
  while (v < SAVE_VERSION) MIGRATIONS[v++](p);
  p.saveVersion = Math.max(v, SAVE_VERSION);
  // An imported code is not trusted (0.00197; the stats page has
  // sanitizeProfile, the game had nothing): made whole, after the steps
  // (they read a legacy save's own shape) — the gear slots (shape, and
  // every worn id checked against items.json: an unknown one, a retired
  // item or a foreign code, made settleRun and kill loot throw and left
  // the profile half-settled, 0.00223), the numbers (the top-level ones,
  // the stats / alchemy / records tables, the forge levels), the lists.
  p.equipment = { ...emptyEquipment(), ...(p.equipment || {}) };
  if (!Array.isArray(p.equipment.rings) || p.equipment.rings.length !== 2) p.equipment.rings = [null, null];
  const known = (id) => (typeof id === 'string' && Object.hasOwn(DATA.items, id) ? id : null);
  for (const s of Object.keys(p.equipment)) p.equipment[s] = s === 'rings' ? p.equipment.rings.map(known) : known(p.equipment[s]);
  for (const k of ['coins', 'xp', 'potions', 'potionCap', 'potionsBought']) p[k] = Number.isFinite(Number(p[k])) ? Number(p[k]) : DEFAULTS[k];
  for (const t of ['stats', 'alchemy', 'records']) { if (!p[t] || typeof p[t] !== 'object') p[t] = {}; for (const k of Object.keys(DEFAULTS[t])) p[t][k] = Number.isFinite(Number(p[t][k])) ? Number(p[t][k]) : DEFAULTS[t][k]; }
  if (!p.forged || typeof p.forged !== 'object') p.forged = {};
  for (const [id, lvl] of Object.entries(p.forged)) { if (!Object.hasOwn(DATA.items, id) || !Number.isFinite(Number(lvl))) delete p.forged[id]; else p.forged[id] = Number(lvl); }
  for (const k of ['history', 'bench']) if (!Array.isArray(p[k])) p[k] = [];

}
