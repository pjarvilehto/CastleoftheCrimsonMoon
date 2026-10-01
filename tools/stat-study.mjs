#!/usr/bin/env node
// tools/stat-study.mjs — what is each upgrade worth? (0.112)
//
// A controlled experiment on the real game code (via simCore.mjs), like
// tools/shrine-study.mjs:
//   1. A baseline bot plays one campaign; the profile is snapshotted at
//      several stages.
//   2. From each snapshot, a budget is spent on ONE upgrade only: XP worth
//      ~3 runs at that stage on a single discipline, or coins worth ~3 runs
//      on a single alchemy track. Then N runs are played with no further
//      spending.
//   3. Run i uses the same RNG seed for every variant (common random
//      numbers): differences come from the upgrade, not from luck.
// Reports levels bought, mean depth gain (± standard error), coins and
// relic rate. A DEAD upgrade buys levels that change nothing.
//
// Usage: node tools/stat-study.mjs [--n 200] [--seed 1] [--stages 5,15,30,60]
//        [--set player.hpPerVitality=130 --set ...]   try a tuning without editing the data

import { fileURLToPath } from 'node:url';
import { loadSim, withSeed, newAgg } from './simCore.mjs';

const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const se = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1) / Math.max(1, a.length)); };

const DISCIPLINES = ['power', 'vitality', 'endurance', 'precision', 'fortune'];
const TRACKS = ['potency', 'efficiency', 'infusion'];

export async function statStudy({ n = 200, seed = 1, stages = [5, 15, 30, 60], runsOfBudget = 3, sets = [] } = {}) {
  const sim = await loadSim();
  for (const s of sets) { // "a.b.c=json" -> DATA.difficulty.a.b.c
    const [path, raw] = s.split('=');
    const keys = path.split('.');
    let o = sim.DATA.difficulty;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys.at(-1)] = JSON.parse(raw);
  }
  const lv = await import('../src/meta/leveling.js');
  const snaps = [];
  withSeed(seed, () => {
    sim.fresh();
    const agg = newAgg();
    for (let r = 0; r <= Math.max(...stages); r++) {
      if (stages.includes(r)) {
        const recent = agg.runs.slice(-5);
        snaps.push({ stage: r, profile: sim.snapshot(), xpPerRun: mean(recent.map((x) => x.xp)) || 60, coinsPerRun: mean(recent.map((x) => x.banked ?? x.coins)) || 60 });
      }
      sim.playRun({ agg });
      sim.spendInHub(agg);
    }
  });
  const results = [];
  for (const snap of snaps) {
    const play = (prepare) => {
      const recs = [];
      let bought = 0;
      for (let i = 0; i < n; i++) {
        sim.restore(snap.profile);
        if (prepare) bought = prepare(sim.getProfile());
        recs.push(withSeed(seed * 100003 + snap.stage * 7919 + i, () => sim.playRun({})));
      }
      return { recs, bought };
    };
    const base = play(null).recs;
    const row = (name, kind, { recs, bought }) => {
      const d = recs.map((r, i) => r.depth - base[i].depth);
      const c = recs.map((r, i) => (r.banked ?? r.coins) - (base[i].banked ?? base[i].coins));
      return { stage: snap.stage, name, kind, bought, depthGain: mean(d), se: se(d), coinGain: mean(c),
        relics: mean(recs.map((r) => r.relics)) - mean(base.map((r) => r.relics)) };
    };
    const xpBudget = Math.round(snap.xpPerRun * runsOfBudget);
    const coinBudget = Math.round(snap.coinsPerRun * runsOfBudget);
    for (const stat of DISCIPLINES) {
      results.push(row(stat, `${xpBudget} xp`, play((p) => {
        p.xp = xpBudget; let k = 0;
        while (lv.canAfford(stat)) { lv.buyStat(stat); k++; }
        return k;
      })));
    }
    for (const track of TRACKS) {
      results.push(row(track, `${coinBudget} c`, play((p) => {
        p.coins = coinBudget; let k = 0;
        while (p.coins >= lv.alchemyCost(track)) { lv.trainAlchemy(track); k++; }
        return k;
      })));
    }
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const n = Number(arg('n', 200)), seed = Number(arg('seed', 1));
  const stages = String(arg('stages', '5,15,30,60')).split(',').map(Number);
  const sets = process.argv.flatMap((a, i) => (a === '--set' ? [process.argv[i + 1]] : []));
  const rows = await statStudy({ n, seed, stages, sets });
  console.log('| stage | upgrade | budget | levels | depth gain | ± se | coins/run | relics/run |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const flag = r.bought > 0 && Math.abs(r.depthGain) < 2 * r.se && Math.abs(r.coinGain) < 5 && Math.abs(r.relics) < 0.005 ? ' DEAD?' : '';
    console.log(`| ${r.stage} | ${r.name}${flag} | ${r.kind} | +${r.bought} | ${r.depthGain >= 0 ? '+' : ''}${r.depthGain.toFixed(2)} | ${r.se.toFixed(2)} | ${r.coinGain >= 0 ? '+' : ''}${r.coinGain.toFixed(0)} | ${r.relics >= 0 ? '+' : ''}${r.relics.toFixed(3)} |`);
  }
}
