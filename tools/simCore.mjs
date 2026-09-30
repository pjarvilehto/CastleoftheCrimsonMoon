// tools/simCore.mjs — the balance simulator's engine (split out of
// simulate.mjs in 0.091 so tools/shrine-study.mjs can reuse it). Drives
// the REAL game code (src/run/*, src/meta/*) with no DOM: a bot plays
// runs and spends in the hub; policies are pluggable.
//
//   const sim = await loadSim();
//   withSeed(7, () => { sim.fresh(); const rec = sim.playRun({ agg }); sim.spendInHub(agg); });
//
// Policies (playRun options):
//   shrine:  'priority' (default: best affordable boon, SHRINE_PRIORITY)
//            | 'none' (always walk away) | '<boon id>' (FORCE that boon:
//            it's taken whenever affordable, as if the shrine offered it)
//   tactic:  boss rooms with summons (0.092): 'suggested' (default: heavy on
//            the front summon, regular attacks on the boss) | 'boss' (ignore
//            summons) | 'summons' (clear summons first)
//   retreat: false (default: push until death — measures survival)
//            | true (bank the run after a cleared room when it's risky:
//              HP < 35% with no potions, or right after a boss at < 60%)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Standalone shims (the smoke suite provides its own richer versions) ──
if (!globalThis.localStorage) {
  const s = {};
  globalThis.localStorage = {
    getItem: (k) => s[k] ?? null,
    setItem: (k, v) => { s[k] = v; },
    removeItem: (k) => { delete s[k]; },
  };
}
// Node 20+ has a global fetch (undici) that rejects the game's relative
// asset URLs — always replace it with a file loader rooted at the repo.
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => JSON.parse(readFileSync(join(ROOT, String(url).split('?')[0]), 'utf8')),
});

// ── Deterministic RNG (mulberry32) ──
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Run fn with Math.random replaced by a seeded stream (restored after).
export function withSeed(seed, fn) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = orig; }
}

export const SHRINE_PRIORITY = ['quicken', 'leech', 'bulwark', 'secondwind', 'dmg', 'crit', 'armor', 'greed', 'glasscannon'];
export const STAT_PRIORITY = ['vitality', 'power', 'endurance', 'precision', 'fortune'];
export const ALCHEMY_PRIORITY = ['potency', 'infusion', 'efficiency'];

export function newAgg() {
  return {
    runs: [], depths: [],
    deathRooms: {}, deathKinds: {}, deathBy: {}, // room number / kind / enemy id -> deaths
    itemsByTier: { 1: 0, 2: 0, 3: 0, 4: 0 },
    relicRooms: [], relicGateViolations: 0,
    potionsDrunk: 0, potionsFound: 0,
    shrinesTaken: 0, shrineRoomsSeen: 0, boonsTaken: {},
    heavyUses: 0, attacks: 0, turns: 0, combatRooms: 0,
    bossSeen: {}, bossBeaten: {},                // boss room -> count
    retreats: 0,
    dmgTakenByBand: {},
    xpSpent: {}, coinsSpent: { potions: 0, satchel: 0, alchemy: 0, forge: 0 },
    bankedByRun: [], statLevelsByRun: [],
  };
}

const band = (n) => (n <= 5 ? '1-5' : n <= 10 ? '6-10' : n <= 15 ? '11-15' : n <= 20 ? '16-20' : '21+');

