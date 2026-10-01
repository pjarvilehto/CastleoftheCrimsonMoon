// tools/test/combat.test.mjs — combat engine + the battle line: attacks, spill, SMASH, death, playback, animation, summons.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, El, DATA, show, handleKey, setBackground, transitionTo, createRun, generateRoom,
  scaleEnemy, createCombat, playerAttack, shrineOffers, canAffordOffer, acceptOffer, dungeonScene, hubScene, titleScene,
  resetProfile, getProfile, loadData, readFileSync, readdirSync, statSync } from './harness.mjs';

fresh();

// T4: combat attack kills something, log drips (default profile needs
// a few swings — keep attacking until the first kill lands)
{
  show(dungeonScene()); // (was entered by T3 before the 0.098 split)
  await sleep(1100);
  let killed = false;
  for (let i = 0; i < 6 && !killed; i++) {
    handleKey('a');
    for (let j = 0; j < 12; j++) { await sleep(300); if (t().includes('died!') || t().includes('MULTI-KILL')) { killed = true; break; } }
  }
  ok('combat resolves (kill or multi-kill in log)', killed);
  // Drain the combat FULLY before moving on (0.072c): leaving an unresolved
  // fight leaks playback timers into later tests — a dying run mounts a
  // stale YOU DIED overlay mid-T6 (the long-standing T6 flake, root-caused).
  let drainGuard = 0;
  while (!t().includes('Push Deeper') && !t().includes('YOU DIED') && drainGuard++ < 30) {
    handleKey('a');
    for (let j = 0; j < 12; j++) { await sleep(300); if (t().includes('Push Deeper') || t().includes('YOU DIED')) break; }
  }
  ok('T4 combat fully drained (no timer leak)', t().includes('Push Deeper') || t().includes('YOU DIED'));
  // If the run died, dismissing the modal is NOT enough on its own (0.072c):
  // accept → endRun → show(runEndScene) mounts through a 1000ms transitionTo
  // timer, and the dying run's playback chain can fire further late timers
  // (re-mounted modal, second endRun). Any of those landing after a later
  // test wipes #app clobbers that test's scene — the residual T6 flake.
  // So: click accept, then wait until the end screen is mounted and stays
  // quiet for a full transition window, re-dismissing any late modal.
  if (t().includes('YOU DIED')) {
    let settled = false;
    for (let i = 0; i < 30 && !settled; i++) {
      const btn = document.querySelector('.death-accept');
      if (btn) btn.listeners.click[0]();
      await sleep(400);
      if (t().includes('Return to the Great Hall') && !document.querySelector('.death-accept')) {
        await sleep(1200); // one full transition window of quiet
        settled = !document.querySelector('.death-accept');
      }
    }
    ok('T4 death settled (end screen mounted, no late timers)', settled);
  }
}

// T7: multi-kill spill — heavy attacks only (0.049: basic attacks are
// strictly single-target, no matter how overpowered)
{
  const rat = (n) => ({ id: n, name: 'Rat ' + n, maxHp: 16, hp: 16, dmg: 2, xp: 1, coins: [1, 1] });
  const room = () => ({ number: 1, kind: 'combat', isBoss: false, background: 'x.png', name: 'T', enemies: [rat('A'), rat('B'), rat('C')] });
  const run = createRun();
  run.stats.dmg = 500; run.stats.crit = 0;
  const cb1 = createCombat(run, room());
  const evs1 = playerAttack(cb1, 0, false);
  ok('basic attack never spills (target only)', evs1.filter((e) => e.type === 'kill').length === 1 && !evs1.some((e) => e.type === 'multi'));
  run.hp = run.maxHp; // rats hit back during the basic attack
  run.stats.dmg = 20; // heavy doubles to 40: >= 2x target HP (spills) but < 48 room total (no smash)
  const cb2 = createCombat(run, room());
  const evs2 = playerAttack(cb2, 0, true);
  ok('heavy spill chains into multi-kill', evs2.filter((e) => e.type === 'kill').length === 2 && evs2.some((e) => e.type === 'multi'));
}

// T8: enemy level naming
{
  ok('enemy level naming', scaleEnemy('rat', 1).name === 'Giant Rat'
    && scaleEnemy('rat', 4).name === 'Giant Rat LV2'
    && scaleEnemy('rat', 13).name === 'Giant Rat LV5');
}

