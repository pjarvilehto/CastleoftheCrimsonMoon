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

const up2 = (a, b) => { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); return pa[0] > pb[0] || (pa[0] === pb[0] && pa[1] > pb[1]); };
// T76: 0.113 — CHANGELIST corner button: the full history (changelog.json,
// kept by bump.mjs) newest first in a dialog that owns the keyboard, and
// gives back the key trap of a dialog it was opened over.
{
  const cl = await import('../../src/ui/changelog.js');
  const { nextChangelog } = await import('../bump.mjs');
  const { pushKeyTrap, releaseKeyTrap, activeKeyTrap } = await import('../../src/core/scene.js');
  const full = JSON.parse(readFileSync('assets/data/changelog.json', 'utf8'));
  const b = JSON.parse(readFileSync('assets/data/build.json', 'utf8'));
  const vs = Object.keys(full);
  ok('changelog.json: every build back to 0.073, newest first, superset of build.json', vs[0] === b.version && vs.at(-1) === '0.073'
    && vs.every((v, i) => !i || up2(vs[i - 1], v)) && Object.keys(b.changelog).every((v) => JSON.stringify(full[v]) === JSON.stringify(b.changelog[v]))
    && vs.every((v) => Array.isArray(full[v]) && full[v].length > 0 && full[v].every((n) => typeof n === 'string' && n.length > 0)));
  const nc = nextChangelog({ '0.093': ['x'] }, '0.094', ['a']);
  ok('bump.mjs keeps the whole history', JSON.stringify(Object.keys(nc)) === '["0.094","0.093"]' && nextChangelog(nc, '0.095', []).hasOwnProperty('0.095') === false);
  ok('bump.mjs writes changelog.json', readFileSync('tools/bump.mjs', 'utf8').includes('writeFileSync(FULL, JSON.stringify(nextChangelog(full, version, notes)'));
  ok('CHANGELIST sits in the corner column, under VOLUME', /volumeToggle\(\),\s*changelogToggle\(\),/.test(readFileSync('src/main.js', 'utf8')));

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
  ok('the dialog lists every build, newest first, current one marked', !!dlg() && text.includes(`Build ${b.version} — this build`) && text.includes('Build 0.073')
    && text.indexOf(`Build ${b.version}`) < text.indexOf('Build 0.073') && text.includes(full['0.094'][0]));
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
  const { activeKeyTrap } = await import('../../src/core/scene.js');
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

// T71: 0.109 — "Enter your name": asked on the title screen while the
// save has none (the title's hotkeys wait), kept clean and short, kept
// through a progress wipe, changeable from the title, sent with the stats.
{
  const realBody = globalThis.document.body;
  const body = new El('body');
  globalThis.document.body = body;
  const dialog = () => body.children.find((c) => c.className === 'update-overlay name-overlay');
  const prof = await import('../../src/meta/profile.js');
  ok('names: trimmed, spaces collapsed, no control characters, 20 max', prof.cleanName('  Sir\tLancelot \u0007 of   the   Lake and more ') === 'Sir Lancelot of the'
    && prof.cleanName(null) === '');
  resetProfile();
  getProfile().name = '';
  show(titleScene());
  await sleep(1100);
  const d = dialog();
  ok('an unnamed player is asked their name on the title screen', !!d && d.textContent.includes('Enter Your Name'));
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
  ok('the title greets the player by name', t().includes('Playing as Lady Morgana') && t().includes('Morgana'));
  handleKey('e');
  await sleep(1300);
  ok('hotkeys work again once named', t().includes('GREAT HALL'));
  resetProfile();
  ok('a progress wipe keeps the name (same person)', getProfile().name === 'Lady Morgana');
  show(titleScene());
  await sleep(1100);
  ok('a named player is not asked again', !dialog());
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

// T74: 0.111 — the name field: glyphs inside their own line box (no caret
// repaint specks), caps centred from the font's measured metrics.
{
  const np = readFileSync('src/ui/namePrompt.js', 'utf8');
  ok('name field: normal line height, caps centred from measured font metrics', /\.name-input \{[^}]*line-height: normal;/.test(readFileSync('styles.css', 'utf8'))
    && np.includes('const low = (asc - desc - cap) / 2;') && np.includes('setTimeout(() => { centerCaps(input);'));
  const { centerCaps } = await import('../../src/ui/namePrompt.js');
  ok('centerCaps is a safe no-op without a real layout engine', centerCaps(new El('input')) === 0);
}
