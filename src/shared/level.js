// shared/level.js — the character level (0.080): one per five trained
// discipline levels. Shared by the game (meta/profile.js playerLevel) and
// the analytics page, which reads it from saves.

export const DISCIPLINES = ['power', 'vitality', 'fortune', 'precision', 'endurance'];

export function levelFromStats(stats = {}) {
  return 1 + Math.floor(DISCIPLINES.reduce((s, k) => s + (Number(stats[k]) || 0), 0) / 5);
}
