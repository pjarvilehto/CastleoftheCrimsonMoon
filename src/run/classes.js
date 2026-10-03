// run/classes.js — the class registry (0.00283): what each heavy kind does
// and the classes' passives, as hooks the engine (run/combat.js) calls — the
// one place the class logic lives. It used to be a string switch on the
// heavy's kind spread over combat.js (classPhase, the knight-only guards in
// smash and strike, the thrall and the roots in the foes' turn), with the
// kinds and the keys repeated in shared/dataCheck.js and heroes.json's
// doc string.
//
// The data is heroes.json `class` per hero: every key of CLASS_KEYS on
// every hero (0 = off) and `heavy` one of HEAVY_KINDS — dataCheck.js
// checks both from here. meta/stats.js snapshots the block as
// run.stats.klass (with the signature items' mastery in); every number a
// hook reads comes from that block, nothing is tuned here (rule 2).
//
// A hook gets the combat and the turn's two outputs, `turn = { push, hurt }`:
// push(ev) records an event (combat.js adds the state snapshot), hurt(idx,
// dmg, ev) takes dmg off the foe at idx and pushes its line and, when it
// fell, its kill (combat.js damageFoe). The engine calls the hooks in a
// fixed order — classPhase: the heavy's onHeavy, then AFTER_BLOW in list
// order; a foe's turn: FOE_TURN.hold before the blow is rolled, FOE_TURN.take
// before the dodge roll, FOE_TURN.end after every foe — the same order the
// if/else chain had, so the events and the Math.random() calls fall in the
// same places and the simulator's output is byte-identical to 0.00277.

/** The heavy kinds (heroes.json class.heavy). */
export const HEAVY_KINDS = ['blow', 'cleave', 'fireball', 'drain', 'mark', 'censer', 'entangle'];
/** Every numeric key of a class block — present on every hero. */
export const CLASS_KEYS = ['hpMult', 'dmgMult', 'armorMult', 'potionHealMult', 'dodge', 'heavyCd', 'heavyMult', 'charges', 'cleaveShare', 'rage', 'drainShare', 'thrallShare', 'entangleTurns', 'entangleChance', 'mend', 'blightShare', 'potionArmor', 'markCrit', 'chargeOnKill'];

/** The elements a foe can be immune to (enemies.json `immune.<element>`, a chance 0-1 per enemy —
 *  0.00293, the developer's ask: the undead and the vermin shrug the blight off, the fire-born the fire):
 *  a heavy with an `element` rolls it on every foe it would touch; an immune foe prints "Immune!" and takes nothing. */
export const ELEMENTS = ['blight', 'fire'];
/** The roll: the chance is the foe's own (scaleEnemy copies it); a chance of 0 spends no roll, so the
 *  classes without an element play exactly as before. */
export const rollImmune = (enemy, element) => enemy.immune?.[element] > 0 && Math.random() < enemy.immune[element];
const immuneLine = { blight: (name) => `The smoke passes ${name} by — Immune!`, fire: (name) => `The fire washes over ${name} — Immune!` };
/** The event a shrugged-off heavy prints (combat.js pushes it; ui: an IMMUNE floating over the card, a grey line). */
export const immuneEvent = (combat, idx, element) => ({ type: 'immune', text: immuneLine[element](combat.enemies[idx].name), target: idx, element });

/** A charge class (the Wizard): its heavy spends charges, refilled a fight, not a cooldown — combat.js canHeavy / useHeavy, shrine.js Quicken, the button's pips. */
export const usesCharges = (klass) => klass.charges > 0;

const living = (combat) => combat.enemies.filter((e) => e.hp > 0);

// A heavy's reach past its target (the Barbarian's cleave, the Wizard's
// fireball): `dmg` on every other living foe, each its own line (`via` the
// kind: the fire's or the cleave's own particles, 0.00268), a MULTI-KILL
// line for two or more. With an element (the fire), every foe reached
// rolls its immunity first (0.00293).
function sweep(combat, targetIndex, dmg, kind, line, turn, element = null) {
  let kills = 0;
  for (const [i, e] of combat.enemies.entries()) {
    if (i === targetIndex || e.hp <= 0 || dmg <= 0) continue;
    if (element && rollImmune(e, element)) { turn.push(immuneEvent(combat, i, element)); continue; }
    turn.hurt(i, dmg, (applied) => ({ type: 'spill', text: line(e.name, applied), target: i, dmg: applied, via: kind }));
    if (e.hp === 0) kills += 1;
  }
  if (kills >= 2) turn.push({ type: 'multi', text: `MULTI-KILL! One blow fells ${kills} enemies!` });
}

