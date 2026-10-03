// Effects (0.00283): the lunge helper the attack, the dodge and the thrall
// hit share (fxParts.js lunge), the classes' choreography reading the class
// from the run (ui/classFx.js), and the class looks as a table
// (particleLooks.js LOOKS). Behavioural: the harness lends Web Animations
// for a block, the units are the game's own.
import { ok, fresh, sleep, El, createRun, scaleEnemy, getProfile, withAnimations } from './harness.mjs';

// One lunge for the three (0.00283): the attacker's unit pulls back, strikes
// at STRIKE_AT and recovers, added over its own transform; a heavy lunges
// 1.3x as long and reaches further; the dodge's swing overshoots 1.15x; a
// crit or a heavy freezes the attacker at impact for the hit-stop.
{
  fresh();
  const { playFx, strikeMs } = await import('../../src/ui/combatFx.js');
  const { LUNGE_MS, STRIKE_AT, HITSTOP_MS } = await import('../../src/ui/fxParts.js');
  const { createEnemyUnit } = await import('../../src/ui/battleLine.js');
  const { createPlayerUnit } = await import('../../src/ui/heroCard.js');
  ok('the clock: 280 ms, the blow at 45%, strikeMs for the sound (a heavy 1.3x)', LUNGE_MS === 280 && STRIKE_AT === 0.45 && HITSTOP_MS === 70 && strikeMs({}) === LUNGE_MS * STRIKE_AT && strikeMs({ heavy: true }) === LUNGE_MS * 1.3 * STRIKE_AT);
  El.prototype.prepend = function (...nodes) { for (const n of nodes.reverse()) this.insertBefore(n, this.children[0]); }; // (the shim has none; a captioned number — THRALL — prepends its tag)
  await withAnimations(async () => {
    let paused = 0, played = 0;
    const plain = El.prototype.animate;
    El.prototype.animate = function (kf, opts) { const a = plain.call(this, kf, opts); a.pause = () => paused++; a.play = () => played++; return a; };
    const run = createRun();
    const player = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
    const foes = ['rat', 'skeleton'].map((id, i) => createEnemyUnit(scaleEnemy(id, 1), i, { onAttack() {} }));
    const row = new El('div'); row.append(...foes.map((u) => u.el));
    const line = new El('div'); line.append(player.el, row);
    // the enemy stands 350 px right of the hero (the shim puts every box at left 50, width 100)
    foes[0].el.getBoundingClientRect = () => ({ left: 400, top: 50, width: 100, height: 20, right: 500, bottom: 70 });
    const layer = new El('div');
    const ctx = { unit: (w) => (w === 'player' ? player : foes[w] ?? null), layer, run: () => run };
    const lunges = (u) => (u.el.animations ?? []).filter((a) => a.kf.length === 4 && a.kf[2].offset === STRIKE_AT);
    const shape = (a, reach, dur) => a.kf[0].transform === 'translateX(0)' && a.kf[1].transform === `translateX(${-reach * 0.18}px)` && a.kf[1].offset === 0.25
      && a.kf[2].transform === `translateX(${reach}px)` && a.kf[3].transform === 'translateX(0)' && a.opts.duration === dur && a.opts.easing === 'ease-in-out' && a.opts.composite === 'add';
    // the hero's blow: toward the foe (+), 14% of the way, capped at 35% of his width; a heavy at 50% and 1.3x as long
    playFx({ kind: 'attack', from: 'player', to: 0, dmg: 5 }, ctx);
    const blow = lunges(player);
    ok('an attack is one lunge on the attacker: pull back, strike at 45%, recover, 280 ms, added over the unit\'s transform', blow.length === 1 && shape(blow[0], Math.min(350 * 0.14, 100 * 0.35), LUNGE_MS));
    ok('…and no hit-stop on a plain blow', paused === 0 && played === 0);
    playFx({ kind: 'attack', from: 'player', to: 0, dmg: 50, heavy: true }, ctx);
    const heavy = lunges(player)[1];
    ok('a heavy lunges 1.3x as long and reaches half the width', !!heavy && shape(heavy, Math.min(350 * 0.14, 100 * 0.5), LUNGE_MS * 1.3));
    await sleep(strikeMs({ heavy: true }) + 2);
    const stoppedAtStrike = paused === 1 && played === 0;
    await sleep(HITSTOP_MS + 2);
    ok('a heavy freezes the attacker at impact for the hit-stop, then plays on', stoppedAtStrike && paused === 1 && played === 1);
    // the foe's swing that misses: the same lunge toward the hero (-), the strike overshooting 1.15x; the hero side-steps after it
    playFx({ kind: 'dodge', from: 0, to: 'player' }, ctx);
    const miss = lunges(foes[0]);
    const step = (player.el.animations ?? []).find((a) => a.opts.duration === 320);
    ok('a dodge lunges the foe at the hero with a 1.15x overshoot, and the hero side-steps 0.6 of the way to the strike', miss.length === 1
      && miss[0].kf[1].transform === `translateX(${35 * 0.18}px)` && miss[0].kf[2].transform === `translateX(${-35 * 1.15}px)` && miss[0].opts.duration === LUNGE_MS && miss[0].opts.composite === 'add'
      && !!step && step.opts.delay === LUNGE_MS * STRIKE_AT * 0.6 && step.opts.composite === 'add');
    ok('…and MISS floats over the hero at the strike', layer.children.some((n) => n.textContent === 'MISS' && n.className.includes('fx-miss')));
    // a blow on the thrall: the foe's plain lunge, the green THRALL number on the hero
    playFx({ kind: 'thrallhit', from: 0, to: 'player', taken: 7 }, ctx);
    const onThrall = lunges(foes[0]);
    ok('a blow on the thrall is the same lunge (no overshoot) and a THRALL -7 over the hero', onThrall.length === 2 && shape(onThrall[1], -35, LUNGE_MS)
      && layer.children.some((n) => n.className.includes('fx-thrall') && n.textContent.includes('THRALL') && n.textContent.includes('-7')));
    await sleep(3000); // (the effects' own timers run out inside the block)
  });
  delete El.prototype.prepend;
  fresh();
}

