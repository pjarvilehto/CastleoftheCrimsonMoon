// run/shrine.js — shrine room: one-time boon trades.
// Offer data lives in assets/data/shrines.json — display text AND every
// number (costs, multipliers, caps) since 0.079; the `id` maps to the apply
// logic below (a fixed set — add new boons in BOTH places).
// All buffs are run-scoped: they die with the run.

import { DATA } from '../shared/data.js';
import { addPotion } from './runState.js';

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

export function canAffordOffer(run, o) {
  switch (o.id) {
    case 'dmg': return hpFloorOk(run);
    case 'crit': return coinsOk(run, o);
    case 'armor': return run.potions >= o.potionCost;
    case 'leech': return hpFloorOk(run);
    case 'bulwark': return dmgFloorOk(run);
    case 'secondwind': return coinsOk(run, o);
    case 'quicken': return hpFloorOk(run) && run.stats.heavyCdMax > 1;
    case 'greed': return dmgFloorOk(run);
    case 'glasscannon': return run.stats.armor >= o.minArmor;
    default: return false;
  }
}

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

// Apply the cost AND the buff. Caller re-renders.
// A shrine's deal, noted on the run for the play stats (0.00252: the record
// used to say only what was taken — "never offered" and "passed over" read alike).
export function noteDeal(run, offers) {
  (run.shrines ??= []).push({ o: offers.map((x) => x.id), t: null });
}

export function acceptOffer(run, o) {
  const met = run.shrines?.at(-1);
  if (met && met.t === null && met.o.includes(o.id)) met.t = o.id; // (the shrine at hand: its deal is the last noted)
  switch (o.id) {
    case 'dmg':
      payHp(run, o.hpCostPct);
      run.stats.dmg = Math.round(run.stats.dmg * o.dmgMult);
      break;
    case 'crit':
      payCoins(run, o);
      run.stats.crit = Math.min(o.critCap, run.stats.crit + o.critAdd);
      break;
    case 'armor':
      run.potions = Math.max(0, run.potions - o.potionCost);
      // Percentage of CURRENT armor, with a floor (armorMin, 0.091): 25% of
      // a starting armor was next to nothing — not worth the potion it costs.
      run.stats.armor = Math.max(run.stats.armor + o.armorMin, Math.round(run.stats.armor * o.armorMult));
      break;
    case 'leech':
      payHp(run, o.hpCostPct);
      run.stats.lifesteal = Math.min(o.lifestealCap, run.stats.lifesteal + o.lifestealAdd);
      break;
    case 'bulwark':
      payDmg(run, o.dmgCostPct);
      // Flat armorAdd or a share of current armor, whichever is more (0.091):
      // a flat bonus stopped mattering late while -10% damage kept hurting.
      run.stats.armor += Math.max(o.armorAdd, Math.round(run.stats.armor * o.armorPct));
      break;
    case 'secondwind':
      payCoins(run, o);
      // overCap (0.091): these potions ignore the satchel for this run (any
      // left over are capped at settle); otherwise a full satchel sells them.
      if (o.overCap) run.potions += o.potionsAdd;
      else for (let i = 0; i < o.potionsAdd; i++) addPotion(run);
      run.hp = run.maxHp;
      break;
    case 'quicken':
      payHp(run, o.hpCostPct);
      // Heavy cooldown starts at player.baseHeavyCd; each quicken drops it (floor 1).
      run.stats.heavyCdMax = Math.max(1, run.stats.heavyCdMax - o.cdReduce);
      break;
    case 'greed':
      payDmg(run, o.dmgCostPct);
      // Kill coins multiplier — runState.applyLoot reads run.coinMult.
      run.coinMult = run.coinMult + o.coinMultAdd;
      break;
    case 'glasscannon':
      run.stats.armor = Math.floor(run.stats.armor * (1 - o.armorCostPct));
      run.stats.dmg = Math.round(run.stats.dmg * o.dmgMult);
      break;
  }
  // label: the compact buff-bar text (0.096); full: the shrine card's text
  run.buffs.push({ icon: o.icon, img: o.img, label: o.short ?? o.buff, full: o.buff, id: o.id }); // id: run history
}