/** The heavies by kind. `spills`: the blow itself strikes through (combat.js strike, at spillThreshold)
 *  and OVERKILLs a room it covers (smash) — the knight's alone; `element` (0.00293): the heavy is that
 *  element, and a foe immune to it shrugs it off — the target its blow (combat.js playerAttack: no damage,
 *  no lifesteal, the charge or cooldown spent all the same), the others the reach or the stacks here;
 *  `onHeavy(combat, targetIndex, hit, turn)`: what the heavy does once its blow has landed (after the lifesteal). */
export const HEAVIES = {
  // the knight's: the blow is the whole heavy
  blow: { spills: true },
  // the Barbarian's: cleaveShare of the blow on every other foe
  cleave: {
    spills: false,
    onHeavy: (combat, i, { dmg }, turn) => sweep(combat, i, Math.round(dmg * combat.run.stats.klass.cleaveShare), 'cleave', (name, applied) => `...the cleave catches ${name} for ${applied}!`, turn),
  },
  // the Wizard's: the whole blow on every other foe (a charge a cast, canHeavy); the fire-born shrug it off (0.00293)
  fireball: {
    spills: false,
    element: 'fire',
    onHeavy: (combat, i, { dmg }, turn) => sweep(combat, i, dmg, 'fireball', (name, applied) => `...the fire takes ${name} for ${applied}!`, turn, 'fire'),
  },
  // the Necromancer's: drainShare of the blow healed (drain: the soul wisps from the foe to his card, 0.00268)
  drain: {
    spills: false,
    onHeavy(combat, i, { dmg }, { push }) {
      const run = combat.run;
      const healed = Math.min(run.maxHp - run.hp, Math.round(dmg * run.stats.klass.drainShare));
      if (healed > 0) { run.hp += healed; push({ type: 'heal', text: `You drain ${healed} HP from the blow.`, healed, drain: true, target: i }); }
    },
  },
  // the Hexhunter's: the target hexed — every hit on it crits (combat.js rollHit, + markCrit)
  mark: {
    spills: false,
    onHeavy(combat, i, hit, { push }) {
      const t = combat.enemies[i];
      if (t.hp > 0) { combat.marked = i; push({ type: 'mark', text: `You hex ${t.name}: every blow on it will strike true.`, target: i }); }
    },
  },
  // the Plague Sister's: a blight stack on every living foe (blightTick gnaws them a turn); the undead and
  // the vermin roll their immunity and shrug it off (0.00293) — the stacks land first, so the smoke's
  // line shows them, then an Immune! line per foe that shrugged
  censer: {
    spills: false,
    element: 'blight',
    onHeavy(combat, i, hit, { push }) {
      const immune = [];
      for (const [idx, e] of combat.enemies.entries()) {
        if (e.hp <= 0) continue;
        if (rollImmune(e, 'blight')) immune.push(idx); else e.blight += 1;
      }
      push({ type: 'blight', text: 'Your censer\'s smoke settles on every foe.' });
      for (const idx of immune) push(immuneEvent(combat, idx, 'blight'));
    },
  },
  // the Druid's (0.00271): roots bind every living foe for entangleTurns of its turns (rootsHold rolls each)
  entangle: {
    spills: false,
    onHeavy(combat, i, hit, { push }) {
      const turns = combat.run.stats.klass.entangleTurns;
      for (const e of living(combat)) e.entangled = turns;
      push({ type: 'entangle', text: `Roots burst from the ground and bind every foe for ${turns} turns.` });
    },
  },
};

// ---- the passives after the blow (classPhase), in this order ----