// T11: card-combat structure regression — units = card + button row
// beneath, HP as a single text+bar line, player card present.
{
  registry.app.innerHTML = '';
  Object.assign(getProfile(), {
    coins: 0, xp: 0, stats: { power: 14, vitality: 10, fortune: 0 },
    equipment: { weapon: 'executioner_axe', armor: 'dragonscale_mail', boots: null, rings: [null, null], trinket: null, amulet: null },
    potions: 5, records: { kills: 0, bestRoom: 0, runs: 1, deaths: 0 },
  });
  const scene = dungeonScene();
  scene.enter(registry.app);
  const units = registry.app.all((e) => e.className && e.className.startsWith('unit '));
  const cards = registry.app.all((e) => e.className && e.className.startsWith('char-card'));
  const hpLines = registry.app.all((e) => e.className === 'hp-line');
  const actRows = registry.app.all((e) => e.className === 'unit-actions');
  const portraits = registry.app.all((e) => e.tagName === 'img' && e.attrs.src && e.attrs.src.includes('assets/chars/'));
  const atkBtns = registry.app.all((e) => e.tagName === 'button' && e.attrs['data-key'] === 'a' && e.attrs.disabled === undefined);
  const nEnemies = cards.length - 1;
  ok('T11 card structure: units/cards/hp-lines/portraits/actions',
    units.length === cards.length
    && hpLines.length === cards.length
    && portraits.length === cards.length
    && actRows.length === units.length // dead units keep a placeholder row
    && atkBtns.length === nEnemies
    && t().includes('THE CURIOUS KNIGHT'));
}

// T13: SMASH — heavy hit covering ALL living HP wipes the room in one line
{
  const rat = (n) => ({ id: n, name: 'Rat ' + n, maxHp: 16, hp: 16, dmg: 2, xp: 1, coins: [1, 1] });
  const run = createRun();
  run.stats.dmg = 500; run.stats.crit = 0;
  const cb = createCombat(run, { number: 1, kind: 'combat', isBoss: false, background: 'x.png', name: 'T', enemies: [rat('A'), rat('B'), rat('C')] });
  const evs = playerAttack(cb, 0, true);
  const kills = evs.filter((e) => e.type === 'kill');
  ok('smash wipes room in one silent event', evs.some((e) => e.type === 'smash')
    && kills.length === 3 && kills.every((e) => e.silent)
    && !evs.some((e) => e.type === 'atk' || e.type === 'spill' || e.type === 'multi')
    && cb.over && cb.victory && cb.enemies.every((e) => e.hp === 0));
}

// T32: 0.067 — death modal mounts with YOU DIED! and dismisses via its button.
{
  const { showDeathModal } = await import('../../src/ui/deathModal.js');
  let accepted = false;
  const overlay = showDeathModal({ roomNumber: 12 }, () => { accepted = true; });
  const inApp = document.getElementById('app').textContent;
  ok('death modal shows YOU DIED!', inApp.includes('YOU DIED!'));
  ok('death modal mentions the room', inApp.includes('room 12'));
  const btn = document.querySelector('.death-accept');
  ok('death modal accept button labelled', btn.textContent.includes('Accept Your Fate'));
  btn.listeners.click[0]();
  ok('death modal accept fires callback', accepted);
  ok('death modal removed after accept', !document.getElementById('app').textContent.includes('YOU DIED'));
}

// T38: 0.078 — the run-long combat log keeps only the newest 200 lines;
// the battle line carries --n (enemy count) for the fit-to-width card size.
{
  const { logLine } = await import('../../src/ui/hud.js');
  const { el: mkEl } = await import('../../src/core/scene.js');
  const log = mkEl('div', {});
  for (let i = 0; i < 260; i++) logLine(log, `line ${i}`);
  ok('combat log capped at 200 lines', log.children.length === 200 && log.children[0].textContent.includes('line 60'));
  const css = readFileSync('styles.css', 'utf8');
  ok('enemy row never wraps', /\.enemy-row \{[^}]*flex-wrap: nowrap/.test(css));
  ok('cards size from --card-h', /\.char-card \{[^}]*height: var\(--card-h\)/.test(css) && css.includes('--card-h: min(50vh'));
  ok('dungeon sets --n on the battle line', readFileSync('src/ui/scenes/dungeonScene.js', 'utf8').includes('--n:${enemies.length}'));
}

