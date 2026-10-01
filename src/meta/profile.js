// meta/profile.js — the persistent player profile (meta state).
// Owns coins, XP, permanent stat levels, equipment, records.

import { loadProfile, saveProfile, wipeProfile, exportProfile, importProfile } from './storage.js';
import { DATA } from '../shared/data.js';
import { emptyEquipment, equippedItemIds, equipItems } from './equipment.js';
import { newPlayerId } from './history.js';

const DEFAULTS = {
  coins: 0,
  xp: 0,
  stats: { power: 0, vitality: 0, fortune: 0, precision: 0, endurance: 0 },
  alchemy: { potency: 0, efficiency: 0, infusion: 0 },
  forged: {}, // itemId -> enhancement level (The Forge)
  equipment: null, // filled below; one item per slot (see meta/equipment.js)
  // 0.080: potions persist between runs (unused ones come home at run end)
  // and are capped by the satchel; alchemy sells potions and satchel room.
  potions: 2,
  potionCap: 4,
  records: { kills: 0, bestRoom: 0, runs: 0, deaths: 0 },
  history: [], // 0.095: one record per finished run (meta/history.js)
  name: '',     // 0.109: what the player calls themselves (title screen prompt; analytics)
};

function startingEquipment() {
  const eq = emptyEquipment();
  eq.weapon = 'rusty_sword';
  eq.armor = 'oak_shield';
  return eq;
}

let profile = null;

export function getProfile() {
  if (!profile) {
    profile = { ...structuredClone(DEFAULTS), ...(loadProfile() || {}) };
    migrateProfile(profile);
  }
  return profile;
}

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

function migrateProfile(p) {
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
  migrateProfile(profile);
  persist();
  return true;
}

// Wipe the save and reset the in-memory profile to a fresh start. The
// same person keeps their id and name (analytics, 0.095 / 0.109).
export function resetProfile() {
  const id = profile?.playerId;
  const name = profile?.name ?? '';
  wipeProfile();
  profile = { ...structuredClone(DEFAULTS), saveVersion: SAVE_VERSION, playerId: id ?? newPlayerId(), name };
  profile.equipment = startingEquipment();
  const pc = DATA.difficulty.potions ?? {};
  profile.potions = pc.startCount ?? profile.potions;
  profile.potionCap = pc.startCap ?? profile.potionCap;
  persist();
}

