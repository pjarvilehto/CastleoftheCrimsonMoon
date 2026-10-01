// analytics/tables.js — the dashboard's tables (0.136: split out of
// dashboard.js): by build, players (with the owner's tester names), recent
// runs. Every string from a save goes through esc(). `names` carries the
// page's lookups: { enemyName, itemName, boonName, labelOf, offers() }.

import { esc } from './charts.js';
import { fmtDuration } from './stats.js';
import { levelFromStats as level } from '../src/shared/level.js';

export const pct = (x) => `${Math.round(x * 100)}%`;
export function ago(t) {
  if (!t) return '—';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : new Date(t).toLocaleDateString();
}

export function buildTable(rows) {
  if (!rows.length) return '<p class="empty">No runs recorded yet.</p>';
  return `<table><tr><th>Build</th><th>Runs</th><th>Avg room</th><th>Best</th><th>Died</th></tr>${rows.map((r) =>
    `<tr><td>${esc(r.build)}</td><td>${r.runs}</td><td>${r.avgRoom.toFixed(1)}</td><td>${r.bestRoom}</td><td>${pct(r.deathRate)}</td></tr>`).join('')}</table>`;
}

export function playersTable(list, names) {
  if (!list.length) return '<p class="empty">No players yet — play a run in this browser, or add a tester’s save code above.</p>';
  const rows = list.map((pl) => {
    const p = pl.profile, h = p.history ?? [], st = p.stats ?? {}, eq = p.equipment ?? {}, rec = p.records ?? {};
    const last = h[h.length - 1];
    const recent = h.slice(-10);
    return `<tr>
      <td><b>${esc(pl.base)}</b><small>${esc(p.playerId ?? 'pre-0.095 save')}${pl.source === 'server' ? ' · collected' : pl.source === 'code' ? ' · save code' : ''}</small></td>
      <td><input data-tester="${esc(pl.testerKey)}" value="${esc(pl.tester ?? '')}" placeholder="Who is this?" maxlength="30" aria-label="Tester name for ${esc(pl.base)}"></td>
      <td>${level(st)}</td>
      <td>${h.length}<small>of ${rec.runs ?? 0}</small></td>
      <td>${rec.bestRoom ?? 0}</td>
      <td>${recent.length ? (recent.reduce((a, r) => a + r.room, 0) / recent.length).toFixed(1) : '—'}</td>
      <td>${rec.deaths ?? 0}</td>
      <td>P${st.power ?? 0} V${st.vitality ?? 0} F${st.fortune ?? 0} Pr${st.precision ?? 0} E${st.endurance ?? 0}</td>
      <td>${esc(names.itemName(eq.weapon))}<small>${esc(names.itemName(eq.armor))}</small></td>
      <td>${p.coins ?? 0}c<small>${p.xp ?? 0} xp · ${p.potions ?? 0}/${p.potionCap ?? 0} potions</small></td>
      <td>${ago(last?.at)}<small>${esc(last?.build ?? '')}</small></td>
      <td>${pl.source === 'code' ? `<button class="small" data-act="remove" data-key="${esc(pl.key)}">Remove</button>` : ''}</td>
    </tr>`;
  }).join('');
  return `<div class="scroll"><table><tr><th>Player</th><th>Tester</th><th>Lvl</th><th>Runs</th><th>Best room</th><th>Avg (last 10)</th><th>Deaths</th><th>Disciplines</th><th>Gear</th><th>Purse</th><th>Last played</th><th></th></tr>${rows}</table></div>`;
}

export function runsTable(runs, names) {
  if (!runs.length) return '<p class="empty">No runs recorded yet.</p>';
  const latest = [...runs].sort((a, b) => b.at - a.at).slice(0, 60);
  return `<div class="scroll"><table><tr><th>When</th><th>Player</th><th>Build</th><th>Result</th><th>Room</th><th>Kills</th><th>Banked</th><th>Killed by</th><th>Boons</th><th>Bosses</th><th>Potions</th><th>Time</th><th>Lvl / HP / Dmg / Armor</th></tr>${latest.map((r) => `
    <tr class="${r.outcome}">
      <td>${ago(r.at)}</td><td>${esc(names.labelOf(r.player))}</td><td>${esc(r.build)}</td>
      <td>${r.outcome === 'death' ? 'died' : 'retreated'}</td><td>${r.room}</td><td>${r.kills}</td><td>${r.banked}</td>
      <td>${esc(r.killedBy ? names.enemyName(r.killedBy) : '')}</td>
      <td>${(r.boons ?? []).map((b) => `<span title="${esc(names.boonName(b))}">${esc(names.offers()[b]?.icon ?? b)}</span>`).join(' ')}</td>
      <td>${r.bosses}</td><td>${r.potions}</td><td>${fmtDuration(r.ms)}</td>
      <td>${r.level} / ${r.maxHp} / ${r.dmg} / ${r.armor}</td>
    </tr>`).join('')}</table></div>`;
}
