// tools/test/scenes.test.mjs — scene manager, transitions, hotkeys, versioned boot, update prompt.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, El, DATA, withAnimations, show, handleKey, setBackground, transitionTo, createRun, dungeonScene, hubScene, titleScene, resetProfile, getProfile, readFileSync, statSync } from './harness.mjs';

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
{ // (0.00223: relative — whichever layer is up holds the newer painting, the other the older, faded)
  const up = [registry.bg0, registry.bg1].find((l) => l.style.opacity === '1'), down = [registry.bg0, registry.bg1].find((l) => l !== up);
  ok('bg crossfade swaps layers', !!up && up.dataset.file === 'castle_great_hall.png' && down.style.opacity === '0' && down.dataset.file === 'medieval_castle.png');
}

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
  // 0.00223: a scene whose enter() throws shows a panel with a Reload button Space presses (an empty, un-hidden #app before)
  const realLoc = globalThis.location; let reloads = 0;
  globalThis.location = { reload: () => { reloads++; } };
  show({ enter() { throw new Error('intentional'); } });
  await sleep(1100);
  const reload = registry.app.all((e) => e.tagName === 'button' && e.attrs['data-key2'] === ' ');
  ok('a throwing enter() leaves a Reload button Space can press', !registry.app.classList.contains('hidden') && reload.length === 1 && reload[0].textContent.includes('Reload') && handleKey(' ') === true && reloads === 1);
  globalThis.location = realLoc;
  // 0.00223: a dialog opened mid-transition hears the keyboard; the scene's own keys stay deaf
  const { openDialog } = await import('../../src/ui/dialog.js');
  const { isTransitioning, onSceneChange, whenWindowsBack } = await import('../../src/core/scene.js');
  const { el: mk } = await import('../../src/core/dom.js');
  let dlgKeys = 0, sceneClicks = 0;
  registry.app.append(mk('button', { key: 'z', onclick: () => { sceneClicks++; } }, 'Z'));
  transitionTo(() => {}, 500);
  const mid = isTransitioning();
  const sceneKeyMid = handleKey('z');
  const dlg = openDialog({ label: 'Mid', children: [], onKey: () => { dlgKeys++; } });
  const dlgKeyMid = handleKey('escape');
  dlg.close();
  await sleep(700);
  ok('a dialog opened mid-transition hears the keyboard, the scene\'s keys stay deaf (the 0.077 guard holds)', mid && sceneKeyMid === false && sceneClicks === 0 && dlgKeyMid === true && dlgKeys === 1);
  // 0.00223: the scene listener fires once the windows are back, never mid-fade or for a bare room change
  const fired = [];
  onSceneChange((s) => fired.push({ s, mid: isTransitioning(), hidden: registry.app.classList.contains('hidden') }));
  const sceneX = { enter() {} };
  show(sceneX);
  await sleep(500);
  const early = fired.length;
  await sleep(700);
  transitionTo(() => {}, 100);
  await sleep(300);
  ok('onSceneChange fires once the windows are back, once per scene switch, never for a bare transition', early === 0 && fired.length === 1 && fired[0].s === sceneX && !fired[0].mid && !fired[0].hidden);
  onSceneChange(null);
  // 0.00223: go() names its scene
  const { go } = await import('../../src/core/scene.js');
  go('hub'); await sleep(1100);
  ok('go() names the scene it shows', (await import('../../src/core/scene.js')).currentScene().name === 'hub');
  fresh(); // (the hub and the 'z' button must not reach the hotkey checks below)
  // 0.00223: the very first painting resolves at once on the flat path (it is painted under transition: none); later ones wait the CSS fade
  const realGcs = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ transitionDuration: '2s' });
  try {
    const first = await import('../../src/core/scene.js?first'); // a fresh instance: no painting yet
    let doneA = false, doneB = false;
    first.setBackground('castle_a.jpg').then(() => { doneA = true; });
    await sleep(50);
    first.setBackground('castle_b.jpg').then(() => { doneB = true; });
    await sleep(1900);
    const held = !doneB;
    await sleep(300);
    ok('the first painting resolves at once on the flat path; the next waits the layer\'s 2 s fade', doneA && held && doneB);
  } finally { globalThis.getComputedStyle = realGcs; }
}

