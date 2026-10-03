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
// 0.153: with 35 room paintings (~13MB) Descend waits only for what every
// run needs — the boss, shrine and death art and the portraits; the rooms
// keep loading behind (a room whose painting isn't in yet keeps the last
// one up until it is: bg3d swaps only once a layer has loaded).

import { CHEST_ICONS } from '../run/treasure.js';
import { DATA } from './data.js';
import { depthUrl } from '../core/bg3d.js';
import { portraitUrl, portraitFile, PORTRAIT_DIR } from './portraits.js';
import { heroFirstUrls, heroArtUrls } from './heroes.js';
import { itemArtUrls } from './itemArt.js';
import { GEAR_SLOTS } from '../meta/equipment.js';
import { getProfile } from '../meta/profile.js';

const bgUrl = (f) => `assets/bg/${f}`;

// What the title + hub need before the first paint.
export function bootUrls() {
  const first = [...new Set([DATA.backgrounds.title, DATA.backgrounds.hub])];
  return [...first.map(bgUrl), ...first.map(depthUrl)];
}

// What every run needs before it starts: the shrine and death art, the
// portraits (depth maps ~20KB each). (0.156: the throne rooms stream with
// the rooms — the first boss is eight rooms away.)
export function essentialUrls() {
  const b = DATA.backgrounds, first = new Set([b.title, b.hub]);
  const art = [...new Set([b.death, b.shrine])].filter((f) => !first.has(f));
  const chars = ['player', ...Object.keys(DATA.enemies)];
  const icons = [...DATA.shrines.offers.map((o) => o.img), ...Object.values(CHEST_ICONS)]; // (0.177; one table, run/treasure.js)
  return [...new Set([...heroFirstUrls(getProfile()), ...art.map(bgUrl), ...art.map(depthUrl), ...chars.map(portraitUrl), `${PORTRAIT_DIR}/${portraitFile('player')}`, ...icons])]; // (0.00264: the knight's wide sprite — his crouching look's — too, now the player's portrait is a standing figure) // (0.00248: the figures CHOOSE YOUR HERO opens on first — it follows the title; the knight's card draws one of them, so a Set)
}

// The room paintings (and their depth maps) not already loaded above —
// the entrance corridors first (0.171: room 1 is always one of them).
export function roomUrls() {
  const b = DATA.backgrounds, seen = new Set([b.title, b.hub, b.death, b.shrine]);
  const rooms = [...new Set([...b.entrance, ...b.rooms, ...b.bosses, ...b.treasure])].filter((f) => !seen.has(f));
  return [...rooms.map(bgUrl), ...rooms.map(depthUrl)];
}

// Everything the dungeon and run-end screens use, essentials first.
// The heroes' other looks (0.00248): the switcher's, after the essentials and before the rooms.
export function heroLaterUrls() { const first = new Set(heroFirstUrls(getProfile())); return heroArtUrls().filter((u) => !first.has(u)); }
// The gear's pictures (0.00260, ~300KB for all): the save's worn gear first — the hall paints those — then the rest a find can show.
export function itemUrls() {
  const eq = getProfile().equipment ?? {};
  return itemArtUrls(GEAR_SLOTS.map(([k, i]) => (i === undefined ? eq[k] : eq[k]?.[i])).filter(Boolean));
}
export const restUrls = () => [...essentialUrls(), ...heroLaterUrls(), ...itemUrls(), ...roomUrls()];

// img.decode() waits for a full decode, not just the network fetch.
// Falls back to onload where decode is unavailable; resolves (never
// rejects) per asset.
function warm(url) {
  if (typeof Image === 'undefined') return Promise.resolve(); // no images to warm (Node tests)
  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    if (img.decode) img.decode().then(resolve, resolve); // (0.00209: decode alone — onload used to resolve first, before the pixels were ready)
    else { img.onload = () => resolve(); img.onerror = () => resolve(); }
  });
}

// The room paintings and depth maps (0.00222): fetched into the HTTP
// cache only — the 3D renderer decodes them itself as a room is entered
// (core/bg3dGL.js loadPicture, off the main thread), so decoding 34
// paintings here (~320 MB of pixels) warmed nothing it could reuse. The
// flat CSS fallback reads the same cache. Resolves, never rejects.
function fetchOnly(url) {
  if (typeof fetch !== 'function') return Promise.resolve();
  return fetch(url, { priority: 'low' }).then((r) => r.arrayBuffer?.(), () => {}).then(() => {}, () => {});
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
    pool(itemUrls(), 4, warm).then(() => pool(roomUrls(), 3, fetchOnly)); // (0.00260: the gear's pictures first — small, decoded, so a find's card shows its picture the moment it rises; Descend waits for neither) // (the rooms keep coming; nobody waits for them; 0.00222: into the cache, not decoded)
  })();
  return rest;
}

// { done, total, ready } — the hub shows it on Descend while it waits.
export const restProgress = () => ({ ...restState });