// T41: 0.079 — 'active' pulse on Push Deeper after a won fight, the death
// sequence (slow red build -> dialog at the peak -> 2s fade), the dialog's
// button in active red, and INVULNERABLE only under ?debug.
{
  const css = readFileSync('styles.css', 'utf8');
  ok('active state styles exist', css.includes('button.active {') && css.includes('button.active.active-red'));
  ok('active glow slides linearly (8s cycle = 4s each way, 0.082)', css.includes('animation: active-glow 8s linear infinite'));
  const d = readFileSync('src/ui/scenes/dungeonScene.js', 'utf8');
  ok('Push Deeper is active after combat', /class: 'primary active', key: 'd'/.test(d));
  const { showDeathModal } = await import('../../src/ui/deathModal.js');
  const ov = showDeathModal({ roomNumber: 3 }, () => {});
  const acc = ov.all((n) => n.tagName === 'button')[0];
  ok('death button pulses active red', acc && /\bactive\b/.test(acc.className) && acc.className.includes('active-red'));
  ov.remove();
  const { deathFlash } = await import('../../src/ui/fx.js');
  let peaked = false;
  deathFlash(() => { peaked = true; });
  ok('death flash builds red before the dialog', registry.flash.classList.contains('death-in') && !peaked);
  await sleep(1000);
  ok('dialog at the peak, then red fades out', peaked && registry.flash.classList.contains('death-out') && !registry.flash.classList.contains('death-in'));
  ok('flash timings: 0.9s build, 2s fade to 75%', css.includes('#flash.death-in  { opacity: 0.75; transition: opacity 0.9s')
    && css.includes('#flash.death-out { opacity: 0;    transition: opacity 2s'));
  const m = readFileSync('src/main.js', 'utf8');
  ok('INVULNERABLE only with ?debug', m.includes(".has('debug')") && m.includes('const inv = debugMode && el('));
}

// T47: 0.086 — replayable combat: events carry state snapshots; the battle
// line is built once per room and patched in place; HP on screen follows
// the log line by line (the player's too); effects ride on queue items.
{
  const rat = (n) => ({ id: 'rat', name: 'Rat ' + n, maxHp: 16, hp: 16, dmg: 3, xp: 1, coins: [1, 1] });
  const run = createRun();
  run.stats.dmg = 6; run.stats.crit = 0; run.stats.dodge = 0;
  const cb = createCombat(run, { number: 1, kind: 'combat', enemies: [rat('A'), rat('B')] });
  const evs = playerAttack(cb, 0, false);
  const atk = evs.find((e) => e.type === 'atk');
  ok('atk event snapshot = state after the hit', atk.snap.enemies[0] === 10 && atk.snap.enemies[1] === 16 && atk.heavy === false);
  const hits = evs.filter((e) => e.type === 'dmg');
  ok('enemy hits carry their source and the player HP after each hit',
    hits.length === 2 && hits[0].source === 0 && hits[1].source === 1
    && hits[1].snap.hp === run.hp && hits[0].snap.hp === run.hp + hits[1].taken);
  const big = createRun(); big.stats.dmg = 500; big.stats.crit = 0;
  const cb2 = createCombat(big, { number: 1, kind: 'combat', enemies: [rat('A'), rat('B')] });
  const sm = playerAttack(cb2, 0, true).find((e) => e.type === 'smash');
  ok('SMASH snapshot shows the wiped room', sm && sm.snap.enemies.every((h) => h === 0));
  ok('the room-wipe line reads OVERKILL (0.095)', sm.text === 'OVERKILL! Everyone dies!');
  const { fxFor } = await import('../../src/ui/combatFx.js');
  const fa = fxFor(atk), fd = fxFor(hits[1]);
  ok('fx mapping: player attack / enemy attack', fa.kind === 'attack' && fa.from === 'player' && fa.to === 0 && fa.dmg === 6
    && fd.kind === 'attack' && fd.from === 1 && fd.to === 'player' && fxFor({ type: 'sys' }) === null);

  // Scene integration: persistent nodes + line-by-line HP
  registry.app.innerHTML = '';
  resetProfile();
  Object.assign(getProfile(), { stats: { power: 0, vitality: 30, fortune: 0, precision: 0, endurance: 0 } });
  const scene = dungeonScene();
  scene.enter(registry.app);
  await sleep(50);
  const line = registry.app.all((e) => e.className === 'battle-line')[0];
  const firstEnemyCard = registry.app.all((e) => e.className && e.className.startsWith('char-card enemy-char'))[0];
  const playerHpText = () => registry.app.all((e) => e.className === 'hp-text')[0].textContent;
  const before = playerHpText();
  handleKey('a');
  const duringFirstLine = playerHpText();
  await sleep(3000); // drain
  const after = playerHpText();
  const lineAfter = registry.app.all((e) => e.className === 'battle-line')[0];
  ok('battle line is not rebuilt during playback', line === lineAfter
    && registry.app.all((e) => e.className && e.className.startsWith('char-card enemy-char'))[0] === firstEnemyCard);
  ok('player HP holds until the enemy hit prints', duringFirstLine === before, `${before} / ${duringFirstLine} / ${after}`);
  ok('HP settles on the real value after playback', after.startsWith('HP ') && after.includes(`/`));
  const deadCards = registry.app.all((e) => e.className && e.className.startsWith('char-card enemy-char') && e.classList.contains('dead'));
  ok('dead cards keep their portrait node (CSS swaps in the skull)', deadCards.every((c) => c.children.some((k) => k.tagName === 'img')));
  const css = readFileSync('styles.css', 'utf8');
  ok('portrait/skull swap is CSS-driven', /\n\.char-card\.dead \.skull \{[^}]*display: block;/.test(css) && /\n\.char-card\.dead \.portrait \{[^}]*display: none;/.test(css));
  // Drain the fight so no timers leak into later tests.
  for (let g = 0; g < 40 && !t().includes('Push Deeper') && !t().includes('YOU DIED'); g++) { handleKey('a'); await sleep(900); }
}