// Player names (0.109): trimmed, inner whitespace collapsed, no control
// characters, at most NAME_MAX characters.
export const NAME_MAX = 20;
export function cleanName(n) {
  return String(n ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

export function setPlayerName(n) {
  const p = getProfile();
  p.name = cleanName(n);
  persist();
  return p.name;
}

// Character level: one per five trained discipline levels (shown on the
// combat card and in the Great Hall, 0.080).
export function playerLevel(p = getProfile()) {
  const s = p.stats;
  return 1 + Math.floor(((s.power ?? 0) + (s.vitality ?? 0) + (s.fortune ?? 0)
    + (s.precision ?? 0) + (s.endurance ?? 0)) / 5);
}

// ---- derived combat stats (base + permanent levels + gear) ----

// Breakthroughs: every 5th trained level in a discipline counts double.
// Level 12 therefore lands as 14 effective levels.
export function trainedLevel(p, stat) {
  const lvl = p.stats[stat] ?? 0;
  const every = DATA.difficulty.breakthroughEvery ?? 5;
  return lvl + Math.floor(lvl / every);
}

// The Forge: an equipped item's stats scale by (1 + boost*level).
export function itemWithForge(id, p = getProfile()) {
  const base = DATA.items[id];
  if (!base) return null;
  const lvl = p.forged?.[id] ?? 0;
  if (!lvl) return base;
  const mult = 1 + (DATA.difficulty.forge?.statBoostPerLevel ?? 0.2) * lvl;
  const boosted = { ...base, forgeLvl: lvl };
  for (const k of ['dmg', 'armor', 'hp', 'thorns']) if (boosted[k]) boosted[k] = Math.round(boosted[k] * mult);
  for (const k of ['crit', 'lifesteal', 'dodge']) if (boosted[k]) boosted[k] *= mult;
  return boosted;
}

// Player base stats + per-level gains (difficulty.json `player`, 0.078).
const P = () => DATA.difficulty.player ?? {};

// Diminishing returns (0.112): `perLevel` for each of the first `linear`
// levels, then every further level closes a share of the remaining gap to
// `max` — each level still adds something, a little less than the one
// before, and the total never passes `max`. (Efficiency used to hit a hard
// cap at level 5 and keep charging for nothing.)
// Without a `rate`, the taper is smooth: its first step equals `perLevel`
// and every later one shrinks by the same ratio (no cliff after `linear`).
export function taper(level, { perLevel = 0, linear = 0, max = 0, rate } = {}) {
  const L = Math.max(0, level);
  const head = perLevel * Math.min(L, linear);
  if (L <= linear) return head;
  const gap = Math.max(0, max - perLevel * linear);
  const r = rate ?? Math.min(1, gap > 0 ? perLevel / gap : 1);
  return head + gap * (1 - (1 - r) ** (L - linear));
}

// Precision -> crit chance (0.062 bands; 0.112 a taper in difficulty.json
// player.precisionTaper — the bands fell to +0.1%/level after 30 levels,
// worth ~1/5 of Power for the same XP in tools/stat-study.mjs).
export function precisionCrit(lvl) {
  return taper(lvl, P().precisionTaper ?? { perLevel: 0.03, linear: 10, max: 0.5 });
}

export function derivedStats(p = getProfile()) {
  const gear = equippedItemIds(p.equipment).map((id) => itemWithForge(id, p)).filter(Boolean);
  const gearDmg = gear.reduce((s, g) => s + (g.dmg || 0), 0);
  const gearArmor = gear.reduce((s, g) => s + (g.armor || 0), 0);
  const gearHp = gear.reduce((s, g) => s + (g.hp || 0), 0);
  const lifesteal = gear.reduce((s, g) => s + (g.lifesteal || 0), 0);
  const pl = P();
  const crit = (pl.baseCrit ?? 0.05) + precisionCrit(trainedLevel(p, 'precision')) + gear.reduce((s, g) => s + (g.crit || 0), 0);
  const critCap = pl.critCap ?? 0.6;

  // T4 relic powers
  const dodge = Math.min(pl.dodgeCap ?? 0.35, gear.reduce((s, g) => s + (g.dodge || 0), 0));
  const thorns = gear.reduce((s, g) => s + (g.thorns || 0), 0);
  const heavyCdMax = Math.max(1, (pl.baseHeavyCd ?? 3) - gear.reduce((s, g) => s + (g.heavyCd || 0), 0));
  const revive = gear.some((g) => g.revive);

  return {
    // 0.072: hpPerVitality was 12 — HP stacking out-scaled everything
    maxHp: (pl.baseHp ?? 400) + trainedLevel(p, 'vitality') * (pl.hpPerVitality ?? 90) + gearHp,
    dmg: (pl.baseDmg ?? 6) + trainedLevel(p, 'power') * (pl.dmgPerPower ?? 3) + gearDmg,
    armor: trainedLevel(p, 'endurance') * (pl.armorPerEndurance ?? 10) + gearArmor,
    crit: Math.min(critCap, crit),
    // 0.112: crit chance past the cap isn't lost — it becomes crit damage
    // (critOverflowDamage x the excess, added to the crit multiplier)
    critBonus: Math.max(0, crit - critCap) * (pl.critOverflowDamage ?? 1.5),
    lifesteal,
    dodge,
    thorns,
    heavyCdMax,
    revive,
    potions: p.potions,
    potionCap: p.potionCap,
  };
}
