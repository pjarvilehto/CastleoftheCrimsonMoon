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

import { DATA } from './data.js';
import { depthUrl } from '../core/bg3d.js';

const bgUrl = (f) => `assets/bg/${f}`;

function allBackgrounds() {
  const b = DATA.backgrounds;
  return [...new Set([b.title, b.hub, b.boss, b.death, b.shrine, ...b.rooms])];
}

// What the title + hub need before the first paint.
export function bootUrls() {
  const first = [...new Set([DATA.backgrounds.title, DATA.backgrounds.hub])];
  return [...first.map(bgUrl), ...first.map(depthUrl)];
}

// Everything the dungeon and run-end screens use (depth maps ~20KB each).
export function restUrls() {
  const first = new Set([DATA.backgrounds.title, DATA.backgrounds.hub]);
  const later = allBackgrounds().filter((f) => !first.has(f));
  const chars = ['player', ...Object.keys(DATA.enemies)];
  return [...later.map(bgUrl), ...later.map(depthUrl), ...chars.map((id) => `assets/chars/${id}.webp`)];
}

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
    const urls = restUrls();
    restState.total = urls.length;
    await pool(urls, 4, async (url) => { await warm(url); restState.done++; });
    restState.ready = true;
  })();
  return rest;
}

// { done, total, ready } — the hub shows it on Descend while it waits.
export const restProgress = () => ({ ...restState });
