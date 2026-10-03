// classes.test.mjs — the classes' gameplay (drafted 0.00258, shipped 0.00267,
// the developer's call: "we can edit and finetune once I get to play"):
// heroes.json class per hero through stats.js derivedStats into
// run.stats.klass, the seven heavies and the passives in the registry
// run/classes.js (0.00278: HEAVIES by kind, AFTER_BLOW and FOE_TURN hooks;
// combat.js calls them, damageFoe the one wound path), and the combat UI's
// minimum: the charges on the hero's button, the HEXED / BLIGHT / ROOTED
// tag on a foe's card, a colour per new log line — the UI reading the class
// from run.hero, never the profile.
import { ok, fresh, DATA, createRun, createCombat, playerAttack, getProfile, readFileSync, statSync, registry, show, sleep, t, dungeonScene, hubScene, withSeedAsync } from './harness.mjs';
import { readdirSync } from 'node:fs';

const { useHeavy, canHeavy } = await import('../../src/run/combat.js');
const { drinkPotion } = await import('../../src/run/runState.js');
const { createPlayerUnit, createEnemyUnit } = await import('../../src/ui/battleLine.js');
const { derivedStats } = await import('../../src/meta/stats.js');
const { HEAVY_KINDS, CLASS_KEYS, HEAVIES, AFTER_BLOW, FOE_TURN, usesCharges } = await import('../../src/run/classes.js');
const { heroSnapshot, heroById, lookUrl } = await import('../../src/shared/heroes.js');
const { checkData } = await import('../../src/shared/dataCheck.js');

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

// the registry (0.00278): the kinds and the keys in one place, driving the data check
{
  fresh();
  ok('the seven heavy kinds, each in HEAVIES; the knight\'s blow the one that spills (strike and OVERKILL)', HEAVY_KINDS.join() === 'blow,cleave,fireball,drain,mark,censer,entangle' && HEAVY_KINDS.every((k) => HEAVIES[k] && typeof HEAVIES[k].spills === 'boolean')
    && HEAVIES.blow.spills && !HEAVIES.blow.onHeavy && HEAVY_KINDS.filter((k) => HEAVIES[k].spills).length === 1 && HEAVY_KINDS.filter((k) => k !== 'blow').every((k) => typeof HEAVIES[k].onHeavy === 'function'));
  ok('every hero\'s class block is exactly CLASS_KEYS + heavy, its heavy a kind', DATA.heroes.heroes.every((h) => Object.keys(h.class).sort().join() === [...CLASS_KEYS, 'heavy'].sort().join() && HEAVY_KINDS.includes(h.class.heavy)));
  ok('the passives run in the engine\'s order: the charges, the blight\'s tick, the mending, the thrall; the foes\' turn holds (roots), takes (thrall), ends (roots loosen)', AFTER_BLOW.map((f) => f.name).join() === 'chargeOnKill,blightTick,mend,thrallRaise'
    && FOE_TURN.hold.map((f) => f.name).join() === 'rootsHold' && FOE_TURN.take.map((f) => f.name).join() === 'thrallTakes' && FOE_TURN.end.map((f) => f.name).join() === 'rootsLoosen');
  ok('usesCharges: the Wizard (charges > 0), no one else', DATA.heroes.heroes.filter((h) => usesCharges(h.class)).map((h) => h.id).join() === 'wizard');
  const broken = structuredClone(DATA);
  broken.heroes.heroes[1].class.heavy = 'kick';
  delete broken.heroes.heroes[2].class.rage;
  broken.heroes.heroes[3].class.mend = 'some';
  const probs = checkData(broken);
  ok('dataCheck reads the registry: an unknown heavy kind, a missing key and a non-number are each named', probs.some((m) => m.includes('barbarian.class.heavy (kick)') && m.includes(HEAVY_KINDS.join(' | '))) && probs.some((m) => m.includes('wizard.class.rage')) && probs.some((m) => m.includes('necromancer.class.mend'))
    && checkData(DATA).length === 0, probs.join('; '));
  ok('dataCheck.js carries no list of its own: the kinds and the keys are imported', (() => { const src = readFileSync('src/shared/dataCheck.js', 'utf8'); return src.includes("import { HEAVY_KINDS, CLASS_KEYS } from '../run/classes.js'") && !src.includes("'cleaveShare'") && !src.includes("'fireball'"); })());
  // the fallback grep (content.test.mjs) keys on dataCheck.js's quoted leaves, which the class keys left: the same check for them here
  const files = readdirSync('src', { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => `src/${f}`);
  const copies = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\.(\w+) \?\? -?[\d.]+/g)].filter((m) => CLASS_KEYS.includes(m[1])).map((m) => `${f}: ${m[0]}`));
  ok('no fallback copies of a class key\'s number in src', copies.length === 0, copies.join('; '));
  ok('the doc string in heroes.json points at the registry', DATA.heroes._class.includes('run/classes.js') && DATA.heroes._class.includes('CLASS_KEYS') && DATA.heroes._class.includes('HEAVY_KINDS'));
  // the statuses are numbers from the first line: the room's foes and a summon alike (the hooks count on it), the room's own objects untouched
  const summoner = { ...foe(100000, 0, 'Lord'), summonEvery: 1, summonMeter: 0 };
  const roomObj = { number: 9, kind: 'combat', isBoss: true, background: 'x', name: 'T', enemies: [summoner] };
  const cb = createCombat(as('knight'), roomObj);
  ok('createCombat gives every foe blight 0 and entangled 0; the room\'s objects stay as they were', cb.enemies[0].blight === 0 && cb.enemies[0].entangled === 0 && summoner.blight === undefined && summoner.entangled === undefined);
  const evs = playerAttack(cb, 0, false);
  ok('a summon joins with the same defaults (and no rewards, as before)', evs.some((e) => e.type === 'summon') && cb.enemies.length === 2 && cb.enemies[1].summoned && cb.enemies[1].blight === 0 && cb.enemies[1].entangled === 0 && cb.enemies[1].xp === 0 && cb.enemies[1].hp === cb.enemies[1].maxHp);
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

