// shared/heroes.js — the character classes (0.00248): heroes.json lists
// them (id, name, epithet, lore, traits, and `looks` = the figures in
// assets/heroes/, one per look: `art` the file, `fh` the figure's share of
// its sheet's height, so the heroes read in scale with one another on the
// CHOOSE YOUR HERO screen; tools/cut-heroes.mjs makes both from the
// developer's sheets). The profile
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
/** A hero's colour theme (0.00254): { plate, light, tint } — the card plates' colour, the card light's look and tint. */
export const heroTheme = (hero) => hero.theme;
/** A hero's look, whole: { art, fh } (an index past the list is clamped). */
export const lookOf = (hero, look = 0) => hero.looks[Math.min(Math.max(0, look), hero.looks.length - 1)];
/** Where a hero's look is drawn from. */
export const lookUrl = (hero, look = 0) => `${HERO_DIR}/${lookOf(hero, look).art}`;
/** Every look of every hero. */
export const heroArtUrls = () => [...new Set(heroList().flatMap((h) => h.looks.map((l) => `${HERO_DIR}/${l.art}`)))];
/** What CHOOSE YOUR HERO opens on: every hero's first look and the profile's own (the preloader's essentials; the other looks stream behind). */
export const heroFirstUrls = (p) => { const own = cleanHero(p?.hero); return [...new Set([...heroList().map((h) => lookUrl(h, h.id === own.id ? own.look : 0)), lookUrl(heroById(own.id), own.look)])]; };
