#!/usr/bin/env node
// tools/simulate.mjs — headless balance simulator. Drives the REAL game math
// (src/run/*, src/meta/*) without any DOM: a greedy-depth bot plays N full
// runs from a fresh profile, spends its XP/coins in the hub between runs,
// and aggregates where runs end, what they earn, and where the resources go.
// Deterministic with --seed. Flags common balance smells automatically.
//
// Usage:
//   node tools/simulate.mjs                 # 40 runs, seed 1
//   node tools/simulate.mjs --runs 100 --seed 7
//   node tools/simulate.mjs --verbose       # per-run lines
//
// The bot policy (a competent, greedy player):
//   combat:  potion below 40% HP, heavy attack whenever off cooldown,
//            focus the first living enemy, always Push Deeper (death ends
//            every run — this measures the survival curve, not retreat play)
//   shrine:  take the best affordable boon (priority order below)
//   hub XP:  round-robin vitality > power > endurance > precision > fortune
//   hub coins: restock potions to 3, then alchemy round-robin, then forge
//            equipped T2+ gear (keeps a 2x reserve so one buy never bankrupts)

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
if (!globalThis.document) {
  // itemName() builds a span for relic log lines; the sim throws logs away.
  // el() type-checks with `instanceof Node`, so the stub must BE Node.
  class StubEl {
    constructor(tag) {
      this.tagName = tag; this.className = ''; this.textContent = '';
      this.children = []; this.attrs = {}; this.style = {};
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener() {}
    append(...kids) { this.children.push(...kids); }
  }
  globalThis.Node = StubEl;
  globalThis.document = {
    createElement: (tag) => new StubEl(tag),
    createTextNode: (t) => ({ text: t }),
  };
}
// Node 20+ has a global fetch (undici) that rejects the game's relative
// asset URLs — always replace it with a file loader rooted at the repo.
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => JSON.parse(readFileSync(join(ROOT, String(url)), 'utf8')),
});

// ── Deterministic RNG (mulberry32) ──
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHRINE_PRIORITY = ['quicken', 'leech', 'bulwark', 'secondwind', 'dmg', 'crit', 'armor', 'greed', 'glasscannon'];
const STAT_PRIORITY = ['vitality', 'power', 'endurance', 'precision', 'fortune'];
const ALCHEMY_PRIORITY = ['potency', 'infusion', 'efficiency'];

