// tools/test/cards.test.mjs — the card effects (0.183, the Card Lab's picks
// in the game): the shader light behind every portrait (ui/cardFx.js), the
// cards in 3D (the kick, the dealt entrance) and the glint.
// Run via tools/smoke-test.mjs.

import { readFileSync } from 'node:fs';
import { ok, fresh, sleep, DATA, createRun, scaleEnemy, El, withAnimations } from './harness.mjs';

fresh();
const css = readFileSync('styles.css', 'utf8');
const { attachCardFx, cardStyle, styleNamed, SHRINE_STYLE, CHEST_STYLE, LOOKS, WINDOW, FS, litCards } = await import('../../src/ui/cardFx.js');

// The looks: by particle material, the boss and the knight their own
{
  const looks = { player: cardStyle('player').look, boss: cardStyle('vampire_lord', true).look, skeleton: cardStyle('skeleton').look, ghoul: cardStyle('ghoul').look, wraith: cardStyle('wraith').look, rat: cardStyle('rat').look, golem: cardStyle('golem').look };
  ok('card looks: knight ether, boss flames, bone fog, embers flames, wraith ether, flesh blood',
    looks.player === 'ether' && looks.boss === 'flames' && looks.skeleton === 'fog' && looks.ghoul === 'flames' && looks.wraith === 'ether' && looks.rat === 'blood' && looks.golem === 'blood', JSON.stringify(looks));
  const all = [...Object.values(SHRINE_STYLE), ...Object.values(CHEST_STYLE)];
  ok('every shrine boon and every chest names a style the shader knows',
    DATA.shrines.offers.every((o) => SHRINE_STYLE[o.id]) && ['coffer', 'gilded', 'reliquary'].every((k) => CHEST_STYLE[k])
    && all.every((n) => LOOKS.includes(styleNamed(n).look) && styleNamed(n).tint.length === 3));
  ok('the shader draws the lit window per card kind (frame: the measured border; panel: to the edge)',
    FS.includes('uniform vec2 uWin') && WINDOW.frame[0] === 0.0113 && WINDOW.panel[0] === 0 && FS.includes('smoothstep(-0.003, 0.003, d)'));
}

// The lab draws the game's shader, not a copy of it (0.183)
ok('the Card Lab imports the game\'s shader and tables', readFileSync('labs/cards/cardFx.js', 'utf8').includes("import { VS, FS, LOOKS, TINTS, WINDOW } from '../../src/ui/cardFx.js'"));
{
  const lab = readFileSync('labs/cards/lab.js', 'utf8'), page = readFileSync('labs/cards/index.html', 'utf8');
  ok('the Card Lab uses the units\' own glint and resets to the shipped tuning (0.00223)', lab.includes('u.band = u.glint') && !lab.includes('cloneNode') && lab.includes('C.fx.amt') && lab.includes('C.motion.kickDeg') && lab.includes('C.glint.band')
    && !page.includes('.portrait.glint {') && page.includes('.portrait.glint.streak {') && page.includes('#stage .boss-card .card-frame {') && lab.includes('--slots:${ENEMIES.length + ENEMIES.filter((e) => e.boss).length}'));
  ok('the Card and Art labs reload the stylesheet under the build with their modules', page.includes('href="styles.css" data-versioned') && readFileSync('labs/art/index.html', 'utf8').includes('href="styles.css" data-versioned')
    && readFileSync('labs/boot.js', 'utf8').includes('link[rel="stylesheet"][data-versioned]'));
}

// 0.00227: every lit card draws on a WebGL canvas of its own from a pool
// of at most POOL_MAX, handed from room to room (the first device report
// put Safari's createImageBitmap(canvas) — the copy out of the one hidden
// context — at 13.5 ms a tick on the developer's iPhone); the copy path stays
// for the cards past the pool and where no pool canvas can be made
{
  const src = readFileSync('src/ui/cardFx.js', 'utf8');
  ok('the card light: a pooled canvas per card (acquire / release, a lost context leaves the pool), a card that finds the pool held waits a tick, the overflow copy as the fallback',
    src.includes('const POOL_MAX = 8;') && src.includes('const acquire = () => free.pop() ?? make();') && src.includes('if (e.own) { release(e.own); return; }')
    && src.includes("addEventListener?.('webglcontextlost', () => { slot.lost = true;") && src.includes('if (e.own) continue;')
    && src.includes('for (const e of entries) if (!e.canvas) { if (place(e)) mount(e); else e.unlit = true; }')
    && src.includes('if (e.bmp) createImageBitmap(shared.canvas, 0, 0, w, h)') && src.includes('else e.ctx.drawImage(shared.canvas'));
  ok('the pool holds every fight (difficulty.json maxEnemies and the knight; the boss, its summons and the knight)',
    8 >= DATA.difficulty.maxEnemies + 1 && 8 >= 1 + DATA.difficulty.boss.summon.maxAlive + 1);
}

