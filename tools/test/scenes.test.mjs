// tools/test/scenes.test.mjs — scene manager, transitions, hotkeys, versioned boot, update prompt.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, El, DATA, show, handleKey, setBackground, transitionTo, createRun, generateRoom,
  scaleEnemy, createCombat, playerAttack, shrineOffers, canAffordOffer, acceptOffer, dungeonScene, hubScene, titleScene,
  resetProfile, getProfile, loadData, readFileSync, readdirSync, statSync } from './harness.mjs';

fresh();

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
{
  resetProfile();
  show(titleScene());
  await sleep(1100);
  handleKey('e');
  await sleep(1300);
  ok('hub renders after Enter', t().includes('GREAT HALL') && !registry.app.classList.contains('hidden'));
  handleKey('d');
  await sleep(1300);
  ok('dungeon renders after Descend', t().includes('Room 1') && !registry.app.classList.contains('hidden'));
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

// T14: space = secondary binding (data-key2, Push Deeper in the dungeon).
// Built via el() ON PURPOSE — 0.051 shipped with the el() key2 branch
// silently dropped, so buttons never got data-key2 and space did nothing.
// A synthetic setAttribute button can't catch that class of break.
{
  const { el: mkEl } = await import('../../src/core/scene.js');
  let clicked = 0;
  const btn = mkEl('button', { key: 'd', key2: ' ', onclick: () => clicked++ }, 'Push Deeper');
  ok('el() wires key2 to data-key2', btn.attrs['data-key2'] === ' ' && btn.attrs.key2 === undefined);
  registry.app.append(btn);
  handleKey(' ');
  ok('space clicks data-key2 button', clicked === 1);
  btn.remove();
  ok('space without a binding is inert', handleKey(' ') === false);
}

// T37: 0.077 — double Retreat must not bank the run twice, the fading-out
// scene ignores hotkeys, and typing in a text field is not a hotkey.
{
  const { settleRun } = await import('../../src/run/runState.js');
  resetProfile();
  const r = createRun(); r.coins = 100; r.xp = 40; r.roomNumber = 3;
  settleRun(r, 'retreat');
  const p = getProfile();
  const snap = { coins: p.coins, xp: p.xp, runs: p.records.runs };
  settleRun(r, 'retreat');
  ok('settleRun is idempotent (double retreat banks once)',
    p.coins === snap.coins && p.xp === snap.xp && p.records.runs === snap.runs && snap.coins === 100 && snap.runs === 1);

  let clicked = 0;
  const { el: mkEl, initHotkeys } = await import('../../src/core/scene.js');
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

// T44: 0.082 — versioned boot: build.json lists every module (bump.mjs),
// index.html loads CSS/JS under ?v=<version>; glow keyframes blendable.
{
  const { listModules } = await import('../bump.mjs');
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

// T56: 0.094 — update prompt: version compare, changelist since this
// build, never mid-run (waits for the next scene), owns the keyboard
// while open, "Later" silences that version; bump.mjs keeps the changelog.
{
  const up = await import('../../src/ui/updatePrompt.js');
  const { nextBuild } = await import('../bump.mjs');
  const { currentScene } = await import('../../src/core/scene.js');
  ok('version compare is numeric', up.isNewer('0.100', '0.099') && up.isNewer('0.095', '0.094') && !up.isNewer('0.094', '0.094') && !up.isNewer('0.093', '0.094'));
  const log = { '0.097': ['c1'], '0.096': ['b1', 'b2'], '0.095': ['a1'], '0.094': ['old'] };
  ok('changelist = builds since mine, newest first', JSON.stringify(up.notesSince(log, '0.094', '0.096')) === '["b1","b2","a1"]');
  const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`0.1${String(i).padStart(2, '0')}`, [`n${i}`]]));
  const capped = up.notesSince(many, '0.099', '0.111');
  ok('changelist is capped', capped.length === 8 && capped[7].includes('more') && capped[0] === 'n11');
  const nb = nextBuild({ version: '0.093', changelog: { '0.093': ['x'] } }, '0.094', ['a'], ['m.js']);
  ok('bump.mjs adds notes and keeps history', nb.version === '0.094' && nb.changelog['0.094'][0] === 'a' && nb.changelog['0.093'][0] === 'x');
  const b = JSON.parse(readFileSync('assets/data/build.json', 'utf8'));
  ok('this build has changelist notes', Array.isArray(b.changelog?.[b.version]) && b.changelog[b.version].length > 0);

  // Live behaviour against stubbed fetch/location/body.
  const realFetch = globalThis.fetch, realBody = globalThis.document.body, realLoc = globalThis.location;
  const body = new El('body');
  globalThis.document.body = body;
  let reloaded = 0;
  globalThis.location = { reload: () => { reloaded++; } };
  let served = { version: '9.001', changelog: { '9.001': ['Bosses dance'] } };
  globalThis.fetch = async (url) => (String(url).includes('build.json')
    ? { ok: true, json: async () => served }
    : realFetch(url));
  up.initUpdateCheck(0);
  const prompt = () => body.children.find((c) => c.className === 'update-overlay');
  show({ inRun: true, enter() {} }); // mid-run
  await sleep(1100);
  const found = await up.checkForUpdate();
  ok('mid-run: the update is noticed but not shown', found?.version === '9.001' && !prompt() && currentScene().inRun);
  show(hubScene());
  await sleep(1100);
  ok('after the run: the prompt appears with version + changelist', !!prompt() && prompt().textContent.includes('9.001') && prompt().textContent.includes('Bosses dance'));
  const hubText = t();
  handleKey('e'); handleKey('1');
  ok('the prompt owns the keyboard', !!prompt() && t() === hubText && reloaded === 0);
  handleKey('n');
  ok('N puts it off', !prompt() && reloaded === 0);
  await up.checkForUpdate();
  ok('...and that version stays quiet this session', !prompt());
  served = { version: '9.002', changelog: { '9.002': ['More'], '9.001': ['Bosses dance'] } };
  await up.checkForUpdate();
  ok('a newer build asks again, listing both', !!prompt() && prompt().textContent.includes('More') && prompt().textContent.includes('Bosses dance'));
  handleKey('y');
  ok('Y reloads', reloaded === 1);
  handleKey('escape');
  ok('Esc closes; the keyboard is released', !prompt() && handleKey('zz') === false);
  globalThis.fetch = realFetch; globalThis.document.body = realBody; globalThis.location = realLoc;
}
