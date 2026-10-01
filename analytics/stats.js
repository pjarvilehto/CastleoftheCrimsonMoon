// analytics/stats.js — the data side of the play-stats dashboard (0.095).
// Pure functions, no DOM: the smoke suite runs them in Node.
//
// Where the data comes from: every finished run appends a record to the
// player's profile (src/meta/history.js), and the profile lives in that
// player's browser. The dashboard reads THIS browser's save directly and
// testers' saves from the save codes they export on the title screen.

import { compareVersions } from '../src/shared/version.js';

export const LOCAL_SAVE_KEY = 'castle-roguelike-profile-v1';

// A save code (title screen -> Export Save) -> profile, or null.

export function decodeSave(code) {
  try {
    const raw = decodeURIComponent(escape(atob(String(code).replace(/\s+/g, ''))));
    const p = JSON.parse(raw);
    return p && typeof p === 'object' && p.records && p.stats ? sanitizeProfile(p) : null;
  } catch {
    return null;
  }
}

// A save from someone else's browser is untrusted input (0.097): keep only
// the fields the dashboard shows, as plain numbers / short strings, so
// nothing in a crafted code can reach the page as markup.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v, max = 40) => (v === null || v === undefined ? null : String(v).slice(0, max));
const ITEM_SLOTS = ['weapon', 'armor', 'boots', 'trinket', 'amulet'];

export function sanitizeRun(r = {}) {
  const out = { outcome: r.outcome === 'retreat' ? 'retreat' : 'death', build: str(r.build, 12) ?? '?',
    killedBy: str(r.killedBy), relic: !!r.relic,
    boons: Array.isArray(r.boons) ? r.boons.slice(0, 12).map((b) => str(b, 24)) : [] };
  for (const k of ['at', 'room', 'kills', 'xp', 'coins', 'banked', 'items', 'bosses', 'potions', 'turns', 'ms', 'level', 'maxHp', 'dmg', 'armor']) out[k] = num(r[k]);
  return out;
}

