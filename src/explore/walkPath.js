// explore/walkPath.js — the knight's own way between rooms (0.150, the
// game's 3D corridors). Pure; tested in Node. route() finds the way along
// the floor's trail (mapgen.js: every corridor cell and the way through
// each room, which themes.js keeps clear of furniture); smoothWalk() turns
// those cells into a walk: straight runs, each corner rounded, sampled
// every few centimetres, with where the knight is at any distance along it
// and which way he looks (a point a little ahead, so turns start early).
// route(trail, from, isGoal) -> [{ x, z }] cells, `from` to the first goal cell (or null)
// smoothWalk(cells, C, round) -> { length, at(s) -> { x, z }, heading(s, ahead) -> yaw }

const STEP = 0.1; // metres between samples on a straight run

export function route(trail, from, isGoal) {
  const key = (x, z) => `${x},${z}`;
  const open = new Set(trail);
  open.add(key(from.x, from.z)); // (where the knight stands is always walkable)
  const prev = new Map([[key(from.x, from.z), null]]), todo = [{ x: from.x, z: from.z }];
  for (let i = 0; i < todo.length; i++) {
    const c = todo[i];
    if (isGoal(c.x, c.z)) {
      const out = [];
      for (let p = c; p; p = prev.get(key(p.x, p.z))) out.unshift(p);
      return out;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, z: c.z + dz }, k = key(n.x, n.z);
      if (open.has(k) && !prev.has(k)) { prev.set(k, c); todo.push(n); }
    }
  }
  return null;
}

const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const toward = (p, q, r) => { const d = dist(p, q) || 1; return { x: p.x + ((q.x - p.x) * r) / d, z: p.z + ((q.z - p.z) * r) / d }; };
const quad = (a, c, b, t) => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, z: (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * c.z + t * t * b.z });

// cells -> a smooth walk in metres; `round` = how far (in cells) each
// corner's curve starts before it
export function smoothWalk(cells, C, round) {
  const P = cells.map((c) => ({ x: (c.x + 0.5) * C, z: (c.z + 0.5) * C }));
  const corners = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    if ((b.x - a.x) * (c.z - b.z) !== (b.z - a.z) * (c.x - b.x)) corners.push(b); // the way turns here
  }
  if (P.length > 1) corners.push(P.at(-1));
  const S = [{ ...corners[0] }];
  const lineTo = (p) => {
    const q = S.at(-1), n = Math.ceil(dist(q, p) / STEP);
    for (let i = 1; i <= n; i++) S.push({ x: q.x + ((p.x - q.x) * i) / n, z: q.z + ((p.z - q.z) * i) / n });
  };
  for (let i = 1; i < corners.length; i++) {
    const p = corners[i];
    if (i === corners.length - 1) { lineTo(p); break; }
    const a = corners[i - 1], b = corners[i + 1], r = Math.min(round * C, dist(a, p) / 2, dist(p, b) / 2);
    const p0 = toward(p, a, r), p1 = toward(p, b, r);
    lineTo(p0);
    for (let k = 1; k <= 10; k++) S.push(quad(p0, p, p1, k / 10));
  }
  const L = [0];
  for (let i = 1; i < S.length; i++) L.push(L[i - 1] + dist(S[i - 1], S[i]));
  const length = L.at(-1);
  const at = (s) => {
    if (S.length === 1 || s <= 0) return { ...S[0] };
    if (s >= length) return { ...S.at(-1) };
    let lo = 0, hi = L.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= s) lo = m; else hi = m; }
    const t = (s - L[lo]) / (L[hi] - L[lo] || 1);
    return { x: S[lo].x + (S[hi].x - S[lo].x) * t, z: S[lo].z + (S[hi].z - S[lo].z) * t };
  };
  // which way to look: toward the point `ahead` metres on (at the very end,
  // along the last stretch); yaw as player.js has it (0 = +z)
  const heading = (s, ahead) => {
    if (S.length < 2) return null;
    let a = at(s), b = at(Math.min(length, s + ahead));
    if (dist(a, b) < 1e-3) { a = S.at(-2); b = S.at(-1); }
    return Math.atan2(b.x - a.x, b.z - a.z);
  };
  return { length, at, heading };
}
