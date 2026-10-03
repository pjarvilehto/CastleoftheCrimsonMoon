// shared/portraits.js — where a character's portrait is (0.184). The file
// is data: enemies.json `art` per enemy, cards.json `player.art` for the
// knight, both in assets/chars/ — a redrawn portrait lands under a new
// filename (tools/gen-art.mjs --import; assets are never replaced in
// place) and the data points at it, so the old art is one edit away.
// 0.00248: the player's card draws the chosen hero's figure (heroes.json,
// assets/heroes/) — 0.00264: every standing look, the knight's included;
// 0.00291: his crouching look too (the developer's call: the inked figure the
// look picker shows, never the old photoreal cards.json player.art — that
// file stays only for the Art Lab).

import { DATA } from './data.js';
import { getProfile } from '../meta/profile.js';
import { heroOf, lookUrl, cleanHero } from './heroes.js';

export const PORTRAIT_DIR = 'assets/chars';
// 0.00303 (the developer's call): every approved redraw is in the game — an
// enemy's `art` is the LIST of its variants (tools/gen-art.mjs --import) and
// a fight deals them out (dealPortrait below); `ref` is the original every
// redraw was made from (the generator's reference and the prompts doc's File
// column), on disk but drawn by no fight.
export const portraitFiles = (id) => (id === 'player' ? [DATA.cards.player.art] : DATA.enemies[id]?.art ?? []);
export const portraitFile = (id) => portraitFiles(id)[0];
export const portraitUrls = (id) => (id === 'player' ? [portraitUrl('player')] : portraitFiles(id).map((f) => `${PORTRAIT_DIR}/${f}`));
export function portraitUrl(id) {
  if (id === 'player') { const p = getProfile(); return lookUrl(heroOf(p), cleanHero(p.hero).look); }
  return `${PORTRAIT_DIR}/${portraitFile(id)}`;
}

// The deal (0.00303): each foe of a kind gets its own picture while the
// kind's variants last — three Giant Rats, three different rats where there
// are three — then a fresh shuffle; the boss one of his at random each
// fight. Per fight (any object, the combat) and kept per foe, so a relayout
// or SWITCH CLASS re-mounting the line keeps every face, and a summon draws
// from the fight's deck. Its own random source, never Math.random: that
// order is the seeded fights' and the simulator's (a room rolls its enemies
// before its painting).
export const uniform = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const decks = new WeakMap(); // fight -> { [id]: urls left to deal }
const dealt = new WeakMap(); // foe -> its url
const shuffled = (list, rand) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export function dealPortrait(fight, foe, rand = uniform) {
  if (dealt.has(foe)) return dealt.get(foe);
  let byId = decks.get(fight);
  if (!byId) decks.set(fight, (byId = {}));
  if (!byId[foe.id]?.length) byId[foe.id] = shuffled(portraitUrls(foe.id), rand);
  const url = byId[foe.id].pop();
  dealt.set(foe, url);
  return url;
}