export async function simulate({ runs = 40, seed = 1, verbose = false } = {}) {
  const { loadData, DATA } = await import('../src/shared/data.js');
  if (!DATA.difficulty) await loadData();

  const origRandom = Math.random;
  Math.random = mulberry32(seed);
  try {
    const { getProfile, resetProfile, derivedStats } = await import('../src/meta/profile.js');
    const {
      canAfford, buyStat, restockPotion, potionCost,
      alchemyCost, trainAlchemy, forgeCost, forgeMaxed, forgeItem,
    } = await import('../src/meta/leveling.js');
    const { createRun, enterNextRoom, applyLoot, drinkPotion, settleRun } = await import('../src/run/runState.js');
    const { createCombat, playerAttack, canHeavy, useHeavy } = await import('../src/run/combat.js');
    const { dealOffers, canAffordOffer, acceptOffer } = await import('../src/run/shrine.js');

    resetProfile();
    const p = getProfile();
    const noop = () => {};

    const agg = {
      runs: [],
      depths: [],
      deathRooms: {},            // room number -> deaths
      deathKinds: {},            // room kind -> deaths
      itemsByTier: { 1: 0, 2: 0, 3: 0, 4: 0 },
      relicRooms: [],            // room where each T4 dropped
      relicGateViolations: 0,    // T4 before t4MinRoom — must stay 0
      potionsDrunk: 0,
      potionsFound: 0,
      shrinesTaken: 0,
      shrineRoomsSeen: 0,
      heavyUses: 0,
      attacks: 0,
      dmgTakenByBand: {},        // depth band -> { taken, zeroHits, hits }
      xpSpent: {},               // stat -> levels bought
      coinsSpent: { potions: 0, alchemy: 0, forge: 0 },
      bankedByRun: [],
      statLevelsByRun: [],
    };
    const t4MinRoom = DATA.difficulty.t4MinRoom ?? 11;
    agg.potionDropChance = DATA.difficulty.potionDropChance ?? 0.05;

    function band(roomNumber) {
      return roomNumber <= 5 ? '1-5' : roomNumber <= 10 ? '6-10' : roomNumber <= 15 ? '11-15' : roomNumber <= 20 ? '16-20' : '21+';
    }

    function playOneRun() {
      const run = createRun();
      const rec = { depth: 0, kills: 0, coins: 0, xp: 0, relics: 0, outcome: 'death' };
      while (!run.over) {
        const room = enterNextRoom(run);
        if (room.kind === 'shrine') {
          agg.shrineRoomsSeen += 1;
          const dealt = dealOffers(); // the game's own deal (run/shrine.js)
          const pick = SHRINE_PRIORITY.map((id) => dealt.find((o) => o.id === id))
            .find((o) => o && canAffordOffer(run, o));
          if (pick) { acceptOffer(run, pick); agg.shrinesTaken += 1; }
          continue;
        }
        // combat / boss room
        const combat = createCombat(run, room);
        while (!combat.over) {
          if (run.potions > 0 && run.hp / run.maxHp < 0.4) {
            if (drinkPotion(run)) agg.potionsDrunk += 1;
          }
          const idx = combat.enemies.findIndex((e) => e.hp > 0);
          if (idx === -1) break;
          const heavy = canHeavy(combat);
          if (heavy) { useHeavy(combat); agg.heavyUses += 1; }
          agg.attacks += 1;
          const events = playerAttack(combat, idx, heavy);
          for (const ev of events) {
            if (ev.type === 'kill' && ev.enemy) {
              const before = run.itemsFound.length;
              const potionsBefore = run.potions;
              applyLoot(run, ev.enemy, noop);
              if (run.potions > potionsBefore) agg.potionsFound += 1;
              for (const id of run.itemsFound.slice(before)) {
                const tier = DATA.items[id].tier;
                agg.itemsByTier[tier] += 1;
                if (tier === 4) {
                  rec.relics += 1;
                  agg.relicRooms.push(run.roomNumber);
                  if (run.roomNumber < t4MinRoom) agg.relicGateViolations += 1;
                }
              }
            } else if (ev.type === 'dmg') {
              const b = agg.dmgTakenByBand[band(run.roomNumber)] ||= { taken: 0, hits: 0, zeroHits: 0 };
              b.taken += ev.taken; b.hits += 1;
              if (ev.taken === 0) b.zeroHits += 1;
            }
          }
        }
        rec.depth = run.roomNumber;
        if (!combat.victory) break; // died — run.over set at settle
      }
      rec.kills = run.kills;
      rec.coins = run.coins;
      rec.xp = run.xp;
      const dead = !run.room || run.hp <= 0;
      settleRun(run, dead ? 'death' : 'retreat');
      agg.runs.push(rec);
      agg.depths.push(rec.depth);
      if (dead) {
        const rn = run.roomNumber;
        agg.deathRooms[rn] = (agg.deathRooms[rn] ?? 0) + 1;
        const kind = run.room?.kind ?? 'unknown';
        agg.deathKinds[kind] = (agg.deathKinds[kind] ?? 0) + 1;
      }
      return rec;
    }

    function spendInHub() {
      // XP disciplines: round-robin by priority until nothing is affordable.
      for (let guard = 0; guard < 200; guard++) {
        const stat = STAT_PRIORITY.find((s) => canAfford(s));
        if (!stat) break;
        buyStat(stat);
        agg.xpSpent[stat] = (agg.xpSpent[stat] ?? 0) + 1;
      }
      // Coins: potions to 3, alchemy round-robin, forge equipped T2+ gear.
      while (p.potions < 3 && p.coins >= potionCost()) {
        const c = potionCost();
        restockPotion();
        agg.coinsSpent.potions += c;
      }
      for (let guard = 0; guard < 60; guard++) {
        const track = ALCHEMY_PRIORITY.find((t) => p.coins >= alchemyCost(t) * 2);
        if (!track) break;
        const c = alchemyCost(track);
        trainAlchemy(track);
        agg.coinsSpent.alchemy += c;
      }
      const eq = p.equipment;
      const equipped = [eq.weapon, eq.armor, eq.boots, ...(eq.rings ?? []), eq.trinket, eq.amulet].filter(Boolean);
      for (const id of equipped) {
        if ((DATA.items[id]?.tier ?? 1) >= 2 && !forgeMaxed(id) && p.coins >= forgeCost(id) * 2) {
          const c = forgeCost(id);
          forgeItem(id);
          agg.coinsSpent.forge += c;
        }
      }
      agg.bankedByRun.push(p.coins);
      agg.statLevelsByRun.push({ ...p.stats });
    }

    for (let r = 0; r < runs; r++) {
      const rec = playOneRun();
      if (verbose) {
        console.log(`run ${String(r + 1).padStart(2)}: depth ${String(rec.depth).padStart(2)}, kills ${rec.kills}, coins ${rec.coins}, xp ${rec.xp}, relics ${rec.relics}`);
      }
      spendInHub();
    }
    agg.finalStats = { ...p.stats };
    agg.finalCoins = p.coins;
    agg.finalDerived = derivedStats(p);
    agg.t4MinRoom = t4MinRoom;
    agg.alchemy = { ...p.alchemy };
    return agg;
  } finally {
    Math.random = origRandom;
  }
}

