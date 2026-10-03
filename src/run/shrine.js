// run/shrine.js — shrine room: one-time boon trades.
// Offer data lives in assets/data/shrines.json — display text AND every
// number (costs, multipliers, caps) since 0.079; the `id` names its entry in
// BOONS below (0.00299: the registry — `needs` the numbers the entry reads,
// `afford(run, o)` its gate, `apply(run, o)` its cost and its buff — exactly
// like run/classes.js HEAVIES; canAffordOffer / acceptOffer dispatch through
// it and shared/dataCheck.js reads `needs` from it, so a new boon is one
// entry here and its line in shrines.json. It used to be two switches on
// the id and a third copy of every boon's keys in dataCheck.js NEEDS).
// All buffs are run-scoped: they die with the run.

import { DATA } from '../shared/data.js';
import { addPotion } from './runState.js';
import { usesCharges } from './classes.js';

export function shrineOffers() {
  return DATA.shrines.offers;
}

// The 3 offers a shrine deals: Fisher-Yates over the pool. Shared by
// shrineUI (stored on room.dealtOffers so re-renders are stable) and the
// balance simulator, so the bot sees exactly the player's odds.
export function dealOffers() {
  const pool = [...shrineOffers()];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, DATA.shrines.dealCount);
}

// Coin-priced boons scale with depth (0.072): at room 1 the price is the
// base; deeper shrines charge more, so rich late profiles can't auto-yes.
export function coinCost(base, roomNumber) {
  const growth = DATA.shrines.coinCostGrowthPerRoom;
  return Math.round(base * (1 + growth * Math.max(0, roomNumber - 1)));
}

// What a coin-priced offer costs here: depth-scaled, unless the offer has
// a flat price (flatCost, 0.091 — scaled prices tripled by room 5 and made
// Crit / Second Wind unaffordable in the rooms where shrines appear).
function offerCoinCost(o, roomNumber) {
  return o.flatCost ? o.coinCost : coinCost(o.coinCost, roomNumber);
}

// Display text for an offer's cost — dynamic for coin-priced boons so the
// card shows what will ACTUALLY be charged at this depth.
export function costText(offer, roomNumber) {
  if (offer.coinCost) return `-${offerCoinCost(offer, roomNumber)} COINS`;
  return offer.costDesc;
}

// Coin prices scale with the room the shrine leads to (0.171: shrines are
// interludes; run.room.depth), as they did when the shrine had its number.
const depthOf = (run) => run.room?.depth ?? run.roomNumber;
const hpFloorOk = (run) => run.maxHp > DATA.shrines.minMaxHp; // keep a sane HP floor
const dmgFloorOk = (run) => run.stats.dmg > DATA.shrines.minDmg;
const coinsOk = (run, o) => run.coins >= offerCoinCost(o, depthOf(run));

// Shared cost helpers: shave a fraction off max HP / damage.
function payHp(run, pct) {
  run.maxHp = Math.max(1, Math.round(run.maxHp * (1 - pct)));
  run.hp = Math.min(run.hp, run.maxHp);
}
function payDmg(run, pct) {
  run.stats.dmg = Math.max(1, Math.round(run.stats.dmg * (1 - pct)));
}
function payCoins(run, o) {
  run.coins = Math.max(0, run.coins - offerCoinCost(o, depthOf(run)));
}

/** The boons by id (0.00299): `needs` = the shrines.json numbers the entry reads (dataCheck.js wants each),
 *  `afford(run, o)` = can this run pay, `apply(run, o)` = the cost and the buff. None of them rolls. */
