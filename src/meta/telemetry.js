// meta/telemetry.js — automatic play stats (0.102). After every run (and
// once per session, so history from before this build arrives too) the
// game sends a snapshot of this browser's save to the collector Worker
// (collector/worker.js) named in assets/data/telemetry.json; the
// /analytics/ dashboard reads all players back from it. Testers don't
// export anything.
//
// Who is who: the save's random playerId (meta/history.js) — stable per
// browser, survives a progress wipe — and, since 0.109, the name the
// player typed on the title screen. Nothing else personal is sent: only
// the run records, disciplines, gear and purse the dashboard shows.
// Empty endpoint, or a local/dev host, sends nothing. Never throws.

import { DATA } from '../shared/data.js';
import { deviceInfo } from '../core/perfMonitor.js';
import { takeReport } from './perfReport.js';

const LOCAL_HOST = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|$)/;

// What goes over the wire: the dashboard's fields, nothing else — plus the
// device report waiting to go (0.00225: a run's or a benchmark's, once).
export function statsPayload(p, report = takeReport()) {
  return {
    playerId: p.playerId,
    build: DATA.build?.version ?? '?',
    device: deviceInfo(), // 0.130: the machine (GPU, browser, OS, cores) — the latest one wins
    ...(report ? { report } : {}),
    profile: {
      playerId: p.playerId, name: p.name ?? '', coins: p.coins, xp: p.xp, potions: p.potions, potionCap: p.potionCap,
      stats: p.stats, records: p.records, equipment: p.equipment, history: p.history ?? [],
      bench: p.bench ?? [], // 0.131: ?debug BENCHMARK results
    },
  };
}

export function telemetryEnabled() {
  const host = globalThis.location?.hostname;
  return !!DATA.telemetry?.endpoint && typeof host === 'string' && !LOCAL_HOST.test(host);
}

export function shareStats(p) {
  // no runs (or benchmarks, 0.131) yet: nothing to show (and a brand-new
  // save's id isn't stored yet)
  if (!p?.playerId || !(p.history?.length || p.bench?.length) || !telemetryEnabled()) return false;
  // text/plain: a "simple" request, no CORS preflight round trip
  globalThis.fetch?.(`${DATA.telemetry.endpoint.replace(/\/$/, '')}/collect`, {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(statsPayload(p)),
  }).catch(() => {});
  return true;
}