// T48: 0.087 — character animation: every enemy has an idle family with a
// CSS loop (independent-property transforms only, pivot at the feet);
// attack lines hold the log long enough to read; floating numbers get a
// layer; reduced motion stops the loops.
{
  const { IDLE_FAMILY } = await import('../../src/ui/battleLine.js');
  const { holdFor } = await import('../../src/ui/combatFx.js');
  const css = readFileSync('styles.css', 'utf8');
  const missing = Object.keys(DATA.enemies).filter((id) => !IDLE_FAMILY[id]);
  ok('every enemy has an idle family', missing.length === 0, missing.join(','));
  const fams = [...new Set([...Object.values(IDLE_FAMILY), 'player'])];
  const noLoop = fams.filter((f) => !css.includes(`.idle-${f} `) || !css.includes(`@keyframes idle-${f} `));
  ok('every idle family has a CSS loop', noLoop.length === 0, noLoop.join(','));
  // the full text of an @keyframes block (brace-matched)
  const block = (name) => {
    const start = css.indexOf(`@keyframes ${name} `);
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
    }
    return '';
  };
  const loops = fams.map((f) => block(`idle-${f}`));
  ok('idle loops never animate filter (repaint cost)', loops.every((k) => k.length > 30 && !k.includes('filter')));
  ok('brace matcher sanity', block('idle-hover').includes('translate: 0 -2.2%') && block('idle-hover').endsWith('}'));
  ok('portrait pivots at the feet (0 100%, see comment)', /\n\.portrait \{[^}]*transform-origin: 0 100%;/.test(css));
  ok('reduced motion stops idle loops', css.includes('@media (prefers-reduced-motion: reduce) { .portrait { animation: none !important; } }'));
  const pc = DATA.difficulty.combatPacing;
  ok('attack pacing: player/heavy/enemy holds, others default',
    holdFor({ kind: 'attack', from: 'player' }) === pc.playerAttackMs && holdFor({ kind: 'attack', from: 'player', heavy: true }) === pc.heavyAttackMs
    && holdFor({ kind: 'attack', from: 2, to: 'player' }) === pc.enemyAttackMs && holdFor({ kind: 'hit' }) === undefined && holdFor(null) === undefined);
  registry.app.innerHTML = '';
  resetProfile();
  const scene = dungeonScene();
  scene.enter(registry.app);
  await sleep(50);
  ok('combat room has the fx layer', registry.app.all((e) => e.className === 'fx-layer').length === 1);
  const portraits = registry.app.all((e) => e.tagName === 'img' && /\bidle-/.test(e.className));
  ok('portraits carry idle classes + random phase', portraits.length >= 2 && portraits.every((p) => /^-\d/.test(p.style.animationDelay)));
}

// T49: 0.088 — combat extras: camera jolts decay and end, the edge skirt
// covers the strongest jolt on top of the sway, every effect has its
// number style, and every effect kind is safe without Web Animations.
{
  const bm = await import('../../src/core/bg3dMath.js');
  const bg3d = await import('../../src/core/bg3d.js');
  const j = [{ t0: 0, amp: 0.01, dir: 1 }];
  const at = (ms) => Math.abs(bm.joltOffset(j, ms).yaw);
  ok('jolt kicks, decays, and ends', at(0) > 0.0099 && at(200) < at(0) * 0.3 && at(bm.JOLT_LIFE_MS + 1) === 0);
  const cfg = bg3d.tuning('');
  const worst = Math.min(...[4 / 3, 16 / 9, 21 / 9].map((a) => bm.edgeMargin(bm.withJoltReserve(cfg), a, cfg.overscan)));
  ok('edge skirt covers sway + strongest jolt', cfg.joltDeg > 0 && worst > 0, worst.toFixed(4));
  ok('renderer sizes the skirt with the jolt reserve', readFileSync('src/core/bg3d.js', 'utf8').includes('requiredOverscan(withJoltReserve(cfg)'));
  const css = readFileSync('styles.css', 'utf8');
  const missing = ['fx-dmg', 'fx-crit', 'fx-thorns', 'fx-miss', 'fx-heal', 'fx-revive'].filter((c) => !css.includes(`.${c} {`));
  ok('every floating-number style exists', missing.length === 0, missing.join(','));
  ok('crit numbers are 1.5x', css.includes('.fx-crit { color: #ffd24a; font-size: calc(var(--num, 24px) * 1.5);'));
  const { playFx } = await import('../../src/ui/combatFx.js');
  const u = { el: new El('div'), card: new El('div'), portrait: new El('img') };
  const ctx = { unit: (w) => (w === 'player' || w === 0 ? u : null), layer: new El('div') };
  let threw = null;
  try {
    for (const fx of [{ kind: 'attack', from: 'player', to: 0, dmg: 9, crit: true, heavy: true }, { kind: 'attack', from: 0, to: 'player', dmg: 3 },
      { kind: 'hit', to: 0, dmg: 2, thorns: true }, { kind: 'dodge', from: 0, to: 'player' }, { kind: 'heal', to: 'player', amount: 5 },
      { kind: 'revive', to: 'player' }, { kind: 'smash', dmg: 99 }, { kind: 'multi' }, { kind: 'enter' }, { kind: 'die', to: 0 }]) playFx(fx, ctx);
  } catch (e) { threw = e.message; }
  ok('every effect kind is safe without Web Animations', threw === null, threw ?? '');
  ok('bgJolt is a no-op without WebGL', bg3d.bgJolt(1) === undefined);
}

