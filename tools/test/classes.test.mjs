// classes.test.mjs — the classes' gameplay (drafted 0.00258, shipped 0.00266,
// the developer's call: "we can edit and finetune once I get to play"):
// heroes.json class per hero through stats.js derivedStats into
// run.stats.klass, the seven heavies and the passives in combat.js
// (classPhase, sweep, the thrall, the charges), the wild shape's potion
// block in runState.js, and the combat UI's minimum: the charges and the
// feral turns on the hero's button, the HEXED / BLIGHT tag on a foe's card,
// a colour per new log line.
import { ok, fresh, DATA, createRun, createCombat, playerAttack, getProfile, readFileSync } from './harness.mjs';

const { useHeavy, canHeavy } = await import('../../src/run/combat.js');
const { drinkPotion } = await import('../../src/run/runState.js');
const { createPlayerUnit, createEnemyUnit } = await import('../../src/ui/battleLine.js');
const { derivedStats } = await import('../../src/meta/stats.js');

const as = (id) => { getProfile().hero = { id, look: 0 }; const run = createRun(); run.stats.crit = 0; return run; };
const foe = (hp, dmg = 0, name = 'Rat') => ({ id: 'rat', name, maxHp: hp, hp, dmg, xp: 1, coins: [1, 1] });
const room = (run, enemies) => createCombat(run, { number: 1, kind: 'combat', isBoss: false, background: 'x', name: 'T', enemies });
const heavy = (cb, i = 0) => { useHeavy(cb); return playerAttack(cb, i, true); };
const types = (evs) => evs.map((e) => e.type);

// the block itself
{
  fresh();
  const knight = DATA.heroes.heroes.find((h) => h.id === 'knight').class;
  ok('the knight\'s class block is the neutral one (his path is the game as it was)', knight.heavy === 'blow' && knight.hpMult === 1 && knight.dmgMult === 1 && knight.armorMult === 1 && knight.heavyMult === 1 && knight.charges === 0 && knight.dodge === 0 && knight.rage === 0 && knight.thrallShare === 0 && knight.mend === 0 && knight.blightShare === 0);
  const base = derivedStats();
  getProfile().hero = { id: 'barbarian', look: 0 };
  const b = derivedStats(), k = DATA.heroes.heroes.find((h) => h.id === 'barbarian').class;
  ok('a class scales the derived HP, damage and armor and sets the heavy\'s cooldown (the Barbarian)', b.maxHp === Math.round(base.maxHp * k.hpMult) && b.dmg === Math.round(base.dmg * k.dmgMult) && b.armor === Math.round(base.armor * k.armorMult) && b.heavyCdMax === k.heavyCd && b.klass.heavy === 'cleave');
  getProfile().hero = { id: 'hexhunter', look: 0 };
  ok('the Hexhunter\'s dodge is the class\'s plus the gear\'s', derivedStats().dodge === DATA.heroes.heroes.find((h) => h.id === 'hexhunter').class.dodge + base.dodge);
  getProfile().hero = null;
}

// the Barbarian: the cleave reaches the other foes
{
  fresh();
  const run = as('barbarian');
  const cb = room(run, [foe(100000), foe(100000), foe(100000)]);
  const evs = heavy(cb, 1);
  const spills = evs.filter((e) => e.type === 'spill');
  const share = run.stats.klass.cleaveShare, blow = evs.find((e) => e.type === 'atk').dmg;
  ok('Cleave: the blow lands, and cleaveShare of it on every other living foe', spills.length === 2 && spills.every((s) => s.dmg === Math.round(blow * share) && s.target !== 1) && cb.enemies[0].hp === 100000 - Math.round(blow * share));
  run.hp = Math.round(run.maxHp * 0.1);
  const low = room(run, [foe(100000)]);
  const dmgLow = playerAttack(low, 0, false).find((e) => e.type === 'atk').dmg;
  run.hp = run.maxHp;
  const dmgFull = playerAttack(room(run, [foe(100000)]), 0, false).find((e) => e.type === 'atk').dmg;
  ok('rage: a blow hits harder the lower the Barbarian\'s HP', dmgLow > dmgFull);
}