export const BOONS = {
  // damage for max HP
  dmg: {
    needs: ['hpCostPct', 'dmgMult'],
    afford: (run) => hpFloorOk(run),
    apply(run, o) { payHp(run, o.hpCostPct); run.stats.dmg = Math.round(run.stats.dmg * o.dmgMult); },
  },
  // crit chance for coins (a flat price, 0.091)
  crit: {
    needs: ['coinCost', 'critAdd', 'critCap'],
    afford: coinsOk,
    apply(run, o) { payCoins(run, o); run.stats.crit = Math.min(o.critCap, run.stats.crit + o.critAdd); },
  },
  // armor for a potion: a share of CURRENT armor, with a floor (armorMin, 0.091 — 25% of a
  // starting armor was next to nothing, not worth the potion it costs)
  armor: {
    needs: ['potionCost', 'armorMin', 'armorMult'],
    afford: (run, o) => run.potions >= o.potionCost,
    apply(run, o) {
      run.potions = Math.max(0, run.potions - o.potionCost);
      run.stats.armor = Math.max(run.stats.armor + o.armorMin, Math.round(run.stats.armor * o.armorMult));
    },
  },
  // lifesteal for max HP
  leech: {
    needs: ['hpCostPct', 'lifestealAdd', 'lifestealCap'],
    afford: (run) => hpFloorOk(run),
    apply(run, o) { payHp(run, o.hpCostPct); run.stats.lifesteal = Math.min(o.lifestealCap, run.stats.lifesteal + o.lifestealAdd); },
  },
  // armor for damage: flat armorAdd or a share of current armor, whichever is more (0.091 —
  // a flat bonus stopped mattering late while the damage cost kept hurting)
  bulwark: {
    needs: ['armorPct', 'armorAdd', 'dmgCostPct'],
    afford: (run) => dmgFloorOk(run),
    apply(run, o) { payDmg(run, o.dmgCostPct); run.stats.armor += Math.max(o.armorAdd, Math.round(run.stats.armor * o.armorPct)); },
  },
  // potions and a full heal for coins; overCap (0.091): these potions ignore the satchel for
  // this run (any left over are capped at settle), otherwise a full satchel sells them
  secondwind: {
    needs: ['coinCost', 'potionsAdd'],
    afford: coinsOk,
    apply(run, o) {
      payCoins(run, o);
      if (o.overCap) run.potions += o.potionsAdd;
      else for (let i = 0; i < o.potionsAdd; i++) addPotion(run);
      run.hp = run.maxHp;
    },
  },
  // a quicker heavy for max HP: the cooldown starts at the class's heavyCd (heroes.json,
  // meta/stats.js) and each quicken drops it (floor 1); a charge class (the wizard, 0.00258,
  // live 0.00267) gets a charge a fight instead — its cooldown is already 1
  quicken: {
    needs: ['hpCostPct', 'cdReduce'],
    afford: (run) => hpFloorOk(run) && (usesCharges(run.stats.klass) || run.stats.heavyCdMax > 1),
    apply(run, o) {
      payHp(run, o.hpCostPct);
      if (usesCharges(run.stats.klass)) run.stats.klass.charges += o.cdReduce;
      else run.stats.heavyCdMax = Math.max(1, run.stats.heavyCdMax - o.cdReduce);
    },
  },
  // kill coins for damage (runState.applyLoot reads run.coinMult)
  greed: {
    needs: ['dmgCostPct', 'coinMultAdd'],
    afford: (run) => dmgFloorOk(run),
    apply(run, o) { payDmg(run, o.dmgCostPct); run.coinMult = run.coinMult + o.coinMultAdd; },
  },
  // damage for armor
  glasscannon: {
    needs: ['minArmor', 'dmgMult', 'armorCostPct'],
    afford: (run, o) => run.stats.armor >= o.minArmor,
    apply(run, o) {
      run.stats.armor = Math.floor(run.stats.armor * (1 - o.armorCostPct));
      run.stats.dmg = Math.round(run.stats.dmg * o.dmgMult);
    },
  },
};

export function canAffordOffer(run, o) {
  return BOONS[o.id]?.afford(run, o) ?? false; // (an id without an entry: never affordable, as the switch's default was)
}

// Apply the cost AND the buff. Caller re-renders.
// A shrine's deal, noted on the run for the play stats (0.00252: the record
// used to say only what was taken — "never offered" and "passed over" read alike).
export function noteDeal(run, offers) {
  (run.shrines ??= []).push({ o: offers.map((x) => x.id), t: null });
}

// A boon's line as this class reads it (0.00277): Quicken gives a charge
// class (the Wizard) a charge, not a shorter cooldown — the card and the
// buff bar say so; every other boon's line is the data's.
export function buffText(o, run) {
  return o.id === 'quicken' && usesCharges(run.stats.klass) ? `HEAVY CHARGE +${o.cdReduce}` : o.buff;
}
export function acceptOffer(run, o) {
  const met = run.shrines?.at(-1);
  if (met && met.t === null && met.o.includes(o.id)) met.t = o.id; // (the shrine at hand: its deal is the last noted)
  BOONS[o.id]?.apply(run, o);
  // label: the compact buff-bar text (0.096); full: the shrine card's text
  run.buffs.push({ icon: o.icon, img: o.img, label: o.short ?? buffText(o, run), full: buffText(o, run), id: o.id }); // id: run history
}
