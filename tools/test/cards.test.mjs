// tools/test/cards.test.mjs — the card effects (0.183, the Card Lab's picks
// in the game): the shader light behind every portrait (ui/cardFx.js), the
// cards in 3D (the kick, the dealt entrance) and the glint.
// Run via tools/smoke-test.mjs.

import { readFileSync } from 'node:fs';
import { ok, fresh, sleep, DATA, createRun, El } from './harness.mjs';

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

// The cards in 3D and the effects' wiring (source checks: the shim has no
// Web Animations)
{
  const fx = readFileSync('src/ui/combatFx.js', 'utf8');
  ok('the kick: full angle at 6% of the kick, slow recovery, added over the card\'s own transform',
    fx.includes("offset: 0.06, easing: 'cubic-bezier(0.45, 0.05, 0.35, 1)'") && fx.includes("duration: M.kickMs, delay, easing: 'linear', composite: 'add'")
    && fx.includes('kick(u, fx.mega || fx.crit ? M.critKick : fx.heavy ? M.heavyKick : 1, away, delay + stop)'));
  ok('the deal brings the cards in turned, the glint crossing each', fx.includes('rotateY(${-side * 62}deg) rotateZ(${side * 9}deg) scale(0.92)') && fx.includes('glintSweep(u, G.enterMs, side, delay + 120)'));
  ok('the units wait unseen from the room\'s build to the deal, and the scenes deal once the windows are back (0.184)',
    fx.includes("case 'deal': return deal(ctx);") && fx.includes("if (can(u?.el)) u.el.style.opacity = '0';")
    && readFileSync('src/ui/scenes/dungeonScene.js', 'utf8').includes("whenWindowsBack().then(() => { if (ui === built) playFx({ kind: 'deal' }, fxCtx); });")
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

// Shrine boon and treasure chest cards are lit to their edge
{
  ok('shrine cards go through litCard with the boon\'s style', readFileSync('src/ui/shrineUI.js', 'utf8').includes("litCard(SHRINE_STYLE[o.id], el('div', { class: 'shrine-card' }")
    && readFileSync('src/ui/shrineUI.js', 'utf8').includes("{ window: 'panel', amt: DATA.cards.fx.panelAmt, into: plate }"));
  ok('treasure chests go through litCard with the chest\'s style', readFileSync('src/ui/treasureUI.js', 'utf8').includes('litCard(CHEST_STYLE[kind], el'));
  ok('a panel card\'s gradient is a plate layer holding its light', css.includes('.shrine-card .card-plate { position: absolute; inset: 0; z-index: -1;') && readFileSync('src/ui/shrineUI.js', 'utf8').includes("const plate = el('div', { class: 'card-plate' });"));
  // litCard hands the card back (the light is a no-op in the shim)
  const { litCard } = await import('../../src/ui/shrineUI.js');
  const c = new El('div');
  ok('litCard gives the card its plate layer first and hands it back', litCard('blood', c) === c && c.children.length === 1 && c.children[0].classList.contains('card-plate'));
}