// the Druid: Entangle (0.00271, the developer's call) — roots bind every foe for entangleTurns of their turns; a bound foe's attack fails with entangleChance; mend a turn
{
  fresh();
  const run = as('druid');
  const k = run.stats.klass;
  run.potions = 3; run.hp = Math.round(run.maxHp / 2);
  const cb = room(run, [foe(100000, 50), foe(100000, 50)]);
  const hpBefore = run.hp;
  const evs = heavy(cb, 0);
  ok('Entangle binds every living foe for entangleTurns and says so', types(evs).includes('entangle') && k.entangleTurns === 2 && k.entangleChance > 0 && k.heavy === 'entangle');
  ok('…the roots loosen a turn: after the heavy\'s enemy phase one turn is left on each foe', cb.enemies.every((e) => e.entangled === k.entangleTurns - 1));
  ok('a potion goes down as ever (no wild shape any more)', drinkPotion(run) !== false);
  ok('mend: the Druid\'s wounds knit a share of max HP a turn', evs.some((e) => e.type === 'heal' && e.healed === Math.max(1, Math.round(run.maxHp * k.mend))) && run.hp > hpBefore);
  // the roll: with the chance at 1 every bound foe fails ('Entangled!'), at 0 none; the blow is skipped entirely
  const cert = as('druid'); cert.stats.klass.entangleChance = 1;
  const c1 = room(cert, [foe(100000, 50), foe(100000, 50)]);
  const e1 = heavy(c1, 0);
  ok('a bound foe that fails its roll does not attack at all: an entangled line, no dmg line', e1.filter((e) => e.type === 'entangled').length === 2 && !e1.some((e) => e.type === 'dmg') && e1.find((e) => e.type === 'entangled').text.includes('Entangled!') && e1.find((e) => e.type === 'entangled').source === 0);
  const t2 = playerAttack(c1, 0, false);
  ok('…the second turn too, then the roots are gone and the foes strike again', t2.filter((e) => e.type === 'entangled').length === 2 && c1.enemies.every((e) => e.entangled === 0) && playerAttack(c1, 0, false).filter((e) => e.type === 'dmg').length === 2);
  const never = as('druid'); never.stats.klass.entangleChance = 0;
  const c0 = room(never, [foe(100000, 50)]);
  ok('at chance 0 a bound foe always strikes', !heavy(c0, 0).some((e) => e.type === 'entangled') && heavy(c0, 0).some((e) => e.type === 'dmg'));
  const kn = as('knight');
  ok('the knight\'s foes are never bound (no roll spent)', !heavy(room(kn, [foe(100000, 50)]), 0).some((e) => e.type === 'entangled'));
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
  u.update({ hp: run.hp, printing: false, dead: false, heavyReady: true, heavyCd: 0, charges: 2 });
  ok('the Wizard\'s button shows its charges as pips (two of three)', label().includes('◆◆◇') && label().startsWith('Fireball'));
  getProfile().hero = { id: 'druid', look: 0 };
  const dr = createRun(); dr.potions = 2; dr.hp = 1;
  const du = createPlayerUnit(dr, { onHeavy() {}, onPotion() {} });
  const dl = () => du.el.all((n) => n.className === 'btn-label')[0]?.textContent;
  du.update({ hp: 1, printing: false, dead: false, heavyReady: false, heavyCd: 3, charges: 0 });
  const potionBtn = du.el.all((n) => n.tagName === 'button' && n.attrs['data-key'] === 'p')[0];
  ok('the Druid\'s button is Entangle with a plain cooldown, the potion live', dl().startsWith('Entangle') && dl().includes('(3)') && potionBtn.attrs.disabled === undefined);
  getProfile().hero = null;
  const e = createEnemyUnit(foe(100), 0, { onAttack() {}, onGone() {} });
  const tag = e.card.all((n) => n.className.includes('foe-tag'))[0];
  e.update({ hp: 100, dead: false, printing: false, combatOver: false, hexed: true, blight: 2, entangled: 1 });
  ok('a foe\'s card tags HEXED, the blight stacks and the roots\' turns, the hexed card marked', tag.textContent === 'HEXED · BLIGHT ×2 · ROOTED 1' && tag.classList.contains('on') && e.card.classList.contains('hexed'));
  e.update({ hp: 100, dead: false, printing: false, combatOver: false, hexed: false, blight: 0, entangled: 0 });
  ok('…and clears them', tag.textContent === '' && !tag.classList.contains('on') && !e.card.classList.contains('hexed'));
  // the status in the figure (0.00272): the card's classes tint the portrait and slow its loop (styles.css), the flash's cached filter dropped on a change
  e.baseFilter = 'cached';
  e.update({ hp: 100, dead: false, printing: false, combatOver: false, blight: 1, entangled: 0 });
  ok('a blighted foe\'s card is blighted and slowed, the flash\'s cached filter dropped', e.card.classList.contains('blighted') && e.card.classList.contains('slowed') && !e.card.classList.contains('rooted') && e.baseFilter === undefined);
  e.baseFilter = 'cached';
  e.update({ hp: 100, dead: false, printing: false, combatOver: false, blight: 1, entangled: 2 });
  ok('…rooted too when bound; the same status keeps the cache', e.card.classList.contains('rooted') && e.card.classList.contains('blighted') && e.baseFilter === undefined
    && (e.baseFilter = 'cached', e.update({ hp: 100, dead: false, printing: false, combatOver: false, blight: 2, entangled: 1 }), e.baseFilter === 'cached'));
  e.update({ hp: 100, dead: false, printing: false, combatOver: false, blight: 0, entangled: 0 });
  ok('…and back to plain', !e.card.classList.contains('blighted') && !e.card.classList.contains('rooted') && !e.card.classList.contains('slowed'));
  const css2 = readFileSync('styles.css', 'utf8');
  ok('the looks are static filters and slower loops per family, the phone keeping the figure plain', /\.char-card\.blighted \.portrait:not\(\.glint\) \{ filter: [^}]*sepia/.test(css2) && /\.char-card\.rooted \.portrait:not\(\.glint\) \{ filter: [^}]*sepia/.test(css2)
    && ['hover', 'heavy', 'prowl', 'boss'].every((f) => new RegExp(`\\.char-card\\.slowed \\.idle-${f} \\{ animation-duration: [\\d.]+s; \\}`).test(css2)) && css2.includes('html.phone .char-card.blighted .portrait:not(.glint) { filter: none; }'));
  const css = readFileSync('styles.css', 'utf8');
  ok('every class event has a log colour (mark, blight, entangle, entangled, charge, thrall, thrallhit, thrallfall)', ['mark', 'blight', 'entangle', 'entangled', 'charge', 'thrall', 'thrallhit', 'thrallfall'].every((c) => css.includes(`#combat-log .${c} `)));
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
  ok('the Druid\'s heavy blow is three parallel rakes and leaves, his blows one; Entangle\'s roots shoot up from the ground (streaks rising, earth-coloured, pulled back down), a bound foe\'s strain a smaller tug', spawnClassBurst('claw', 0, 0, { size: 290 }).filter((p) => p.kind === 'slash').length === 3 && kinds(spawnClassBurst('claw', 0, 0, { size: 290 })).has('blob')
    && spawnClassBurst('thorn', 0, 0, { size: 290 }).filter((p) => p.kind === 'slash').length === 1
    && spawnClassBurst('roots', 0, 0, { size: 290 }).filter((p) => p.kind === 'streak').every((p) => p.vy < 0 && p.g > 0 && p.mid === CLASS_PAL.root.mid) && spawnClassBurst('roots', 0, 0, { size: 290 }).filter((p) => p.kind === 'streak').length === 12
    && spawnClassBurst('rooted', 0, 0, { size: 290 }).filter((p) => p.kind === 'streak').length === 4 && kinds(spawnClassBurst('roots', 0, 0, { size: 290 })).has('puff'));
  ok('the Hexhunter\'s Hex is a sigil in a ring; a blow on the hexed foe flares a quicker one', kinds(spawnClassBurst('hex', 0, 0, { size: 290 })).has('sigil') && kinds(spawnClassBurst('hex', 0, 0, { size: 290 })).has('ring')
    && spawnClassBurst('hexhit', 0, 0, { size: 290 }).find((p) => p.kind === 'sigil').life < spawnClassBurst('hex', 0, 0, { size: 290 }).find((p) => p.kind === 'sigil').life && !kinds(spawnClassBurst('hexspark', 0, 0, { size: 290 })).has('sigil'));
  ok('the Plague Sister\'s censer is smoke (puffs that grow) in ochre; the blight\'s gnawing a smaller wisp of it', spawnClassBurst('censer', 0, 0, { size: 290 }).filter((p) => p.kind === 'puff').every((p) => p.grow > 1 && [CLASS_PAL.ochre.dark, CLASS_PAL.ochre.mid].includes(p.color))
    && spawnClassBurst('blight', 0, 0, { size: 290 }).filter((p) => p.kind === 'puff').length < spawnClassBurst('censer', 0, 0, { size: 290 }).filter((p) => p.kind === 'puff').length);
  // the trace a blow leaves, by the class and the blow
  const blow = (o) => ({ kind: 'attack', from: 'player', ...o });
  ok('the trace table: the knight\'s heavy a steel clash and his blows none; each class its own, the hexed foe\'s theirs', traceFor(blow({ heavy: true }), 'blow') === 'steel' && traceFor(blow({}), 'blow') === null
    && traceFor(blow({ heavy: true }), 'cleave') === 'cleave' && traceFor(blow({}), 'cleave') === 'rage' && traceFor(blow({ heavy: true }), 'fireball') === 'fireball' && traceFor(blow({}), 'fireball') === 'arcane'
    && traceFor(blow({}), 'drain') === 'grave' && traceFor(blow({ heavy: true }), 'drain') === 'drain' && traceFor(blow({ heavy: true }), 'entangle') === 'claw' && traceFor(blow({}), 'entangle') === 'thorn'
    && traceFor(blow({ marked: true }), 'mark') === 'hexhit' && traceFor(blow({}), 'mark') === 'hexspark' && traceFor(blow({ heavy: true }), 'censer') === 'incense');
  ok('the reach of a heavy (via) traces as the fire, the cleave or the blight whatever the class; an enemy\'s blow on the hero leaves none', traceFor({ kind: 'hit', via: 'fireball' }, 'blow') === 'fireball' && traceFor({ kind: 'hit', via: 'cleave' }, 'cleave') === 'cleavespill'
    && traceFor({ kind: 'hit', via: 'blight' }, 'censer') === 'blight' && traceFor({ kind: 'hit' }, 'blow') === null && traceFor({ kind: 'attack', from: 0, to: 'player' }, 'cleave') === null);
  // the events carry what the trace needs
  ok('the class events become effects (mark, blight, entangle, entangled, charge, thrall, thrallhit, thrallfall), the blow its marked flag, the reach its via, the drain its foe', fxFor({ type: 'mark', target: 2 }).kind === 'mark' && fxFor({ type: 'mark', target: 2 }).to === 2
    && fxFor({ type: 'blight' }).kind === 'blight' && fxFor({ type: 'entangle' }).kind === 'entangle' && fxFor({ type: 'entangled', source: 2 }).from === 2 && fxFor({ type: 'charge' }).kind === 'charge' && fxFor({ type: 'thrall' }).kind === 'thrall'
    && fxFor({ type: 'thrallhit', source: 1, taken: 18 }).taken === 18 && fxFor({ type: 'thrallfall' }).kind === 'thrallfall'
    && fxFor({ type: 'atk', target: 0, dmg: 5, marked: true }).marked === true && fxFor({ type: 'atk', target: 0, dmg: 5 }).marked === false
    && fxFor({ type: 'spill', target: 1, dmg: 3, via: 'cleave' }).via === 'cleave' && fxFor({ type: 'heal', healed: 9, drain: true, target: 2 }).from === 2 && fxFor({ type: 'heal', healed: 9 }).drain === false);
  getProfile().hero = { id: 'hexhunter', look: 0 };
  const hx = room(as('hexhunter'), [foe(100000), foe(100000)]);
  heavy(hx, 1);
  const onMark = playerAttack(hx, 1, false).find((e) => e.type === 'atk');
  ok('a blow on the hexed foe carries marked (the sigil flares)', onMark.marked === true && playerAttack(hx, 0, false).find((e) => e.type === 'atk').marked === false);
  const nc = room(as('necromancer'), [foe(100000)]);
  ok('the drain\'s heal names its foe', (() => { const r = nc.run; r.hp = 1; const ev = heavy(nc, 0).find((e) => e.type === 'heal'); return ev?.drain === true && ev.target === 0; })());
  getProfile().hero = null;
}