// Without WebGL (the shim: no canvas contexts) a card is left as it is
{
  const card = new El('div');
  ok('no WebGL: attachCardFx lights nothing and leaves the card untouched', attachCardFx(card, cardStyle('rat')) === null && card.children.length === 0 && litCards() === 0);
}

// The battle line: a portrait's glint copy is mounted for a sweep only
// (0.00222), right after the portrait inside its band, on the same idle
// loop and phase; the unit carries the band width
{
  const { createEnemyUnit, createPlayerUnit, unmountGlint } = await import('../../src/ui/battleLine.js');
  const run = createRun();
  const e = { id: 'skeleton', name: 'Skeleton LV2', maxHp: 30, hp: 30, dmg: 3, xp: 1, coins: [1, 1] };
  const u = createEnemyUnit(e, 0, { onAttack() {}, onGone() {} });
  const before = u.card.children.length;
  ok('enemy unit: no glint in the card until a sweep asks (six invisible copies used to run all fight)', !u.card.all((n) => n.classList.contains('glint')).length && u.glintEl === null);
  const band = u.glint;
  const kids = u.card.children;
  const i = kids.indexOf(u.portrait), g = band.children[0];
  ok('the glint mounts as a band right after the portrait: a copy of the art inside, same idle loop and phase, hidden from readers',
    band.classList.contains('glint-band') && kids[i + 1] === band && kids.length === before + 1 && u.glint === band
    && g.classList.contains('glint') && g.classList.contains('portrait') && g.classList.contains('idle-prowl') && g.attrs.src === u.portrait.attrs.src
    && g.style.animationDelay === u.portrait.style.animationDelay && g.attrs['aria-hidden'] === 'true' && g.attrs.alt === '');
  unmountGlint(u);
  ok('…and leaves again after the sweep', u.card.children.length === before && u.glintEl === null && !u.card.all((n) => n.classList.contains('glint-band')).length);
  ok('the unit carries the glint band width from cards.json', u.el.attrs.style === `--band:${DATA.cards.glint.band}%`);
  ok('the card\'s first child is its frame layer (the art, the light inside)', u.card.children[0].classList.contains('card-frame'));
  const p = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
  ok('player unit: a glint too, on the player idle loop', p.glint.children[0].classList.contains('idle-player') && p.card.children[p.card.children.indexOf(p.portrait) + 1] === p.glint);
  ok('the band carries the mask and is three cards wide; the copy keeps its brightness', css.includes('.glint-band {\n  position: absolute; top: 0; bottom: 0; left: -100%; width: 300%;') && css.includes('.portrait.glint { filter: brightness(1.9) saturate(0.5); max-width: calc(128% / 3); }') && !/\.portrait\.glint \{[^}]*mask/.test(css));
}

