// shared/heroes.js — the character classes (0.00248): heroes.json lists
// them (id, name, epithet, lore, traits, `fh` = the figure's share of its
// sheet's height so the five read in scale on the CHOOSE YOUR HERO screen,
// and `looks` = the figure files in assets/heroes/, one per look — four of
// the same bitmap until the developer's variations land). The profile
// carries the pick as `hero: { id, look }` (save version 5); the choice is
// cosmetic: the knight's card and the hall draw the hero's figure, the
// numbers are the same for every class. Pure: the data in, no DOM.

import { DATA } from './data.js';

export const HERO_DIR = 'assets/heroes';
export const heroList = () => DATA.heroes.heroes;
export const heroById = (id) => heroList().find((h) => h.id === id) ?? null;
export const defaultHero = () => heroById(DATA.heroes.default) ?? heroList()[0];
/** A profile's pick made whole: a known hero, a look inside its list (an imported code, an old save). */
export function cleanHero(h) {
  const hero = heroById(h?.id) ?? defaultHero();
  const look = Number.isInteger(h?.look) ? Math.min(Math.max(0, h.look), hero.looks.length - 1) : 0;
  return { id: hero.id, look };
}
/** The hero a profile plays, whole. */
export const heroOf = (p) => heroById(cleanHero(p?.hero).id);
/** Where a hero's look is drawn from. */
export const lookUrl = (hero, look = 0) => `${HERO_DIR}/${hero.looks[Math.min(Math.max(0, look), hero.looks.length - 1)]}`;
/** Every look of every hero (the preloader: the screen follows the title). */
export const heroArtUrls = () => [...new Set(heroList().flatMap((h) => h.looks.map((f) => `${HERO_DIR}/${f}`)))];