// The class is the run's (0.00283, ui/classFx.js): the trace a blow leaves
// comes from run.stats.klass.heavy, never the profile; a context without a
// run (the tests' bare ones) falls back to the profile's hero.
{
  fresh();
  const { heavyKindOf, traceFor, CLASS_FX, CLASS_KINDS } = await import('../../src/ui/classFx.js');
  const { traceFor: reexported, fxFor } = await import('../../src/ui/combatFx.js');
  ok('combatFx.js still exports traceFor (the same function)', reexported === traceFor);
  const asRun = (id) => { getProfile().hero = { id, look: 0 }; return createRun(); };
  const barbarian = asRun('barbarian'), wizard = asRun('wizard');
  getProfile().hero = { id: 'knight', look: 0 }; // the save says knight: the run decides
  const heavy = fxFor({ type: 'atk', target: 0, dmg: 30, heavy: true, crit: false }), blow = fxFor({ type: 'atk', target: 0, dmg: 10 });
  const ctx = { unit: () => null, layer: null, run: () => barbarian };
  ok('the Barbarian\'s run traces Cleave on a heavy and rage on a blow, whatever the save says', heavyKindOf(ctx) === 'cleave' && traceFor(heavy, heavyKindOf(ctx)) === 'cleave' && traceFor(blow, heavyKindOf(ctx)) === 'rage');
  ctx.run = () => wizard;
  ok('the same context with the Wizard\'s run traces Fireball, his blows arcane', heavyKindOf(ctx) === 'fireball' && traceFor(heavy, heavyKindOf(ctx)) === 'fireball' && traceFor(blow, heavyKindOf(ctx)) === 'arcane');
  ok('a context without a run reads the profile (the knight: steel on a heavy, nothing on a blow)', heavyKindOf({ unit: () => null }) === 'blow' && heavyKindOf({ unit: () => null, run: () => null }) === 'blow'
    && traceFor(heavy, heavyKindOf({})) === 'steel' && traceFor(blow, heavyKindOf({})) === null);
  ok('the class events are a table combatFx.js plays by kind', CLASS_KINDS.join() === 'mark,blight,entangle,entangled,immune,charge,thrall,thrallhit,thrallfall' && CLASS_KINDS.every((k) => typeof CLASS_FX[k] === 'function'));
  getProfile().hero = null;
  fresh();
}

// The class looks as a table (0.00283): CLASS_LOOKS is its keys — every one
// spawns, nothing else does, the 22 of 0.00268 / 0.00271 in their order.
{
  const { spawnClassBurst, CLASS_LOOKS } = await import('../../src/ui/particles.js');
  const looks = ['steel', 'cleave', 'cleavespill', 'rage', 'fireball', 'arcane', 'charge', 'drain', 'grave', 'thrall', 'thrallhit', 'thrallfall', 'claw', 'thorn', 'roots', 'rooted', 'hex', 'hexhit', 'hexspark', 'censer', 'blight', 'incense'];
  ok('CLASS_LOOKS is the table\'s keys: the 22 looks, each spawning, an unknown look nothing', CLASS_LOOKS.join() === looks.join() && new Set(CLASS_LOOKS).size === 22
    && CLASS_LOOKS.every((l) => spawnClassBurst(l, 0, 0, { size: 290 }).length > 0) && ['blow', 'ink', 'spark', 'heal', ''].every((l) => spawnClassBurst(l, 0, 0, { size: 290 }).length === 0));
  ok('a crit\'s fireball and hexhit grow by the count factor (1.5x the streaks)', spawnClassBurst('fireball', 0, 0, { size: 290, kind: 'crit' }).filter((p) => p.kind === 'streak').length === Math.round(22 * 1.5)
    && spawnClassBurst('hexhit', 0, 0, { size: 290, kind: 'crit' }).filter((p) => p.kind === 'streak').length === Math.round(12 * 1.5) && spawnClassBurst('hexhit', 0, 0, { size: 290 }).filter((p) => p.kind === 'streak').length === 12);
  const wisps = spawnClassBurst('drain', 100, 100, { size: 290, to: { x: 500, y: 300 } }).filter((p) => p.kind === 'dot');
  ok('the drain\'s wisps seek the point they are given, and drift free without one', wisps.every((p) => p.tx === 500 && p.ty === 300 && p.pull > 0)
    && spawnClassBurst('drain', 100, 100, { size: 290 }).filter((p) => p.kind === 'dot').every((p) => p.tx === undefined && !p.pull));
}