// T50: 0.089 — particles by material, elite aura, rat/spider sway, the
// potion event, Great Hall potion colors.
{
  const { MATERIAL, materialOf } = await import('../../src/ui/particles.js');
  ok('particle materials: Cinderborn embers, wraith wisps, bone/stone dust, flesh blood',
    materialOf('ghoul') === 'embers' && materialOf('wraith') === 'wisps' && materialOf('skeleton') === 'dust'
    && materialOf('rat') === 'blood' && materialOf('player') === 'blood' && Object.keys(MATERIAL).every((id) => DATA.enemies[id]));
  const { IDLE_FAMILY, enemyCard } = await import('../../src/ui/battleLine.js');
  ok('rat and spider sway like the skeletons', IDLE_FAMILY.rat === 'prowl' && IDLE_FAMILY.crypt_spider === 'prowl');
  const opts = { printing: false, combatOver: false, onAttack: () => {} };
  const elite = enemyCard(scaleEnemy('golem', 1), 0, 70, opts);
  const plain = enemyCard(scaleEnemy('rat', 1), 1, 14, opts);
  ok('elites get an aura, plain enemies do not', elite.all((n) => /\baura\b/.test(n.className)).length === 1
    && plain.all((n) => /\baura\b/.test(n.className)).length === 0);
  const css = readFileSync('styles.css', 'utf8');
  const i = css.indexOf('@keyframes aura-pulse');
  const auraKf = css.slice(i, css.indexOf('} }', i) + 3); // one-line block
  ok('aura animates only opacity/scale', auraKf.includes('opacity') && auraKf.includes('scale') && !auraKf.includes('filter') && !auraKf.includes('transform'));
  ok('potion is an event (aura, bar flare, sparkles)', readFileSync('src/ui/combatFx.js', 'utf8').includes("aura.className = 'heal-aura'")
    && css.includes('.heal-aura {') && readFileSync('src/ui/particles.js', 'utf8').includes("case 'heal':"));
  const { potionLevel } = await import('../../src/ui/scenes/hubScene.js');
  ok('Great Hall potions: green full, red low',
    potionLevel({ potions: 4, potionCap: 4 }) === 'potions-full' && potionLevel({ potions: 1, potionCap: 4 }) === 'potions-low'
    && potionLevel({ potions: 0, potionCap: 4 }) === 'potions-low' && potionLevel({ potions: 2, potionCap: 4 }) === 'potions-ok'
    && potionLevel({ potions: 2, potionCap: 8 }) === 'potions-low' && potionLevel({ potions: 3, potionCap: 8 }) === 'potions-ok'
    && css.includes('.hub-stats .potions-full .value { color: #6fe07a; }') && css.includes('.hub-stats .potions-low .value { color: #e05a4a; }'));
}

// T51: 0.089 — the player card shows TOTAL armor, plus the Infusion
// potion bonus while it lasts ("14 ARMOR" / "14+2 ARMOR").
{
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  resetProfile();
  const r = createRun(); r.stats.armor = 14; r.tempArmor = 0;
  const u = createPlayerUnit(r, { onHeavy() {}, onPotion() {} });
  const st = { hp: r.hp, printing: false, heavyReady: true, heavyCd: 0, dead: false };
  u.update(st);
  const plain = u.el.textContent;
  r.tempArmor = 2; u.update(st);
  ok('armor line: total, then total+potion bonus', plain.includes('14 ARMOR') && !plain.includes('14+') && u.el.textContent.includes('14+2 ARMOR'));
}