// ── Balance smell detector ──
export function analyze(agg) {
  const flags = [];
  const depths = [...agg.depths].sort((a, b) => a - b);
  const median = depths[Math.floor(depths.length / 2)];
  const mean = depths.reduce((s, d) => s + d, 0) / depths.length;

  if (agg.relicGateViolations > 0) {
    flags.push({ level: 'BUG', text: `${agg.relicGateViolations} T4 relic(s) dropped before room ${agg.t4MinRoom} — the depth gate is broken.` });
  }
  if (median <= 3) flags.push({ level: 'HIGH', text: `Median run dies on room ${median} — the early game walls new profiles.` });
  // Early-game ease is about FRESH profiles: judge by the first 10 runs,
  // before hub training and gear accumulate. Overall median mixes in deep
  // trained runs and would cry wolf.
  const earlyDepths = agg.depths.slice(0, Math.min(10, agg.depths.length)).sort((a, b) => a - b);
  const earlyMedian = earlyDepths[Math.floor(earlyDepths.length / 2)];
  if (earlyMedian >= 12) flags.push({ level: 'MED', text: `Fresh-profile median depth ${earlyMedian} (first 10 runs) — early game may be too easy.` });
  const lastMedian = agg.depths.slice(-10).reduce((s, d) => s + d, 0) / Math.min(10, agg.depths.length);
  if (lastMedian >= 25) flags.push({ level: 'MED', text: `Final-10-runs average depth ${lastMedian.toFixed(1)} — late-game scaling may be outrunning content.` });

  const coinsFinal = agg.bankedByRun.at(-1) ?? 0;
  const alchemyMaxedSoon = Object.values(agg.alchemy).every((l) => l >= 5);
  if (coinsFinal > 2000 && alchemyMaxedSoon) {
    flags.push({ level: 'MED', text: `${coinsFinal} coins banked with alchemy maxed — coin sinks run dry; consider more sinks or pricier tiers.` });
  }
  const potionRatio = agg.potionsDrunk / Math.max(1, agg.potionsDrunk + agg.potionsFound);
  if (potionRatio < 0.4 && agg.potionsDrunk > 5) flags.push({ level: 'LOW', text: `Potions drunk:found = ${potionRatio.toFixed(2)} — healing may be too generous.` });
  if (agg.potionsDrunk > 0 && agg.potionsFound === 0 && agg.coinsSpent.potions === 0) {
    flags.push({ level: 'LOW', text: 'No potions found or bought — potion economy may be invisible.' });
  }

  for (const [b, d] of Object.entries(agg.dmgTakenByBand)) {
    if (d.hits >= 10 && d.zeroHits / d.hits > 0.5) {
      flags.push({ level: 'HIGH', text: `Depth band ${b}: ${(100 * d.zeroHits / d.hits).toFixed(0)}% of enemy hits deal 0 damage — armor is soaking the content.` });
    }
  }
  const trained = Object.keys(agg.xpSpent);
  for (const s of STAT_PRIORITY) {
    if (!trained.includes(s)) flags.push({ level: 'LOW', text: `Discipline '${s}' was never trained — possibly useless or overpriced.` });
  }

  // Relic economy: T4s should be rare, build-defining drops — not a per-run
  // income stream once past the gate.
  const deepRuns = agg.depths.filter((d) => d >= agg.t4MinRoom).length;
  const relicsPerDeepRun = agg.relicRooms.length / Math.max(1, deepRuns);
  if (relicsPerDeepRun > 1) {
    flags.push({ level: 'HIGH', text: `T4 relics average ${relicsPerDeepRun.toFixed(1)} per deep run (${agg.relicRooms.length} total) — top tier isn't rare past the gate. Consider a per-run relic cap or lower t4Chance.` });
  }
  if (agg.itemsByTier[4] > agg.itemsByTier[3] * 0.5 && agg.itemsByTier[4] > 10) {
    flags.push({ level: 'MED', text: `T4 drops (${agg.itemsByTier[4]}) approach T3 volume (${agg.itemsByTier[3]}) — the rarity ladder is inverted at depth.` });
  }

  // Potion economy: drops alone should not sustain a run. Volume scales
  // with kills, so only flag when consumption doesn't outpace the drops.
  const foundPerRun = agg.potionsFound / agg.runs.length;
  if (foundPerRun > 5 && agg.potionsDrunk < agg.potionsFound) {
    const rate = agg.potionDropChance ?? 0.05;
    flags.push({ level: 'MED', text: `${foundPerRun.toFixed(1)} potions found per run (${rate}/kill) and only ${agg.potionsDrunk} drunk vs ${agg.potionsFound} found — drops outpace consumption; buying potions is pointless.` });
  }

  // Shrines: near-100% take rate is expected when every boon carries a real
  // sacrifice (15% max HP, -10% dmg, scaled coins) — a greedy bot always
  // finds one worth taking. Informational unless costs stop scaling.
  if (agg.shrineRoomsSeen >= 5 && agg.shrinesTaken / agg.shrineRoomsSeen > 0.95) {
    flags.push({ level: 'LOW', text: `Shrines taken ${agg.shrinesTaken}/${agg.shrineRoomsSeen} — acceptable since every boon is a sacrifice trade (coin prices scale with depth since 0.072); add a cursed offer if decline should be a real option.` });
  }

  // Bosses should be the spike, not background noise.
  const bossDeaths = agg.deathKinds.boss ?? 0;
  const totalDeaths = Object.values(agg.deathKinds).reduce((s, n) => s + n, 0);
  if (totalDeaths >= 10 && bossDeaths / totalDeaths < 0.1) {
    flags.push({ level: 'LOW', text: `Only ${bossDeaths}/${totalDeaths} deaths at boss rooms — deep trash rooms are deadlier than bosses.` });
  }
  return { flags, median, mean };
}

