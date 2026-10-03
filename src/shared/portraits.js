// shared/portraits.js — where a character's portrait is (0.184). The file
// is data: enemies.json `art` per enemy, cards.json `player.art` for the
// knight, both in assets/chars/ — a redrawn portrait lands under a new
// filename (tools/gen-art.mjs --import; assets are never replaced in
// place) and the data points at it, so the old art is one edit away.
// 0.00248: the player's card draws the chosen hero's figure (heroes.json,
// assets/heroes/) — 0.00264: every standing look, the knight's included;
// a look marked `sprite` (the knight's old crouching one) keeps cards.json
// player.art, the file the Art Lab's import writes.

import { DATA } from './data.js';
import { getProfile } from '../meta/profile.js';
import { heroOf, lookUrl, cleanHero, lookIsSprite } from './heroes.js';

export const PORTRAIT_DIR = 'assets/chars';
export const portraitFile = (id) => (id === 'player' ? DATA.cards.player.art : DATA.enemies[id]?.art);
export function portraitUrl(id) {
  if (id === 'player') {
    const p = getProfile(), hero = heroOf(p), look = cleanHero(p.hero).look;
    if (!lookIsSprite(hero, look)) return lookUrl(hero, look); // (0.00264: the knight stands too — only his crouching look is the wide sprite)
  }
  return `${PORTRAIT_DIR}/${portraitFile(id)}`;
}
