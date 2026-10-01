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
//   node tools/simulate.mjs --retreat       # bot banks the run when it's risky
//   node tools/simulate.mjs --seeds 1-8     # 8 independent campaigns, mean ± sd
//   (per-boon shrine balance: node tools/shrine-study.mjs)
//
// The bot policy (a competent, greedy player):
//   combat:  potion below 40% HP, heavy attack whenever off cooldown,
//            focus the first living enemy, always Push Deeper (death ends
//            every run — this measures the survival curve, not retreat play)
//   shrine:  take the best affordable boon (priority order below)
//   hub XP:  round-robin vitality > power > endurance > precision > fortune
//   hub coins: restock potions to the satchel cap, expand the satchel when
//              it has 2x the price, then alchemy round-robin, then forge
//            equipped T2+ gear (keeps a 2x reserve so one buy never bankrupts)

import { fileURLToPath } from 'node:url';
import { loadSim, withSeed, newAgg, STAT_PRIORITY } from './simCore.mjs';

// One campaign: a fresh profile plays `runs` runs, spending in the hub
// between them. (Engine + policies live in simCore.mjs since 0.091.)
export async function simulate({ runs = 40, seed = 1, verbose = false, retreat = false, tactic = 'suggested' } = {}) {
  const sim = await loadSim();
  const agg = newAgg();
  const t4MinRoom = sim.DATA.difficulty.t4MinRoom ?? 11;
  agg.potionDropChance = sim.DATA.difficulty.potionDropChance ?? 0.05;
  return withSeed(seed, () => {
    sim.fresh();
    for (let r = 0; r < runs; r++) {
      const rec = sim.playRun({ agg, retreat, tactic });
      if (rec.bossesBeaten >= 1 && agg.firstBossClearRun == null) agg.firstBossClearRun = r + 1;
      if (verbose) {
        console.log(`run ${String(r + 1).padStart(2)}: depth ${String(rec.depth).padStart(2)}, ${rec.outcome}, kills ${rec.kills}, coins ${rec.coins}, xp ${rec.xp}, relics ${rec.relics}, boon ${rec.boon ?? '-'}`);
      }
      sim.spendInHub(agg);
    }
    const p = sim.getProfile();
    agg.finalStats = { ...p.stats };
    agg.finalCoins = p.coins;
    agg.finalDerived = sim.derivedStats(p);
    agg.t4MinRoom = t4MinRoom;
    agg.alchemy = { ...p.alchemy };
    agg.potionCap = p.potionCap;
    return agg;
  });
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
  const killersBy = Object.entries(agg.deathBy).sort((a, b) => b[1] - a[1]).slice(0, 5);
  push(`- deadliest enemies (final blow): ${killersBy.map(([id, n]) => `${id} ×${n}`).join(', ') || '—'}`);
  const bosses = Object.keys(agg.bossSeen).map(Number).sort((a, b) => a - b);
  push(`- boss clear rate: ${bosses.map((r) => `room ${r} ${agg.bossBeaten[r] ?? 0}/${agg.bossSeen[r]} (${Math.round(100 * (agg.bossBeaten[r] ?? 0) / agg.bossSeen[r])}%)`).join(' | ') || '—'}`);
  if (agg.retreats) push(`- retreats: ${agg.retreats}/${agg.runs.length} runs banked their purse`);
  push();
  push(`## Earnings (per run)`);
  const avg = (f) => (agg.runs.reduce((s, r) => s + f(r), 0) / agg.runs.length).toFixed(1);
  push(`- coins carried out: avg ${avg((r) => r.coins)} | XP: avg ${avg((r) => r.xp)} | kills: avg ${avg((r) => r.kills)}`);
  push(`- items by tier: T1 ${agg.itemsByTier[1]} | T2 ${agg.itemsByTier[2]} | T3 ${agg.itemsByTier[3]} | T4 ${agg.itemsByTier[4]}`);
  push(`- T4 relic rooms: ${agg.relicRooms.length ? agg.relicRooms.sort((a, b) => a - b).join(', ') : 'none'} (gate: room ${agg.t4MinRoom}+)`);
  push();
  push(`## Hub allocation over ${runs} runs`);
  push(`- XP → disciplines: ${Object.entries(agg.xpSpent).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} +${n}`).join(', ') || 'none'}`);
  push(`- coins → potions ${agg.coinsSpent.potions}c, satchel ${agg.coinsSpent.satchel}c, alchemy ${agg.coinsSpent.alchemy}c, forge ${agg.coinsSpent.forge}c; banked at end: ${agg.bankedByRun.at(-1)}c`);
  push(`- final disciplines: ${Object.entries(agg.finalStats).map(([s, l]) => `${s} ${l}`).join(', ')}`);
  push(`- final alchemy: ${Object.entries(agg.alchemy).map(([t, l]) => `${t} ${l}`).join(', ')}`);
  push(`- final satchel: ${agg.potionCap} potion cap`);
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
  push(`- attacks: ${agg.attacks} (heavy ${agg.heavyUses}, ${(100 * agg.heavyUses / Math.max(1, agg.attacks)).toFixed(0)}%), avg ${(agg.turns / Math.max(1, agg.combatRooms)).toFixed(1)} turns per combat room`);
  push(`- potions: drunk ${agg.potionsDrunk}, found ${agg.potionsFound}, bought ${agg.coinsSpent.potions > 0 ? 'yes (see coins)' : 'no'}`);
  push(`- shrines: ${agg.shrinesTaken}/${agg.shrineRoomsSeen} taken (${Object.entries(agg.boonsTaken).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ') || '—'})`);
  for (const [b, x] of Object.entries(agg.dmgTakenByBand)) {
    push(`- depth ${b}: avg ${(x.taken / Math.max(1, x.hits)).toFixed(1)} dmg/hit over ${x.hits} hits (${(100 * x.zeroHits / Math.max(1, x.hits)).toFixed(0)}% zero-damage)`);
  }
  push();
  push(`## Flags`);
  if (!flags.length) push('- none — no obvious smells');
  for (const f of flags) push(`- [${f.level}] ${f.text}`);
  return lines.join('\n');
}

// ── Multi-seed summary: independent campaigns, mean ± sd per metric ──
async function multiSeed(seeds, { runs = 40, retreat = false, tactic = 'suggested' } = {}) {
  const rows = [];
  for (const seed of seeds) {
    const agg = await simulate({ runs, seed, retreat, tactic });
    const { median, mean } = analyze(agg);
    const rate = (r) => (agg.bossSeen[r] ? (agg.bossBeaten[r] ?? 0) / agg.bossSeen[r] : NaN);
    const early = agg.depths.slice(0, 10);
    rows.push({
      seed, median, mean,
      early: early.reduce((x, y) => x + y, 0) / early.length,
      late: agg.depths.slice(-10).reduce((x, y) => x + y, 0) / Math.min(10, agg.depths.length),
      boss8: rate(8), boss16: rate(16), boss24: rate(24),
      coins: agg.runs.reduce((x, r) => x + r.coins, 0) / agg.runs.length,
      banked: agg.runs.reduce((x, r) => x + (r.banked ?? 0), 0) / agg.runs.length,
      turns: agg.turns / Math.max(1, agg.combatRooms),
      first8: agg.firstBossClearRun ?? runs + 1, // runs until the room-8 boss first falls
    });
  }
  return rows;
}

function renderMultiSeed(rows, { runs, retreat }) {
  const keys = ['median', 'mean', 'early', 'late', 'first8', 'boss8', 'boss16', 'boss24', 'coins', 'banked', 'turns'];
  const fmt = (k, v) => (Number.isNaN(v) ? '  —  ' : k.startsWith('boss') ? `${Math.round(v * 100)}%` : v.toFixed(1));
  const stat = (k) => {
    const v = rows.map((r) => r[k]).filter((x) => !Number.isNaN(x));
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
    return k.startsWith('boss') ? `${Math.round(m * 100)}% ± ${Math.round(sd * 100)}` : `${m.toFixed(1)} ± ${sd.toFixed(1)}`;
  };
  const out = [`# Balance — ${rows.length} campaigns × ${runs} runs${retreat ? ' (bot retreats when risky)' : ' (bot pushes until death)'}`, '',
    '| seed | ' + keys.join(' | ') + ' |', '|' + '---|'.repeat(keys.length + 1)];
  for (const r of rows) out.push(`| ${r.seed} | ${keys.map((k) => fmt(k, r[k])).join(' | ')} |`);
  out.push(`| **mean ± sd** | ${keys.map(stat).join(' | ')} |`, '',
    'median/mean = run depth; early/late = avg depth of the first/last 10 runs; first8 = runs until the room-8 boss first falls;',
    'bossN = clear rate of the room-N boss;',
    'coins = earned per run; banked = carried home after the death toll; turns = avg player turns per combat room.');
  return out.join('\n');
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
  const retreat = process.argv.includes('--retreat');
  const tactic = arg('tactic', 'suggested');
  const seeds = arg('seeds', null); // e.g. 1-8
  if (seeds) {
    const [from, to] = seeds.split('-').map(Number);
    const list = Array.from({ length: (to ?? from) - from + 1 }, (_, i) => from + i);
    console.log(renderMultiSeed(await multiSeed(list, { runs, retreat, tactic }), { runs, retreat }));
  } else {
    const agg = await simulate({ runs, seed, verbose, retreat });
    console.log(renderReport(agg, { runs, seed }));
  }
}