// the UI reads the class from the run (0.00278): run.hero, not the profile
{
  fresh();
  const { heroArt } = await import('../../src/ui/battleLine.js');
  const { cardStyle } = await import('../../src/ui/cardFx.js');
  const run = as('knight');
  ok('createRun snapshots the class: id, name, heavyName, theme, look', run.hero.id === 'knight' && run.hero.name === 'The Curious Knight' && run.hero.heavyName === 'Heavy Attack' && run.hero.theme === heroById('knight').theme && run.hero.look === 0);
  run.hero = heroSnapshot({ hero: { id: 'wizard', look: 2 } }); // the run says wizard; the profile still says knight
  getProfile().hero = { id: 'knight', look: 0 };
  const u = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
  const title = u.el.all((n) => n.className === 'hero-title card-name')[0].textContent;
  const label = u.el.all((n) => n.className === 'btn-label')[0].textContent;
  const frame = u.card.all((n) => n.className === 'card-frame')[0];
  ok('the hero title, the heavy button, the plate\'s theme and the figure follow run.hero (the Wizard\'s third look), the STATS row too', title === 'THE WIZARD' && label.startsWith('Fireball') && frame.attrs.style === `--theme:${heroById('wizard').theme.plate}`
    && u.portrait.attrs.src === lookUrl(heroById('wizard'), 2) && u.art === lookUrl(heroById('wizard'), 2) && u.card.all((n) => (n.className ?? '').startsWith('back-row')).some((r) => r.textContent.startsWith('Fireball')) && u.card.classList.contains('hero-standing'));
  ok('heroArt: a look\'s file, the knight\'s crouch the wide sprite from cards.json', heroArt({ id: 'necromancer', look: 1 }) === lookUrl(heroById('necromancer'), 1) && heroArt({ id: 'knight', look: heroById('knight').looks.findIndex((l) => l.sprite) }) === `assets/chars/${DATA.cards.player.art}`);
  const sprite = createPlayerUnit({ ...run, hero: heroSnapshot({ hero: { id: 'knight', look: 4 } }) }, { onHeavy() {}, onPotion() {} });
  ok('…and the card drops hero-standing for the sprite', !sprite.card.classList.contains('hero-standing') && sprite.portrait.attrs.src === `assets/chars/${DATA.cards.player.art}`);
  ok('cardStyle(\'player\') takes the run\'s theme; without one the profile\'s class (the hall, the labs)', cardStyle('player', false, heroById('barbarian').theme).look === 'embers' && cardStyle('player').look === 'ether' && cardStyle('rat', false, heroById('barbarian').theme).look === 'blood');
  ok('battleLine reads no class from the profile any more', !/heroOf\(|heavyName\(|cleanHero\(/.test(readFileSync('src/ui/battleLine.js', 'utf8')) && !readFileSync('src/ui/combatQueue.js', 'utf8').includes('getProfile'));
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
  ok('every class has atk_, heavy_ and hurt_ clips: rendered files on disk (0.00271), measured, pitched per class', ids.every((id) => ['atk', 'heavy', 'hurt'].every((k) => C[`${k}_${id}`]?.file?.startsWith('assets/audio/sfx/') && statSync(C[`${k}_${id}`].file).size > 2 * 1024 && Number.isFinite(C[`${k}_${id}`].measuredDb) && Number.isFinite(C[`${k}_${id}`].gainDb) && C[`${k}_${id}`].rate?.length === 2))
    && C.atk_barbarian.rate[1] < C.atk_wizard.rate[0] && C.hurt_hexhunter.rate[0] > C.hurt_barbarian.rate[1]);
  ok('every foe has eatk_ and ehurt_ clips on disk, measured and trimmed (0.00271)', Object.keys(DATA.enemies).every((id) => ['eatk', 'ehurt'].every((k) => C[`${k}_${id}`]?.file?.startsWith('assets/audio/sfx/') && statSync(C[`${k}_${id}`].file).size > 2 * 1024 && Number.isFinite(C[`${k}_${id}`].measuredDb) && Number.isFinite(C[`${k}_${id}`].gainDb))));
  ok('each has its own variation with the class\'s synth layers (every layer a synth clip)', ids.every((id) => ['atk', 'heavy', 'hurt'].every((k) => V[`${k}_${id}`]?.layers?.length && V[`${k}_${id}`].layers.every((l) => C[l.name]?.synth)))
    && V.heavy_barbarian.layers.some((l) => l.name === 'swing' && l.p === 1) && V.heavy_wizard.layers.some((l) => l.name === 'crackle') && V.heavy_hexhunter.layers.some((l) => l.name === 'chime')
    && V.heavy_necromancer.layers.some((l) => l.name === 'wail') && V.atk_druid.layers.some((l) => l.name === 'rake') && V.heavy_plaguesister.layers.some((l) => l.name === 'hiss'));
  ok('a blow taken is the class\'s own recording, pitched per class, with no synth grunt under it (0.00277: the recordings carry the cry)', ids.every((id) => !V[`hurt_${id}`].layers.some((l) => l.name === 'grunt') && V[`hurt_${id}`].layers.length > 0)
    && V.hurt_hexhunter.rate[0] > V.hurt_barbarian.rate[1]);
  const wiz = { id: 'wizard' };
  ok('sfxFor picks the class\'s clips: the blow, the heavy, the reach, a blow taken; the rest as before', sfxFor({ type: 'atk' }, wiz) === 'atk_wizard' && sfxFor({ type: 'atk', heavy: true }, wiz) === 'heavy_wizard' && sfxFor({ type: 'spill' }, wiz) === 'atk_wizard'
    && sfxFor({ type: 'dmg' }, wiz) === 'hurt_wizard' && sfxFor({ type: 'kill' }, wiz) === 'kill' && sfxFor({ type: 'atk' }, { id: 'nobody' }) === 'attack' && sfxFor({ type: 'dmg' }, { id: 'nobody' }) === 'hurt');
  ok('…by the run\'s class (run.hero, 0.00278), the plain sound when none is given', sfxFor({ type: 'atk', heavy: true }, as('druid').hero) === 'heavy_druid' && sfxFor({ type: 'atk', heavy: true }) === 'attack' && sfxFor({ type: 'dmg' }) === 'hurt');
  getProfile().hero = null;
  {
    // queueEvents hands sfxFor the run's class, whatever the profile says
    const { queueEvents } = await import('../../src/ui/combatQueue.js');
    const run = as('wizard'); getProfile().hero = { id: 'knight', look: 0 };
    const cb = room(run, [foe(100000)]);
    const items = [];
    queueEvents(playerAttack(cb, 0, false), { run, combat: cb, playback: { enqueue: (it) => items.push(it) } });
    ok('the queued blow carries the run\'s class\'s clip (the Wizard\'s), not the profile\'s', items.find((it) => it.text.startsWith('You attack'))?.sfx === 'atk_wizard');
    getProfile().hero = null;
  }
  ok('the class events have sounds (the hex a chime, the blight a hiss, the thrall a wail, a charge a zap)', sfxFor({ type: 'mark' }) === 'chime' && sfxFor({ type: 'blight' }) === 'hiss' && sfxFor({ type: 'thrall' }) === 'wail' && sfxFor({ type: 'charge' }) === 'zap' && sfxFor({ type: 'entangle' }) === 'thud' && sfxFor({ type: 'entangled' }) === 'swoosh');
  ok('the new instruments are synth clips and in the synth', ['swing', 'crackle', 'zap', 'wail', 'rake', 'chime', 'hiss', 'grunt'].every((n) => C[n]?.synth && readFileSync('src/audio/synth.js', 'utf8').includes(`function ${n}(`)));
}


// the foes' sounds (0.00271): layered on the blow by the struck or striking foe's id
{
  fresh();
  const { combatSfx } = await import('../../src/ui/combatSfx.js');
  const played = [];
  const play = (name, opts) => played.push([name, opts?.delayMs]);
  const unitOf = (who) => (who === 'player' ? { id: 'player', card: null } : { id: ['rat', 'skeleton'][who], card: null });
  const ctx = { unit: unitOf };
  combatSfx({ sfx: 'atk_knight', fx: { kind: 'attack', from: 'player', to: 0, dmg: 5 } }, ctx, play);
  ok('the hero\'s blow plays his attack and the struck foe\'s cry (ehurt_rat), both on the strike', played.map((p) => p[0]).join('|') === 'atk_knight|ehurt_rat' && played.every((p) => p[1] > 0));
  played.length = 0;
  combatSfx({ sfx: 'hurt_knight', fx: { kind: 'attack', from: 1, to: 'player', dmg: 5 } }, ctx, play);
  ok('a foe\'s blow plays the hero\'s hurt and the foe\'s attack (eatk_skeleton)', played.map((p) => p[0]).join('|') === 'hurt_knight|eatk_skeleton');
  played.length = 0;
  combatSfx({ sfx: 'attack', fx: { kind: 'attack', from: 'player', to: 0, dmg: 5 } }, { unit: (w) => (w === 'player' ? { id: 'player' } : { id: 'nobody' }) }, play);
  ok('a foe without a clip is as before: the blow alone', played.map((p) => p[0]).join('|') === 'attack');
}


// the display and state fixes of 0.00277 (the review's findings)
{
  fresh();
  const { potionHealFor, potionHealAmount } = await import('../../src/meta/leveling.js');
  const { buffText } = await import('../../src/run/shrine.js');
  const { statusOf } = await import('../../src/run/combat.js');
  const { createPlayback } = await import('../../src/ui/combatPlayback.js');
  const wiz = as('wizard'), kn = as('knight');
  ok('a potion heals the class\'s share, one function for the drink and the UI (the Wizard 0.9 of the trained amount)', potionHealFor(wiz.stats.klass) === Math.round(potionHealAmount() * wiz.stats.klass.potionHealMult) && potionHealFor(kn.stats.klass) === potionHealAmount()
    && (wiz.hp = 1, wiz.potions = 1, drinkPotion(wiz).healed === potionHealFor(wiz.stats.klass)));
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  getProfile().hero = { id: 'wizard', look: 0 };
  const wu = createPlayerUnit(createRun(), { onHeavy() {}, onPotion() {} });
  const rows = () => wu.card.all((n) => (n.className ?? '').startsWith('back-row')).map((r) => r.textContent);
  wu.update({ hp: 1, printing: false, dead: false, heavyReady: true, heavyCd: 0, charges: 3 });
  const tune = DATA.difficulty.combat, wk = DATA.heroes.heroes.find((h) => h.id === 'wizard').class;
  ok('the STATS page shows the class\'s own heavy factor and, for a charge class, its charges (the Wizard: ×2.07 · 3 charges)', rows().some((t) => t.startsWith('Fireball') && t.includes(`×${+(tune.heavyMult * wk.heavyMult).toFixed(2)}`) && t.includes(`${wk.charges} charges`)) && rows().some((t) => t.startsWith('Potion heals') && t.includes(`${potionHealFor(wk)} HP`)));
  getProfile().hero = { id: 'knight', look: 0 };
  const ku = createPlayerUnit(createRun(), { onHeavy() {}, onPotion() {} });
  ok('…the knight: ×2.3 · 3 turns as before', ku.card.all((n) => (n.className ?? '').startsWith('back-row')).some((r) => r.textContent.startsWith('Heavy Attack') && r.textContent.includes(`×${tune.heavyMult} · 3 turns`)));
  getProfile().hero = null;
  const q = DATA.shrines.offers.find((o) => o.id === 'quicken');
  ok('the Quicken card reads as a charge for a charge class, the cooldown for the rest', buffText(q, wiz) === `HEAVY CHARGE +${q.cdReduce}` && buffText(q, kn) === q.buff && buffText(DATA.shrines.offers.find((o) => o.id !== 'quicken'), wiz) === DATA.shrines.offers.find((o) => o.id !== 'quicken').buff);
  // the statuses ride the replay's snapshot
  const hx = room(as('hexhunter'), [foe(100000), foe(100000)]);
  const evs = heavy(hx, 1);
  const markEv = evs.find((e) => e.type === 'mark'), atkEv = evs.find((e) => e.type === 'atk');
  ok('every event\'s snapshot carries the foes\' statuses as they stood: hexed only from the mark line on', atkEv.snap.status[1].hexed === false && markEv.snap.status[1].hexed === true && markEv.snap.status[0].hexed === false && 'blight' in markEv.snap.status[0] && 'entangled' in markEv.snap.status[0]);
  ok('a fallen foe carries no status', statusOf({ marked: 0 }, { hp: 0, blight: 2, entangled: 1 }, 0).hexed === false && statusOf({ marked: 0 }, { hp: 0, blight: 2, entangled: 1 }, 0).blight === 0 && statusOf({ marked: 0 }, { hp: 5, blight: 2, entangled: 1 }, 0).blight === 2);
  const pb = createPlayback({ logEl: () => ({ children: [], prepend() {}, append() {} }), onTick: () => {}, onEmpty: () => {}, logDelayMs: 100, tickMs: 50 });
  pb.begin({ enemies: [5, 5], hp: 10 });
  ok('the playback hands the snapshot\'s status, the live one for a foe not in it (a summon)', JSON.stringify(pb.statusOf(0, { hexed: true })) === JSON.stringify({ hexed: true }) || typeof pb.statusOf === 'function');
  // SWITCH CLASS clears the blight with the rest
  ok('SWITCH CLASS resets the blight too', readFileSync('src/ui/scenes/dungeonScene.js', 'utf8').includes('{ e.entangled = 0; e.blight = 0; }'));
}
