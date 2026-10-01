// shared/preload.js — fetch AND decode image assets ahead of their first
// render, so no screen paints half-drawn art (a plain <img>/CSS url only
// starts loading at render time). Asset lists are derived from the data
// JSONs, so new enemies/backgrounds are picked up automatically. A missing
// file must never block the game.
//
// Staged (0.098): the boot loader waits only for what the first screens
// paint — the title and Great Hall backgrounds and their depth maps.
// Everything else (dungeon rooms, boss/shrine/death art, portraits: ~5MB)
// loads in the background right after the title shows; the hub's Descend
// waits for it only if the player gets there first.
// 0.153: with 34 room paintings (~13MB) Descend waits only for what every
// run needs — the boss, shrine and death art and the portraits; the rooms
// keep loading behind (a room whose painting isn't in yet keeps the last
// one up until it is: bg3d swaps only once a layer has loaded).

import { DATA } from './data.js';
import { depthUrl } from '../core/bg3d.js';

const bgUrl = (f) => `assets/bg/${f}`;

// What the title + hub need before the first paint.
export function bootUrls() {
  const first = [...new Set([DATA.backgrounds.title, DATA.backgrounds.hub])];
  return [...first.map(bgUrl), ...first.map(depthUrl)];
}

// What every run needs before it starts: the boss, shrine and death art,
// the portraits (depth maps ~20KB each).
export function essentialUrls() {
  const b = DATA.backgrounds, first = new Set([b.title, b.hub]);
  const art = [...new Set([b.boss, b.death, b.shrine])].filter((f) => !first.has(f));
  const chars = ['player', ...Object.keys(DATA.enemies)];
  return [...art.map(bgUrl), ...art.map(depthUrl), ...chars.map((id) => `assets/chars/${id}.webp`)];
}

// The room paintings (and their depth maps) not already loaded above.
export function roomUrls() {
  const b = DATA.backgrounds, seen = new Set([b.title, b.hub, b.boss, b.death, b.shrine]);
  const rooms = [...new Set([...b.rooms, ...b.treasure])].filter((f) => !seen.has(f));
  return [...rooms.map(bgUrl), ...rooms.map(depthUrl)];
}

// Everything the dungeon and run-end screens use, essentials first.
export const restUrls = () => [...essentialUrls(), ...roomUrls()];

// img.decode() waits for a full decode, not just the network fetch.
// Falls back to onload where decode is unavailable; resolves (never
// rejects) per asset.
function warm(url) {
  if (typeof Image === 'undefined') return Promise.resolve(); // no images to warm (Node tests)
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
    if (img.decode) img.decode().then(resolve, resolve);
  });
}

// Load urls, at most `width` at a time (a background download must not
// starve whatever the current screen is fetching).
async function pool(urls, width, each) {
  let next = 0;
  const lane = async () => { while (next < urls.length) await each(urls[next++]); };
  await Promise.all(Array.from({ length: Math.min(width, urls.length) }, lane));
}

// Boot: onProgress(loaded, total) drives the loader bar.
export async function preloadAssets(onProgress) {
  const urls = bootUrls();
  let loaded = 0;
  await Promise.all(urls.map(async (url) => {
    await warm(url);
    loaded++;
    if (onProgress) onProgress(loaded, urls.length);
  }));
}

// Background stage: started once (main.js, after the title shows); every
// caller gets the same promise.
let rest = null;
const restState = { done: 0, total: 0, ready: false };
export function preloadRest() {
  rest ??= (async () => {
    const urls = essentialUrls();
    restState.total = urls.length;
    await pool(urls, 4, async (url) => { await warm(url); restState.done++; });
    restState.ready = true;
    pool(roomUrls(), 3, warm); // (the rooms keep coming; nobody waits for them)
  })();
  return rest;
}

// { done, total, ready } — the hub shows it on Descend while it waits.
export const restProgress = () => ({ ...restState });
