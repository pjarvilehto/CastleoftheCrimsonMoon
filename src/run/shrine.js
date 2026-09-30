// run/shrine.js — shrine room: one-time boon trades.
// Offer data lives in assets/data/shrines.json — display text AND every
// number (costs, multipliers, caps) since 0.079; the `id` maps to the apply
// logic below (a fixed set — add new boons in BOTH places).
// All buffs are run-scoped: they die with the run.

import { DATA } from '../shared/data.js';

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
  return pool.slice(0, 3);
}

// Coin-priced boons scale with depth (0.072): at room 1 the price is the
// base; deeper shrines charge more, so rich late profiles can't auto-yes.
export function coinCost(base, roomNumber) {
  const growth = DATA.shrines.coinCostGrowthPerRoom ?? 0.5;
  return Math.round(base * (1 + growth * Math.max(0, roomNumber - 1)));
}

// Display text for an offer's cost — dynamic for coin-priced boons so the
// card shows what will ACTUALLY be charged at this depth.
export function costText(offer, roomNumber) {
  if (offer.coinCost) return `-${coinCost(offer.coinCost, roomNumber)} COINS`;
  return offer.costDesc;
}

const hpFloorOk = (run) => run.maxHp > (DATA.shrines.minMaxHp ?? 5); // keep a sane HP floor
const dmgFloorOk = (run) => run.stats.dmg > (DATA.shrines.minDmg ?? 5);
const coinsOk = (run, o) => run.coins >= coinCost(o.coinCost, run.roomNumber);

export function canAffordOffer(run, o) {
  switch (o.id) {
    case 'dmg': return hpFloorOk(run);
    case 'crit': return coinsOk(run, o);
    case 'armor': return run.potions >= (o.potionCost ?? 1);
    case 'leech': return hpFloorOk(run);
    case 'bulwark': return dmgFloorOk(run);
    case 'secondwind': return coinsOk(run, o);
    case 'quicken': return hpFloorOk(run) && (run.stats.heavyCdMax ?? 3) > 1;
    case 'greed': return dmgFloorOk(run);
    case 'glasscannon': return run.stats.armor >= (o.minArmor ?? 2);
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
  run.coins = Math.max(0, run.coins - coinCost(o.coinCost, run.roomNumber));
}

// Apply the cost AND the buff. Caller re-renders.
export function acceptOffer(run, o) {
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
      // Percentage of CURRENT armor, not a flat point grant.
      run.stats.armor = Math.round(run.stats.armor * o.armorMult);
      break;
    case 'leech':
      payHp(run, o.hpCostPct);
      run.stats.lifesteal = Math.min(o.lifestealCap, (run.stats.lifesteal || 0) + o.lifestealAdd);
      break;
    case 'bulwark':
      payDmg(run, o.dmgCostPct);
      run.stats.armor += o.armorAdd;
      break;
    case 'secondwind':
      payCoins(run, o);
      run.potions += o.potionsAdd;
      run.hp = run.maxHp;
      break;
    case 'quicken':
      payHp(run, o.hpCostPct);
      // Heavy cooldown starts at player.baseHeavyCd; each quicken drops it (floor 1).
      run.stats.heavyCdMax = Math.max(1, (run.stats.heavyCdMax ?? 3) - o.cdReduce);
      break;
    case 'greed':
      payDmg(run, o.dmgCostPct);
      // Kill coins multiplier — runState.applyLoot reads run.coinMult.
      run.coinMult = (run.coinMult ?? 1) + o.coinMultAdd;
      break;
    case 'glasscannon':
      run.stats.armor = Math.floor(run.stats.armor * (1 - o.armorCostPct));
      run.stats.dmg = Math.round(run.stats.dmg * o.dmgMult);
      break;
  }
  run.buffs.push({ icon: o.icon, label: o.buff });
}