export async function loadSim() {
  const { loadData, DATA } = await import('../src/shared/data.js');
  if (!DATA.difficulty) await loadData();
  const profile = await import('../src/meta/profile.js');
  const lv = await import('../src/meta/leveling.js');
  const rs = await import('../src/run/runState.js');
  const cb = await import('../src/run/combat.js');
  const sh = await import('../src/run/shrine.js');
  const noop = () => {};
  const P = () => profile.getProfile();

  function takeShrine(run, policy, agg) {
    agg.shrineRoomsSeen += 1;
    let pick = null;
    if (policy === 'priority') {
      const dealt = sh.dealOffers(); // the game's own deal
      pick = SHRINE_PRIORITY.map((id) => dealt.find((o) => o.id === id)).find((o) => o && sh.canAffordOffer(run, o));
    } else if (policy !== 'none') {
      const o = DATA.shrines.offers.find((x) => x.id === policy);
      if (!o) throw new Error(`unknown boon ${policy}`);
      pick = sh.canAffordOffer(run, o) ? o : null;
    }
    if (pick) {
      sh.acceptOffer(run, pick);
      agg.shrinesTaken += 1;
      agg.boonsTaken[pick.id] = (agg.boonsTaken[pick.id] ?? 0) + 1;
    }
    return pick?.id ?? null;
  }

  // Who the bot hits this turn.
  function target(combat, heavy, tactic) {
    const alive = (f) => combat.enemies.findIndex((e) => e.hp > 0 && f(e));
    const summon = alive((e) => e.summoned);
    const main = alive((e) => !e.summoned);
    if (tactic === 'summons' && summon >= 0) return summon;
    if (tactic === 'suggested' && heavy) return cb.heavyTarget(combat);
    return main >= 0 ? main : summon;
  }

  function playRun({ agg = newAgg(), shrine = 'priority', retreat = false, tactic = 'suggested' } = {}) {
    const t4MinRoom = DATA.difficulty.t4MinRoom ?? 11;
    const run = rs.createRun();
    const rec = { depth: 0, kills: 0, coins: 0, xp: 0, relics: 0, outcome: 'death', boon: null, shrineRoom: null, bossesBeaten: 0, killedBy: null };
    let lastHitter = null;
    for (;;) {
      const room = rs.enterNextRoom(run);
      if (room.kind === 'shrine') {
        const boon = takeShrine(run, shrine, agg);
        if (rec.shrineRoom === null) { rec.shrineRoom = room.number; rec.boon = boon; } // the run's FIRST shrine
        rec.depth = run.roomNumber;
        continue;
      }
      const combat = cb.createCombat(run, room);
      agg.combatRooms += 1;
      if (room.isBoss) agg.bossSeen[room.number] = (agg.bossSeen[room.number] ?? 0) + 1;
      while (!combat.over) {
        if (run.potions > 0 && run.hp / run.maxHp < 0.4 && rs.drinkPotion(run)) agg.potionsDrunk += 1;
        const heavy = cb.canHeavy(combat);
        const idx = target(combat, heavy, tactic);
        if (heavy) { cb.useHeavy(combat); agg.heavyUses += 1; }
        agg.attacks += 1;
        agg.turns += 1;
        for (const ev of cb.playerAttack(combat, idx, heavy)) {
          if (ev.type === 'kill' && ev.enemy) {
            const potionsBefore = run.potions;
            const drop = rs.applyLoot(run, ev.enemy, noop);
            if (run.potions > potionsBefore) agg.potionsFound += 1;
            if (drop.itemId && !drop.kept) agg.salvagedOnSpot = (agg.salvagedOnSpot ?? 0) + 1;
            for (const id of drop.itemId ? [drop.itemId] : []) {
              const tier = DATA.items[id].tier;
              agg.itemsByTier[tier] += 1;
              if (tier === 4) {
                rec.relics += 1;
                agg.relicRooms.push(run.roomNumber);
                if (run.roomNumber < t4MinRoom) agg.relicGateViolations += 1;
              }
            }
          } else if (ev.type === 'summon') {
            agg.summons = (agg.summons ?? 0) + 1;
          } else if (ev.type === 'dmg') {
            lastHitter = combat.enemies[ev.source]?.id ?? null;
            const b = (agg.dmgTakenByBand[band(run.roomNumber)] ||= { taken: 0, hits: 0, zeroHits: 0 });
            b.taken += ev.taken; b.hits += 1;
            if (ev.taken === 0) b.zeroHits += 1;
          }
        }
      }
      rec.depth = run.roomNumber;
      if (!combat.victory) { rec.killedBy = lastHitter; break; }
      if (room.isBoss) { rec.bossesBeaten += 1; agg.bossBeaten[room.number] = (agg.bossBeaten[room.number] ?? 0) + 1; }
      if (retreat && ((run.hp / run.maxHp < 0.35 && run.potions === 0) || (room.isBoss && run.hp / run.maxHp < 0.6))) {
        rec.outcome = 'retreat';
        break;
      }
    }
    rec.kills = run.kills;
    rec.coins = run.coins;
    rec.xp = run.xp;
    rs.settleRun(run, rec.outcome);
    rec.banked = run.coinsRetrieved;
    agg.runs.push(rec);
    agg.depths.push(rec.depth);
    if (rec.outcome === 'death') {
      agg.deathRooms[rec.depth] = (agg.deathRooms[rec.depth] ?? 0) + 1;
      const kind = run.room?.kind ?? 'unknown';
      agg.deathKinds[kind] = (agg.deathKinds[kind] ?? 0) + 1;
      if (rec.killedBy) agg.deathBy[rec.killedBy] = (agg.deathBy[rec.killedBy] ?? 0) + 1;
    } else {
      agg.retreats += 1;
    }
    return rec;
  }

  function spendInHub(agg = newAgg()) {
    const p = P();
    // XP disciplines: round-robin by priority until nothing is affordable.
    for (let guard = 0; guard < 200; guard++) {
      const stat = STAT_PRIORITY.find((s) => lv.canAfford(s));
      if (!stat) break;
      lv.buyStat(stat);
      agg.xpSpent[stat] = (agg.xpSpent[stat] ?? 0) + 1;
    }
    // Coins: potions to the cap, satchel at 2x price, alchemy round-robin
    // (2x reserve), forge equipped T2+ gear (2x reserve).
    const topUp = () => {
      while (!lv.satchelFull(p) && p.coins >= lv.potionCost()) {
        agg.coinsSpent.potions += lv.potionCost();
        lv.restockPotion();
      }
    };
    topUp();
    while (!lv.satchelMaxed(p) && p.coins >= lv.satchelCost(p) * 2) {
      agg.coinsSpent.satchel += lv.satchelCost(p);
      lv.expandSatchel();
      topUp();
    }
    for (let guard = 0; guard < 60; guard++) {
      const track = ALCHEMY_PRIORITY.find((t) => p.coins >= lv.alchemyCost(t) * 2);
      if (!track) break;
      agg.coinsSpent.alchemy += lv.alchemyCost(track);
      lv.trainAlchemy(track);
    }
    const eq = p.equipment;
    for (const id of [eq.weapon, eq.armor, eq.boots, ...(eq.rings ?? []), eq.trinket, eq.amulet].filter(Boolean)) {
      if ((DATA.items[id]?.tier ?? 1) >= 2 && !lv.forgeMaxed(id) && p.coins >= lv.forgeCost(id) * 2) {
        agg.coinsSpent.forge += lv.forgeCost(id);
        lv.forgeItem(id);
      }
    }
    agg.bankedByRun.push(p.coins);
    agg.statLevelsByRun.push({ ...p.stats });
  }

  // Profile snapshots: the study replays many runs from the same profile.
  const snapshot = () => structuredClone(P());
  function restore(snap) {
    const p = P();
    for (const k of Object.keys(p)) delete p[k];
    Object.assign(p, structuredClone(snap));
  }
  const fresh = () => profile.resetProfile();

  return { DATA, playRun, spendInHub, snapshot, restore, fresh, derivedStats: profile.derivedStats, getProfile: P };
}