// ── Report rendering (markdown-ish text) ──
export function renderReport(agg, { runs, seed }) {
  const { flags, median, mean } = analyze(agg);
  const depths = [...agg.depths].sort((a, b) => a - b);
  const lines = [];
  const push = (s = '') => lines.push(s);

  push(`# Balance Simulation — ${runs} runs (seed ${seed})`);
  push();
  push(`## Depth`);
  push(`- median **${median}**, mean **${mean.toFixed(1)}**, min ${depths[0]}, max ${depths.at(-1)}`);
  const buckets = { '1-5': 0, '6-10': 0, '11-15': 0, '16-20': 0, '21+': 0 };
  for (const d of depths) buckets[d <= 5 ? '1-5' : d <= 10 ? '6-10' : d <= 15 ? '11-15' : d <= 20 ? '16-20' : '21+'] += 1;
  push(`- distribution: ${Object.entries(buckets).map(([b, n]) => `${b}: ${n}`).join(' | ')}`);
  const killers = Object.entries(agg.deathRooms).sort((a, b) => b[1] - a[1]).slice(0, 6);
  push(`- top killer rooms: ${killers.map(([r, n]) => `room ${r} ×${n}`).join(', ') || '—'}`);
  push(`- deaths by room kind: ${Object.entries(agg.deathKinds).map(([k, n]) => `${k} ×${n}`).join(', ') || '—'}`);
  push();
  push(`## Earnings (per run)`);
  const avg = (f) => (agg.runs.reduce((s, r) => s + f(r), 0) / agg.runs.length).toFixed(1);
  push(`- coins carried out: avg ${avg((r) => r.coins)} | XP: avg ${avg((r) => r.xp)} | kills: avg ${avg((r) => r.kills)}`);
  push(`- items by tier: T1 ${agg.itemsByTier[1]} | T2 ${agg.itemsByTier[2]} | T3 ${agg.itemsByTier[3]} | T4 ${agg.itemsByTier[4]}`);
  push(`- T4 relic rooms: ${agg.relicRooms.length ? agg.relicRooms.sort((a, b) => a - b).join(', ') : 'none'} (gate: room ${agg.t4MinRoom}+)`);
  push();
  push(`## Hub allocation over ${runs} runs`);
  push(`- XP → disciplines: ${Object.entries(agg.xpSpent).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} +${n}`).join(', ') || 'none'}`);
  push(`- coins → potions ${agg.coinsSpent.potions}c, alchemy ${agg.coinsSpent.alchemy}c, forge ${agg.coinsSpent.forge}c; banked at end: ${agg.bankedByRun.at(-1)}c`);
  push(`- final disciplines: ${Object.entries(agg.finalStats).map(([s, l]) => `${s} ${l}`).join(', ')}`);
  push(`- final alchemy: ${Object.entries(agg.alchemy).map(([t, l]) => `${t} ${l}`).join(', ')}`);
  const d = agg.finalDerived;
  push(`- final derived: ${d.maxHp} HP, ${d.dmg} dmg, ${d.armor} armor, ${(d.crit * 100).toFixed(1)}% crit`);
  // Progression pacing: stat totals + banked coins at quarter marks.
  const marks = [10, 20, 30, 40].filter((m) => m <= agg.statLevelsByRun.length);
  push(`- pacing: ${marks.map((m) => {
    const st = agg.statLevelsByRun[m - 1];
    const tot = Object.values(st).reduce((s, l) => s + l, 0);
    return `run ${m}: ${tot} stat lvls, ${agg.bankedByRun[m - 1]}c banked`;
  }).join(' | ')}`);
  push();
  push(`## Combat texture`);
  push(`- attacks: ${agg.attacks} (heavy ${agg.heavyUses}, ${(100 * agg.heavyUses / Math.max(1, agg.attacks)).toFixed(0)}%)`);
  push(`- potions: drunk ${agg.potionsDrunk}, found ${agg.potionsFound}, bought ${agg.coinsSpent.potions > 0 ? 'yes (see coins)' : 'no'}`);
  push(`- shrines: ${agg.shrinesTaken}/${agg.shrineRoomsSeen} taken`);
  for (const [b, x] of Object.entries(agg.dmgTakenByBand)) {
    push(`- depth ${b}: avg ${(x.taken / Math.max(1, x.hits)).toFixed(1)} dmg/hit over ${x.hits} hits (${(100 * x.zeroHits / Math.max(1, x.hits)).toFixed(0)}% zero-damage)`);
  }
  push();
  push(`## Flags`);
  if (!flags.length) push('- none — no obvious smells');
  for (const f of flags) push(`- [${f.level}] ${f.text}`);
  return lines.join('\n');
}

// ── CLI ──
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : dflt;
  };
  const runs = Number(arg('runs', 40));
  const seed = Number(arg('seed', 1));
  const verbose = process.argv.includes('--verbose');
  const agg = await simulate({ runs, seed, verbose });
  console.log(renderReport(agg, { runs, seed }));
}
