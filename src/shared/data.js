// shared/data.js — single async load point for all game data JSON.
// Everything else imports the already-parsed objects from here. The
// numbers the code reads are checked once loaded (shared/dataCheck.js).

import { checkData } from './dataCheck.js';

export const DATA = {};

export async function loadData() {
  const files = ['enemies', 'items', 'difficulty', 'backgrounds', 'shrines', 'build', 'telemetry', 'audio', 'narration', 'cards'];
  await Promise.all(files.map(async (name) => {
    // no-cache = always revalidate (cheap 304 when unchanged): balance data
    // must match the code version that just loaded (0.082).
    const res = await fetch(`assets/data/${name}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${name}.json`);
    DATA[name] = await res.json();
  }));
  for (const problem of checkData(DATA)) console.error(`[data] ${problem}`);
  return DATA;
}
