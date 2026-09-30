// shared/preload.js — fetch AND decode every image asset up front, so the
// first render of any screen paints instantly (a plain <img>/CSS url only
// starts loading at render time, which is what produced half-drawn art).
// Asset list is derived from the data JSONs, so new enemies/backgrounds
// are picked up automatically. A missing file must never block the game.

import { DATA } from './data.js';

function assetUrls() {
  const b = DATA.backgrounds;
  const bgs = [b.title, b.hub, b.boss, b.death, b.shrine, ...b.rooms];
  const chars = ['player', ...Object.keys(DATA.enemies)];
  return [
    ...new Set(bgs.map((f) => `assets/bg/${f}`)),
    ...chars.map((id) => `assets/chars/${id}.png`),
  ];
}

// img.decode() waits for a full decode, not just the network fetch — the
// decoded bitmap stays warm, so first paint is instant. Falls back to
// onload where decode is unavailable; resolves (never rejects) per asset.
function warm(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
    if (img.decode) img.decode().then(resolve, resolve);
  });
}

// onProgress(loaded, total) drives the boot progress bar.
export async function preloadAssets(onProgress) {
  const urls = assetUrls();
  let loaded = 0;
  await Promise.all(urls.map(async (url) => {
    await warm(url);
    loaded++;
    if (onProgress) onProgress(loaded, urls.length);
  }));
}
