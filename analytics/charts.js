// analytics/charts.js — tiny chart builders for the dashboard (0.095):
// HTML strings (inline SVG and div bars), no library. Every label that
// could come from a save goes through esc().

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const PALETTE = ['#e0b84a', '#d0584a', '#6fb7d8', '#7bc98a', '#b99ae8', '#e08a4a', '#c9c9c9', '#e06fa8'];

// Horizontal bars: [{ label, value, note? }] — value drives the length.
export function bars(items, { color = '#c9a227', fmt = (v) => v } = {}) {
  if (!items.length) return '<p class="empty">No data yet.</p>';
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<div class="bars">${items.map((i) => `
    <div class="bar-row">
      <span class="bar-label" title="${esc(i.label)}">${esc(i.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(100 * i.value) / max}%;background:${color}"></span></span>
      <span class="bar-value">${esc(fmt(i.value))}${i.note ? ` <em>${esc(i.note)}</em>` : ''}</span>
    </div>`).join('')}</div>`;
}

const W = 640, H = 240, PAD = { l: 34, r: 12, t: 12, b: 26 };

// Axis ticks: about `n` round steps from 0 to max.
function ticks(max, n = 4) {
  const step = Math.max(1, Math.ceil(max / n));
  const out = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

function frame(xMax, yMax, xLabel, yLabel) {
  const x = (v) => PAD.l + ((W - PAD.l - PAD.r) * v) / Math.max(1, xMax);
  const y = (v) => H - PAD.b - ((H - PAD.t - PAD.b) * v) / Math.max(1, yMax);
  const grid = ticks(yMax).map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="gl"/>`
    + `<text x="${PAD.l - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}</text>`).join('');
  const xt = ticks(xMax, 6).filter((v) => v > 0).map((v) => `<text x="${x(v)}" y="${H - 8}" class="tick" text-anchor="middle">${v}</text>`).join('');
  const labels = `<text x="${W - PAD.r}" y="${H - 8}" class="axis" text-anchor="end">${esc(xLabel)}</text>`
    + `<text x="${PAD.l}" y="${PAD.t - 2}" class="axis">${esc(yLabel)}</text>`;
  return { x, y, svg: grid + xt + labels };
}

// Lines: [{ label, points: [[x, y], ...] }], one colour per series.
export function lines(series, { xLabel = '', yLabel = '' } = {}) {
  if (!series.length) return '<p class="empty">No runs recorded yet.</p>';
  const xMax = Math.max(...series.flatMap((s) => s.points.map((p) => p[0])));
  const yMax = Math.max(...series.flatMap((s) => s.points.map((p) => p[1])), 1);
  const f = frame(xMax, yMax, xLabel, yLabel);
  const paths = series.map((s, i) => {
    const c = PALETTE[i % PALETTE.length];
    const d = s.points.map((p, k) => `${k ? 'L' : 'M'}${f.x(p[0]).toFixed(1)},${f.y(p[1]).toFixed(1)}`).join('');
    const dots = s.points.length <= 80 ? s.points.map((p) => `<circle cx="${f.x(p[0])}" cy="${f.y(p[1])}" r="2.6" fill="${c}"><title>${esc(s.label)} run ${p[0]}: room ${p[1]}</title></circle>`).join('') : '';
    return `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
  }).join('');
  const legend = series.map((s, i) => `<span class="legend"><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(s.label)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${f.svg}${paths}</svg><div class="legends">${legend}</div>`;
}

// Stacked columns: [{ x, parts: [v1, v2] }] with parts coloured by `colors`.
export function columns(rows, { colors = ['#c14b4b', '#c9a227'], names = [], xLabel = '', yLabel = '' } = {}) {
  if (!rows.length) return '<p class="empty">No runs recorded yet.</p>';
  const yMax = Math.max(...rows.map((r) => r.parts.reduce((a, b) => a + b, 0)), 1);
  const f = frame(rows.length + 0.5, yMax, xLabel, yLabel);
  const bw = Math.max(2, ((W - PAD.l - PAD.r) / (rows.length + 1)) * 0.7);
  const cols = rows.map((r, i) => {
    let base = 0;
    return r.parts.map((v, k) => {
      if (!v) return '';
      const y0 = f.y(base), y1 = f.y(base + v);
      base += v;
      return `<rect x="${f.x(i + 1) - bw / 2}" y="${y1}" width="${bw}" height="${y0 - y1}" fill="${colors[k]}"><title>${esc(xLabel)} ${r.x}: ${v} ${esc(names[k] ?? '')}</title></rect>`;
    }).join('');
  }).join('');
  const legend = names.map((n, k) => `<span class="legend"><i style="background:${colors[k]}"></i>${esc(n)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${f.svg}${cols}</svg><div class="legends">${legend}</div>`;
}
