// tools/smoke-test.mjs — headless smoke suite. Run before every build:
//   node tools/smoke-test.mjs
//
// The DOM shim deliberately models browser constraints the easy version
// missed — `children` is getter-only (assigning to it threw on real DOM
// and shipped broken in 0.031), style lives behind setAttribute, etc.

import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

let passed = 0, failed = 0;
const ok = (name, cond, info = '') => {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${info ? ' — ' + info : ''}`); }
};

// ---------- DOM shim ----------
class El {
  constructor(tag) {
    this.tagName = tag;
    this.attrs = {};
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.parent = null;
    this._text = '';
    const kids = [];
    // READ-ONLY children, like real DOM. Internal pushes go through the
    // array reference; assignments throw in module strict mode.
    Object.defineProperty(this, 'children', { get: () => kids, enumerable: true });
    const s = new Set();
    this.classList = { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
  }
  set className(v) { this._cls = v; String(v).split(' ').filter(Boolean).forEach((c) => this.classList.add(c)); }
  get className() { return this._cls || ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  append(...nodes) {
    for (const n of nodes) {
      if (n instanceof El) { n.parent = this; this.children.push(n); }
      else if (typeof n === 'string') this.children.push({ text: n, textContent: n, walk() {} });
      else if (n && typeof n.textContent === 'string') this.children.push(n);
      else this.children.push({ text: String(n), textContent: String(n), walk() {} });
    }
  }
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); } }
  insertBefore(n, ref) {
    if (n.remove) n.remove();
    n.parent = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    this.children.splice(i < 0 ? this.children.length : i, 0, n);
  }
  getBoundingClientRect() { return { left: 50, top: 50, width: 100, height: 20 }; }
  set innerHTML(v) { if (v === '') this.children.length = 0; }
  get innerHTML() { return ''; }
  get scrollHeight() { return 100; }
  get offsetWidth() { return 0; }
  // Like real DOM: setting textContent replaces the children (0.086 — the
  // persistent battle line patches text in place).
  set textContent(v) { this.children.length = 0; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(''); }
  click() { for (const fn of this.listeners.click || []) fn({}); }
  walk(fn) { fn(this); for (const c of this.children) if (c.walk) c.walk(fn); }
  all(pred) { const out = []; this.walk((e) => { if (pred(e)) out.push(e); }); return out; }
}

const registry = { app: new El('main'), bg0: new El('div'), bg1: new El('div'), flash: new El('div') };
function findById(root, id) { let hit = null; root.walk((e) => { if (!hit && e.attrs && e.attrs.id === id) hit = e; }); return hit; }
function match(el, sel) {
  if (sel === 'button.primary:not([disabled])')
    return el.tagName === 'button' && el.className.split(' ').includes('primary') && el.attrs.disabled === undefined;
  const m = sel.match(/^button\[data-key="([a-z0-9])"\]:not\(\[disabled\]\)$/);
  if (m) return el.tagName === 'button' && el.attrs['data-key'] === m[1] && el.attrs.disabled === undefined;
  if (sel === 'button[data-key2=" "]:not([disabled])')
    return el.tagName === 'button' && el.attrs['data-key2'] === ' ' && el.attrs.disabled === undefined;
  if (sel === '.death-accept') return el.className.split(' ').includes('death-accept');
  return false;
}

globalThis.document = {
  getElementById: (id) => registry[id] || findById(registry.app, id),
  createElement: (t) => new El(t),
  createTextNode: (t) => ({ text: t, textContent: t, walk() {} }),
  listeners: {},
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
  querySelector: (sel) => { let hit = null; registry.app.walk((e) => { if (!hit && match(e, sel)) hit = e; }); return hit; },
  querySelectorAll: (sel) => { const out = []; registry.app.walk((e) => { if (match(e, sel)) out.push(e); }); return out; },
};
globalThis.Node = El;
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 5);
globalThis.localStorage = {
  s: {},
  getItem(k) { return this.s[k] ?? null; },
  setItem(k, v) { this.s[k] = v; },
  removeItem(k) { delete this.s[k]; },
};
globalThis.confirm = () => true;
// Strip ?v= cachebust stamps so the suite also runs in the stamped deploy
// tree (app/) — the stamp is a browser-cache concern, not a file on disk.
globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(readFileSync(String(url).split('?')[0], 'utf8')) });

// ---------- boot ----------
const { loadData, DATA } = await import('../src/shared/data.js');
const { show, handleKey, setBackground, transitionTo } = await import('../src/core/scene.js');
const { createRun } = await import('../src/run/runState.js');
const { generateRoom } = await import('../src/run/roomGen.js');
const { scaleEnemy } = await import('../src/shared/balance.js');
const { createCombat, playerAttack } = await import('../src/run/combat.js');
const { shrineOffers, canAffordOffer, acceptOffer } = await import('../src/run/shrine.js');
const { dungeonScene } = await import('../src/ui/scenes/dungeonScene.js');
const { hubScene } = await import('../src/ui/scenes/hubScene.js');
const { titleScene } = await import('../src/ui/scenes/titleScene.js');
const { resetProfile, getProfile } = await import('../src/meta/profile.js');
await loadData();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = () => registry.app.textContent;

// ---------- tests ----------

// T1: read-only children (the 0.031 bug class) — assignment must throw
{
  const el = new El('div');
  let threw = false;
  try { el.children = []; } catch { threw = true; }
  ok('children is read-only (throws on assignment)', threw);
}

// T2: background crossfade
setBackground('medieval_castle.png');
setBackground('castle_great_hall.png');
ok('bg crossfade swaps layers', registry.bg1.style.opacity === '1' && registry.bg0.style.opacity === '0');

// T3: title -> hub -> dungeon transition path
resetProfile();
show(titleScene());
await sleep(1100);
handleKey('e');
await sleep(1300);
ok('hub renders after Enter', t().includes('GREAT HALL') && !registry.app.classList.contains('hidden'));
handleKey('d');
await sleep(1300);
ok('dungeon renders after Descend', t().includes('Room 1') && !registry.app.classList.contains('hidden'));

// T4: combat attack kills something, log drips (default profile needs
// a few swings — keep attacking until the first kill lands)
{
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

// T5: a shrine in every 8-room stretch (rooms 2-7, 10-15, ... — 0.091;
// it used to be only once per run); boon math
{
  const { enterNextRoom } = await import('../src/run/runState.js');
  let placement = true;
  for (let i = 0; i < 40; i++) {
    const r = createRun();
    if (r.shrineRooms[0] < 2 || r.shrineRooms[0] > 7) placement = false;
    if (generateRoom(r.shrineRooms[0], r).kind !== 'shrine') placement = false;
    const kinds = [];
    for (let n = 0; n < 24; n++) kinds.push(enterNextRoom(r).kind);
    for (let s = 0; s < 3; s++) {
      const stretch = kinds.slice(s * 8, s * 8 + 8);
      const at = stretch.indexOf('shrine');
      if (stretch.filter((k) => k === 'shrine').length !== 1 || at < 1 || at > 6 || stretch[7] !== 'boss') placement = false;
    }
  }
  ok('one shrine in every 8-room stretch (2-7, 10-15, 18-23), boss at 8/16/24', placement);
  const run = createRun();
  const [dmg, crit, armor] = shrineOffers();
  const hp0 = run.maxHp, d0 = run.stats.dmg;
  acceptOffer(run, dmg);
  ok('dmg boon: -15% HP, +25% dmg, logged', run.stats.dmg === Math.round(d0 * 1.25) && run.maxHp < hp0 && run.buffs.length === 1);
  run.coins = 100; run.roomNumber = 6; const c0 = run.stats.crit;
  acceptOffer(run, crit);
  ok('crit boon (0.091): flat -30c at any depth, +15% crit', run.coins === 70 && Math.abs(run.stats.crit - (c0 + 0.15)) < 1e-9);
  run.potions = 2; run.stats.armor = 80;
  acceptOffer(run, armor);
  ok('armor boon: +25% of current, at least +30 (80 -> 110)', run.potions === 1 && run.stats.armor === 110);
  run.potions = 2; run.stats.armor = 400;
  acceptOffer(run, armor);
  ok('armor boon: +25% when that is more (400 -> 500)', run.stats.armor === 500);
  const leech = shrineOffers().find((o) => o.id === 'leech');
  const ls0 = run.stats.lifesteal || 0; const lh0 = run.maxHp;
  acceptOffer(run, leech);
  ok('leech boon: -15% HP, +100% lifesteal (0.093: x10 with HP)', leech.lifestealAdd === 1 && run.stats.lifesteal === Math.min(leech.lifestealCap, ls0 + 1) && run.maxHp < lh0);
  const bulwark = shrineOffers().find((o) => o.id === 'bulwark');
  const bd0 = run.stats.dmg; const ba0 = run.stats.armor;
  acceptOffer(run, bulwark);
  ok('bulwark boon: +20% armor (min +50), -10% dmg', run.stats.armor === ba0 + Math.max(50, Math.round(ba0 * 0.2)) && run.stats.dmg === Math.round(bd0 * 0.9));
  const secondwind = shrineOffers().find((o) => o.id === 'secondwind');
  run.coins = 100; run.hp = 1; const pw0 = run.potions;
  acceptOffer(run, secondwind);
  ok('secondwind boon (0.091): flat -40c, +2 potions, full heal', run.coins === 60 && run.potions === pw0 + 2 && run.hp === run.maxHp);
  const poor = createRun(); poor.coins = 10; poor.potions = 0;
  ok('affordability gates', !canAffordOffer(poor, crit) && !canAffordOffer(poor, armor) && canAffordOffer(poor, dmg) && !canAffordOffer(poor, secondwind) && canAffordOffer(poor, leech));
}

// T6: full shrine integration — walk to it, accept via hotkey, buff bar shows
{
  registry.app.innerHTML = ''; // NOT .children = [] — read-only, like real DOM
  // Strong profile so the walker survives to the shrine. NOTE: the profile
  // module caches in memory — mutate the live object, don't re-seed
  // localStorage (a weak profile can legitimately die first — that's the
  // game, not a bug).
  // vitality 40: this profile was tuned when vitality gave +12 HP/level;
  // 0.072 made it +9, and the walker started dying before the shrine.
  Object.assign(getProfile(), {
    // Overwhelming ON PURPOSE: the walk to the shrine must not be subject to
    // combat RNG at all (power 60 one-shots everything through room 7, 800+
    // HP cannot be drained by 2-6 dmg floor hits). This tests shrine
    // integration, not survival — survival curves are the simulator's job.
    coins: 500, xp: 0, stats: { power: 60, vitality: 80, fortune: 0, precision: 0, endurance: 0 },
    equipment: { weapon: 'executioner_axe', armor: 'dragonscale_mail', boots: null, rings: [null, null], trinket: null, amulet: null },
    potions: 5, records: { kills: 0, bestRoom: 0, runs: 1, deaths: 0 },
  });
  const scene = dungeonScene();
  scene.enter(registry.app);
  let guard = 0;
  while (!t().includes('shrine hums') && guard++ < 120) {
    if (t().includes('YOU DIED')) break; // fail fast — don't burn the guard loop
    if (t().includes('Push Deeper')) { handleKey('d'); await sleep(1600); continue; }
    // Drink below 60% HP ("HP 26/92" on the player card) — potions are a
    // no-op at full HP, and the pre-0.072 walker never drank at all.
    const hp = t().match(/HP (\d+)\/(\d+)/);
    if (hp && Number(hp[1]) < Number(hp[2]) * 0.6) { handleKey('p'); await sleep(300); }
    for (let k = 0; k < 3; k++) { handleKey('a'); await sleep(900); }
  }
  if (!t().includes('shrine hums')) {
    const { derivedStats: dd2 } = await import('../src/meta/profile.js');
    const dd = dd2();
    console.log(`    [t6 debug] guard=${guard} died=${t().includes('YOU DIED')} profileNow: dmg=${dd.dmg} maxHp=${dd.maxHp} vit=${getProfile().stats.vitality} tail=${JSON.stringify(t().slice(-160))}`);
  }
  ok('shrine reached by walking', t().includes('shrine hums'));
  // Accept a boon via hotkey — the FIRST ENABLED one, not blindly '1'
  // (0.072c): runs start with 0 coins, so coin-priced boons (crit,
  // secondwind) are disabled at shrine depth 2-7 — when the shuffle deals
  // one into slot 1 (~22%), pressing '1' clicks nothing and the old test
  // flaked. Also retry: the shrine mounts through a 1000ms transition timer
  // that can fire late under load, dropping early keypresses.
  let bar, items = [];
  for (let i = 0; i < 6; i++) {
    const key = ['1', '2', '3'].find((k) => document.querySelectorAll(`button[data-key="${k}"]:not([disabled])`).length);
    if (key) handleKey(key);
    await sleep(500);
    bar = registry.app.all((e) => e.attrs && e.attrs.id === 'buffs')[0];
    items = bar ? bar.all((e) => e.className === 'buff') : [];
    if (items.length === 1 && t().includes('Retreat with Loot')) break;
  }
  if (!(items.length === 1 && t().includes('Retreat with Loot'))) {
    const btns = registry.app.all((e) => e.tagName === 'button');
    const txt = t();
    console.log(`    [t6b debug] items=${items.length} hums=${txt.includes('shrine hums')} fades=${txt.includes('light fades')} len=${txt.length} btns=${btns.map((b) => `${String(b.textContent).slice(0, 18)}[${b.attrs['data-key'] || '-'}${b.attrs.disabled !== undefined ? '!' : ''}]`).join(' ')} tail=${JSON.stringify(txt.slice(-300))}`);
  }
  ok('buff bar shows blessing after accept', items.length === 1 && t().includes('Retreat with Loot'));
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

// T9: transitionTo resilience — a throwing work() must not brick the UI.
// The throw escapes the timer callback (uncaught), so swallow ONLY the
// intentional one; anything else is a real failure.
process.on('uncaughtException', (e) => {
  if (e.message !== 'intentional') { console.error('UNEXPECTED:', e); process.exit(1); }
});
{
  transitionTo(() => { throw new Error('intentional'); });
  await sleep(1300);
  ok('transitionTo try/finally recovery', !registry.app.classList.contains('hidden'));
}

// T10: settleRun — death takes 50% coin toll, retreat banks all
{
  const rd = createRun(); rd.coins = 100; rd.roomNumber = 5;
  const { settleRun } = await import('../src/run/runState.js');
  settleRun(rd, 'death');
  const rr = createRun(); rr.coins = 100; rr.roomNumber = 5;
  settleRun(rr, 'retreat');
  ok('death toll 50%, retreat full', rd.coinsRetrieved === 50 && rd.coinsLost === 50 && rr.coinsRetrieved === 100);
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

// T12: 0.080 — potions: flat price, capped by the satchel; the satchel
// upgrade doubles in price and stops at the max cap.
{
  const { restockPotion, potionCost, satchelCost, expandSatchel, satchelMaxed } = await import('../src/meta/leveling.js');
  const pc = DATA.difficulty.potions;
  resetProfile();
  const p = getProfile();
  ok('fresh profile: 2/4 potions', p.potions === pc.startCount && p.potionCap === pc.startCap);
  p.coins = 1000;
  const c0 = potionCost();
  restockPotion(); restockPotion();
  ok('potion price is flat', c0 === pc.price && potionCost() === pc.price && p.potions === 4 && p.coins === 1000 - 2 * pc.price);
  ok('cannot buy past the cap', restockPotion() === false && p.potions === 4);
  const s0 = satchelCost();
  expandSatchel();
  ok('satchel +1 cap, price doubles', s0 === pc.capUpgradeBase && p.potionCap === 5 && satchelCost() === pc.capUpgradeBase * pc.capUpgradeGrowth);
  p.coins = 1e9;
  for (let i = 0; i < 20; i++) expandSatchel();
  ok('satchel stops at max cap', p.potionCap === pc.maxCap && satchelMaxed() && expandSatchel() === false);
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

// T14: space = secondary binding (data-key2, Push Deeper in the dungeon).
// Built via el() ON PURPOSE — 0.051 shipped with the el() key2 branch
// silently dropped, so buttons never got data-key2 and space did nothing.
// A synthetic setAttribute button can't catch that class of break.
{
  const { el: mkEl } = await import('../src/core/scene.js');
  let clicked = 0;
  const btn = mkEl('button', { key: 'd', key2: ' ', onclick: () => clicked++ }, 'Push Deeper');
  ok('el() wires key2 to data-key2', btn.attrs['data-key2'] === ' ' && btn.attrs.key2 === undefined);
  registry.app.append(btn);
  handleKey(' ');
  ok('space clicks data-key2 button', clicked === 1);
  btn.remove();
  ok('space without a binding is inert', handleKey(' ') === false);
}

// T15: save transfer round-trip (export code -> wipe -> import restores)
{
  const { exportSave, importSave } = await import('../src/meta/profile.js');
  resetProfile();
  getProfile().coins = 777;
  const code = exportSave();
  resetProfile();
  ok('importSave restores coins from code', typeof code === 'string' && importSave(code) === true && getProfile().coins === 777);
  ok('importSave rejects garbage', importSave('not-a-save-code') === false && getProfile().coins === 777);
}

// T16: content integrity — data JSONs, art files, and apply logic stay in
// sync (guards every future content drop)
{
  const { readdirSync } = await import('fs');
  const chars = readdirSync(join(ROOT, 'assets/chars'));
  const enemiesOk = Object.keys(DATA.enemies).every((id) => chars.includes(`${id}.webp`));
  const slots = new Set(['weapon', 'armor', 'boots', 'ring', 'trinket', 'amulet']);
  const itemsOk = Object.values(DATA.items).every((i) => slots.has(i.slot) && i.tier >= 1 && i.tier <= 4);
  ok('content integrity: enemy portraits + item slots', enemiesOk && itemsOk);

  // Every shrine offer id must have real apply logic — acceptOffer's
  // default branch silently pushes the buff without mutating anything.
  let shrineOk = true;
  for (const offer of DATA.shrines.offers) {
    const run = createRun();
    run.coins = 500; run.potions = 3; run.stats.armor = 8; // afford everything
    const strip = ({ buffs, ...rest }) => JSON.stringify(rest);
    const before = strip(run);
    acceptOffer(run, offer);
    if (strip(run) === before) shrineOk = false;
  }
  ok('every shrine offer mutates run state', shrineOk);

  // quicken: heavy cooldown drops to 2
  const { useHeavy } = await import('../src/run/combat.js');
  const run = createRun();
  acceptOffer(run, DATA.shrines.offers.find((o) => o.id === 'quicken'));
  const cb = createCombat(run, { enemies: [] });
  useHeavy(cb);
  ok('quicken boon: heavy cooldown 3 -> 2', cb.heavyCd === 2);

  // greed: kill coins multiplied x1.4
  const { applyLoot } = await import('../src/run/runState.js');
  const gr = createRun();
  acceptOffer(gr, DATA.shrines.offers.find((o) => o.id === 'greed'));
  // Read the kill-coins line: a junk drop salvaged on the spot (0.091) or a
  // sold potion adds its own coins on top — that's not the boon's doing.
  const lines = [];
  applyLoot(gr, { ...DATA.enemies.rat, hp: 14 }, (text) => lines.push(text));
  const gained = Number(String(lines[0]).match(/^\+(\d+) coins/)?.[1] ?? -1);
  ok('greed boon: kill coins x1.4', gained >= Math.round(3 * 1.4) && gained <= Math.round(7 * 1.4), gained);
}

// T17: alchemy tracks — escalating costs, potency drives heal, legacy save migrates
{
  const { trainAlchemy, alchemyCost, potionHealAmount } = await import('../src/meta/leveling.js');
  const { drinkPotion } = await import('../src/run/runState.js');
  resetProfile();
  const p = getProfile();
  p.coins = 1000;
  const h0 = potionHealAmount();
  const ac0 = alchemyCost('potency');
  trainAlchemy('potency');
  const ac1 = alchemyCost('potency');
  const run = createRun();
  run.hp = 100; run.maxHp = 1000; run.potions = 1;
  drinkPotion(run);
  ok('alchemy: potency cost 60 -> 120, heal +50, applied on drink', h0 === 300 && ac0 === 60 && ac1 === 120
    && potionHealAmount() === 350 && run.hp === 450 && p.coins === 940);
  // Legacy save with stats.alchemy = 3 migrates to alchemy.potency = 3
  const { importSave } = await import('../src/meta/profile.js');
  const old = JSON.parse(JSON.stringify(p));
  delete old.alchemy; delete old.forged;
  delete old.saveVersion; // real pre-0.079 saves are unversioned (0.079)
  old.stats.alchemy = 3;
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(old))));
  importSave(code);
  const m = getProfile();
  ok('legacy stats.alchemy migrates to potency', m.alchemy.potency === 3 && m.stats.alchemy === undefined
    && m.forged && typeof m.forged === 'object' && m.stats.precision === 0 && m.stats.endurance === 0);
}

// T18: record-depth tag — at/past best-ever room, never on the first run
{
  registry.app.innerHTML = '';
  Object.assign(getProfile(), {
    coins: 0, xp: 0, stats: { power: 14, vitality: 10, fortune: 0, precision: 0, endurance: 0 },
    equipment: { weapon: 'executioner_axe', armor: 'dragonscale_mail', boots: null, rings: [null, null], trinket: null, amulet: null },
    potions: 5, records: { kills: 0, bestRoom: 5, runs: 3, deaths: 0 },
  });
  dungeonScene().enter(registry.app);
  ok('no record tag below best depth', !t().includes('Record depth'));
  getProfile().records.bestRoom = 1; // frontier: room 1 is at the record
  dungeonScene().enter(registry.app);
  ok('record tag at frontier depth', t().includes('Record depth'));
  getProfile().records.runs = 0; // first run ever: never tag
  dungeonScene().enter(registry.app);
  ok('no record tag on first run', !t().includes('Record depth'));
}

// T19: hub records box shows lifetime stats
{
  registry.app.innerHTML = '';
  Object.assign(getProfile(), {
    coins: 0, xp: 0, stats: { power: 0, vitality: 0, fortune: 0, precision: 0, endurance: 0 },
    equipment: { weapon: 'rusty_sword', armor: 'oak_shield', boots: null, rings: [null, null], trinket: null, amulet: null },
    potions: 2, records: { kills: 126, bestRoom: 6, runs: 9, deaths: 4 },
  });
  hubScene().enter(registry.app);
  ok('hub records line', t().includes('9 runs, 126 kills, deepest room 6.'));
}

// T20: (retired 0.082) cachebust.mjs stamping — superseded by the versioned
// boot in index.html (see T44), which busts caches on every host.

// T22: disciplines — XP-only training, new stats feed derived, breakthroughs double
{
  const { buyStat, statCost } = await import('../src/meta/leveling.js');
  const { derivedStats, trainedLevel } = await import('../src/meta/profile.js');
  resetProfile();
  const p = getProfile();
  p.coins = 0; p.xp = 10000;
  p.equipment = { weapon: null, armor: null, boots: null, rings: [null, null], trinket: null, amulet: null };
  ok('training is XP-only', statCost(0).xp === 15 && statCost(0).coins === undefined);
  buyStat('power'); // lvl 1, 15xp
  ok('buyStat spends xp, not coins', p.coins === 0 && p.xp === 10000 - 15 && p.stats.power === 1);
  p.stats.power = 4;
  const r = buyStat('power'); // -> lvl 5 = breakthrough
  ok('breakthrough doubles every 5th level', r === 'breakthrough' && trainedLevel(p, 'power') === 6);
  p.stats.precision = 5; p.stats.endurance = 7; p.stats.vitality = 0;
  const d = derivedStats(p);
  ok('precision/endurance feed crit/armor (tapered crit)', Math.abs(d.crit - 0.11) < 1e-9 && d.armor === 80
    && d.dmg === 24 && d.maxHp === 400);
}

// T23: alchemy tracks — base costs, efficiency free drinks, infusion temp armor
{
  const { alchemyCost, efficiencyChance, infusionArmor } = await import('../src/meta/leveling.js');
  const { drinkPotion, enterNextRoom, createRun } = await import('../src/run/runState.js');
  resetProfile();
  getProfile().coins = 10000;
  ok('three track base costs 60/80/100', alchemyCost('potency') === 60
    && alchemyCost('efficiency') === 80 && alchemyCost('infusion') === 100);
  getProfile().alchemy.efficiency = 5; // 5 x 0.08 hits the 0.4 cap
  ok('efficiency caps at 40%', Math.abs(efficiencyChance() - 0.4) < 1e-9);
  getProfile().alchemy.infusion = 3;
  ok('infusion armor = lvl x 20', infusionArmor() === 60);
  const run = createRun();
  run.hp = 100; run.maxHp = 1000; run.potions = 2;
  const origRandom = Math.random;
  Math.random = () => 0.0; // force the efficiency roll to succeed
  const sip = drinkPotion(run);
  Math.random = origRandom;
  ok('efficiency: potion not consumed', sip.free === true && run.potions === 2 && run.hp === 400);
  ok('infusion: temp armor applied', sip.armor === 60 && run.tempArmor === 60);
  enterNextRoom(run);
  ok('infusion: temp armor clears next room', run.tempArmor === 0);
}

// T24: The Forge — per-item enhancement, escalating cost, derived stats boosted
{
  const { forgeCost, forgeItem, forgeMaxed } = await import('../src/meta/leveling.js');
  const { itemWithForge, derivedStats } = await import('../src/meta/profile.js');
  resetProfile();
  const p = getProfile();
  p.coins = 10000;
  p.equipment = { weapon: 'moonbrand', armor: null, boots: null, rings: [null, null], trinket: null, amulet: null };
  ok('forge cost T3 lvl0 = 150c', forgeCost('moonbrand') === 150);
  ok('forge item to +1', forgeItem('moonbrand') && p.forged.moonbrand === 1 && p.coins === 9850);
  const boosted = itemWithForge('moonbrand');
  ok('forge boosts stats 20%', boosted.dmg === Math.round(14 * 1.2) && boosted.forgeLvl === 1);
  ok('derived dmg includes forge boost', derivedStats(p).dmg === 6 + Math.round(14 * 1.2));
  forgeItem('moonbrand'); forgeItem('moonbrand'); // +2 (300c), +3 (450c)
  ok('forge maxes at +3', forgeMaxed('moonbrand') && !forgeItem('moonbrand') && p.coins === 9100);
}

// T25: hub render — five disciplines, three alchemy tracks, XP-only buttons, no Scribe
{
  registry.app.innerHTML = '';
  Object.assign(getProfile(), {
    coins: 500, xp: 500,
    stats: { power: 0, vitality: 0, fortune: 0, precision: 0, endurance: 0 },
    alchemy: { potency: 0, efficiency: 0, infusion: 0 }, forged: {},
    equipment: { weapon: 'knights_blade', armor: 'oak_shield', boots: null, rings: [null, null], trinket: null, amulet: null },
    potions: 2, records: { kills: 0, bestRoom: 0, runs: 0, deaths: 0 },
  });
  hubScene().enter(registry.app);
  const html = t();
  ok('hub: five disciplines', ['Power', 'Vitality', 'Fortune', 'Precision', 'Endurance'].every((n) => html.includes(n)));
  ok('hub: three alchemy tracks', ['Potency', 'Efficiency', 'Infusion'].every((n) => html.includes(n)));
  ok('hub: xp-only train buttons', html.includes('Train (15xp)'));
  ok('hub: scribe removed', !html.includes('Scribe'));
  ok('hub: forge button on equipped item', html.includes('+100c')); // knights_blade T2 lvl0 (T1 gear gets no button since 0.068)
}

// T26: T4 crimson relics — drop gating, new powers, combat events, forge pricing
{
  const { rollLoot } = await import('../src/run/loot.js');
  const { forgeCost } = await import('../src/meta/leveling.js');
  const { createCombat, playerAttack } = await import('../src/run/combat.js');
  const relics = Object.entries(DATA.items).filter(([, i]) => i.tier === 4);
  const slots = ['weapon', 'armor', 'boots', 'ring', 'trinket', 'amulet'];
  ok('seven T4 relics, valid slots', relics.length === 7 && relics.every(([, i]) => slots.includes(i.slot)));

  // Drop gating: weak enemies never carry relics, bosses roll the relic table
  const origRandom = Math.random;
  Math.random = () => 0.001;
  const ratLoot = rollLoot({ ...DATA.enemies.rat, maxHp: 14 }, 0);
  ok('relics never drop from weak enemies', ratLoot.itemId === null || DATA.items[ratLoot.itemId].tier < 4);
  const bossLoot = rollLoot({ boss: true, maxHp: 100, xp: 50, coins: [50, 60] }, 0);
  ok('bosses roll the relic table', bossLoot.itemId !== null && DATA.items[bossLoot.itemId].tier === 4);
  // 0.071: relics are depth-gated — before room 11 even bosses can't drop T4
  const bossShallow = rollLoot({ boss: true, maxHp: 100, xp: 50, coins: [50, 60] }, 0, 5);
  ok('no relics before room 11', bossShallow.itemId === null || DATA.items[bossShallow.itemId].tier < 4);
  const bossDeep = rollLoot({ boss: true, maxHp: 100, xp: 50, coins: [50, 60] }, 0, 11);
  ok('relics from room 11 on', bossDeep.itemId !== null && DATA.items[bossDeep.itemId].tier === 4);
  ok('t4MinRoom tunable is 11', DATA.difficulty.t4MinRoom === 11);
  Math.random = origRandom;

  // New powers reach derived stats
  resetProfile();
  const p = getProfile();
  p.equipment = {
    weapon: 'fang_of_the_eclipse', armor: 'bloodmoon_aegis', boots: 'umbral_treads',
    rings: ['ring_of_the_red_veil', null], trinket: 'heart_of_the_dying_moon', amulet: null,
  };
  const { derivedStats } = await import('../src/meta/profile.js');
  const d = derivedStats(p);
  ok('relic powers: dodge 14%, thorns 4, heavy cd 2, revive', Math.abs(d.dodge - 0.14) < 1e-9
    && d.thorns === 4 && d.heavyCdMax === 2 && d.revive === true);
  ok('forge T4 base cost = 200c', forgeCost('fang_of_the_eclipse') === 200);

  // Combat: dodge avoids the blow entirely
  const run = createRun();
  run.stats.dmg = 1;
  const cb = createCombat(run, { enemies: [{ id: 'golem', name: 'Fellblade', maxHp: 500, dmg: 50, xp: 1, coins: [1, 1] }] });
  Math.random = () => 0.0; // dodge roll 0 < 0.14
  let evs = playerAttack(cb, 0, false);
  ok('dodge avoids the blow', evs.some((e) => e.type === 'dodge') && run.hp === run.maxHp);
  Math.random = origRandom;

  // Combat: thorns wound but never finish
  p.equipment = { weapon: null, armor: 'bloodmoon_aegis', boots: null, rings: [null, null], trinket: null, amulet: null };
  const run2 = createRun();
  run2.stats.dmg = 1;
  const cb2 = createCombat(run2, { enemies: [{ id: 'golem', name: 'Fellblade', maxHp: 10, dmg: 1, xp: 1, coins: [1, 1] }] });
  Math.random = () => 0.5; // no crit, no forced dodge
  evs = playerAttack(cb2, 0, false);
  Math.random = origRandom;
  const foe = cb2.enemies[0];
  ok('thorns wound the attacker', foe.hp === Math.max(1, 9 - 4) && evs.some((e) => e.type === 'thorns'));

  // Combat: the Heart revives once at half health
  p.equipment = { weapon: null, armor: null, boots: null, rings: [null, null], trinket: 'heart_of_the_dying_moon', amulet: null };
  const run3 = createRun(); // maxHp 500, armor 50, revive true
  run3.stats.dmg = 1;
  const cb3 = createCombat(run3, { enemies: [{ id: 'golem', name: 'Fellblade', maxHp: 500, dmg: 1000, xp: 1, coins: [1, 1] }] });
  Math.random = () => 0.5;
  evs = playerAttack(cb3, 0, false);
  Math.random = origRandom;
  ok('heart revives at half health, once', run3.revive === false && run3.hp === Math.ceil(run3.maxHp / 2)
    && evs.some((e) => e.type === 'revive') && !cb3.over);
}

// T27: elite star markers + epic relic log line
{
  const { isElite } = await import('../src/shared/balance.js');
  const { enemyCard } = await import('../src/ui/battleLine.js');
  const { rollLoot } = await import('../src/run/loot.js');
  const rat = scaleEnemy('rat', 1);
  const golem = scaleEnemy('golem', 1);   // 70 maxHp — T3-strength elite
  const boss = scaleEnemy('vampire_lord', 8);
  ok('isElite: rat is not elite', !isElite(rat));
  ok('isElite: Fellblade (70hp) is elite', isElite(golem));
  ok('isElite: boss is elite', isElite(boss));

  const opts = { printing: false, combatOver: false, onAttack() {} };
  ok('elite card shows the star marker', enemyCard(golem, 0, 70, opts).textContent.includes('\u2605'));
  ok('boss card shows the star marker', enemyCard(boss, 0, boss.maxHp, opts).textContent.includes('\u2605'));
  ok('plain enemy card has no star', !enemyCard(rat, 0, 14, opts).textContent.includes('\u2605'));

  // 0.063: modal removed — relics announce themselves in the combat log
  resetProfile();
  const { applyLoot } = await import('../src/run/runState.js');
  const runL = createRun();
  runL.roomNumber = 12; // past the t4MinRoom gate (0.071) so relics can roll
  const lines = [];
  const origR = Math.random;
  Math.random = () => 0.001; // force relic + potion drops
  applyLoot(runL, scaleEnemy('golem', 1), (text, cls) => lines.push({ text, cls }));
  const epic = lines.find((l) => l.cls === 'relic');
  ok('T4 drop logs a burning EPIC ITEM line', !!epic && Array.isArray(epic.text)
    && epic.text.some((s) => typeof s === 'string' && s.includes('EPIC ITEM'))
    && epic.text.some((n) => n && n.item && n.item.tier === 4));
  {
    // 0.079: run/ emits a DOM-free { item } part; hud.logLine renders it
    // as the rarity-4 span.
    const { logLine } = await import('../src/ui/hud.js');
    const { el: mkEl } = await import('../src/core/scene.js');
    const logBox = mkEl('div', {});
    logLine(logBox, epic.text, 'relic');
    ok('relic line renders rarity-colored name', logBox.all((n) => n.className === 'rarity-4').length === 1);
  }
  const lines2 = [];
  applyLoot(runL, scaleEnemy('rat', 1), (text, cls) => lines2.push({ text, cls }));
  Math.random = origR;
  ok('normal drops log a loot line (upgrade found, or salvaged on the spot — 0.091)', lines2.some((l) => l.cls === 'loot'
    && ((Array.isArray(l.text) && l.text[0] === 'Found: ') || (typeof l.text === 'string' && /\(salvaged /.test(l.text)))));
  ok('relic modal module is gone', await import('../src/ui/relicModal.js').then(() => false, () => true));

  // loot.js and battleLine.js share one elite rule: starred enemies carry relics
  const origRandom = Math.random;
  Math.random = () => 0.001;
  const eliteDrop = rollLoot(golem, 0);
  Math.random = origRandom;
  ok('star-marked elites roll the relic table', eliteDrop.itemId !== null && DATA.items[eliteDrop.itemId].tier === 4);
  const { rarityClass } = await import('../src/ui/hud.js');
  ok('T4 items use the crimson rarity class', rarityClass(DATA.items.umbral_treads) === 'rarity-4');
}

// T28: 0.062 — precision taper, armor floor, title panel docked low
{
  const { precisionCrit, derivedStats } = await import('../src/meta/profile.js');
  const pts = [[0, 0], [5, 0.05], [10, 0.10], [15, 0.125], [20, 0.15], [25, 0.16], [30, 0.17], [45, 0.185]];
  ok('precision taper: +1%/.5%/.2%/.1% per 10-level band', pts.every(([l, c]) => Math.abs(precisionCrit(l) - c) < 1e-9));

  resetProfile();
  const p = getProfile();
  p.stats.precision = 10; // trained 12 -> 0.10 + 0.01
  ok('derived crit uses the taper (0.05 base + 0.11)', Math.abs(derivedStats(p).crit - 0.16) < 1e-9);

  // Armor floor: a blow always lands at least 15% of its raw damage
  const run = createRun();
  run.stats.dmg = 1; run.stats.armor = 5000;
  const cb = createCombat(run, { enemies: [{ id: 'golem', name: 'Fellblade', maxHp: 500, dmg: 200, xp: 1, coins: [1, 1] }] });
  const origRandom = Math.random;
  Math.random = () => 0.5; // raw = 200 + floor(0.5 x 21) = 210; the floor share of it beats 210-5000
  const evs = playerAttack(cb, 0, false);
  Math.random = origRandom;
  const hit = evs.find((e) => e.type === 'dmg');
  const floorPct = DATA.difficulty.combat.armorMinTakenPct;
  ok('armor soaks at most 83% of a blow (floor 17%, 0.093)', floorPct === 0.17 && hit && hit.taken === Math.ceil(210 * floorPct), hit?.taken);

  titleScene().enter(registry.app);
  ok('title dialog carries the low-dock class',
    registry.app.all((e) => (e.className || '').includes('title-panel')).length === 1);
}

// T29: styles.css integrity — an unbalanced/stray brace silently eats the
// next rule (0.063 shipped a dead .title-panel rule this way).
{
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    .replace(/\/\*[^*]*\*\//g, ''); // strip comments
  let depth = 0; let intact = true;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth < 0) { intact = false; break; }
  }
  ok('styles.css braces balanced', intact && depth === 0);
  ok('title-panel docking rule present', css.includes('#app > .panel.title-panel'));
}

// T30: 0.066 — background music engine (no Web Audio in the shim: safe no-ops)
{
  const music = await import('../src/audio/music.js');
  ok('music module loads without AudioContext', typeof music.play === 'function' && typeof music.initMusic === 'function');
  ok('default: music on', music.isMuted() === false);
  ok('toggle mutes and persists', music.toggleMuted() === true && localStorage.getItem('castle-music-muted') === '1');
  ok('toggle restores', music.toggleMuted() === false && localStorage.getItem('castle-music-muted') === '0');
  music.play('boss'); music.play('nope'); music.initMusic();
  ok('play/init no-op safely without AudioContext', true);
}

// T31: 0.067 — precision desc shows the next click's ACTUAL gain (taper bands
// including ★ breakthrough doubles: lvl 4→5 counts double, hence '+2%').
{
  const { precisionDesc } = await import('../src/meta/leveling.js');
  const bands = [[0, '+1%'], [4, '+2%'], [9, '+1%'], [10, '+0.5%'], [19, '+0.4%'], [20, '+0.2%'], [29, '+0.2%'], [30, '+0.1%'], [45, '+0.1%']];
  for (const [l, t] of bands) {
    ok(`precisionDesc lv${l} shows ${t}`, precisionDesc(l) === `increase Crit Chance ${t}`);
  }

  resetProfile();
  getProfile().stats.precision = 12;
  hubScene().enter(registry.app);
  ok('hub shows the tapered gain at lvl 12', registry.app.textContent.includes('Lv 12 — increase Crit Chance +0.5%'));
  getProfile().stats.precision = 0;
}

// T32: 0.067 — death modal mounts with YOU DIED! and dismisses via its button.
{
  const { showDeathModal } = await import('../src/ui/deathModal.js');
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

// T33: 0.068 — five 60s music tracks wired to the right scenes; the Forge
// ignores tier-1 gear (no enhance button, forgeItem refuses).
{
  const musicSrc = readFileSync(new URL('../src/audio/music.js', import.meta.url), 'utf8');
  for (const t of ['title', 'combat', 'boss', 'shrine', 'end']) {
    ok(`music track file referenced: ${t}`, musicSrc.includes(`assets/audio/music-${t}.mp3`));
    const size = statSync(new URL(`../assets/audio/music-${t}.mp3`, import.meta.url)).size;
    ok(`music-${t}.mp3 is a ~60s track`, size > 800 * 1024); // 61s @ 128kbps ~ 977KB
  }
  ok('no stale ambient/dungeon track refs', !musicSrc.includes('ambient.mp3') && !musicSrc.includes('dungeon.mp3'));
  const read = (f) => readFileSync(new URL(`../src/ui/scenes/${f}`, import.meta.url), 'utf8');
  ok('title screen plays title track', read('titleScene.js').includes("play('title')"));
  ok('hub plays title track', read('hubScene.js').includes("play('title')"));
  ok('end screen plays end track', read('runEndScene.js').includes("play('end')"));
  ok('dungeon routes combat/shrine/boss', (() => { const d = read('dungeonScene.js'); return d.includes("'combat'") && d.includes("'shrine'") && d.includes("'boss'"); })());
}
{
  const { forgeItem, forgeCost } = await import('../src/meta/leveling.js');
  resetProfile();
  const p = getProfile();
  p.coins = 100000;
  ok('forge refuses tier-1 items', forgeItem('rusty_sword') === false && !p.forged.rusty_sword);
  ok('forge accepts tier-2 items', forgeItem('knights_blade') === true && p.forged.knights_blade === 1);

  const { hubScene } = await import('../src/ui/scenes/hubScene.js');
  const countForgeBtns = () => { let n = 0; registry.app.walk((e) => { if (e.className && e.className.split(' ').includes('forge-btn')) n++; }); return n; };
  resetProfile();
  getProfile().equipment.weapon = 'rusty_sword'; // tier 1
  hubScene().enter(registry.app);
  ok('no forge button for tier-1 gear', countForgeBtns() === 0);
  resetProfile();
  getProfile().equipment.weapon = 'knights_blade'; // tier 2
  getProfile().coins = 100000;
  hubScene().enter(registry.app);
  ok('forge button shown for tier-2 gear', countForgeBtns() === 1);
  resetProfile();
}

// T34: 0.069 — fullscreen toggle wired under the music toggle, label synced
// to fullscreenchange so Esc exits don't leave a stale ON label.
{
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok('fullscreen button created', mainSrc.includes('fs-toggle') && mainSrc.includes('FULLSCREEN: OFF'));
  ok('toggle requests/exits fullscreen', mainSrc.includes('requestFullscreen') && mainSrc.includes('exitFullscreen'));
  ok('label synced to fullscreenchange', mainSrc.includes('fullscreenchange') && mainSrc.includes('document.fullscreenElement'));
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  ok('fs-toggle positioned under music toggle', css.includes('.fs-toggle { top: 72px; }') && css.includes('.music-toggle { top: 40px; }'));
}

// T35: 0.070 — sound effects: module no-op safety, all clips on disk, and
// every hook point wired (playback-synced combat sounds, clicks, transitions,
// death, shrine, level-up, loot, forge, victory).
{
  const sfxMod = await import('../src/audio/sfx.js');
  ok('sfx module loads without AudioContext', typeof sfxMod.sfx === 'function' && typeof sfxMod.initSfx === 'function');
  ok('sfx default: sound on', sfxMod.isMuted() === false);
  ok('sfx toggle mutes and persists', sfxMod.toggleMuted() === true && localStorage.getItem('castle-sfx-muted') === '1');
  ok('sfx toggle restores', sfxMod.toggleMuted() === false && localStorage.getItem('castle-sfx-muted') === '0');
  sfxMod.sfx('attack'); sfxMod.sfx('nope'); sfxMod.initSfx();
  ok('sfx play/init no-op safely without AudioContext', true);

  const clips = ['click', 'attack', 'kill', 'hurt', 'swoosh', 'death', 'shrine', 'levelup', 'rare', 'loot', 'heal', 'forge', 'victory'];
  const sfxSrc = readFileSync(new URL('../src/audio/sfx.js', import.meta.url), 'utf8');
  for (const c of clips) {
    ok(`sfx clip referenced + on disk: ${c}`,
      sfxSrc.includes(`assets/audio/sfx-${c}.mp3`)
      && statSync(new URL(`../assets/audio/sfx-${c}.mp3`, import.meta.url)).size > 5 * 1024); // 0.5s click ~ 8.8KB
  }
  ok('combat sounds jittered', sfxSrc.includes('playbackRate') && sfxSrc.includes("'attack'"));

  const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  ok('playback fires item.sfx on print', read('../src/ui/combatPlayback.js').includes('if (item.sfx) sfx(item.sfx)'));
  const d = read('../src/ui/scenes/dungeonScene.js');
  ok('dungeon maps combat events to sfx', d.includes("atk: 'attack'") && d.includes("dmg: 'hurt'") && d.includes("kill: 'kill'"));
  ok('dungeon: rare vs common loot sounds', d.includes("cls === 'relic' ? 'rare' : 'loot'"));
  ok('dungeon: swoosh/death/potion wired', d.includes("sfx('swoosh')") && d.includes("sfx('death')") && d.includes("sfx('heal')"));
  ok('shrine blessing chime wired', read('../src/ui/shrineUI.js').includes("sfx('shrine')"));
  const h = read('../src/ui/scenes/hubScene.js');
  ok('hub: levelup + forge wired', h.includes("sfx('levelup')") && h.includes("sfx('forge')"));
  ok('run end: escape fanfare', read('../src/ui/scenes/runEndScene.js').includes("sfx('victory')"));
  const m = read('../src/main.js');
  ok('main: SOUND toggle + global clicks', m.includes('sfx-toggle') && m.includes("closest?.('button')") && m.includes('initSfx()'));
  // 0.079: one slot higher without ?debug (no INVULNERABLE toggle above it)
  ok('sfx toggle positioned under fullscreen', read('../styles.css').includes('.sfx-toggle { top: 72px; }')
    && read('../styles.css').includes('body.debug .sfx-toggle { top: 104px; }'));
}

// T36: 0.072 — the headless balance simulator drives the real run math and
// never violates the relic depth gate.
{
  const { simulate, analyze, renderReport } = await import('./simulate.mjs');
  const agg = await simulate({ runs: 3, seed: 7 });
  ok('sim completes all runs', agg.runs.length === 3 && agg.runs.every((r) => r.depth >= 1));
  ok('sim tracks allocation', agg.bankedByRun.length === 3 && typeof agg.coinsSpent.alchemy === 'number');
  ok('sim never violates the relic gate', agg.relicGateViolations === 0);
  const { flags } = analyze(agg);
  ok('analyze returns flags', Array.isArray(flags));
  ok('report renders', renderReport(agg, { runs: 3, seed: 7 }).includes('Balance Simulation'));
}

// T37: 0.077 — double Retreat must not bank the run twice, the fading-out
// scene ignores hotkeys, and typing in a text field is not a hotkey.
{
  const { settleRun } = await import('../src/run/runState.js');
  resetProfile();
  const r = createRun(); r.coins = 100; r.xp = 40; r.roomNumber = 3;
  settleRun(r, 'retreat');
  const p = getProfile();
  const snap = { coins: p.coins, xp: p.xp, runs: p.records.runs };
  settleRun(r, 'retreat');
  ok('settleRun is idempotent (double retreat banks once)',
    p.coins === snap.coins && p.xp === snap.xp && p.records.runs === snap.runs && snap.coins === 100 && snap.runs === 1);

  let clicked = 0;
  const { el: mkEl, initHotkeys } = await import('../src/core/scene.js');
  const btn = mkEl('button', { key: 'r', onclick: () => clicked++ }, 'Retreat');
  registry.app.append(btn);
  transitionTo(() => {}, 50);
  ok('hotkeys ignored during a transition', handleKey('r') === false && clicked === 0);
  await sleep(100);
  ok('hotkeys work again after the transition', handleKey('r') === true && clicked === 1);

  initHotkeys();
  const kd = document.listeners.keydown.at(-1);
  let prevented = false;
  const ev = (tagName, key) => ({ key, target: { tagName }, preventDefault: () => { prevented = true; } });
  kd(ev('TEXTAREA', 'r'));
  kd(ev('INPUT', 'r'));
  ok('keys typed into a text field are not hotkeys', clicked === 1 && !prevented);
  kd(ev('BODY', 'r'));
  ok('keys elsewhere still fire hotkeys', clicked === 2 && prevented);
  btn.remove();
  ok('fading scene takes no clicks (CSS)', /#app\.hidden \{[^}]*pointer-events: none/.test(readFileSync('styles.css', 'utf8')));
}

// T38: 0.078 — the run-long combat log keeps only the newest 200 lines;
// the battle line carries --n (enemy count) for the fit-to-width card size.
{
  const { logLine } = await import('../src/ui/hud.js');
  const { el: mkEl } = await import('../src/core/scene.js');
  const log = mkEl('div', {});
  for (let i = 0; i < 260; i++) logLine(log, `line ${i}`);
  ok('combat log capped at 200 lines', log.children.length === 200 && log.children[0].textContent.includes('line 60'));
  const css = readFileSync('styles.css', 'utf8');
  ok('enemy row never wraps', /\.enemy-row \{[^}]*flex-wrap: nowrap/.test(css));
  ok('cards size from --card-h', /\.char-card \{[^}]*height: var\(--card-h\)/.test(css) && css.includes('--card-h: min(50vh'));
  ok('dungeon sets --n on the battle line', readFileSync('src/ui/scenes/dungeonScene.js', 'utf8').includes('--n:${enemies.length}'));
}

// T39: 0.079 — tuning lives in data: shrine card text agrees with the
// boon's numbers, and hub discipline text is generated from player knobs.
{
  const pct = (x) => `${Math.round(x * 100)}%`;
  const expect = {
    dmg: (o) => [pct(o.dmgMult - 1), pct(o.hpCostPct)],
    crit: (o) => [pct(o.critAdd), String(o.coinCost)],
    armor: (o) => [`${pct(o.armorMult - 1)} ARMOR (MIN +${o.armorMin})`, `${o.potionCost} POTION`],
    leech: (o) => [pct(o.lifestealAdd), pct(o.hpCostPct)],
    bulwark: (o) => [`${pct(o.armorPct)} ARMOR (MIN +${o.armorAdd})`, pct(o.dmgCostPct)],
    secondwind: (o) => [`${o.potionsAdd} POTION`, String(o.coinCost)],
    quicken: (o) => [String(o.cdReduce), pct(o.hpCostPct)],
    greed: (o) => [pct(o.coinMultAdd), pct(o.dmgCostPct)],
    glasscannon: (o) => [pct(o.dmgMult - 1), pct(o.armorCostPct)],
  };
  const bad = DATA.shrines.offers.filter((o) => {
    const [buff, cost] = expect[o.id](o);
    return !o.buff.includes(buff) || !o.costDesc.includes(cost);
  }).map((o) => o.id);
  ok('shrine text matches shrine numbers', bad.length === 0, bad.join(','));
  const { statDesc } = await import('../src/meta/leveling.js');
  const pl = DATA.difficulty.player;
  ok('hub stat text generated from data', statDesc('power', 0).includes(`+${pl.dmgPerPower} `)
    && statDesc('vitality', 0).includes(`+${pl.hpPerVitality} `) && statDesc('precision', 0).startsWith('increase Crit'));
}

// T40: 0.079 — save schema versioning: old unversioned saves migrate once
// to SAVE_VERSION; fresh and imported saves carry the version.
{
  const { SAVE_VERSION, exportSave, importSave } = await import('../src/meta/profile.js');
  ok('save version defined', Number.isInteger(SAVE_VERSION) && SAVE_VERSION >= 1);
  resetProfile();
  ok('fresh profile carries saveVersion', getProfile().saveVersion === SAVE_VERSION);
  // A pre-0.079 save: no version, old single alchemy stat, flat inventory.
  const legacy = { coins: 5, xp: 1, stats: { power: 2, alchemy: 3 }, records: { runs: 4 },
    inventory: ['rusty_sword', 'rusty_sword'] };
  const code = Buffer.from(JSON.stringify({ ...legacy, equipment: {} })).toString('base64');
  // importSave requires equipment/records; build the legacy case directly too.
  localStorage.setItem('castle-roguelike-profile-v1', JSON.stringify(legacy));
  const mod = await import('../src/meta/profile.js?legacy');
  const p = mod.getProfile();
  ok('legacy save migrates to current version', p.saveVersion === SAVE_VERSION
    && p.alchemy.potency === 3 && p.stats.alchemy === undefined
    && p.equipment && p.equipment.weapon === 'rusty_sword' && p.inventory === undefined
    && p.records.kills === 0 && p.records.runs === 4);
  ok('import stamps saveVersion', importSave(code) === true && getProfile().saveVersion === SAVE_VERSION);
  resetProfile();
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
  const { showDeathModal } = await import('../src/ui/deathModal.js');
  const ov = showDeathModal({ roomNumber: 3 }, () => {});
  const acc = ov.all((n) => n.tagName === 'button')[0];
  ok('death button pulses active red', acc && /\bactive\b/.test(acc.className) && acc.className.includes('active-red'));
  ov.remove();
  const { deathFlash } = await import('../src/ui/fx.js');
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

// T42: 0.080 — potions persist between runs: unused ones come home (retreat
// and death), pickups past the cap are sold, the save migrates v1 -> v2,
// and the Great Hall shows the player level.
{
  const { settleRun, addPotion, drinkPotion } = await import('../src/run/runState.js');
  resetProfile();
  const p = getProfile();
  const r1 = createRun();
  ok('run draws the stock and cap', r1.potions === 2 && r1.potionCap === 4);
  r1.hp = 1; drinkPotion(r1);
  settleRun(r1, 'retreat');
  ok('unused potions come home (retreat)', p.potions === 1);
  const r2 = createRun(); r2.potions = 3;
  settleRun(r2, 'death');
  ok('unused potions come home (death)', p.potions === 3);
  const r3 = createRun(); r3.potions = 4; r3.coins = 0;
  ok('pickup at the cap is sold', addPotion(r3) === false && r3.potions === 4 && r3.coins === DATA.difficulty.potions.fullSatchelSellCoins);
  const r4 = createRun(); r4.potions = 1;
  ok('pickup under the cap is kept', addPotion(r4) === true && r4.potions === 2);
  const sw = DATA.shrines.offers.find((o) => o.id === 'secondwind');
  const r5 = createRun(); r5.potions = 4; r5.coins = 1000; r5.roomNumber = 2; r5.hp = 1;
  acceptOffer(r5, sw);
  ok('secondwind goes over the satchel cap by design (0.091)', r5.potions === 6 && r5.hp === r5.maxHp);
  settleRun(r5, 'retreat');
  ok('...and leftovers are capped at settle', p.potions === p.potionCap);

  // v1 save (pre-0.080) with a big permanent potion count
  const { importSave } = await import('../src/meta/profile.js');
  const v1 = { ...JSON.parse(JSON.stringify(p)), saveVersion: 1, potions: 7, potionsBought: 5 };
  delete v1.potionCap;
  ok('v1 save migrates: count becomes a full satchel', importSave(Buffer.from(JSON.stringify(v1)).toString('base64'))
    && getProfile().potionCap === 7 && getProfile().potions === 7 && getProfile().potionsBought === undefined
    && getProfile().saveVersion === 2);
  const v1small = { ...v1, potions: 2 };
  importSave(Buffer.from(JSON.stringify(v1small)).toString('base64'));
  ok('small v1 stock keeps its potions, cap starts at 4', getProfile().potionCap === 4 && getProfile().potions === 2);
  const v1huge = { ...v1, potions: 25 };
  importSave(Buffer.from(JSON.stringify(v1huge)).toString('base64'));
  ok('huge v1 stock clamps to max cap', getProfile().potionCap === 10 && getProfile().potions === 10);

  resetProfile();
  const hub = hubScene();
  const root = new El('main');
  hub.enter(root);
  const txt = root.textContent;
  ok('Great Hall shows Level before Coins', txt.indexOf('Level') !== -1 && txt.indexOf('Level') < txt.indexOf('Coins'));
  ok('Great Hall shows potions as n/max and the satchel', txt.includes('2/4') && txt.includes('Potion Satchel'));
}

// T43: 0.081 — Great Hall stat boxes: 3 columns (Level/Coins/XP,
// Attack/HP/Armor, Potions centered), label top-left, value bottom-right.
{
  resetProfile();
  const root = new El('main');
  hubScene().enter(root);
  const grid = root.all((n) => n.className.includes('hub-stats'))[0];
  const labels = grid ? grid.children.map((b) => b.children[0].textContent) : [];
  ok('hub stat order', labels.join(',') === 'Level,Coins,XP,Attack,HP,Armor,Potions', labels.join(','));
  ok('potions box centered', grid && grid.children[6].className.includes('stat-potions'));
  const css = readFileSync('styles.css', 'utf8');
  ok('hub stats: 3 columns, label top-left, value bottom-right',
    css.includes('.hub-wrap .stat-grid.hub-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }')
    && css.includes('.hub-stats .stat-box .label { align-self: flex-start; }')
    && css.includes('.hub-stats .stat-box .value { align-self: flex-end;')
    && css.includes('.hub-stats .stat-potions { grid-column: 2; }'));
}

// T44: 0.082 — versioned boot: build.json lists every module (bump.mjs),
// index.html loads CSS/JS under ?v=<version>; glow keyframes blendable.
{
  const { listModules } = await import('./bump.mjs');
  const b = JSON.parse(readFileSync('assets/data/build.json', 'utf8'));
  ok('build.json module list matches src/ (run tools/bump.mjs)', JSON.stringify(b.modules) === JSON.stringify(listModules()));
  const html = readFileSync('index.html', 'utf8');
  ok('index.html boots versioned', html.includes("fetch('assets/data/build.json', { cache: 'no-store' })")
    && html.includes("im.type = 'importmap'") && html.includes("'styles.css' + q") && html.includes("'src/main.js' + q")
    && !html.includes('<script type="module" src="src/main.js">'));
  const css = readFileSync('styles.css', 'utf8');
  const layers = (name) => {
    const block = css.slice(css.indexOf(`@keyframes ${name} {`)).split('}')[0] + '}' + css.slice(css.indexOf(`@keyframes ${name} {`)).split('}')[1];
    return [...block.matchAll(/box-shadow:([^;]*);/g)].map((m) => m[1].split(/,(?![^(]*\))/).length);
  };
  const y = layers('active-glow'), r = layers('active-glow-red');
  ok('glow keyframes have matching shadow counts (smooth fade)', y.length === 2 && y[0] === y[1] && r.length === 2 && r[0] === r[1], `${y} / ${r}`);
}

// T45: 0.083 — 3D backgrounds: every background ships a depth map; the
// camera starts at the rest pose (= the flat CSS image); the overscan
// skirt covers the screen at the sway extremes for every depth and common
// aspect ratios (no black edges); the math mirrors CSS "cover".
{
  const bg3d = await import('../src/core/bg3d.js');
  const b = DATA.backgrounds;
  const all = [...new Set([b.title, b.hub, b.boss, b.death, b.shrine, ...b.rooms])];
  const missing = all.filter((f) => { try { return !statSync(bg3d.depthUrl(f)).isFile(); } catch { return true; } });
  ok('every background has a depth map', missing.length === 0, missing.join(','));
  const png = readFileSync(bg3d.depthUrl(b.title));
  ok('depth maps are 8-bit grayscale PNGs', png.readUInt32BE(16) === 512 && png[24] === 8 && png[25] === 0);
  const { preloadAssets } = await import('../src/shared/preload.js');
  ok('depth maps are preloaded', readFileSync('src/shared/preload.js', 'utf8').includes('unique.map(depthUrl)') && typeof preloadAssets === 'function');

  const cs = (w, h) => bg3d.coverScale(w, h, 2048, 1152).map((x) => Math.round(x * 1000) / 1000).join(',');
  ok('cover mapping matches CSS cover', cs(1920, 1080) === '1,1' && cs(1024, 768) === '0.75,1' && cs(2560, 1080) === '1,0.75');
  const o0 = bg3d.orbit(0, bg3d.tuning(''));
  ok('sway starts at the rest pose', o0.yaw === 0 && o0.pitch === 0);
  const d = { w: 2, h: 2, data: new Uint8Array([0, 255, 255, 255]) };
  ok('bilinear depth sampling', bg3d.sampleDepth(d, 0, 0) === 0 && bg3d.sampleDepth(d, 1, 1) === 1
    && Math.abs(bg3d.sampleDepth(d, 0.5, 0.5) - 0.75) < 1e-9 && bg3d.sampleDepth(d, -3, 9) === 1);

  // Shader mirror + coverage math live in core/bg3dMath.js (one copy).
  const bm = await import('../src/core/bg3dMath.js');
  const cfg = bg3d.tuning('');
  const fov = (cfg.fovDeg * Math.PI) / 180;
  const [rx, ry] = bm.projectVertex(bm.mvp(0, 0, fov, 16 / 9), 0.25, 0.75, 0.9, 16 / 9, cfg);
  ok('rest pose: depth does not move pixels', Math.abs(rx - -0.5) < 1e-6 && Math.abs(ry - -0.5) < 1e-6);
  const worst = Math.min(...[4 / 3, 16 / 9, 21 / 9].map((a) => bm.edgeMargin(cfg, a, cfg.overscan)));
  ok('overscan skirt covers the screen at sway extremes', worst > 0, `worst margin ${worst.toFixed(4)} NDC`);
  ok('coverage check detects a too-small skirt', bm.edgeMargin(cfg, 16 / 9, 0) < 0);

  const main = readFileSync('src/main.js', 'utf8');
  ok('bg debug toggles only under ?debug', main.includes('...(debugMode ? bgDebugToggles() : [])')
    && main.includes("'HIDE FOREGROUND: OFF'") && main.includes("['3d', 'flat', 'depth']"));
  const body = globalThis.document.body;
  globalThis.document.body = { classList: { contains: (c) => c === 'fg-hidden' } };
  let clicked = 0;
  const { el: mkEl } = await import('../src/core/scene.js');
  const btn = mkEl('button', { key: 'q', onclick: () => clicked++ }, 'Q');
  registry.app.append(btn);
  ok('hotkeys off while the foreground is hidden', handleKey('q') === false && clicked === 0);
  globalThis.document.body = body;
  ok('hotkeys back when shown', handleKey('q') === true && clicked === 1);
  btn.remove();
  ok('3D backgrounds no-op without WebGL', bg3d.initBg3d() === false && bg3d.isBg3dActive() === false);
}

// T46: 0.084 — ?debug BG TUNING: live values override the data, Save keeps
// them in localStorage, Reset clears; the skirt grows automatically for
// whatever sway/depth the sliders allow (up to their maximums).
{
  const bg3d = await import('../src/core/bg3d.js');
  const bm = await import('../src/core/bg3dMath.js');
  const base = bg3d.tuning('');
  ok('tunables: depth, speed, sway x/y, focus', bg3d.TUNABLE.join(',') === 'depthScale,speed,yawDeg,pitchDeg,pivot'
    && base.speed === (DATA.backgrounds.parallax.speed ?? 1)); // shipped value comes from the data
  bg3d.setLiveTuning({ depthScale: 0.9, speed: 2 });
  ok('live values override the shipped ones', bg3d.tuning('').depthScale === 0.9 && bg3d.liveTuning().speed === 2
    && bg3d.tuning('').yawDeg === base.yawDeg);
  const json = bg3d.saveLiveTuning();
  const saved = JSON.parse(localStorage.getItem('castle-bg-tuning'));
  ok('save stores + returns the values', saved.depthScale === 0.9 && saved.speed === 2 && JSON.parse(json).pivot === base.pivot);
  bg3d.resetLiveTuning();
  ok('reset restores shipped values and clears storage', bg3d.tuning('').depthScale === base.depthScale && localStorage.getItem('castle-bg-tuning') === null);
  const extreme = { ...base, depthScale: 1.2, yawDeg: 5, pitchDeg: 3, pivot: 0 }; // the sliders' maximums
  ok('near-plane floor matches the shader', readFileSync('src/core/bg3d.js', 'utf8').includes('max(0.4, 1.0 + uDepthScale')
    && readFileSync('src/core/bg3dMath.js', 'utf8').includes('Math.max(0.4, 1 + c.depthScale'));
  const fov = (base.fovDeg * Math.PI) / 180;
  ok('no geometry behind the camera at max sliders', bm.projectVertex(bm.mvp(0, 0, fov, 16 / 9), 0.5, 0.5, 1, 16 / 9, extreme).every(Number.isFinite));
  const cover = Math.min(...[4 / 3, 16 / 9, 21 / 9].map((a) => bm.edgeMargin(extreme, a, bm.requiredOverscan(extreme, a))));
  ok('auto skirt covers the screen at max slider settings', cover > 0, cover.toFixed(4));
  const tuner = readFileSync('src/ui/bgTuner.js', 'utf8');
  ok('tuner: 5 sliders + Save Depth Settings + Reset', (tuner.match(/^\s+\['\w+', '[\w ]+', /gm) || []).length === 5
    && tuner.includes("'Save Depth Settings'") && tuner.includes("'Reset'") && tuner.includes('navigator.clipboard.writeText'));
  ok('tuner only under ?debug', readFileSync('src/main.js', 'utf8').includes('bgTunerToggle()]'));
  ok('clip-enemies experiment fully removed (0.090)', !readFileSync('src/main.js', 'utf8').includes('clip')
    && !readFileSync('styles.css', 'utf8').includes('clip-enemies'));
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
  const { fxFor } = await import('../src/ui/combatFx.js');
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
  ok('portrait/skull swap is CSS-driven', css.includes('.char-card.dead .skull { display: block; }') && css.includes('.char-card.dead .portrait { display: none; }'));
  // Drain the fight so no timers leak into later tests.
  for (let g = 0; g < 40 && !t().includes('Push Deeper') && !t().includes('YOU DIED'); g++) { handleKey('a'); await sleep(900); }
}

// T48: 0.087 — character animation: every enemy has an idle family with a
// CSS loop (independent-property transforms only, pivot at the feet);
// attack lines hold the log long enough to read; floating numbers get a
// layer; reduced motion stops the loops.
{
  const { IDLE_FAMILY } = await import('../src/ui/battleLine.js');
  const { holdFor } = await import('../src/ui/combatFx.js');
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
  ok('portrait pivots at the feet (0 100%, see comment)', css.includes('.portrait { transform-origin: 0 100%; }'));
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
  const bm = await import('../src/core/bg3dMath.js');
  const bg3d = await import('../src/core/bg3d.js');
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
  const { playFx } = await import('../src/ui/combatFx.js');
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
  const { MATERIAL, materialOf } = await import('../src/ui/particles.js');
  ok('particle materials: Cinderborn embers, wraith wisps, bone/stone dust, flesh blood',
    materialOf('ghoul') === 'embers' && materialOf('wraith') === 'wisps' && materialOf('skeleton') === 'dust'
    && materialOf('rat') === 'blood' && materialOf('player') === 'blood' && Object.keys(MATERIAL).every((id) => DATA.enemies[id]));
  const { IDLE_FAMILY, enemyCard } = await import('../src/ui/battleLine.js');
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
  const { potionLevel } = await import('../src/ui/scenes/hubScene.js');
  ok('Great Hall potions: green full, red low',
    potionLevel({ potions: 4, potionCap: 4 }) === 'potions-full' && potionLevel({ potions: 1, potionCap: 4 }) === 'potions-low'
    && potionLevel({ potions: 0, potionCap: 4 }) === 'potions-low' && potionLevel({ potions: 2, potionCap: 4 }) === 'potions-ok'
    && potionLevel({ potions: 2, potionCap: 8 }) === 'potions-low' && potionLevel({ potions: 3, potionCap: 8 }) === 'potions-ok'
    && css.includes('.hub-stats .potions-full .value { color: #6fe07a; }') && css.includes('.hub-stats .potions-low .value { color: #e05a4a; }'));
}

// T51: 0.089 — the player card shows TOTAL armor, plus the Infusion
// potion bonus while it lasts ("14 ARMOR" / "14+2 ARMOR").
{
  const { createPlayerUnit } = await import('../src/ui/battleLine.js');
  resetProfile();
  const r = createRun(); r.stats.armor = 14; r.tempArmor = 0;
  const u = createPlayerUnit(r, { onHeavy() {}, onPotion() {} });
  const st = { hp: r.hp, printing: false, heavyReady: true, heavyCd: 0, dead: false };
  u.update(st);
  const plain = u.el.textContent;
  r.tempArmor = 2; u.update(st);
  ok('armor line: total, then total+potion bonus', plain.includes('14 ARMOR') && !plain.includes('14+') && u.el.textContent.includes('14+2 ARMOR'));
}

// T52: 0.090 — Feast Hall depth fix (grounded map under a new filename),
// denser mesh, clip experiment gone; Great Hall spend hints + potion glow;
// randomized particle origins.
{
  const bg3d = await import('../src/core/bg3d.js');
  ok('feast hall uses the regenerated depth map', bg3d.depthUrl('castle_great_hall.jpg') === 'assets/bg/depth/castle_great_hall_v2.png'
    && bg3d.depthUrl('castle_library.jpg') === 'assets/bg/depth/castle_library.png');
  ok('mesh dense enough for thin objects (256x144, under the 16-bit index limit)', bg3d.tuning('').grid.join('x') === '256x144' && 257 * 145 < 65536);
  ok('generator has the grounding pass', readFileSync('tools/gen-depth.py', 'utf8').includes('def ground(') && readFileSync('tools/gen-depth.py', 'utf8').includes('--ground'));
  const hub = await import('../src/ui/scenes/hubScene.js');
  resetProfile();
  const p = getProfile();
  p.xp = 0; p.coins = 0;
  ok('nothing to spend: no green', !hub.canSpendXp(p) && !hub.canSpendCoins(p));
  p.xp = 1000; p.coins = DATA.difficulty.potions.price;
  ok('XP/coins green when something is affordable', hub.canSpendXp(p) && hub.canSpendCoins(p));
  ok('potion glow below 30% of the satchel', hub.potionsLow({ potions: 1, potionCap: 4 }) && !hub.potionsLow({ potions: 2, potionCap: 4 })
    && hub.potionsLow({ potions: 2, potionCap: 8 }) && !hub.potionsLow({ potions: 3, potionCap: 8 }));
  p.potions = 1; p.potionCap = 4;
  const root = new El('main');
  hub.hubScene().enter(root);
  const buy = root.all((n) => n.tagName === 'button' && n.attrs['data-key'] === 'u')[0];
  ok('Buy Potion glows when low and affordable', buy && /\bactive\b/.test(buy.className));
  ok('particle bursts start at a random point on the figure', readFileSync('src/ui/combatFx.js', 'utf8').includes('r.width * (0.5 + (Math.random() - 0.5) * 0.5)')
    && readFileSync('src/ui/particles.js', 'utf8').includes('x: x + (r() - 0.5) * 36 * u'));
}

// T53: 0.091 — simulator engine (simCore) policies + the shrine study.
{
  const { loadSim, withSeed, newAgg } = await import('./simCore.mjs');
  const sim = await loadSim();
  const snap = sim.snapshot();
  let forced = null, none = null;
  for (let s = 1; s < 60 && (!forced || !none); s++) { // find a seed whose run reaches the shrine
    sim.restore(snap);
    const f = withSeed(s, () => sim.playRun({ shrine: 'dmg' }));
    sim.restore(snap);
    const n = withSeed(s, () => sim.playRun({ shrine: 'none' }));
    if (f.shrineRoom !== null) { forced = f; none = n; }
  }
  sim.restore(snap);
  ok('forced boon is taken; walking away takes nothing', forced && forced.boon === 'dmg' && none.boon === null && none.shrineRoom === forced.shrineRoom);
  const agg = newAgg();
  withSeed(3, () => { sim.fresh(); for (let i = 0; i < 6; i++) { sim.playRun({ agg, retreat: true }); sim.spendInHub(agg); } });
  sim.restore(snap);
  ok('retreat policy banks runs and tracks bosses/turns', agg.runs.length === 6 && agg.turns > 0 && agg.combatRooms > 0
    && agg.runs.every((r) => r.outcome === 'death' || r.outcome === 'retreat'));
  const { shrineStudy, verdict } = await import('./shrine-study.mjs');
  const st = await shrineStudy({ n: 12, seed: 5, stages: [3] });
  const rows = st.results[0].rows;
  ok('shrine study: one row per boon + walk away', rows.length === DATA.shrines.offers.length + 1 && rows[0].policy === 'none');
  ok('study verdicts', verdict({ policy: 'x', afford: 0.1, dDepth: 0, seDepth: 0.1, dCoins: 0 }) === 'DEAD'
    && verdict({ policy: 'x', afford: 1, dDepth: -1, seDepth: 0.1, dCoins: 300 }) === 'TRADE'
    && verdict({ policy: 'x', afford: 1, dDepth: -1, seDepth: 0.1, dCoins: 0 }) === 'TRAP'
    && verdict({ policy: 'x', afford: 1, dDepth: 3, seDepth: 0.2, dCoins: 0 }) === 'OP');
  resetProfile();
}

// T54: 0.091 — drops that can't beat the gear (as it will be after this
// run's finds) are salvaged on the spot for their salvage value; upgrades
// still drop; the per-run relic cap counts salvaged relics too.
{
  const { applyLoot } = await import('../src/run/runState.js');
  const { salvageValue } = await import('../src/meta/equipment.js');
  resetProfile();
  const p = getProfile();
  p.equipment.weapon = 'crimson_reaver'; // a T4 weapon: any other weapon is junk
  const run = createRun();
  const origR = Math.random;
  const items = DATA.items;
  const weaker = Object.keys(items).find((id) => items[id].slot === 'weapon' && items[id].tier === 1);
  const ring = Object.keys(items).find((id) => items[id].slot === 'ring' && items[id].tier === 1);
  // drive a rat's drop (tier-1 pool) to a chosen item: keep every higher
  // tier (equipped gear must resolve) plus only that one tier-1 item
  const only = (id) => {
    const keep = DATA.items;
    DATA.items = Object.fromEntries(Object.entries(keep).filter(([k, v]) => v.tier > 1 || k === id));
    return () => { DATA.items = keep; };
  };
  Math.random = () => 0.001;
  let undo = only(weaker);
  const lines = [];
  const c0 = run.coins;
  const r1 = applyLoot(run, scaleEnemy('rat', 1), (t, c) => lines.push(t));
  undo();
  ok('non-upgrade salvaged on the spot', r1.itemId === weaker && !r1.kept && !run.itemsFound.includes(weaker)
    && lines.some((l) => typeof l === 'string' && l.includes(`salvaged ${items[weaker].name}`)));
  ok('...for its salvage value', run.coins - c0 >= salvageValue(weaker));
  undo = only(ring);
  const r2 = applyLoot(run, scaleEnemy('rat', 1), () => {});
  undo();
  Math.random = origR;
  ok('upgrade (empty ring slot) still drops as an item', r2.kept && run.itemsFound.includes(ring));
  ok('relic cap tracks salvaged relics too', readFileSync('src/run/runState.js', 'utf8').includes('rollLoot(enemy, fortune, run.roomNumber, run.relicFound)'));
  resetProfile();
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
  const { applyLoot } = await import('../src/run/runState.js');
  const k0 = run.kills, c0 = run.coins, x0 = run.xp;
  const drop = applyLoot(run, sk, () => {});
  ok('...and no loot, but count as kills', drop.itemId === null && run.kills === k0 + 1 && run.coins === c0 && run.xp === x0);
  for (let i = 0; i < cfg.every * (cfg.maxAlive + 2); i++) turn();
  const alive = cb.enemies.filter((e) => e.summoned && e.hp > 0).length;
  ok('summons capped alive; meter waits full', alive === cfg.maxAlive && cb.enemies[0].summonMeter === cfg.every);
  const { heavyTarget } = await import('../src/run/combat.js');
  ok('Heavy targets the front summon, else the boss', heavyTarget(cb) === 1
    && heavyTarget({ enemies: [{ hp: 5 }, { hp: 0, summoned: true }] }) === 0);
  ok('regular rooms have no summoners', generateRoom(3, createRun()).enemies.every((e) => !e.summonEvery));

  const { fxFor, holdFor } = await import('../src/ui/combatFx.js');
  const sfx = fxFor(sev);
  ok('summon fx + pacing hold', sfx.kind === 'summon' && sfx.from === 0 && sfx.to === 1 && holdFor(sfx) === DATA.difficulty.combatPacing.summonMs);

  // Cards: the boss has a summon bar; a fallen summon's unit leaves the row.
  const { createEnemyUnit } = await import('../src/ui/battleLine.js');
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
  const bm = await import('../src/core/bg3dMath.js');
  const bg3d = await import('../src/core/bg3d.js');
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
    fxSrc.includes("case 'smash': shake(ctx, 1.6); return bgSway(1.5, 1);") && fxSrc.includes('if (fx.crit) bgSway(')
    && fxSrc.includes("fx.to === 'player' && fx.share >= big") && fxSrc.includes('/ big, -1)'));

  // Alignment (0.092): caps centered in buttons (underline ignored), and
  // the elite star no longer drops its name below the others.
  const css = readFileSync('styles.css', 'utf8');
  ok('button caps centered via text-box trim (with fallback nudge)', /@supports \(text-box: trim-both cap alphabetic\) \{\s*\.btn-label \{ top: 0; text-box: trim-both cap alphabetic; padding-block: calc\(\(1lh - 1cap\) \/ 2\); \}/.test(css)
    && css.includes('.btn-label { position: relative; top: 0.15em; }'));
  ok('elite star stays out of the name line box', /\.elite-star \{[^}]*line-height: 0;/.test(css));
  resetProfile();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
