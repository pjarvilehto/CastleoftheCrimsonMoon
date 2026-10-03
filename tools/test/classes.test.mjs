// classes.test.mjs — the classes' gameplay (drafted 0.00258, shipped 0.00267,
// the developer's call: "we can edit and finetune once I get to play"):
// heroes.json class per hero through stats.js derivedStats into
// run.stats.klass, the seven heavies and the passives in combat.js
// (classPhase, sweep, the thrall, the charges), the wild shape's potion
// block in runState.js, and the combat UI's minimum: the charges and the
// feral turns on the hero's button, the HEXED / BLIGHT tag on a foe's card,
// a colour per new log line.
import { ok, fresh, DATA, createRun, createCombat, playerAttack, getProfile, readFileSync, registry, show, sleep, t, dungeonScene, hubScene, withSeedAsync } from './harness.mjs';

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

// the classes' particles (0.00268): a trace per class and blow over the
// foe's own burst, a burst per class event; pure looks, checked here
{
  fresh();
  const { spawnClassBurst, CLASS_LOOKS, CLASS_PAL } = await import('../../src/ui/particles.js');
  const { fxFor, traceFor } = await import('../../src/ui/combatFx.js');
  const kinds = (list) => new Set(list.map((p) => p.kind));
  ok('every class look spawns something, sized by the card', CLASS_LOOKS.every((l) => spawnClassBurst(l, 0, 0, { size: 290 }).length > 0) && spawnClassBurst('nothing', 0, 0, { size: 290 }).length === 0
    && spawnClassBurst('fireball', 0, 0, { size: 580 }).find((p) => p.kind === 'flash').size === spawnClassBurst('fireball', 0, 0, { size: 290 }).find((p) => p.kind === 'flash').size * 2);
  ok('the Barbarian\'s Cleave is a crescent swung the way of the blow, with embers', kinds(spawnClassBurst('cleave', 0, 0, { size: 290, dir: 1 })).has('arc') && spawnClassBurst('cleave', 0, 0, { size: 290, dir: 1 }).find((p) => p.kind === 'arc').sweep > 0
    && spawnClassBurst('cleave', 0, 0, { size: 290, dir: -1 }).find((p) => p.kind === 'arc').sweep < 0 && spawnClassBurst('cleave', 0, 0, { size: 290 }).every((p) => p.kind !== 'streak' || p.mid === CLASS_PAL.rust.mid));
  ok('the Wizard\'s Fireball blooms (an amber flash, fire streaks rising, cinders, smoke — no ring over the foe\'s own); his blows crackle arcane blue', ['flash', 'streak', 'dot', 'puff'].every((k) => kinds(spawnClassBurst('fireball', 0, 0, { size: 290 })).has(k))
    && !kinds(spawnClassBurst('fireball', 0, 0, { size: 290 })).has('ring') && spawnClassBurst('fireball', 0, 0, { size: 290 }).filter((p) => p.kind === 'streak').every((p) => p.g < 0) && spawnClassBurst('arcane', 0, 0, { size: 290 }).every((p) => p.kind !== 'streak' || p.mid === CLASS_PAL.arcane.mid)
    && spawnClassBurst('fireball', 0, 0, { size: 290, kind: 'crit' }).length > spawnClassBurst('fireball', 0, 0, { size: 290 }).length);
  const wisps = spawnClassBurst('drain', 100, 100, { size: 290, to: { x: 500, y: 300 } }).filter((p) => p.kind === 'dot');
  ok('the Necromancer\'s drain: wisps that seek the point given (the hero\'s card), none without one', wisps.length >= 18 && wisps.every((p) => p.tx === 500 && p.ty === 300 && p.pull > 0)
    && spawnClassBurst('drain', 100, 100, { size: 290 }).filter((p) => p.kind === 'dot').every((p) => !p.pull));
  ok('the Druid\'s feral blow is three parallel rakes and leaves; Go Feral bursts leaves all round', spawnClassBurst('claw', 0, 0, { size: 290 }).filter((p) => p.kind === 'slash').length === 3 && kinds(spawnClassBurst('claw', 0, 0, { size: 290 })).has('blob')
    && spawnClassBurst('thorn', 0, 0, { size: 290 }).filter((p) => p.kind === 'slash').length === 1 && spawnClassBurst('wild', 0, 0, { size: 290 }).filter((p) => p.kind === 'blob').length >= 20);
  ok('the Hexhunter\'s Hex is a sigil in a ring; a blow on the hexed foe flares a quicker one', kinds(spawnClassBurst('hex', 0, 0, { size: 290 })).has('sigil') && kinds(spawnClassBurst('hex', 0, 0, { size: 290 })).has('ring')
    && spawnClassBurst('hexhit', 0, 0, { size: 290 }).find((p) => p.kind === 'sigil').life < spawnClassBurst('hex', 0, 0, { size: 290 }).find((p) => p.kind === 'sigil').life && !kinds(spawnClassBurst('hexspark', 0, 0, { size: 290 })).has('sigil'));
  ok('the Plague Sister\'s censer is smoke (puffs that grow) in ochre; the blight\'s gnawing a smaller wisp of it', spawnClassBurst('censer', 0, 0, { size: 290 }).filter((p) => p.kind === 'puff').every((p) => p.grow > 1 && [CLASS_PAL.ochre.dark, CLASS_PAL.ochre.mid].includes(p.color))
    && spawnClassBurst('blight', 0, 0, { size: 290 }).filter((p) => p.kind === 'puff').length < spawnClassBurst('censer', 0, 0, { size: 290 }).filter((p) => p.kind === 'puff').length);
  // the trace a blow leaves, by the class and the blow
  const blow = (o) => ({ kind: 'attack', from: 'player', ...o });
  ok('the trace table: the knight\'s heavy a steel clash and his blows none; each class its own, the hexed foe and the feral blows theirs', traceFor(blow({ heavy: true }), 'blow') === 'steel' && traceFor(blow({}), 'blow') === null
    && traceFor(blow({ heavy: true }), 'cleave') === 'cleave' && traceFor(blow({}), 'cleave') === 'rage' && traceFor(blow({ heavy: true }), 'fireball') === 'fireball' && traceFor(blow({}), 'fireball') === 'arcane'
    && traceFor(blow({}), 'drain') === 'grave' && traceFor(blow({ heavy: true }), 'drain') === 'drain' && traceFor(blow({ wild: true }), 'wildshape') === 'claw' && traceFor(blow({}), 'wildshape') === 'thorn'
    && traceFor(blow({ marked: true }), 'mark') === 'hexhit' && traceFor(blow({}), 'mark') === 'hexspark' && traceFor(blow({ heavy: true }), 'censer') === 'incense');
  ok('the reach of a heavy (via) traces as the fire, the cleave or the blight whatever the class; an enemy\'s blow on the hero leaves none', traceFor({ kind: 'hit', via: 'fireball' }, 'blow') === 'fireball' && traceFor({ kind: 'hit', via: 'cleave' }, 'cleave') === 'cleavespill'
    && traceFor({ kind: 'hit', via: 'blight' }, 'censer') === 'blight' && traceFor({ kind: 'hit' }, 'blow') === null && traceFor({ kind: 'attack', from: 0, to: 'player' }, 'cleave') === null);
  // the events carry what the trace needs
  ok('the class events become effects (mark, blight, wild, charge, thrall, thrallhit, thrallfall), the blow its marked / wild flags, the reach its via, the drain its foe', fxFor({ type: 'mark', target: 2 }).kind === 'mark' && fxFor({ type: 'mark', target: 2 }).to === 2
    && fxFor({ type: 'blight' }).kind === 'blight' && fxFor({ type: 'wild' }).to === 'player' && fxFor({ type: 'charge' }).kind === 'charge' && fxFor({ type: 'thrall' }).kind === 'thrall'
    && fxFor({ type: 'thrallhit', source: 1, taken: 18 }).taken === 18 && fxFor({ type: 'thrallfall' }).kind === 'thrallfall'
    && fxFor({ type: 'atk', target: 0, dmg: 5, marked: true, wild: true }).marked === true && fxFor({ type: 'atk', target: 0, dmg: 5 }).wild === false
    && fxFor({ type: 'spill', target: 1, dmg: 3, via: 'cleave' }).via === 'cleave' && fxFor({ type: 'heal', healed: 9, drain: true, target: 2 }).from === 2 && fxFor({ type: 'heal', healed: 9 }).drain === false);
  getProfile().hero = { id: 'hexhunter', look: 0 };
  const hx = room(as('hexhunter'), [foe(100000), foe(100000)]);
  heavy(hx, 1);
  const onMark = playerAttack(hx, 1, false).find((e) => e.type === 'atk');
  ok('a blow on the hexed foe carries marked (the sigil flares); the Druid\'s feral blow carries wild', onMark.marked === true && (() => { const d = room(as('druid'), [foe(100000)]); heavy(d, 0); return playerAttack(d, 0, false).find((e) => e.type === 'atk').wild === true; })());
  const nc = room(as('necromancer'), [foe(100000)]);
  ok('the drain\'s heal names its foe', (() => { const r = nc.run; r.hp = 1; const ev = heavy(nc, 0).find((e) => e.type === 'heal'); return ev?.drain === true && ev.target === 0; })());
  getProfile().hero = null;
}


