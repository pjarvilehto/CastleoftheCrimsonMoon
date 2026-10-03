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
export const portraitFile = (id) => (id === 'player' ? DATA.cards.player.art : DATA.enemies[id]?.art);
export function portraitUrl(id) {
  if (id === 'player') { const p = getProfile(); return lookUrl(heroOf(p), cleanHero(p.hero).look); }
  return `${PORTRAIT_DIR}/${portraitFile(id)}`;
}