// T55: 0.092 — boss summons: the meter fills one step a turn, a full
// meter calls a skeleton (scaled deeper, no rewards) that stands in front
// of the boss, capped alive; Heavy goes to the front summon; the card
// appears as its line prints; fallen summons leave the row. Plus the
// big-hit sway, and the two text-alignment fixes.
{
  const cfg = DATA.difficulty.boss.summon;
  const boss = generateRoom(8, createRun()).enemies[0];
  ok('boss is a summoner (difficulty.json boss.summon)', boss.summonEvery === cfg.every && boss.summonMeter === 0 && cfg.every >= 3 && cfg.every <= 4);
  const run = createRun();
  run.hp = run.maxHp = 100000; run.stats.dmg = 1; run.stats.crit = 0; run.stats.dodge = 0; run.stats.lifesteal = 0;
  const tough = { ...boss, maxHp: 100000 };
  const cb = createCombat(run, { number: 8, kind: 'boss', isBoss: true, enemies: [tough] });
  const turn = () => playerAttack(cb, 0, false);
  for (let i = 1; i < cfg.every; i++) turn();
  ok('meter fills one step per turn, no summon before full', cb.enemies.length === 1 && cb.enemies[0].summonMeter === cfg.every - 1);
  const evs = turn();
  const sev = evs.find((e) => e.type === 'summon');
  const sk = cb.enemies[1];
  ok('full meter summons a skeleton', !!sev && sev.source === 0 && sev.target === 1 && sk?.id === cfg.enemy && sk.summoned && /summons/.test(sev.text));
  ok('summon line shows the full meter and the new card; meter then resets',
    sev.snap.enemies.length === 2 && sev.snap.meters[0] === cfg.every && cb.enemies[0].summonMeter === 0);
  const ref = scaleEnemy(cfg.enemy, 8 + cfg.depthBonus);
  ok('summons scale to the room (+depthBonus, dmgScale, hpScale)', sk.dmg === Math.max(1, Math.round(ref.dmg * cfg.dmgScale)) && sk.maxHp === Math.max(1, Math.round(ref.maxHp * cfg.hpScale)) && sk.hp === sk.maxHp);
  ok('summons give no rewards', sk.xp === 0 && sk.coins[0] === 0 && sk.coins[1] === 0);
  const { applyLoot } = await import('../../src/run/runState.js');
  const k0 = run.kills, c0 = run.coins, x0 = run.xp;
  const drop = applyLoot(run, sk, () => {});
  ok('...and no loot, but count as kills', drop.itemId === null && run.kills === k0 + 1 && run.coins === c0 && run.xp === x0);
  for (let i = 0; i < cfg.every * (cfg.maxAlive + 2); i++) turn();
  const alive = cb.enemies.filter((e) => e.summoned && e.hp > 0).length;
  ok('summons capped alive; meter waits full', alive === cfg.maxAlive && cb.enemies[0].summonMeter === cfg.every);
  const { heavyTarget } = await import('../../src/run/combat.js');
  ok('Heavy targets the front summon, else the boss', heavyTarget(cb) === 1
    && heavyTarget({ enemies: [{ hp: 5 }, { hp: 0, summoned: true }] }) === 0);
  ok('regular rooms have no summoners', generateRoom(3, createRun()).enemies.every((e) => !e.summonEvery));

  const { fxFor, holdFor } = await import('../../src/ui/combatFx.js');
  const sfx = fxFor(sev);
  ok('summon fx + pacing hold', sfx.kind === 'summon' && sfx.from === 0 && sfx.to === 1 && holdFor(sfx) === DATA.difficulty.combatPacing.summonMs);

  // Cards: the boss has a summon bar; a fallen summon's unit leaves the row.
  const { createEnemyUnit } = await import('../../src/ui/battleLine.js');
  const bu = createEnemyUnit(boss, 0, { onAttack() {} });
  bu.update({ hp: boss.maxHp, dead: false, printing: false, combatOver: false, meter: 2 });
  const fill = bu.el.all((e) => e.className === 'summon-fill')[0];
  ok('boss card has a summon bar that fills', !!fill && fill.style.width === `${Math.round((200) / cfg.every)}%`);
  ok('regular cards have no summon bar', createEnemyUnit(scaleEnemy('rat', 1), 0, { onAttack() {} }).el.all((e) => e.className === 'summon-line').length === 0);
  let gone = 0;
  const row = new El('div');
  const su = createEnemyUnit(sk, 1, { onAttack() {}, onGone: () => gone++ });
  row.append(su.el);
  su.update({ hp: 0, dead: true, printing: false, combatOver: false });
  ok('a fallen summon leaves the row', row.children.length === 0 && gone === 1);

  // Scene: a boss room (bossEvery 1 for the test) — the summon card appears
  // as its line prints, in front of (left of) the boss; --n follows.
  const every = DATA.difficulty.bossEvery;
  DATA.difficulty.bossEvery = 1;
  registry.app.innerHTML = '';
  resetProfile();
  Object.assign(getProfile(), { stats: { power: 0, vitality: 90, fortune: 0, precision: 0, endurance: 30 } });
  const scene = dungeonScene();
  scene.enter(registry.app);
  await sleep(50);
  const enemyRow = () => registry.app.all((e) => e.className === 'enemy-row')[0];
  const lineStyle = () => registry.app.all((e) => e.className === 'battle-line')[0].attrs.style;
  let early = null;
  for (let i = 0; i < cfg.every; i++) {
    handleKey('a');
    if (i === cfg.every - 1) early = enemyRow().children.length; // playback has only begun
    await sleep(2600);
  }
  const kids = enemyRow().children;
  ok('summon card appears with its log line, not before', early === 1 && kids.length === 2, `${early} -> ${kids.length}`);
  ok('...in front of the boss, and --n follows', kids[1].all((e) => e.className && e.className.includes('boss-card')).length === 1
    && kids[0].all((e) => e.className && e.className.includes('enemy-skeleton')).length === 1 && lineStyle() === '--n:2');
  ok('summon line printed in violet', registry.app.all((e) => e.className === 'summon').length === 1);
  DATA.difficulty.bossEvery = every;
  for (let g = 0; g < 3; g++) { handleKey('a'); await sleep(900); } // let timers settle

  // Big-hit sway (0.092; a rotation about the depth centre since 0.093):
  // directional, damped, ends, and subtle.
  const bm = await import('../../src/core/bg3dMath.js');
  const bg3d = await import('../../src/core/bg3d.js');
  const sw = (dir, ms) => bm.swayOffset([{ t0: 0, amp: 0.03, dir }], ms);
  ok('sway starts at rest and goes WITH the blow', sw(1, 0) === 0 && sw(1, 100) > 0.015 && sw(-1, 100) < -0.015);
  ok('sway rebounds smaller, then ends', sw(1, 450) < 0 && Math.abs(sw(1, 450)) < sw(1, 120) * 0.5 && sw(1, bm.SWAY_LIFE_MS + 1) === 0);
  const pc = bg3d.tuning('');
  const aspect = 16 / 9, fov = (pc.fovDeg * Math.PI) / 180;
  const peak = (pc.swayDeg * Math.PI) / 180 * 0.64; // strength-1 peak
  const shift = (d) => bm.projectVertex(bm.mvp(peak, 0, fov, aspect), 0.5, 0.5, d, aspect, pc)[0];
  ok('+ sway rotates about the depth centre: near art right, far left, pivot still',
    shift(1) > 0 && shift(0) < 0 && Math.abs(shift(pc.pivot)) < 1e-6);
  ok('...and stays subtle (near art moves < 1.5% of the screen)', shift(1) * 50 < 1.5, `${(shift(1) * 50).toFixed(2)}%`);
  ok('bgSway is a no-op without WebGL', bg3d.bgSway(1, 1) === undefined);
  ok('enemy hits carry their share of max HP', fxFor({ type: 'dmg', source: 0, taken: 30 }, { maxHp: 120 }).share === 0.25);
  const fxSrc = readFileSync('src/ui/combatFx.js', 'utf8');
  ok('crits / SMASH / multi-kills sway right, big hits on the knight sway left',
    fxSrc.includes("shake(ctx, 2);\n  bgSway(2, 1);") && /if \(fx\.crit\) \{?\s*bgSway\(/.test(fxSrc)
    && fxSrc.includes("fx.to === 'player' && fx.share >= big") && fxSrc.includes('/ big, -1)'));

  // Alignment (0.092): caps centered in buttons (underline ignored), and
  // the elite star no longer drops its name below the others.
  const css = readFileSync('styles.css', 'utf8');
  ok('button caps centered via text-box trim (with fallback nudge)', /@supports \(text-box: trim-both cap alphabetic\) \{\s*\.btn-label \{ top: 0; text-box: trim-both cap alphabetic; padding-block: calc\(\(1lh - 1cap\) \/ 2\); \}/.test(css)
    && css.includes('.btn-label { position: relative; top: 0.15em; }'));
  ok('elite star stays out of the name line box', /\.elite-star \{[^}]*line-height: 0;/.test(css));
  resetProfile();
}

// T66: 0.104 — crit damage varies ±critJitter around critMult; a rare MEGA
// CRIT (megaCritChance of crits) does megaCritMult more, with its own
// caption, bigger number and brighter flash.
{
  const { critMultiplier } = await import('../../src/run/combat.js');
  const tune = DATA.difficulty.combat;
  const lo = critMultiplier(tune, false, 0), hi = critMultiplier(tune, false, 0.999999), mid = critMultiplier(tune, false, 0.5);
  ok('crit damage varies around critMult', tune.critJitter > 0 && lo < mid && mid < hi && Math.abs(mid - tune.critMult) < 1e-9
    && Math.abs(lo - tune.critMult * (1 - tune.critJitter)) < 1e-9);
  ok('mega crit = megaCritMult x a crit, and rare', Math.abs(critMultiplier(tune, true, 0.5) - tune.critMult * tune.megaCritMult) < 1e-9
    && tune.megaCritMult >= 1.5 && tune.megaCritChance > 0 && tune.megaCritChance <= 0.2);
  const run = createRun(); run.stats.dmg = 100; run.stats.crit = 1; run.stats.lifesteal = 0;
  const c = createCombat(run, generateRoom(1, run));
  c.enemies[0].hp = 100000;
  const real = Math.random;
  const seq = [0, 0, 0.5]; // crit roll, mega roll, jitter
  Math.random = () => (seq.length ? seq.shift() : 0.5);
  const ev = playerAttack(c, 0, false).find((e) => e.type === 'atk');
  Math.random = real;
  ok('a mega crit hits 1.5x a crit and says so', ev.megaCrit && ev.crit && ev.dmg === Math.round(100 * tune.critMult * tune.megaCritMult) && ev.text.includes('MEGA CRIT!'));
  const fx = readFileSync('src/ui/combatFx.js', 'utf8');
  ok('mega crit: caption, bigger number, brighter flash', fx.includes("fx.mega ? 'MEGA CRIT!'") && fx.includes("'megacrit'")
    && /\.fx-crit\.fx-mega \{[^}]*font-size/.test(readFileSync('styles.css', 'utf8')) && DATA.backgrounds.parallax.lights.megacrit.strength > DATA.backgrounds.parallax.lights.crit.strength);
}

// T67: 0.105 — ?debug FORCE CRITS / FORCE MEGA CRITS toggles.
{
  const { DEBUG } = await import('../../src/shared/debug.js');
  ok('crit toggles are off by default', DEBUG.forceCrit === false && DEBUG.forceMegaCrit === false);
  const hit = () => {
    const run = createRun(); run.stats.dmg = 100; run.stats.crit = 0; run.stats.lifesteal = 0;
    const c = createCombat(run, generateRoom(1, run));
    c.enemies[0].hp = 100000;
    return playerAttack(c, 0, false).find((e) => e.type === 'atk');
  };
  DEBUG.forceCrit = true;
  const a = [hit(), hit(), hit()];
  DEBUG.forceCrit = false; DEBUG.forceMegaCrit = true;
  const b = [hit(), hit(), hit()];
  DEBUG.forceMegaCrit = false;
  const c0 = hit();
  ok('FORCE CRITS: every attack crits (0% crit chance)', a.every((e) => e.crit) && !c0.crit);
  ok('FORCE MEGA CRITS: every attack mega crits', b.every((e) => e.crit && e.megaCrit && e.text.includes('MEGA CRIT!')));
  const main = readFileSync('src/main.js', 'utf8');
  ok('crit toggles only under ?debug', main.includes("toggle('forceCrit', 'FORCE CRITS'") && main.includes("...critToggles()") && main.includes('...(debugMode ? bgDebugToggles() : [])'));
}

// T68: 0.106 — OVERKILL gets the mega-crit treatment across the enemy line.
{
  const fx = readFileSync('src/ui/combatFx.js', 'utf8');
  ok('OVERKILL: banner over the whole enemy line, red-hot flash, big sway', fx.includes("case 'smash': return overkill(fx, ctx);")
    && fx.includes("floatBanner(ctx, area, `-${fx.dmg}`, 'fx-crit fx-mega fx-overkill', 'OVERKILL!')") && fx.includes("bgLight('overkill', area)")
    && /\.fx-crit\.fx-mega\.fx-overkill \{[^}]*font-size/.test(readFileSync('styles.css', 'utf8'))
    && DATA.backgrounds.parallax.lights.overkill.strength > DATA.backgrounds.parallax.lights.megacrit.strength);
  ok('mega crits: one crit in five (0.106)', DATA.difficulty.combat.megaCritChance === 0.2);
}

// T72: 0.109 — dead enemy cards fade almost away (10%).
ok('dead enemy cards at 10% opacity', /\n\.char-card\.dead \{[^}]*opacity: 0\.1;/.test(readFileSync('styles.css', 'utf8')));