// the Wizard's charges come back with the kills (a fireball through a room
// refills it; a boss's summons feed it): deadBefore = the fallen before the blow
function chargeOnKill(combat, deadBefore, { push }) {
  const k = combat.run.stats.klass;
  if (!(k.chargeOnKill > 0)) return;
  const kills = combat.enemies.filter((e) => e.hp <= 0).length - deadBefore;
  if (kills > 0 && combat.charges < k.charges) {
    combat.charges = Math.min(k.charges, combat.charges + k.chargeOnKill * kills);
    push({ type: 'charge', text: `The kill feeds your grimoire: ${combat.charges} charge${combat.charges === 1 ? '' : 's'}.` });
  }
}
// the Plague Sister's blight: blightShare of her damage a stack, on every blighted foe
function blightTick(combat, deadBefore, { hurt }) {
  const run = combat.run, k = run.stats.klass;
  if (!(k.blightShare > 0)) return;
  for (const [i, e] of combat.enemies.entries()) {
    if (e.hp <= 0 || e.blight <= 0) continue;
    hurt(i, Math.max(1, Math.round(run.stats.dmg * k.blightShare * e.blight)), (dealt) => ({ type: 'spill', text: `The blight gnaws ${e.name} for ${dealt}.`, target: i, dmg: dealt, via: 'blight' }));
  }
}
// the Druid's mending: a share of max HP a turn
function mend(combat, deadBefore, { push }) {
  const run = combat.run, k = run.stats.klass;
  if (!(k.mend > 0) || run.hp >= run.maxHp) return;
  const healed = Math.min(run.maxHp - run.hp, Math.max(1, Math.round(run.maxHp * k.mend)));
  run.hp += healed;
  push({ type: 'heal', text: `Your wounds knit for ${healed} HP.`, healed });
}
// the Necromancer's thrall: this turn's (newest) fallen foe rises with thrallShare of its max HP, one at a time
function thrallRaise(combat, deadBefore, { push }) {
  const k = combat.run.stats.klass;
  if (!(k.thrallShare > 0) || combat.thrall?.hp > 0) return;
  const fallen = [...combat.enemies].reverse().find((e) => e.hp <= 0 && !e.raised);
  if (!fallen) return;
  fallen.raised = true;
  combat.thrall = { name: `thrall ${fallen.name}`, hp: Math.max(1, Math.round(fallen.maxHp * k.thrallShare)) };
  combat.thrall.maxHp = combat.thrall.hp;
  push({ type: 'thrall', text: `${fallen.name} rises again at your side.` });
}
/** After the blow and the lifesteal, in this order: `hook(combat, deadBefore, turn)`. */
export const AFTER_BLOW = [chargeOnKill, blightTick, mend, thrallRaise];

// ---- the foes' turn (combat.js enemyPhase / enemyStrike) ----

// the Druid's roots (0.00271): a bound foe rolls to attack at all — the roll is spent only on a bound foe
function rootsHold(combat, enemy, source, { push }) {
  if (!(enemy.entangled > 0 && Math.random() < combat.run.stats.klass.entangleChance)) return false;
  push({ type: 'entangled', text: `${enemy.name} strains against the roots — Entangled!`, source });
  return true;
}
// the Necromancer's thrall takes the rolled blow instead, unarmored
function thrallTakes(combat, enemy, raw, source, { push }) {
  const t = combat.thrall;
  if (!(t?.hp > 0)) return false;
  const taken = Math.min(t.hp, raw);
  t.hp -= taken;
  push({ type: 'thrallhit', text: `${enemy.name} hits your thrall for ${taken}.`, taken, source });
  if (t.hp === 0) push({ type: 'thrallfall', text: 'Your thrall crumbles.' });
  return true;
}
// the roots loosen a turn once every foe has acted
function rootsLoosen(combat) {
  for (const e of combat.enemies) if (e.entangled > 0) e.entangled -= 1;
}
/** hold(combat, enemy, source, turn) before a foe's blow is rolled — true: its turn is over;
 *  take(combat, enemy, raw, source, turn) with the rolled blow, before the dodge — true: something else took it;
 *  end(combat) once every foe has acted. */
export const FOE_TURN = { hold: [rootsHold], take: [thrallTakes], end: [rootsLoosen] };