// The knight's card turns over on a click (0.00256 / 0.00258): STATS, then
// INVENTORY, then the hero again; STATS shows the run's own numbers and
// follows the tick, INVENTORY the worn gear as picture strips (0.00289). The ⓘ under the gear says it turns.
{
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const { getProfile } = await import('../../src/meta/profile.js');
  const p0 = getProfile();
  const eq0 = JSON.stringify(p0.equipment);
  p0.equipment.weapon = 'moonbrand'; p0.equipment.amulet = null;
  const run = createRun();
  const p = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
  const all = (n, f, out = []) => { if (f(n)) out.push(n); (n.children ?? []).forEach((c) => all(c, f, out)); return out; };
  const has = (cls) => (n) => n.classList?.contains(cls);
  const back = all(p.card, has('card-back'))[0];
  const [stats, inv] = [all(back, has('back-stats'))[0], all(back, has('back-inv'))[0]];
  const val = (label) => stats.children.find((r) => r.children?.[0]?.textContent === label)?.children[1].textContent;
  const click = async () => { await p.card.listeners.click[0](); await sleep(0); };
  ok('the ⓘ sits under the gear names', all(p.card, has('gear-names'))[0].children.some((c) => c.classList?.contains('info-i') && c.textContent === 'i'));
  await click();
  const onStats = p.card.classList.contains('flipped') && !p.card.classList.contains('page-inv');
  run.hp = run.maxHp - 7; run.stats.lifesteal = 0.25;
  p.update({ hp: run.hp, heavyCd: 0, heavyReady: true });
  ok('a first click turns the card to STATS: the run\'s health, attack, crit, lifesteal, potions, kept current by the tick', onStats && stats.children[0].textContent === 'Stats'
    && val('Health') === `${run.maxHp - 7} / ${run.maxHp}` && val('Attack') === `${run.stats.dmg}` && val('Lifesteal') === '25%'
    && val('Crit damage') === `×${(DATA.difficulty.combat.critMult + run.stats.critBonus).toFixed(2)}` && val('Potions') === `${run.potions} / ${run.potionCap}`);
  run.itemsFound.push('vampiric_ring');
  await click();
  const rows = all(inv, has('inv-row'));
  const art = (r) => all(r, has('slot-art'))[0];
  ok('a second click turns it to INVENTORY: a strip per gear slot — the worn item\'s picture, name and stats, an empty slot dashed (0.00289)', p.card.classList.contains('flipped') && p.card.classList.contains('page-inv')
    && inv.children[0].textContent === 'Inventory' && rows.length === 7 && rows[0].textContent.includes('MOONBRAND') && art(rows[0])?.children[0]?.attrs?.src?.includes('moonbrand')
    && rows[0].classList.contains(`gear-rarity-${DATA.items.moonbrand.tier}`) && rows[6].classList.contains('empty') && rows[6].textContent.includes('Amulet — empty') && !art(rows[6]));
  ok('…and no list of this run\'s finds on the page (a list of their own is to come)', !inv.textContent.includes('Found this run') && !inv.textContent.includes('VAMPIRIC RING'));
  await click();
  ok('…and a third click turns it back to the hero', !p.card.classList.contains('flipped') && !p.card.classList.contains('page-inv'));
  p0.equipment = JSON.parse(eq0);
}