export function sanitizeProfile(p = {}) {
  const eq = p.equipment ?? {};
  const s = p.stats ?? {}, rec = p.records ?? {};
  return {
    playerId: str(p.playerId, 16),
    name: (str(p.name, 24) ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim(), // 0.109: typed by the player
    coins: num(p.coins), xp: num(p.xp), potions: num(p.potions), potionCap: num(p.potionCap),
    stats: Object.fromEntries(['power', 'vitality', 'fortune', 'precision', 'endurance'].map((k) => [k, num(s[k])])),
    records: Object.fromEntries(['runs', 'kills', 'bestRoom', 'deaths'].map((k) => [k, num(rec[k])])),
    equipment: Object.fromEntries(ITEM_SLOTS.map((k) => [k, str(eq[k])])),
    history: Array.isArray(p.history) ? p.history.map(sanitizeRun) : [],
  };
}

// "0.100" > "0.099": compare version parts as numbers (shared with the game).
export { compareVersions as versionCmp };

// Every recorded run, tagged with its player and its number in that
// player's history (1 = their oldest recorded run).
export function allRuns(players) {
  return players.flatMap((pl) => (pl.profile.history ?? []).map((r, i) => ({ ...r, player: pl.key, n: i + 1 })));
}

export function filterRuns(runs, { player = 'all', build = 'all' } = {}) {
  return runs.filter((r) => (player === 'all' || r.player === player) && (build === 'all' || r.build === build));
}

const sum = (runs, f) => runs.reduce((s, r) => s + (Number(f(r)) || 0), 0);

export function summarize(runs) {
  const n = runs.length;
  const deaths = runs.filter((r) => r.outcome === 'death').length;
  return {
    runs: n,
    deaths,
    retreats: n - deaths,
    deathRate: n ? deaths / n : 0,
    avgRoom: n ? sum(runs, (r) => r.room) / n : 0,
    bestRoom: n ? Math.max(...runs.map((r) => r.room)) : 0,
    kills: sum(runs, (r) => r.kills),
    banked: sum(runs, (r) => r.banked),
    playMs: sum(runs, (r) => r.ms),
    bosses: sum(runs, (r) => r.bosses),
    relics: runs.filter((r) => r.relic).length,
    potions: sum(runs, (r) => r.potions),
  };
}

// [[key, count], ...] most common first (null/undefined keys skipped).
export function countBy(runs, key) {
  const m = new Map();
  for (const r of runs) {
    const k = typeof key === 'function' ? key(r) : r[key];
    if (k === null || k === undefined) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// Room -> { death, retreat } for every room up to the deepest one.
export function endRooms(runs) {
  const max = Math.max(0, ...runs.map((r) => r.room));
  const rows = Array.from({ length: max }, (_, i) => ({ room: i + 1, death: 0, retreat: 0 }));
  for (const r of runs) if (r.room >= 1) rows[r.room - 1][r.outcome === 'death' ? 'death' : 'retreat'] += 1;
  return rows;
}

// Boss rooms: how many runs reached each, and how many beat it. A run
// that ends by retreat IN the boss room has cleared it (retreat is only
// offered after a won room); dying there is a loss.
export function bossClears(runs, every = 8, upTo = 24) {
  const out = [];
  for (let room = every; room <= upTo; room += every) {
    const reached = runs.filter((r) => r.room >= room);
    const cleared = reached.filter((r) => r.room > room || r.outcome === 'retreat');
    out.push({ room, reached: reached.length, cleared: cleared.length });
  }
  return out;
}

// Per shrine boon: how often it was taken and the average depth of those
// runs (vs runs with no boon at all).
export function boonStats(runs) {
  const m = new Map();
  for (const r of runs) {
    const boons = r.boons?.length ? r.boons : ['(none)'];
    for (const b of new Set(boons)) {
      const s = m.get(b) ?? { boon: b, taken: 0, rooms: 0 };
      s.taken += 1;
      s.rooms += r.room;
      m.set(b, s);
    }
  }
  return [...m.values()].map((s) => ({ ...s, avgRoom: s.rooms / s.taken })).sort((a, b) => b.taken - a.taken);
}

// Per build: runs, average depth, death rate — newest build first.
export function byBuild(runs) {
  return countBy(runs, 'build')
    .map(([build]) => ({ build, ...summarize(runs.filter((r) => r.build === build)) }))
    .sort((a, b) => compareVersions(b.build, a.build));
}

// Depth per run, one series per player (x = their run number).
// A run that won the game (0.123): it beat the boss of finalBossRoom —
// it went past that room, or retreated from it (retreat is only offered
// once the room is cleared). The same test as bossClears.
export const wonGame = (r, finalRoom = 24) => r.room > finalRoom || (r.room === finalRoom && r.outcome === 'retreat');

// Points are [run #, room, won the game?] — the chart marks the wins.
export function depthSeries(players, runs, finalRoom = 24) {
  return players
    .map((pl) => ({ key: pl.key, label: pl.label, points: runs.filter((r) => r.player === pl.key).map((r) => [r.n, r.room, wonGame(r, finalRoom)]) }))
    .filter((s) => s.points.length);
}

export function fmtDuration(ms) {
  const m = Math.round((ms ?? 0) / 60000);
  if (m < 1) return ms > 0 ? '<1m' : '0m';
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// CSV of runs (for spreadsheets): one row per run.
export function toCsv(runs, labelOf = (k) => k) {
  const cols = ['player', 'n', 'at', 'build', 'outcome', 'room', 'kills', 'xp', 'coins', 'banked', 'items', 'relic',
    'boons', 'bosses', 'killedBy', 'potions', 'turns', 'ms', 'level', 'maxHp', 'dmg', 'armor'];
  const cell = (v) => {
    let s = Array.isArray(v) ? v.join(' ') : v === null || v === undefined ? '' : String(v);
    // text from a save could start a spreadsheet formula (=, +, -, @): defuse it
    if (typeof v !== 'number' && /^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = runs.map((r) => cols.map((c) => cell(c === 'player' ? labelOf(r.player)
    : c === 'at' ? new Date(r.at).toISOString() : r[c])).join(','));
  return [cols.join(','), ...rows].join('\n');
}