// the Wizard: the fireball takes every foe; charges, not a cooldown; a kill gives one back
{
  fresh();
  const run = as('wizard');
  const k = run.stats.klass;
  const cb = room(run, [foe(100000), foe(100000), foe(1)]);
  ok('the Wizard starts a fight with its charges', cb.charges === k.charges && canHeavy(cb));
  const evs = heavy(cb, 0);
  const blow = evs.find((e) => e.type === 'atk').dmg, spills = evs.filter((e) => e.type === 'spill');
  ok('Fireball: the full blow on every other foe', spills.length === 2 && spills.some((s) => s.dmg === blow) && cb.enemies[2].hp === 0);
  ok('a kill feeds the grimoire (chargeOnKill): the charge spent comes back, the log says so', cb.charges === k.charges && types(evs).includes('charge') && types(evs).includes('kill'));
  const dry = room(run, [foe(100000)]);
  for (let i = 0; i < k.charges; i++) { heavy(dry, 0); dry.heavyCd = 0; }
  ok('out of charges the heavy button is dead until a kill', dry.charges === 0 && !canHeavy(dry));
}

// the Necromancer: the drain heals; a fallen foe rises as a thrall that takes the blows
{
  fresh();
  const run = as('necromancer');
  run.hp = Math.round(run.maxHp / 2);
  const cb = room(run, [foe(1, 50), foe(100000, 50)]);
  const evs = heavy(cb, 0);
  const healEv = evs.find((e) => e.type === 'heal');
  ok('Soul Drain heals drainShare of the blow', healEv && healEv.healed === Math.round(evs.find((e) => e.type === 'atk').dmg * run.stats.klass.drainShare));
  ok('the kill raises a thrall of thrallShare of its max HP', types(evs).includes('thrall') && cb.thrall && cb.thrall.maxHp === Math.max(1, Math.round(1 * run.stats.klass.thrallShare)));
  ok('the foes\' blows land on the thrall, not the Necromancer (thrallhit, then thrallfall)', types(evs).includes('thrallhit') && !types(evs).includes('dmg') && (cb.thrall.hp === 0 ? types(evs).includes('thrallfall') : true));
}

// the Druid: Go Feral — wildMult damage for wildTurns, no potion meanwhile; mend a turn
{
  fresh();
  const run = as('druid');
  const k = run.stats.klass;
  run.potions = 3; run.hp = Math.round(run.maxHp / 2);
  const cb = room(run, [foe(100000)]);
  const hpBefore = run.hp;
  const evs = heavy(cb, 0);
  ok('Go Feral sets the wild shape for wildTurns (the turn after the shape is taken counts down from wildTurns)', types(evs).includes('wild') && run.wild === k.wildTurns);
  ok('no potion in the beast\'s shape', drinkPotion(run) === false && run.potions === 3);
  const wildDmg = playerAttack(cb, 0, false).find((e) => e.type === 'atk').dmg;
  ok('a feral blow is wildMult of the Druid\'s damage', wildDmg === Math.round(run.stats.dmg * k.wildMult));
  ok('mend: the Druid\'s wounds knit a share of max HP a turn', evs.some((e) => e.type === 'heal' && e.healed === Math.max(1, Math.round(run.maxHp * k.mend))) && run.hp > hpBefore);
  run.wild = 0;
  ok('the shape gone, a potion goes down again', drinkPotion(run) !== false);
}

// the Hexhunter: every blow on the hexed foe crits, with the hex's own crit damage
{
  fresh();
  const run = as('hexhunter');
  const cb = room(run, [foe(100000), foe(100000)]);
  const evs = heavy(cb, 1);
  ok('Hex marks the target (the log names it)', types(evs).includes('mark') && cb.marked === 1 && evs.find((e) => e.type === 'mark').text.includes('Rat'));
  const onMark = playerAttack(cb, 1, false).find((e) => e.type === 'atk');
  const plain = playerAttack(cb, 0, false).find((e) => e.type === 'atk');
  const tune = DATA.difficulty.combat; // (a crit's damage is jittered and may go mega: the floor of the range is asserted, with markCrit in it)
  const floor = Math.round(run.stats.dmg * (tune.critMult + run.stats.critBonus + run.stats.klass.markCrit - tune.critJitter)) - 1;
  ok('a blow on the hexed foe always crits (the crit multiplier plus markCrit, no roll spent); the other foe takes a plain blow', onMark.crit && !plain.crit && onMark.dmg >= floor && onMark.dmg > plain.dmg && plain.dmg === run.stats.dmg, `${onMark.dmg} vs floor ${floor}, plain ${plain.dmg}`);
}

