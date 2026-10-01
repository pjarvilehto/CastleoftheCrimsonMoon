// shared/level.js — the character level (0.080): one per `every` trained
// discipline levels (difficulty.json levelEvery). Shared by the game
// (meta/stats.js playerLevel) and the analytics page, which reads it from
// saves — so the knob is passed in rather than read from DATA here.

export const DISCIPLINES = ['power', 'vitality', 'fortune', 'precision', 'endurance'];

export function levelFromStats(stats = {}, every) {
  return 1 + Math.floor(DISCIPLINES.reduce((s, k) => s + (Number(stats[k]) || 0), 0) / every);
}
