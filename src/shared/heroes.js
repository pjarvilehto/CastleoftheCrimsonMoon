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
/** The name of a profile's heavy attack (0.00266, the developer's picks): the knight's Heavy Attack, the Barbarian's Cleave, the Wizard's Fireball, the Necromancer's Soul Drain, the Druid's Go Feral, the Hexhunter's Hex, the Plague Sister's Last Rites — the button and the STATS row; the blow itself is the same for every class. */
export const heavyName = (p) => heroOf(p).heavyName;
/** A hero's colour theme (0.00254): { plate, light, tint } — the card plates' colour, the card light's look and tint. */
export const heroTheme = (hero) => hero.theme;
/** A hero's look, whole: { art, fh } (an index past the list is clamped). */
export const lookOf = (hero, look = 0) => hero.looks[Math.min(Math.max(0, look), hero.looks.length - 1)];
/** A look drawn in combat as the knight's wide sprite (0.00264): `sprite: true` in heroes.json — the knight's
 *  first, crouching look; his card then draws cards.json player.art (the Art Lab's import path), a standing look its figure. */
export const lookIsSprite = (hero, look = 0) => !!lookOf(hero, look).sprite;
/** A class's starting kit (0.00265, heroes.json `kit`): { weapon, armor } — worn by a new save when it picks the class. */
export const heroKit = (hero) => hero.kit;
/** Where a hero's look is drawn from. */
export const lookUrl = (hero, look = 0) => `${HERO_DIR}/${lookOf(hero, look).art}`;
/** Every look of every hero. */
export const heroArtUrls = () => [...new Set(heroList().flatMap((h) => h.looks.map((l) => `${HERO_DIR}/${l.art}`)))];
/** What CHOOSE YOUR HERO opens on: every hero's first look and the profile's own (the preloader's essentials; the other looks stream behind). */
export const heroFirstUrls = (p) => { const own = cleanHero(p?.hero); return [...new Set([...heroList().map((h) => lookUrl(h, h.id === own.id ? own.look : 0)), lookUrl(heroById(own.id), own.look)])]; };
