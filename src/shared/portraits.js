// shared/portraits.js — where a character's portrait is (0.184). The file
// is data: enemies.json `art` per enemy, cards.json `player.art` for the
// knight, both in assets/chars/ — a redrawn portrait lands under a new
// filename (tools/gen-art.mjs --import; assets are never replaced in
// place) and the data points at it, so the old art is one edit away.

import { DATA } from './data.js';

export const PORTRAIT_DIR = 'assets/chars';
export const portraitFile = (id) => (id === 'player' ? DATA.cards.player.art : DATA.enemies[id]?.art);
export const portraitUrl = (id) => `${PORTRAIT_DIR}/${portraitFile(id)}`;
