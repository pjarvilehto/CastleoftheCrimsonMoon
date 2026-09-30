// shared/data.js — single async load point for all game data JSON.
// Everything else imports the already-parsed objects from here.

export const DATA = {};

export async function loadData() {
  const files = ['enemies', 'items', 'difficulty', 'backgrounds', 'shrines', 'build'];
  await Promise.all(files.map(async (name) => {
    const res = await fetch(`assets/data/${name}.json`);
    if (!res.ok) throw new Error(`Failed to load ${name}.json`);
    DATA[name] = await res.json();
  }));
  return DATA;
}
