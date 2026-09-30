// run/shrine.js — shrine room: one-time boon trades.
// Offer data lives in assets/data/shrines.json; the `id` maps to the
// apply logic below (a fixed set — add new boons in BOTH places).
// All buffs are run-scoped: they die with the run.

import { DATA } from '../shared/data.js';

export function shrineOffers() {
  return DATA.shrines.offers;
}

// Coin-priced boons scale with depth (0.072): at room 2 the price is the
// base; deeper shrines charge more, so rich late profiles can't auto-yes.
export function coinCost(base, roomNumber) {
  return Math.round(base * (1 + 0.5 * Math.max(0, roomNumber - 1)));
}

// Display text for an offer's cost — dynamic for coin-priced boons so the
// card shows what will ACTUALLY be charged at this depth.
export function costText(offer, roomNumber) {
  if (offer.id === 'crit') return `-${coinCost(50, roomNumber)} COINS`;
  if (offer.id === 'secondwind') return `-${coinCost(75, roomNumber)} COINS`;
  return offer.costDesc;
}

export function canAffordOffer(run, offer) {
  switch (offer.id) {
    case 'dmg': return run.maxHp > 5; // keep a sane HP floor
    case 'crit': return run.coins >= coinCost(50, run.roomNumber);
    case 'armor': return run.potions >= 1;
    case 'leech': return run.maxHp > 5; // same sane HP floor as dmg
    case 'bulwark': return run.stats.dmg > 5;
    case 'secondwind': return run.coins >= coinCost(75, run.roomNumber);
    case 'quicken': return run.maxHp > 5 && (run.stats.heavyCdMax ?? 3) > 1;
    case 'greed': return run.stats.dmg > 5;
    case 'glasscannon': return run.stats.armor >= 2;
    default: return false;
  }
}

// Apply the cost AND the buff. Caller re-renders.
export function acceptOffer(run, offer) {
  switch (offer.id) {
    case 'dmg':
      run.maxHp = Math.max(1, Math.round(run.maxHp * 0.85));
      run.hp = Math.min(run.hp, run.maxHp);
      run.stats.dmg = Math.round(run.stats.dmg * 1.25);
      break;
    case 'crit':
      run.coins = Math.max(0, run.coins - coinCost(50, run.roomNumber));
      run.stats.crit = Math.min(0.95, run.stats.crit + 0.10);
      break;
    case 'armor':
      run.potions = Math.max(0, run.potions - 1);
      // Percentage of CURRENT armor, not a flat point grant.
      run.stats.armor = Math.round(run.stats.armor * 1.25);
      break;
    case 'leech':
      run.maxHp = Math.max(1, Math.round(run.maxHp * 0.85));
      run.hp = Math.min(run.hp, run.maxHp);
      run.stats.lifesteal = Math.min(0.6, (run.stats.lifesteal || 0) + 0.10);
      break;
    case 'bulwark':
      run.stats.dmg = Math.max(1, Math.round(run.stats.dmg * 0.90));
      run.stats.armor += 5;
      break;
    case 'secondwind':
      run.coins = Math.max(0, run.coins - coinCost(75, run.roomNumber));
      run.potions += 1;
      run.hp = run.maxHp;
      break;
    case 'quicken':
      run.maxHp = Math.max(1, Math.round(run.maxHp * 0.85));
      run.hp = Math.min(run.hp, run.maxHp);
      // Heavy cooldown floor is 3 (combat.js useHeavy); each quicken drops 1.
      run.stats.heavyCdMax = Math.max(1, (run.stats.heavyCdMax ?? 3) - 1);
      break;
    case 'greed':
      run.stats.dmg = Math.max(1, Math.round(run.stats.dmg * 0.90));
      // Kill coins multiplier — runState.applyLoot reads run.coinMult.
      run.coinMult = (run.coinMult ?? 1) + 0.4;
      break;
    case 'glasscannon':
      run.stats.armor = Math.floor(run.stats.armor / 2);
      run.stats.dmg = Math.round(run.stats.dmg * 1.5);
      break;
  }
  run.buffs.push({ icon: offer.icon, label: offer.buff });
}