// T14: space = "proceed further" (el() proceed: true; 0.124 everywhere).
// Built via el() ON PURPOSE — 0.051 shipped with the el() key2 branch
// silently dropped, so buttons never got data-key2 and space did nothing.
// A synthetic setAttribute button can't catch that class of break.
{
  const { el: mkEl } = await import('../../src/core/dom.js');
  let clicked = 0;
  const btn = mkEl('button', { key: 'd', proceed: true, onclick: () => clicked++ }, 'Push Deeper');
  ok('el() proceed: Space binding + [space] under the label', btn.attrs['data-key2'] === ' ' && btn.attrs.proceed === undefined
    && btn.className.includes('proceed') && btn.textContent.includes('[space]'));
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
  const { el: mkEl } = await import('../../src/core/dom.js');
const { initHotkeys } = await import('../../src/core/hotkeys.js');
  const btn = mkEl('button', { key: 'r', onclick: () => clicked++ }, 'Retreat');
  registry.app.append(btn);
  transitionTo(() => {}, 50);
  ok('hotkeys ignored during a transition', handleKey('r') === false && clicked === 0);
  // 0.00223: a dialog opened mid-transition hears the keyboard (the trap comes before the guard; a dialog used to be deaf until the windows were back)
  const { openDialog } = await import('../../src/ui/dialog.js');
  const { isTransitioning } = await import('../../src/core/scene.js');
  const heard = [];
  const dlgMid = openDialog({ label: 'mid', children: [], onKey: (k, close) => { heard.push({ k, mid: isTransitioning() }); if (k === 'escape') close(); } });
  ok('a dialog opened mid-transition hears the keyboard; the scene\'s own keys stay off', handleKey('escape') === true && heard.length === 1 && heard[0].k === 'escape' && heard[0].mid && !dlgMid.isOpen() && handleKey('r') === false && clicked === 0);
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
  ok('index.html boots versioned', html.includes("fetch('assets/data/build.json?t=' + Date.now(), { cache: 'no-store' })")
    && html.includes("im.type = 'importmap'") && html.includes("'styles.css' + q") && html.includes("'src/main.js' + q")
    && !html.includes('<script type="module" src="src/main.js">'));
  const css = readFileSync('styles.css', 'utf8');
  const layers = (name) => {
    const block = css.slice(css.indexOf(`@keyframes ${name} {`)).split('}')[0] + '}' + css.slice(css.indexOf(`@keyframes ${name} {`)).split('}')[1];
    return [...block.matchAll(/box-shadow:([^;]*);/g)].map((m) => m[1].split(/,(?![^(]*\))/).length);
  };
  const y = layers('active-glow'), r = layers('active-glow-red');
  ok('the active glow is a layer whose opacity animates (0.00197: no box-shadow repaint per frame)', css.includes('button.active::after {') && /@keyframes active-glow \{ 0%, 100% \{ opacity: 0; \} 50% \{ opacity: 1; \} \}/.test(css) && css.includes('button.active.active-red::after {') && !/@keyframes active-glow-red/.test(css), `${y} / ${r}`);
}

// T56: 0.094 — update prompt: version compare, changelist since this
// build, never mid-run (waits for the next scene), owns the keyboard
// while open, "Later" silences that version; bump.mjs keeps the changelog.
{
  const up = await import('../../src/ui/updatePrompt.js');
  const { nextBuild } = await import('../bump.mjs');
  const { currentScene } = await import('../../src/core/scene.js');
  const { isNewer } = await import('../../src/shared/version.js');
  ok('version compare is numeric', isNewer('0.100', '0.099') && isNewer('0.095', '0.094') && !isNewer('0.094', '0.094') && !isNewer('0.093', '0.094'));
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
  // 0.00223: no poll while the tab is hidden; a visibility change re-checks
  let hits = 0;
  globalThis.fetch = async (url) => { if (String(url).includes('build.json')) hits++; return { ok: true, json: async () => served }; };
  const stop = up.initUpdateCheck(60000);
  globalThis.document.hidden = true;
  await sleep(120000);
  const hiddenHits = hits;
  globalThis.document.hidden = false;
  await sleep(60000);
  stop();
  ok('the build poll skips a hidden tab and resumes when it shows', hiddenHits === 0 && hits === 1);
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

const up2 = (a, b) => { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); return pa[0] > pb[0] || (pa[0] === pb[0] && pa[1] > pb[1]); };
// T76: 0.113 — CHANGELIST corner button: the full history (changelog.json,
// kept by bump.mjs) newest first in a dialog that owns the keyboard, and
// gives back the key trap of a dialog it was opened over.
{
  const cl = await import('../../src/ui/changelog.js');
  const { nextChangelog } = await import('../bump.mjs');
  const { pushKeyTrap, releaseKeyTrap, activeKeyTrap } = await import('../../src/core/hotkeys.js');
  const full = JSON.parse(readFileSync('assets/data/changelog.json', 'utf8'));
  const b = JSON.parse(readFileSync('assets/data/build.json', 'utf8'));
  const vs = Object.keys(full);
  ok('changelog.json: every build back to 0.073, newest first, superset of build.json', vs[0] === b.version && vs.at(-1) === '0.00073'
    && vs.every((v, i) => !i || up2(vs[i - 1], v)) && Object.keys(b.changelog).every((v) => JSON.stringify(full[v]) === JSON.stringify(b.changelog[v]))
    && vs.every((v) => Array.isArray(full[v]) && full[v].length > 0 && full[v].every((n) => typeof n === 'string' && n.length > 0)));
  const nc = nextChangelog({ '0.093': ['x'] }, '0.094', ['a']);
  ok('bump.mjs keeps the whole history', JSON.stringify(Object.keys(nc)) === '["0.094","0.093"]' && nextChangelog(nc, '0.095', []).hasOwnProperty('0.095') === false);
  ok('bump.mjs writes changelog.json', readFileSync('tools/bump.mjs', 'utf8').includes('writeFileSync(FULL, JSON.stringify(nextChangelog(full, version, notes)'));
  ok('CHANGELIST sits in the SETTINGS menu, under GAME', /menuHead\('Game'\),\s*changelogToggle\(\),/.test(readFileSync('src/main.js', 'utf8')));

  const realBody = globalThis.document.body;
  const body = new El('body');
  globalThis.document.body = body;
  show(hubScene());
  await sleep(1100);
  const btn = cl.changelogToggle();
  ok('corner button reads CHANGELIST', btn.textContent === 'CHANGELIST' && btn.className.includes('debug-toggle'));
  const dlg = () => body.children.find((c) => c.className.includes('changelog-overlay'));
  btn.listeners.click[0]();
  await sleep(10);
  const text = dlg()?.textContent ?? '';
  ok('the dialog lists every build, newest first, current one marked', !!dlg() && text.includes(`Build ${b.version} — this build`) && text.includes('Build 0.00073')
    && text.indexOf(`Build ${b.version}`) < text.indexOf('Build 0.00073') && text.includes(full['0.00094'][0]));
  const hubText = t();
  handleKey('e'); handleKey('1');
  ok('it owns the keyboard', !!dlg() && t() === hubText);
  handleKey('escape');
  ok('Esc closes and releases the keyboard', !dlg() && !cl.changelogOpen() && activeKeyTrap() === null);
  // opened over another dialog: its key trap comes back on close
  const other = () => true;
  pushKeyTrap(other);
  await cl.openChangelog(async () => ({ '9.001': ['Bosses dance'], '9.000': ['Bats'] }));
  ok('custom log renders', dlg().textContent.includes('Bosses dance') && dlg().textContent.indexOf('9.001') < dlg().textContent.indexOf('9.000'));
  handleKey('c');
  ok('closing gives back the trap underneath', !dlg() && activeKeyTrap() === other);
  releaseKeyTrap(other);
  await cl.openChangelog(async () => ({}));
  ok('an empty log says so', dlg().textContent.includes('No release notes'));
  cl.closeChangelog();
  globalThis.document.body = realBody;
}

