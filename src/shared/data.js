// shared/data.js — single async load point for all game data JSON.
// Everything else imports the already-parsed objects from here.

export const DATA = {};

export async function loadData() {
  const files = ['enemies', 'items', 'difficulty', 'backgrounds', 'shrines', 'build', 'telemetry', 'audio'];
  await Promise.all(files.map(async (name) => {
    // no-cache = always revalidate (cheap 304 when unchanged): balance data
    // must match the code version that just loaded (0.082).
    const res = await fetch(`assets/data/${name}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${name}.json`);
    DATA[name] = await res.json();
  }));
  return DATA;
}