// the Plague Sister: the censer's blight stacks on every foe and gnaws a turn; a potion adds armor
{
  fresh();
  const run = as('plaguesister');
  const k = run.stats.klass;
  const cb = room(run, [foe(100000), foe(100000)]);
  const evs = heavy(cb, 0);
  ok('Last Rites: a blight stack on every living foe, ticking the same turn', types(evs).includes('blight') && cb.enemies.every((e) => e.blight === 1) && evs.filter((e) => e.type === 'spill').length === 2);
  const tick = playerAttack(cb, 0, false).filter((e) => e.type === 'spill');
  ok('the blight gnaws blightShare of your damage per stack a turn', tick.length === 2 && tick.every((e) => e.dmg === Math.max(1, Math.round(run.stats.dmg * k.blightShare))));
  heavy({ ...cb, heavyCd: 0 }, 0); // (a second censer on a copy: the stacks are the foes' own)
  ok('a second censer stacks (×2 gnaws twice as hard)', cb.enemies.every((e) => e.blight === 2));
  run.potions = 1; run.hp = 1; const armor = run.tempArmor ?? 0;
  drinkPotion(run);
  ok('a potion adds potionArmor to the Sister\'s armor for the room', (run.tempArmor ?? 0) === armor + k.potionArmor);
}

// the combat UI's minimum
{
  fresh();
  getProfile().hero = { id: 'wizard', look: 0 };
  const run = createRun();
  const u = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
  const label = () => u.el.all((n) => n.className === 'btn-label')[0].textContent;
  u.update({ hp: run.hp, printing: false, dead: false, heavyReady: true, heavyCd: 0, charges: 2, wild: 0 });
  ok('the Wizard\'s button shows its charges as pips (two of three)', label().includes('◆◆◇') && label().startsWith('Fireball'));
  getProfile().hero = { id: 'druid', look: 0 };
  const dr = createRun(); dr.potions = 2; dr.hp = 1;
  const du = createPlayerUnit(dr, { onHeavy() {}, onPotion() {} });
  const dl = () => du.el.all((n) => n.className === 'btn-label')[0].textContent;
  du.update({ hp: 1, printing: false, dead: false, heavyReady: false, heavyCd: 3, charges: 0, wild: 2 });
  const potionBtn = du.el.all((n) => n.tagName === 'button' && n.attrs['data-key'] === 'p')[0];
  ok('the Druid\'s button shows the feral turns and Drink Potion is dead meanwhile', dl().includes('feral 2') && potionBtn.attrs.disabled !== undefined);
  du.update({ hp: 1, printing: false, dead: false, heavyReady: false, heavyCd: 3, charges: 0, wild: 0 });
  ok('…and the cooldown and the potion return with the shape gone', dl().includes('(3)') && potionBtn.attrs.disabled === undefined);
  getProfile().hero = null;
  const e = createEnemyUnit(foe(100), 0, { onAttack() {}, onGone() {} });
  const tag = e.card.all((n) => n.className.includes('foe-tag'))[0];
  e.update({ hp: 100, dead: false, printing: false, combatOver: false, hexed: true, blight: 2 });
  ok('a foe\'s card tags HEXED and the blight stacks, the hexed card marked', tag.textContent === 'HEXED · BLIGHT ×2' && tag.classList.contains('on') && e.card.classList.contains('hexed'));
  e.update({ hp: 100, dead: false, printing: false, combatOver: false, hexed: false, blight: 0 });
  ok('…and clears them', tag.textContent === '' && !tag.classList.contains('on') && !e.card.classList.contains('hexed'));
  const css = readFileSync('styles.css', 'utf8');
  ok('every class event has a log colour (mark, blight, wild, charge, thrall, thrallhit, thrallfall)', ['mark', 'blight', 'wild', 'charge', 'thrall', 'thrallhit', 'thrallfall'].every((c) => css.includes(`#combat-log .${c} `)));
}