// T79: 0.115 — every dialog goes through ui/dialog.js; key traps stack, so
// a dialog opened over another hands the keyboard back to it on close
// (before, closing the top one let the scene's hotkeys fire under the
// bottom one).
{
  const { openDialog } = await import('../../src/ui/dialog.js');
  const { confirmPrompt } = await import('../../src/ui/confirmPrompt.js');
  const { activeKeyTrap } = await import('../../src/core/hotkeys.js');
  const realBody = globalThis.document.body;
  globalThis.document.body = new El('body');
  show(hubScene());
  await sleep(1100);
  let yes = 0;
  const below = confirmPrompt({ title: 'Descend?', yes: ['Yes', 'y'], no: ['No', 'n'], onYes: () => yes++ });
  const keys = [];
  const top = openDialog({ label: 'Top', onKey: (k, close) => { keys.push(k); if (k === 'escape') close(); } });
  const hubText = t();
  handleKey('y'); handleKey('e');
  ok('the top dialog gets the keys; nothing reaches the one below or the scene', keys.join() === 'y,e' && yes === 0 && t() === hubText);
  handleKey('escape');
  ok('closing the top hands the keyboard back to the dialog below', !top.isOpen() && activeKeyTrap() !== null);
  handleKey('e');
  ok('...whose keys work, scene hotkeys still blocked', t() === hubText && yes === 0);
  handleKey('y');
  ok('...and when it closes the scene gets the keyboard back', yes === 1 && activeKeyTrap() === null);
  top.close();
  ok('closing twice is harmless', activeKeyTrap() === null);
  const a = openDialog({ label: 'A' }), b2 = openDialog({ label: 'B' });
  a.close();
  ok('out-of-order close keeps the newest dialog in charge', activeKeyTrap() !== null);
  b2.close();
  ok('...and all closed = released', activeKeyTrap() === null);
  const srcs = ['confirmPrompt', 'updatePrompt', 'namePrompt', 'changelog'].map((f) => readFileSync(`src/ui/${f}.js`, 'utf8'));
  ok('the dialogs all use openDialog', srcs.every((x) => x.includes('openDialog(') && !x.includes('setKeyTrap')));
  globalThis.document.body = realBody;
}

// T64: 0.102 — Descend with XP / coins still to spend asks first; the
// default answer is to stay. Nothing to spend: straight down.
{
  const realBody = globalThis.document.body;
  const body = new El('body');
  globalThis.document.body = body;
  const dialog = () => body.children.find((c) => c.className === 'update-overlay');
  resetProfile();
  show(hubScene());
  await sleep(1100);
  handleKey('d');
  await sleep(1300);
  ok('nothing to spend: Descend goes straight down', !dialog() && t().includes('Room 1'));
  resetProfile();
  getProfile().xp = 5000; getProfile().coins = 12345;
  show(hubScene());
  await sleep(1100);
  handleKey('d');
  const d = dialog();
  ok('unspent XP / coins: Descend asks first', !!d && d.textContent.includes('5,000 XP and 12,345 Coins') && d.textContent.includes('Are you sure') && t().includes('GREAT HALL'));
  ok('the hall\'s hotkeys are held while it asks', (handleKey('b'), !!dialog()) && t().includes('GREAT HALL'));
  handleKey('escape');
  await sleep(1300);
  ok('Esc / Stay and Spend keeps you in the Great Hall', !dialog() && t().includes('GREAT HALL'));
  handleKey('d');
  handleKey('y');
  await sleep(1300);
  ok('Descend Anyway goes down', !dialog() && t().includes('Room 1'));
  globalThis.document.body = realBody;
  resetProfile();
}