// The cards in 3D, played (0.00223: the harness lends Web Animations for a
// block — these used to be checks on the source text)
{
  const { playFx } = await import('../../src/ui/combatFx.js');
  const { createEnemyUnit, createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const M = DATA.cards.motion, G = DATA.cards.glint;
  await withAnimations(async () => {
    const run = createRun();
    const player = createPlayerUnit(run, { onHeavy() {}, onPotion() {} });
    const foes = ['rat', 'skeleton', 'wraith'].map((id, i) => createEnemyUnit(scaleEnemy(id, 1), i, { onAttack() {} }));
    const row = new El('div'); row.append(...foes.map((u) => u.el));
    const line = new El('div'); line.append(player.el, row);
    const ctx = { unit: (w) => (w === 'player' ? player : foes[w] ?? null), layer: null };
    const all = [player, ...foes];
    playFx({ kind: 'attack', from: 'player', to: 0, dmg: 9, crit: true }, ctx);
    const kick = foes[0].card.animations?.[0], band = foes[0].glintEl;
    ok('a crit kicks the struck card: the full angle (kickDeg x critKick) at 6% of the kick, added over the card\'s own transform, kickMs long',
      !!kick && kick.kf[1].offset === 0.06 && kick.kf[1].transform === `rotateY(${-M.kickDeg * M.critKick}deg)` && kick.opts.composite === 'add' && kick.opts.duration === M.kickMs && kick.kf.at(-1).transform === 'rotateY(0deg)');
    ok('...and the glint sweeps the figure at the data strength, the copy sliding back over its own transform', !!band && band.animations?.[0].kf[1].opacity === G.strength && band.animations[0].opts.duration === G.hitMs
      && band.children[0].animations?.[0].opts.composite === 'add');
    playFx({ kind: 'enter' }, ctx);
    const hidden = all.every((u) => u.el.style.opacity === '0');
    playFx({ kind: 'deal' }, ctx);
    const dealt = all.every((u, n) => { const a = u.el.animations?.at(-1); const i = u === player ? 0 : n - 1; return a && a.kf[0].transform.includes('rotateY(') && a.kf[0].opacity === 0 && a.opts.delay === M.enterDelayMs + i * M.enterStaggerMs && a.opts.duration === M.enterMs; });
    await sleep(M.enterDelayMs + foes.length * M.enterStaggerMs + 10);
    ok('the units wait unseen from the room\'s build (enter) to the deal, then come in turned and tilted, staggered, and stay shown', hidden && dealt && all.every((u) => u.el.style.opacity === ''));
    const kicks = (n) => (foes[n].card.animations ?? []).length;
    const before = foes.map((_, n) => kicks(n));
    playFx({ kind: 'overkill', dmg: 999, victims: [0, 1, 2] }, ctx);
    await sleep(5); // (the first victim's own task)
    const at0 = kicks(0) === before[0] + 1 && kicks(1) === before[1];
    await sleep(70);
    const at1 = kicks(1) === before[1] + 1 && kicks(2) === before[2];
    await sleep(70);
    ok('OVERKILL kicks every victim, rippling down the line 70 ms apart', at0 && at1 && kicks(2) === before[2] + 1 && foes[2].card.animations.at(-1).kf[1].transform === `rotateY(${-M.kickDeg * M.overkillKick}deg)`);
    await sleep(3000); // (the effects' own timers run out inside the block)
  });
  ok('the scenes deal once the windows are back (0.184)',
    readFileSync('src/ui/scenes/dungeonScene.js', 'utf8').includes("whenWindowsBack().then(() => { if (ui === built) playFx({ kind: 'deal' }, fxCtx); });")
    && readFileSync('src/ui/scenes/benchmarkScene.js', 'utf8').includes("whenWindowsBack().then(() => playFx({ kind: 'deal' }, fxCtx));"));
  // whenWindowsBack: at once when idle, after the windows return during a transition
  const { whenWindowsBack, transitionTo } = await import('../../src/core/scene.js');
  let idle = false; whenWindowsBack().then(() => { idle = true; });
  await sleep(0);
  let back = false; transitionTo(() => {}); whenWindowsBack().then(() => { back = true; });
  await sleep(500); const early = back;
  await sleep(700);
  ok('whenWindowsBack resolves at once when idle, and when a transition\'s windows return', idle && !early && back);
  ok('every level of the line hands its children the camera', css.includes('.battle-line, .enemy-row, .unit { perspective: 130vh; perspective-origin: 50% 35%; }'));
  ok('the shader layer screens over the frame art inside the card\'s plate layer', css.includes('.card-fx { position: absolute; inset: 0; width: 100%; height: 100%;') && css.includes('mix-blend-mode: screen; }') && css.includes('.card-frame {\n  position: absolute; inset: 0; z-index: -1;') && !css.includes('.char-card::before'));
  const parts = readFileSync('src/ui/fxParts.js', 'utf8');
  ok('the glint sweep peaks at the data strength and slides the band and its copy opposite ways, transforms only (0.00222)', parts.includes("opacity: DATA.cards.glint.strength, offset: 0.4, translate: '0 0'") && parts.includes("img.animate([{ translate: `${-from}px 0` }") && parts.includes("composite: 'add'") && !parts.includes('maskPosition')
    && parts.includes('if (--band.live <= 0) unmountGlint(u)'));
}

// Shrine boon and treasure chest cards are lit to their edge (0.00223: the rooms rendered, not their source read)
{
  const { renderShrineRoom } = await import('../../src/ui/shrineUI.js');
  const { renderTreasureRoom } = await import('../../src/ui/treasureUI.js');
  const { generateInterlude } = await import('../../src/run/roomGen.js');
  const { dealOffers } = await import('../../src/run/shrine.js');
  const hooks = { title: ['T'], logEl: new El('div'), buffBar: new El('div'), coins: 0, xp: 0, onDeeper() {}, onRetreat() {}, refresh() {}, onDeath() {} };
  const run = createRun();
  const shrine = generateInterlude('shrine', 3, run); shrine.dealtOffers = dealOffers(run, shrine);
  const root = new El('div'); renderShrineRoom(root, run, shrine, hooks);
  const boons = root.all((n) => /\bshrine-card\b/.test(n.className ?? ''));
  ok('every dealt boon is a card with its plate layer first (lit through litCard)', boons.length === DATA.shrines.dealCount && boons.every((c) => c.children[0]?.classList.contains('card-plate')));
  const root2 = new El('div'); renderTreasureRoom(root2, createRun(), generateInterlude('treasure', 6, createRun()), hooks);
  const chests = root2.all((n) => /\bshrine-card\b/.test(n.className ?? ''));
  ok('the three chests are cards with their plate layer first', chests.length === 3 && chests.every((c) => c.children[0]?.classList.contains('card-plate')));
  ok('a panel card\'s gradient is a plate layer holding its light', css.includes('.shrine-card .card-plate { position: absolute; inset: 0; z-index: -1;') && readFileSync('src/ui/shrineUI.js', 'utf8').includes("{ window: 'panel', amt: DATA.cards.fx.panelAmt, into: plate }"));
  // litCard hands the card back (the light is a no-op in the shim)
  const { litCard } = await import('../../src/ui/shrineUI.js');
  const c = new El('div');
  ok('litCard gives the card its plate layer first and hands it back', litCard('blood', c) === c && c.children.length === 1 && c.children[0].classList.contains('card-plate'));
}
