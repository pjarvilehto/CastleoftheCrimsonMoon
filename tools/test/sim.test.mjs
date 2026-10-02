// tools/test/sim.test.mjs — the balance simulator and shrine study.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, fresh, DATA, resetProfile } from './harness.mjs';

fresh();

// T36: 0.072 — the headless balance simulator drives the real run math and
// never violates the relic depth gate.
{
  const { simulate, analyze, renderReport } = await import('../simulate.mjs');
  const agg = await simulate({ runs: 3, seed: 7 });
  ok('sim completes all runs', agg.runs.length === 3 && agg.runs.every((r) => r.depth >= 1));
  ok('sim tracks allocation', agg.bankedByRun.length === 3 && typeof agg.coinsSpent.alchemy === 'number');
  ok('sim never violates the relic gate', agg.relicGateViolations === 0);
  const { flags } = analyze(agg);
  ok('analyze returns flags', Array.isArray(flags));
  ok('report renders', renderReport(agg, { runs: 3, seed: 7 }).includes('Balance Simulation'));
}

// T53: 0.091 — simulator engine (simCore) policies + the shrine study.
{
  const { loadSim, withSeed, newAgg } = await import('../simCore.mjs');
  const sim = await loadSim();
  const snap = sim.snapshot();
  let forced = null, none = null;
  for (let s = 1; s < 60 && (!forced || !none); s++) { // find a seed whose run reaches the shrine
    sim.restore(snap);
    const f = withSeed(s, () => sim.playRun({ shrine: 'dmg' }));
    sim.restore(snap);
    const n = withSeed(s, () => sim.playRun({ shrine: 'none' }));
    if (f.shrineRoom !== null) { forced = f; none = n; }
  }
  sim.restore(snap);
  ok('forced boon is taken; walking away takes nothing', forced && forced.boon === 'dmg' && none.boon === null && none.shrineRoom === forced.shrineRoom);
  const agg = newAgg();
  withSeed(3, () => { sim.fresh(); for (let i = 0; i < 6; i++) { sim.playRun({ agg, retreat: true }); sim.spendInHub(agg); } });
  sim.restore(snap);
  ok('retreat policy banks runs and tracks bosses/turns', agg.runs.length === 6 && agg.turns > 0 && agg.combatRooms > 0
    && agg.runs.every((r) => r.outcome === 'death' || r.outcome === 'retreat'));
  const { shrineStudy, verdict } = await import('../shrine-study.mjs');
  const st = await shrineStudy({ n: 12, seed: 5, stages: [3] });
  const rows = st.results[0].rows;
  ok('shrine study: one row per boon + walk away', rows.length === DATA.shrines.offers.length + 1 && rows[0].policy === 'none');
  ok('study verdicts', verdict({ policy: 'x', afford: 0.1, dDepth: 0, seDepth: 0.1, dCoins: 0 }) === 'DEAD'
    && verdict({ policy: 'x', afford: 1, dDepth: -1, seDepth: 0.1, dCoins: 300 }) === 'TRADE'
    && verdict({ policy: 'x', afford: 1, dDepth: -1, seDepth: 0.1, dCoins: 0 }) === 'TRAP'
    && verdict({ policy: 'x', afford: 1, dDepth: 3, seDepth: 0.2, dCoins: 0 }) === 'OP');
  resetProfile();
}