// T71: 0.109 — "Enter your name": asked while the save has none — on the
// way in, when Enter the Castle is pressed (0.00200; it used to open over
// the title before the player had seen anything) — kept clean and short,
// kept through a progress wipe, changeable from the title, sent with the stats.
{
  const realBody = globalThis.document.body;
  const body = new El('body');
  globalThis.document.body = body;
  const dialog = () => body.children.find((c) => c.className === 'update-overlay name-overlay');
  const prof = await import('../../src/meta/names.js');
  ok('names: trimmed, spaces collapsed, no control characters, 20 max', prof.cleanName('  Sir\tLancelot \u0007 of   the   Lake and more ') === 'Sir Lancelot of the'
    && prof.cleanName(null) === '');
  resetProfile();
  getProfile().name = '';
  show(titleScene());
  await sleep(1100);
  ok('the title shows first, no prompt over it', !dialog() && t().includes('CASTLE OF THE CRIMSON MOON'));
  handleKey('e');
  await sleep(100);
  const d = dialog();
  ok('an unnamed player is asked their name on Enter the Castle, and stays on the title until named', !!d && d.textContent.includes('Enter Your Name') && !t().includes('GREAT HALL'));
  handleKey('e');
  await sleep(1300);
  ok('the title\'s hotkeys wait while it asks', !!dialog() && t().includes('CASTLE OF THE CRIMSON MOON') && !t().includes('GREAT HALL'));
  handleKey('escape');
  ok('a first name can\'t be skipped with Esc', !!dialog());
  const input = d.all((n) => n.tagName === 'input')[0];
  const btn = d.all((n) => n.tagName === 'button')[0];
  input.value = '   ';
  btn.listeners.click[0]();
  ok('a blank name is not accepted', !!dialog() && getProfile().name === '');
  input.value = '  Lady   Morgana  ';
  btn.listeners.click[0]();
  ok('the name is saved (cleaned) and the dialog closes', !dialog() && getProfile().name === 'Lady Morgana'
    && JSON.parse(localStorage.getItem('castle-roguelike-profile-v1')).name === 'Lady Morgana');
  await sleep(1300);
  ok('and the way in continues: the Great Hall, its Descend pulsing (nothing to spend yet)', t().includes('GREAT HALL')
    && registry.app.all((n) => n.tagName === 'button' && n.attrs['data-key'] === 'd').some((b) => b.className.includes('active')));
  show(titleScene());
  await sleep(1100);
  ok('the title greets the player by name', t().includes('Playing as Lady Morgana') && t().includes('Morgana'));
  resetProfile();
  ok('a progress wipe keeps the name (same person)', getProfile().name === 'Lady Morgana');
  show(titleScene());
  await sleep(1100);
  handleKey('e');
  await sleep(100);
  ok('a named player is not asked again', !dialog());
  await sleep(1300);
  show(titleScene());
  await sleep(1100);
  const change = registry.app.all((n) => n.tagName === 'button' && n.className === 'link-btn')[0];
  change.listeners.click[0]();
  ok('"change" reopens it, and Esc cancels a change', !!dialog() && dialog().textContent.includes('Change Your Name') && (handleKey('escape'), !dialog()) && getProfile().name === 'Lady Morgana');
  globalThis.document.body = realBody;
  const st = await import('../../analytics/stats.js');
  ok('dashboard keeps a player\'s name (cleaned, short)', st.sanitizeProfile({ name: 'Morgana\u0000<b>x</b> the very very long-named' }).name.length <= 24
    && st.sanitizeProfile({ name: 'Ann' }).name === 'Ann' && st.sanitizeProfile({}).name === '');
  ok('dashboard labels collected players by their name', readFileSync('analytics/dashboard.js', 'utf8').includes("profile.name || `Player ${id.slice(0, 4).toUpperCase()}`"));
  getProfile().name = 'Tester';
}

// T74: 0.111 — the name field: caps centred from the font's measured
// metrics. 0.129: a tall line box (room above Å / Ö, whose marks the
// normal one clipped) and a whole-field repaint on every edit (the macOS
// specks: the caps' tops sit exactly on the font's ascent line).
{
  const np = readFileSync('src/ui/namePrompt.js', 'utf8');
  ok('name field: tall line box, caps centred from measured font metrics', /\.name-input \{[^}]*line-height: 1\.5;/.test(readFileSync('styles.css', 'utf8'))
    && np.includes('const low = (asc - desc - cap) / 2;') && np.includes('setTimeout(() => { centerCaps(input);'));
  const { namePrompt } = await import('../../src/ui/namePrompt.js');
  const realBody = globalThis.document.body;
  globalThis.document.body = new El('body');
  const { input, close } = namePrompt();
  const bgs = [];
  for (let i = 0; i < 3; i++) { input.listeners.input[0](); bgs.push(input.style.backgroundColor); }
  ok('every edit repaints the whole name field (background flips imperceptibly)', bgs[0] === 'rgba(0, 0, 0, 0.556)' && bgs[1] === '' && bgs[2] === bgs[0]);
  close();
  globalThis.document.body = realBody;
  const { centerCaps } = await import('../../src/ui/namePrompt.js');
  ok('centerCaps is a safe no-op without a real layout engine', centerCaps(new El('input')) === 0);
}