// SWITCH CLASS in the debug menu (0.00269): the next class on the save, the
// screen re-rendered — mid-fight the run's stats and the battle line too
{
  fresh();
  const { switchClassButton } = await import('../../src/ui/debugToggles.js');
  const btn = switchClassButton();
  ok('the button names the class on the save (an unchosen save: the knight)', btn.textContent === 'SWITCH CLASS: CURIOUS KNIGHT');
  btn.listeners.click[0]();
  ok('a click moves the save to the next class, first look, and says so', getProfile().hero?.id === 'barbarian' && getProfile().hero.look === 0 && btn.textContent === 'SWITCH CLASS: BARBARIAN');
  for (let i = 0; i < 6; i++) btn.listeners.click[0]();
  ok('…around the ring and back to the knight', getProfile().hero?.id === 'knight');
  // in the Great Hall: the knight card re-renders as the class
  show(hubScene()); await sleep(1300);
  btn.listeners.click[0]();
  const hallCard = () => registry.app.all((n) => (n.className ?? '').includes('knight-card'))[0];
  ok('in the Great Hall the knight card re-renders in the new class\'s colour', (hallCard()?.attrs.style ?? '').includes(DATA.heroes.heroes.find((h) => h.id === 'barbarian').theme.plate));
  // mid-fight: the run's stats, the heavy button and the title follow
  await withSeedAsync(7, async () => {
    show(dungeonScene()); await sleep(1300);
    const title = () => registry.app.all((n) => n.className === 'hero-title card-name')[0]?.textContent;
    const heavyLabel = () => registry.app.all((n) => n.className === 'btn-label')[0]?.textContent.replace(/[\s(◆◇].*$/, '').trim();
    ok('the fight opens as the Barbarian with Cleave', title() === 'THE BARBARIAN' && heavyLabel() === 'Cleave');
    btn.listeners.click[0](); // -> the wizard
    await sleep(100);
    ok('SWITCH CLASS mid-fight: the title and the heavy button are the Wizard\'s, the charges on it, the log says so', title() === 'THE WIZARD' && heavyLabel() === 'Fireball' && registry.app.all((n) => n.className === 'btn-label')[0].textContent.includes('◆◆◆') && t().includes('DEBUG: you fight on as The Wizard'));
    btn.listeners.click[0](); // -> the necromancer: a blow still lands (the run's stats are whole)
    await sleep(100);
    const before = t().length;
    for (let i = 0; i < 3; i++) { registry.app.all((n) => n.tagName === 'button' && n.attrs['data-key'] === 'a' && n.attrs.disabled === undefined)[0]?.listeners.click[0](); await sleep(400); }
    ok('…and the fight goes on as the new class (a blow lands after the switch)', title() === 'THE NECROMANCER' && t().length > before && /You attack/.test(t()));
  });
  getProfile().hero = null;
}

// the classes' sounds (0.00270): a clip per class for the blow, the heavy
// and a blow taken, the class's layers under it; the class events' sounds
{
  fresh();
  const { sfxFor } = await import('../../src/ui/combatQueue.js');
  const { heroList } = await import('../../src/shared/heroes.js');
  const C = DATA.audio.clips, V = DATA.audio.variation;
  const ids = heroList().map((h) => h.id);
  ok('every class has atk_, heavy_ and hurt_ clips, file clips on the two recordings, pitched per class', ids.every((id) => ['atk', 'heavy', 'hurt'].every((k) => C[`${k}_${id}`]?.file && Number.isFinite(C[`${k}_${id}`].measuredDb) && C[`${k}_${id}`].rate?.length === 2))
    && C.atk_barbarian.rate[1] < C.atk_wizard.rate[0] && C.hurt_hexhunter.rate[0] > C.hurt_barbarian.rate[1] && C.atk_knight.file === C.attack.file && C.hurt_knight.file === C.hurt.file);
  ok('each has its own variation with the class\'s synth layers (every layer a synth clip)', ids.every((id) => ['atk', 'heavy', 'hurt'].every((k) => V[`${k}_${id}`]?.layers?.length && V[`${k}_${id}`].layers.every((l) => C[l.name]?.synth)))
    && V.heavy_barbarian.layers.some((l) => l.name === 'swing' && l.p === 1) && V.heavy_wizard.layers.some((l) => l.name === 'crackle') && V.heavy_hexhunter.layers.some((l) => l.name === 'chime')
    && V.heavy_necromancer.layers.some((l) => l.name === 'wail') && V.atk_druid.layers.some((l) => l.name === 'rake') && V.heavy_plaguesister.layers.some((l) => l.name === 'hiss'));
  ok('a blow taken grunts in the class\'s voice: the Barbarian low, the women high; the knight keeps the plain hurt', V.hurt_barbarian.layers[0].name === 'grunt' && V.hurt_barbarian.layerRate[1] < 0.9 && V.hurt_plaguesister.layerRate[0] > 1.1 && V.hurt_hexhunter.layerRate[0] > 1.1
    && !V.hurt_knight.layers.some((l) => l.name === 'grunt') && JSON.stringify(V.hurt_knight.layers) === JSON.stringify(V.hurt.layers));
  const wiz = { id: 'wizard' };
  ok('sfxFor picks the class\'s clips: the blow, the heavy, the reach, a blow taken; the rest as before', sfxFor({ type: 'atk' }, wiz) === 'atk_wizard' && sfxFor({ type: 'atk', heavy: true }, wiz) === 'heavy_wizard' && sfxFor({ type: 'spill' }, wiz) === 'atk_wizard'
    && sfxFor({ type: 'dmg' }, wiz) === 'hurt_wizard' && sfxFor({ type: 'kill' }, wiz) === 'kill' && sfxFor({ type: 'atk' }, { id: 'nobody' }) === 'attack' && sfxFor({ type: 'dmg' }, { id: 'nobody' }) === 'hurt');
  getProfile().hero = { id: 'druid', look: 0 };
  ok('…by the save\'s class when none is given', sfxFor({ type: 'atk', heavy: true }) === 'heavy_druid');
  getProfile().hero = null;
  ok('the class events have sounds (the hex a chime, the blight a hiss, the thrall a wail, a charge a zap)', sfxFor({ type: 'mark' }) === 'chime' && sfxFor({ type: 'blight' }) === 'hiss' && sfxFor({ type: 'thrall' }) === 'wail' && sfxFor({ type: 'charge' }) === 'zap' && sfxFor({ type: 'wild' }) === 'wail');
  ok('the new instruments are synth clips and in the synth', ['swing', 'crackle', 'zap', 'wail', 'rake', 'chime', 'hiss', 'grunt'].every((n) => C[n]?.synth && readFileSync('src/audio/synth.js', 'utf8').includes(`function ${n}(`)));
}
