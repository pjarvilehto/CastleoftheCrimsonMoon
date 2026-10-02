// shared/data.js — single async load point for all game data JSON.
// Everything else imports the already-parsed objects from here. The
// numbers the code reads are checked once loaded (shared/dataCheck.js).
//
// Versioned like the modules (0.187): build.json is read uncached, then
// every other file under ?v=<build> — the boot loads the code that way
// (index.html, 0.082) but the data went by its bare name, so right after a
// deploy a browser could run new code against the CDN's old JSON (0.186:
// the Art Lab and the battle line read the new `art` fields and found
// none). A new build changes every URL, so code and data move together;
// the labs load their data through here too.

import { checkData } from './dataCheck.js';

export const DATA = {};

const get = async (name, query, cache) => {
  const res = await fetch(`assets/data/${name}.json${query}`, { cache });
  if (!res.ok) throw new Error(`Failed to load ${name}.json`);
  return res.json();
};

export async function loadData() {
  DATA.build = await get('build', '', 'no-store');
  const q = DATA.build?.version ? `?v=${encodeURIComponent(DATA.build.version)}` : '';
  const files = ['enemies', 'items', 'difficulty', 'backgrounds', 'shrines', 'telemetry', 'audio', 'narration', 'cards'];
  await Promise.all(files.map(async (name) => { DATA[name] = await get(name, q, 'no-cache'); }));
  for (const problem of checkData(DATA)) console.error(`[data] ${problem}`);
  return DATA;
}

/** The query that pins a data or asset URL to this build (the labs use it for their own files). */
export const buildQuery = () => (DATA.build?.version ? `?v=${encodeURIComponent(DATA.build.version)}` : '');