// T82: 0.117 — scenes switch by name through the router and never import
// each other; scene.js's DOM builder and hotkeys live in their own modules.
{
  const { go, registerScene, currentScene } = await import('../../src/core/scene.js');
  const files = ['titleScene', 'hubScene', 'dungeonScene', 'runEndScene'].map((n) => readFileSync(`src/ui/scenes/${n}.js`, 'utf8'));
  ok('no scene imports another scene', files.every((s) => !/from '\.\/\w+Scene\.js'/.test(s)));
  let made = 0;
  registerScene('probe', (x) => { made = x; return { probe: true, enter(root) { root.append('PROBE'); } }; });
  go('probe', 7);
  await sleep(1100);
  ok('go(name, ...args) builds and shows the registered scene', made === 7 && currentScene().probe && t().includes('PROBE'));
  let threw = false;
  try { go('nope'); } catch { threw = true; }
  ok('an unknown scene name fails loudly', threw);
  ok('scene.js no longer builds DOM or handles keys', !/export function (el|handleKey)\(/.test(readFileSync('src/core/scene.js', 'utf8'))
    && readFileSync('src/core/dom.js', 'utf8').includes('export function el(') && readFileSync('src/core/hotkeys.js', 'utf8').includes('export function handleKey('));
  go('title');
  await sleep(1100);
}

// T85: 0.124 — Space is "proceed further" on every screen, each showing
// [space] under its way forward: title -> Great Hall -> dungeon, and the
// run end back to the hall; the death and victory dialogs too.
{
  const { showDeathModal } = await import('../../src/ui/deathModal.js');
  const { showVictoryModal } = await import('../../src/ui/victoryModal.js');
  const { runEndScene } = await import('../../src/ui/scenes/runEndScene.js');
  fresh();
  show(titleScene());
  await sleep(1100);
  ok('title: [space] under Enter the Castle', /Enter the Castle\s*\[space\]/i.test(t()));
  handleKey(' ');
  await sleep(1300);
  ok('Space enters the Great Hall', t().includes('GREAT HALL') && /Descend into the Dungeon\s*\[space\]/i.test(t()));
  handleKey(' ');
  await sleep(1300);
  ok('Space descends into the dungeon', t().includes('Room 1'));
  let accepted = 0;
  const ov = showDeathModal({ roomNumber: 4 }, () => { accepted++; });
  ok('death dialog: [space] under Accept Your Fate', ov.el.textContent.includes('[space]'));
  handleKey(' ');
  ok('Space accepts your fate', accepted === 1);
  const r = createRun(); r.roomNumber = 4;
  show(runEndScene(r, 'retreat'));
  await sleep(1300);
  ok('run end: [space] under Return to the Great Hall', /Return to the Great Hall\s*\[space\]/i.test(t()));
  handleKey(' ');
  await sleep(1300);
  ok('Space returns to the Great Hall', t().includes('GREAT HALL'));
  const realBody = globalThis.document.body;
  globalThis.document.body = new El('body');
  const dlg = showVictoryModal({ roomNumber: 24 });
  ok('victory dialog: [space] under Onward', dlg.el.textContent.includes('[space]'));
  handleKey(' ');
  ok('Space closes the victory dialog', !dlg.isOpen());
  globalThis.document.body = realBody;
  const hk = readFileSync('src/core/hotkeys.js', 'utf8');
  ok('a held Space (auto-repeat) steps only once', hk.includes("if (e.repeat && e.key === ' ')"));
}

// T86: 0.125 — phones get the "not supported yet" notice instead of the
// game; tablets play, sideways (0.00205); ?desktop skips the check.
{
  const { isMobile, deviceClass, isPhone, TABLET_MIN_PX } = await import('../../src/shared/platform.js');
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', maxTouchPoints: 5 };
  const android = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' };
  const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', maxTouchPoints: 5 };
  const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', maxTouchPoints: 0 };
  const win = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', maxTouchPoints: 10 };
  const hinted = { userAgent: 'Mozilla/5.0 (Linux) Chrome/120', userAgentData: { mobile: true } };
  ok('phones, tablets and iPadOS count as handhelds', [iphone, android, ipad, hinted].every((n) => isMobile(n, '')));
  ok('desktops (a touch-screen Windows laptop too) do not', !isMobile(mac, '') && !isMobile(win, ''));
  ok('?desktop skips the check', !isMobile(iphone, '?desktop'));
  // 0.00205: the screen's longer side tells a phone from a tablet
  ok('a phone screen is a phone, a tablet screen a tablet, a desktop a desktop', deviceClass(iphone, { width: 390, height: 844 }, '') === 'phone'
    && deviceClass(android, { width: 412, height: 915 }, '') === 'phone' && deviceClass(ipad, { width: 1024, height: 1366 }, '') === 'tablet'
    && deviceClass(android, { width: 800, height: 1280 }, '') === 'tablet' && deviceClass(mac, { width: 1440, height: 900 }, '') === 'desktop'
    && deviceClass(iphone, { width: 390, height: 844 }, '?desktop') === 'desktop' && TABLET_MIN_PX === 1000 && isPhone(iphone, { width: 390, height: 844 }, '') && !isPhone(ipad, { width: 1024, height: 1366 }, ''));
  const m = readFileSync('src/main.js', 'utf8');
  // 0.00208: phones play — the gate before the title instead of the old notice (0.00209: the narrator armed and the audio resumed on its tap)
  ok('boot mounts the rotate notice for a handheld held upright, and the play / install gate on a phone', !m.includes('Phones are not supported yet')
    && m.includes("el('div', { class: 'rotate-notice' }") && /if \(isPhone\(\)\) \{[\s\S]*armOnGesture\('title_welcome'\)[\s\S]*await phoneGate\(\{ onPlay[\s\S]*regateOnExit\(\);\s*\}\s*go\('title'\)/.test(m));
  const css = readFileSync('styles.css', 'utf8');
  ok('touch: no double-tap zoom, no image callout, 44px targets and no hotkey hints on a coarse pointer, hover styles only where hover exists, a rotate notice in portrait',
    css.includes('html { touch-action: manipulation; }') && css.includes('img { -webkit-touch-callout: none; }') && css.includes('@media (pointer: coarse) {') && css.includes('min-height: 44px;')
    && css.includes('@media (hover: hover) { button:hover:not(:disabled) {') && css.includes('@media (pointer: coarse) and (orientation: portrait) { .rotate-notice { display: flex; } }'));
  // the home-screen app (0.00205): a manifest the page links, its icons on disk, the Apple metas
  const html = readFileSync('index.html', 'utf8'), man = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  ok('a web app manifest: fullscreen, landscape, icons on disk, linked with the Apple metas and a cover-fit viewport',
    man.display === 'fullscreen' && man.orientation === 'landscape' && man.icons.length >= 2 && man.icons.every((i) => { try { return statSync(i.src).isFile(); } catch { return false; } })
    && html.includes('<link rel="manifest" href="manifest.webmanifest">') && html.includes('apple-mobile-web-app-capable') && html.includes('viewport-fit=cover'));
  // the device line (0.00205): an iPad reads as iPadOS, not macOS
  const { osOf } = await import('../../src/core/perfMonitor.js');
  ok('the device line tells iPadOS (a Macintosh with touch), iOS and Android from macOS', osOf(ipad.userAgent, true) === 'iPadOS' && osOf(mac.userAgent, false) === 'macOS'
    && osOf(iphone.userAgent, true) === 'iOS' && osOf(android.userAgent, true) === 'Android' && osOf(win.userAgent, true) === 'Windows');
}

// 0.154 — transitions strictly in order (the developer's call): the windows fade
// out fully before the background changes, and come back only once the new
// painting has fully faded in (keys ignored meanwhile); no background change,
// no wait; a painting that never arrives holds them 4s at most
{
  const { onBackgroundChange, isTransitioning } = await import('../../src/core/scene.js');
  let faded = false;
  onBackgroundChange(() => new Promise((r) => setTimeout(() => { faded = true; r(); }, 2000)));
  let swappedAt = null;
  const t0 = Date.now();
  transitionTo(() => { swappedAt = Date.now() - t0; setBackground('dungeon_bell_tower.jpg'); });
  await sleep(1500);
  const held = registry.app.classList.contains('hidden') && isTransitioning() && !faded;
  await sleep(1600);
  ok('transition: the background changes only after the windows are out, and they return only once the painting is fully in',
    swappedAt >= 1000 && held && faded && !registry.app.classList.contains('hidden') && !isTransitioning(), `${swappedAt} ${held} ${faded}`);
  transitionTo(() => {});
  await sleep(1050);
  ok('transition: no background change, no wait', !registry.app.classList.contains('hidden') && !isTransitioning());
  onBackgroundChange(() => new Promise(() => {})); // (a painting that never loads)
  transitionTo(() => setBackground('dungeon_cistern.jpg'));
  await sleep(1000 + 3900);
  const stillHeld = registry.app.classList.contains('hidden');
  await sleep(200);
  ok('transition: a painting that never arrives holds the windows 4s at most', stillHeld && !registry.app.classList.contains('hidden') && !isTransitioning());
  onBackgroundChange(() => undefined);
}

// T90: 0.00208 — phones play. The phone layout is <html class="phone">, set
// by the boot from the one query (platform.js PHONE_MQ) and re-rendering the
// hall when it flips; the Great Hall's phone assembly is a stats strip,
// three stacked sheets under their tabs (the pick lifts one and lasts a
// re-render; a dot per sheet by what IT sells), the records line and the way
// on; the short wording carries the data's numbers; the play / install gate
// is a dialog that resolves on PLAY and skips a home-screen app.
{
  const { PHONE_MQ, phoneLayout, standaloneApp, isIos, fullscreenOn } = await import('../../src/shared/platform.js');
  const { statDesc, alchemyDesc, potionDesc, potionCount, satchelDesc, recordsLine } = await import('../../src/ui/hubText.js');
  const { phoneGate } = await import('../../src/ui/phoneGate.js');
  const { anyDialogOpen } = await import('../../src/ui/dialog.js');
  const { canSpendAlchemy, canForgeAny, canSpendCoins } = await import('../../src/ui/scenes/hubScene.js');
  const { forgeCost, alchemyCost, ALCHEMY_DEFS } = await import('../../src/meta/leveling.js');
  const css = readFileSync('styles.css', 'utf8'), m = readFileSync('src/main.js', 'utf8');
  // 0.00223: the watcher lives in platform.js with the query and the document injectable — run it
  const { watchPhoneLayout } = await import('../../src/shared/platform.js');
  const flips = [];
  const classes = new Set();
  const fakeDoc = { documentElement: { classList: { toggle: (c, on) => { on ? classes.add(c) : classes.delete(c); } } } };
  let mq = null;
  const fakeMm = (q) => (mq = { matches: q === PHONE_MQ, listeners: [], addEventListener(t, fn) { this.listeners.push(fn); } });
  watchPhoneLayout(() => flips.push(1), fakeMm, fakeDoc);
  const wasPhone = classes.has('phone');
  mq.matches = false; mq.listeners.forEach((fn) => fn());
  ok('the boot sets html.phone from the platform query and re-lays the scene out when it flips; the layer\'s rules are html.phone twins',
    wasPhone && !classes.has('phone') && flips.length === 1 && m.includes('watchPhoneLayout(() => currentScene()?.relayout?.(app))') && css.includes('html.phone #app > .panel {') && css.includes('html.phone .battle-line {')
    && !phoneLayout(undefined) && phoneLayout((q) => ({ matches: q === PHONE_MQ })) && !phoneLayout((q) => ({ matches: q !== PHONE_MQ })));
  ok('a home-screen app is standalone by display-mode or Safari\'s flag; iOS and fullscreen read the right fields', standaloneApp((q) => ({ matches: q === '(display-mode: standalone)' }), {}) && standaloneApp(undefined, { standalone: true })
    && !standaloneApp((q) => ({ matches: false }), {}) && isIos({ userAgent: 'iPhone' }) && isIos({ userAgent: 'Macintosh', maxTouchPoints: 5 }) && !isIos({ userAgent: 'Android' }) && !fullscreenOn({}) && fullscreenOn({ webkitFullscreenElement: {} }));
  const pl = DATA.difficulty.player, tr = DATA.difficulty.alchemyTracks;
  ok('the short wording carries the data\'s numbers', statDesc('power', 0, true) === `+${pl.dmgPerPower} dmg / lv` && statDesc('vitality', 0, true) === `+${pl.hpPerVitality} hp / lv`
    && statDesc('endurance', 0, true) === `+${pl.armorPerEndurance} armor / lv` && /^\+[\d.]+% crit, \+[\d.]+% crit dmg$/.test(statDesc('precision', 0, true)) && statDesc('fortune', 0, true) === 'better loot'
    && alchemyDesc('potency', true) === `+${tr.potency.healPerLevel} heal / lv (now ${DATA.difficulty.potionHeal})` && alchemyDesc('infusion', true) === `potion armor +0 (+${tr.infusion.armorPerLevel} / lv)`
    && alchemyDesc('infusion').includes(`+${tr.infusion.armorPerLevel} / level`) // (the long line carries it too, 0.00209)
    && /^potion not spent: 0% \(\+[\d.]+%\)$/.test(alchemyDesc('efficiency', true)) && potionDesc({ potions: 2, potionCap: 4 }, true) === 'price climbs per buy' && potionCount({ potions: 2, potionCap: 4 }) === '2/4'
    && satchelDesc({ potionCap: 4 }, false, true) === '+1 capacity (now 4)' && satchelDesc({ potionCap: 6 }, true, true) === 'carries 6 (max)'
    && statDesc('power', 0) === `+${pl.dmgPerPower} damage / level` && recordsLine({ records: { runs: 3, kills: 15, bestRoom: 6 } }) === '3 runs, 15 kills, deepest room 6.');
  // coins buy in two places: the dots follow each (0.00209)
  fresh();
  const forge = getProfile(); forge.equipment.weapon = 'knights_blade'; forge.potions = forge.potionCap; forge.coins = forgeCost('knights_blade');
  ok('a forge price in the purse dots Equipment, and Alchemy only if a track is that cheap', canForgeAny(forge) && canSpendCoins(forge) && canSpendAlchemy(forge) === Object.keys(ALCHEMY_DEFS).some((t) => forge.coins >= alchemyCost(t)));
  // the hub, under the phone query
  fresh();
  const prof = getProfile(); prof.coins = 95; prof.xp = 40;
  const mmBefore = globalThis.matchMedia; globalThis.matchMedia = (q) => ({ matches: q === PHONE_MQ });
  try {
    const scene = hubScene(); scene.enter(registry.app);
    const hub = registry.app.all((n) => /\bphone-hub\b/.test(n.className ?? ''))[0];
    const tabs = hub && hub.all((n) => n.className?.startsWith('tabs'))[0];
    const body = hub && hub.all((n) => n.className?.startsWith('tab-body'))[0];
    ok('the phone hall: a head with the stats, three tabs, three sheets, a foot with the records and the way on', hub && tabs && body && tabs.children.length === 3 && body.children.length === 3
      && tabs.children.map((b) => b.textContent).join('|') === 'Train|Alchemy|Equipment' && hub.all((n) => /\brecords-line\b/.test(n.className ?? '')).length === 1
      && hub.all((n) => n.tagName === 'button' && /Descend/.test(n.textContent)).length === 1 && hub.all((n) => /\bhub-stats\b/.test(n.className ?? '')).length === 1 && typeof scene.relayout === 'function');
    ok('the first sheet is up; the tabs with something to buy carry the dot (XP for Train, a potion for Alchemy, nothing to forge)', tabs.children[0].classList.contains('on') && body.children[0].classList.contains('on') && body.className === 'tab-body pick-1'
      && tabs.children[0].classList.contains('spend') && tabs.children[1].classList.contains('spend') && !tabs.children[2].classList.contains('spend'));
    tabs.children[2].listeners.click[0]();
    ok('a tab lifts its sheet and the stacking order follows', tabs.children[2].classList.contains('on') && body.children[2].classList.contains('on') && !body.children[0].classList.contains('on') && body.className === 'tab-body pick-3');
    hubScene().enter(registry.app); // a purchase re-renders: the pick stays
    const tabs2 = registry.app.all((n) => n.className?.startsWith('tabs'))[0];
    ok('the pick lasts a re-render', tabs2.children[2].classList.contains('on'));
    globalThis.matchMedia = (q) => ({ matches: false }); scene.relayout(registry.app); // the query flipped back: the desktop assembly
    ok('relayout swaps the assembly when the query flips', !registry.app.all((n) => /\bphone-hub\b/.test(n.className ?? '')).length && registry.app.all((n) => /\bhub-wrap\b/.test(n.className ?? '')).length === 1);
    globalThis.matchMedia = (q) => ({ matches: q === PHONE_MQ }); scene.relayout(registry.app);
    tabs2.children[0].listeners.click[0]?.(); // (the old tabs: no effect; leave the first sheet up for the next test)
    const row = registry.app.all((n) => /\bitem-row\b/.test(n.className ?? ''))[0];
    ok('the sheets carry the short wording', row && row.textContent.includes('dmg / lv'));
  } finally { globalThis.matchMedia = mmBefore; }
  fresh();
  // the gate: a dialog; PLAY resolves and runs onPlay; a home-screen app gets no card
  let played = 0;
  const doc = { fullscreenEnabled: false, documentElement: {}, addEventListener() {} };
  const p1 = phoneGate({ onPlay: () => played++, doc, nav: { userAgent: 'iPhone', maxTouchPoints: 5 } });
  const gate = registry.body.children.find((n) => /\bphone-gate\b/.test(n.className ?? ''));
  const playBtn = gate && gate.all((n) => n.tagName === 'button' && /^Play/.test(n.textContent))[0]; // (proceed: true adds the [space] hint to the label)
  ok('the gate: a dialog (key trap, anyDialogOpen) with PLAY and the iPhone\'s way to the full screen', gate && anyDialogOpen() && playBtn && gate.textContent.includes('Add to Home Screen') && !gate.textContent.includes('aA'));
  playBtn.listeners.click[0]();
  ok('PLAY runs onPlay and takes the card away', (await p1) === true && played === 1 && !anyDialogOpen() && !registry.body.children.some((n) => /\bphone-gate\b/.test(n.className ?? '')));
  ok('a home-screen app gets no card', (await phoneGate({ onPlay: () => played++, doc, nav: { standalone: true, userAgent: 'iPhone' } })) === false && played === 2 && !anyDialogOpen());
  fresh();
}

// T91: 0.00209 — Export / Import Save are dialogs (the title used to expand a
// textarea at its foot, under a phone's keyboard): Export shows the code
// and closes on Done; Import loads a pasted code or says it is not one.
{
  const { anyDialogOpen, closeAllDialogs } = await import('../../src/ui/dialog.js');
  const { exportSave } = await import('../../src/meta/profile.js');
  fresh();
  getProfile().coins = 4242; getProfile().name = 'Tester';
  titleScene().enter(registry.app);
  const btn = (re) => registry.app.all((n) => n.tagName === 'button' && re.test(n.textContent))[0];
  btn(/Export Save/).listeners.click[0]();
  const dlg = registry.body.children.find((n) => /update-overlay/.test(n.className ?? ''));
  const ta = dlg && dlg.all((n) => n.tagName === 'textarea')[0];
  ok('Export Save opens a dialog holding the save code', anyDialogOpen() && ta && ta.textContent === exportSave() && /save-code/.test(ta.className));
  dlg.all((n) => n.tagName === 'button' && /^Done/.test(n.textContent))[0].listeners.click[0]();
  ok('...Done closes it', !anyDialogOpen());
  const code = exportSave();
  resetProfile(); getProfile().name = 'Tester';
  titleScene().enter(registry.app);
  btn(/Import Save/).listeners.click[0]();
  const dlg2 = registry.body.children.find((n) => /update-overlay/.test(n.className ?? ''));
  const ta2 = dlg2.all((n) => n.tagName === 'textarea')[0];
  const load = dlg2.all((n) => n.tagName === 'button' && /Load Save/.test(n.textContent))[0];
  ta2.value = 'not a code'; load.listeners.click[0]();
  ok('Import Save: a bad code is refused in the dialog', anyDialogOpen() && dlg2.textContent.includes('valid save') && getProfile().coins !== 4242);
  ta2.value = code; load.listeners.click[0]();
  ok('...a good code loads and closes it', !anyDialogOpen() && getProfile().coins === 4242);
  // 0.00223: the save dialogs from the keyboard — Escape closes, Space is the way on (Done / Load Save)
  btn(/Export Save/).listeners.click[0]();
  ok('Export Save: Escape closes it', anyDialogOpen() && handleKey('escape') === true && !anyDialogOpen());
  btn(/Export Save/).listeners.click[0]();
  ok('...and Space (Done is the way on)', anyDialogOpen() && handleKey(' ') === true && !anyDialogOpen());
  resetProfile(); getProfile().name = 'Tester';
  titleScene().enter(registry.app);
  btn(/Import Save/).listeners.click[0]();
  const dlg3 = registry.body.children.find((n) => /update-overlay/.test(n.className ?? ''));
  dlg3.all((n) => n.tagName === 'textarea')[0].value = 'not a code';
  ok('Import Save: a bad value closes on Escape without loading', handleKey('escape') === true && !anyDialogOpen() && getProfile().coins !== 4242);
  btn(/Import Save/).listeners.click[0]();
  const dlg4 = registry.body.children.find((n) => /update-overlay/.test(n.className ?? ''));
  dlg4.all((n) => n.tagName === 'textarea')[0].value = code;
  ok('Import Save: Space loads a good code (Load Save is the way on)', handleKey(' ') === true && !anyDialogOpen() && getProfile().coins === 4242);
  closeAllDialogs(); fresh();
}

// A purchase makes the attribute it raised glow (0.00233): Power rolls Attack
// up with the pulse, Coins / XP (what was spent) and the untouched boxes stay put.
{
  fresh();
  await withAnimations(async () => {
    const p = getProfile(); p.name = 'Glow'; p.xp = 1e6; p.coins = 0;
    const scene = hubScene(); scene.enter(registry.app);
    const box = (label) => registry.app.all((n) => /\bstat-box\b/.test(n.className ?? '') && n.children[0]?.textContent === label)[0]?.children[1];
    const before = Number(box('Attack').textContent);
    registry.app.all((n) => n.tagName === 'button' && /^Train/.test(n.textContent))[0].listeners.click[0](); // Power
    const atk = box('Attack'), hp = box('HP'), xp = registry.app.all((n) => /\bpurse\b/.test(n.className ?? ''))[0]?.children[1];
    ok('training Power: Attack glows', atk.animations?.length === 1 && !hp.animations && xp && !xp.animations);
    await sleep(1000);
    ok('…and rolls up to its new value', Number(atk.textContent) === before + DATA.difficulty.player.dmgPerPower, `${before} → ${atk.textContent}`);
    scene.enter(registry.app); // re-entering the hall is not a purchase
    ok('entering the hall glows nothing', !box('Attack').animations);
  });
  fresh();
}
