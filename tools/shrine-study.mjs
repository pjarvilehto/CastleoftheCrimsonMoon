#!/usr/bin/env node
// tools/shrine-study.mjs — is any shrine boon out of balance? (0.091)
//
// A controlled experiment on the real game code (via simCore.mjs):
//   1. A baseline bot plays one campaign; the profile is snapshotted at
//      several stages (fresh / early / mid / late).
//   2. From each snapshot, for every boon, N runs are played with that boon
//      FORCED at the shrine (taken whenever affordable), plus N runs that
//      always walk away ('none').
//   3. Run i uses the same RNG seed for every boon (common random numbers),
//      so differences come from the boon, not from luck. Each boon is
//      compared to walking away with a paired mean difference ± standard error.
//
// Only runs that REACH the shrine count: paired runs are identical until
// the shrine (same seed, same profile), so a run that dies before it says
// nothing about the boon. Stages span the whole progression so no single
// difficulty wall (where nothing matters) dominates.
//
// Usage: node tools/shrine-study.mjs [--n 300] [--seed 1] [--stages 2,5,10,15,20,25,30]
// Flags: OP (big, significant gain), TRAP (significantly worse than walking
// away), DEAD (unaffordable most of the time).

import { fileURLToPath } from 'node:url';
import { loadSim, withSeed, newAgg } from './simCore.mjs';

const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

export async function shrineStudy({ n = 300, seed = 1, stages = [2, 5, 10, 15, 20, 25, 30] } = {}) {
  const sim = await loadSim();
  const boons = sim.DATA.shrines.offers.map((o) => o.id);
  // 1. profile snapshots along one baseline campaign
  const snaps = [];
  withSeed(seed, () => {
    sim.fresh();
    const agg = newAgg();
    for (let r = 0; r <= Math.max(...stages); r++) {
      if (stages.includes(r)) snaps.push({ stage: r, profile: sim.snapshot(), derived: sim.derivedStats(sim.getProfile()) });
      sim.playRun({ agg });
      sim.spendInHub(agg);
    }
  });
  // 2 + 3. forced-boon runs from each snapshot, common random numbers
  const results = [];
  for (const snap of snaps) {
    const byPolicy = {};
    for (const policy of ['none', ...boons]) {
      const recs = [];
      for (let i = 0; i < n; i++) {
        sim.restore(snap.profile);
        recs.push(withSeed(seed * 100003 + snap.stage * 7919 + i, () => sim.playRun({ shrine: policy })));
      }
      byPolicy[policy] = recs;
    }
    const base = byPolicy.none;
    const idx = base.map((r, i) => (r.shrineRoom !== null ? i : -1)).filter((i) => i >= 0); // reached the shrine
    const rows = ['none', ...boons].map((policy) => {
      const recs = idx.map((i) => byPolicy[policy][i]);
      const diffs = idx.map((i) => byPolicy[policy][i].depth - base[i].depth);
      return {
        policy,
        afford: policy === 'none' ? 1 : mean(recs.map((r) => (r.boon === policy ? 1 : 0))),
        depth: mean(recs.map((r) => r.depth)),
        dDepth: mean(diffs), seDepth: sd(diffs) / Math.sqrt(Math.max(1, idx.length)),
        boss8: mean(recs.map((r) => (r.bossesBeaten >= 1 ? 1 : 0))),
        reach16: mean(recs.map((r) => (r.depth >= 16 ? 1 : 0))),
        dCoins: mean(idx.map((i) => byPolicy[policy][i].coins - base[i].coins)),
      };
    });
    results.push({ stage: snap.stage, derived: snap.derived, reached: idx.length / n, rows });
  }
  return { n, seed, results };
}

export function verdict(row) {
  if (row.policy === 'none') return '';
  const t = row.seDepth > 0 ? row.dDepth / row.seDepth : 0;
  const tags = [];
  if (row.afford < 0.3) tags.push('DEAD');
  // worse than walking away: a TRAP, unless it buys coins (a deliberate TRADE)
  if (t < -3) tags.push(row.dCoins > 50 ? 'TRADE' : 'TRAP');
  if (t > 3 && row.dDepth > 2) tags.push('OP');
  return tags.join(' ');
}

export function renderStudy({ n, seed, results }) {
  const out = [`# Shrine balance study — ${n} paired runs per boon per stage (seed ${seed})`, ''];
  for (const { stage, derived, reached, rows } of results) {
    out.push(`## After ${stage} campaign runs — ${derived.maxHp} HP, ${derived.dmg} dmg, ${derived.armor} armor, ${(derived.crit * 100).toFixed(0)}% crit — ${Math.round(reached * 100)}% of runs reach the shrine`);
    out.push('', '| boon | taken | avg depth | Δ depth vs walk away | boss 8 | reach 16 | Δ coins/run | flag |', '|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const d = r.policy === 'none' ? '—' : `${r.dDepth >= 0 ? '+' : ''}${r.dDepth.toFixed(2)} ± ${r.seDepth.toFixed(2)}`;
      out.push(`| ${r.policy} | ${Math.round(r.afford * 100)}% | ${r.depth.toFixed(2)} | ${d} | ${Math.round(r.boss8 * 100)}% | ${Math.round(r.reach16 * 100)}% | ${r.policy === 'none' ? '—' : Math.round(r.dCoins)} | ${verdict(r)} |`);
    }
    out.push('');
  }
  out.push('All columns count only runs that reached the shrine. taken = how often the boon was affordable there;',
    'Δ = paired difference in final depth vs walking away (± standard error);',
    'OP = significant gain over +2 rooms; TRAP = significantly worse than walking away; TRADE = worse depth but',
    'clearly more coins; DEAD = unaffordable >70% of the time.');
  return out.join('\n');
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt; };
  const study = await shrineStudy({
    n: Number(arg('n', 300)), seed: Number(arg('seed', 1)),
    stages: arg('stages', '2,5,10,15,20,25,30').split(',').map(Number),
  });
  console.log(renderStudy(study));
}
