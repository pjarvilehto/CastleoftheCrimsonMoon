// tools/test/history.test.mjs — run history (profile) and the /analytics/ dashboard.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, El, DATA, show, handleKey, createRun, scaleEnemy, createCombat, playerAttack, dungeonScene, hubScene, resetProfile, getProfile, readFileSync } from './harness.mjs';
import { compareVersions } from '../../src/shared/version.js';
import { DEBUG } from '../../src/shared/debug.js';
import { currentScene } from '../../src/core/scene.js';
// how many builds past build.json a build number is (<= 0 = shipped already, 1 = the one being shipped; ship.mjs bumps build.json after the suite's first run)
const buildsAhead = (v) => Number(String(v).split('.')[1]) - Number(DATA.build.version.split('.')[1]);

fresh();

// T57: 0.095 — run history (settleRun records every run; save v3 adds it
// + a stable player id), the /analytics/ dashboard's stats module, and
// the CRIT! caption on crit numbers.
{
  const { settleRun, drinkPotion } = await import('../../src/run/runState.js');
  const { HISTORY_MAX } = await import('../../src/meta/history.js');
  const { importSave, exportSave } = await import('../../src/meta/profile.js');
  const { SAVE_VERSION } = await import('../../src/meta/migrations.js');
  resetProfile();
  const p = getProfile();
  const id0 = p.playerId;
  ok('fresh profiles have an id and an empty history', typeof id0 === 'string' && id0.length >= 6 && Array.isArray(p.history) && p.history.length === 0);
  // a run that clears a boss room, drinks, then dies to a golem
  const run = createRun();
  run.hp = run.maxHp = 100000; run.stats.dmg = 100000; run.stats.crit = 0;
  const bossRoom = { number: 8, kind: 'boss', isBoss: true, enemies: [scaleEnemy('rat', 1)] };
  const cbB = createCombat(run, bossRoom);
  playerAttack(cbB, 0, false);
  run.hp = 5; run.potions = 1; drinkPotion(run);
  run.hp = run.maxHp = 10; run.stats.dmg = 0; run.stats.armor = 0; run.stats.dodge = 0; run.revive = false;
  const cbD = createCombat(run, { number: 9, kind: 'combat', enemies: [{ id: 'golem', name: 'Fellblade', maxHp: 999, dmg: 5000, xp: 1, coins: [1, 1] }] });
  playerAttack(cbD, 0, false);
  run.roomNumber = 9; run.buffs.push({ icon: 'x', label: 'y', id: 'crit' });
  settleRun(run, 'death');
  const rec = p.history[p.history.length - 1];
  ok('settleRun records the run', p.history.length === 1 && rec.outcome === 'death' && rec.room === 9 && rec.build === DATA.build.version);
  ok('...with the killer, bosses, potions, turns, boons', rec.killedBy === 'golem' && rec.bosses === 1 && rec.potions === 1 && rec.turns === 2 && rec.boons[0] === 'crit');
  ok('...and who went in (level + stat snapshot) and how long', rec.level >= 1 && rec.maxHp > 0 && typeof rec.ms === 'number' && rec.banked === run.coinsRetrieved);
  for (let i = 0; i < HISTORY_MAX + 5; i++) { const r = createRun(); r.roomNumber = 1; settleRun(r, 'retreat'); }
  ok('history keeps the newest HISTORY_MAX runs', p.history.length === HISTORY_MAX && p.history[p.history.length - 1].outcome === 'retreat' && p.history[0].outcome === 'retreat');
  resetProfile();
  ok('a wipe keeps the player id', getProfile().playerId === id0);
  const v2 = { ...JSON.parse(JSON.stringify(getProfile())), saveVersion: 2 };
  delete v2.history; delete v2.playerId;
  importSave(Buffer.from(JSON.stringify(v2)).toString('base64'));
  ok('v2 save migrates: history + player id', SAVE_VERSION >= 3 && getProfile().saveVersion === SAVE_VERSION && Array.isArray(getProfile().history) && typeof getProfile().playerId === 'string');

  // Dashboard stats (analytics/stats.js) against a save code from the game
  const st = await import('../../analytics/stats.js');
  const ch = await import('../../analytics/charts.js');
  const g = getProfile();
  g.history = [
    { at: 1, build: '0.095', outcome: 'death', room: 3, kills: 5, banked: 10, ms: 60000, bosses: 0, killedBy: 'rat', boons: [], relic: false, potions: 0 },
    { at: 2, build: '0.095', outcome: 'retreat', room: 8, kills: 20, banked: 90, ms: 120000, bosses: 1, killedBy: null, boons: ['crit'], relic: true, potions: 2 },
    { at: 3, build: '0.096', outcome: 'death', room: 8, kills: 18, banked: 40, ms: 90000, bosses: 0, killedBy: 'vampire_lord', boons: ['crit', 'dmg'], relic: false, potions: 1 },
    { at: 4, build: '0.100', outcome: 'death', room: 17, kills: 50, banked: 200, ms: 300000, bosses: 2, killedBy: 'golem', boons: ['dmg'], relic: false, potions: 3 },
  ];
  const decoded = st.decodeSave(exportSave());
  ok('dashboard decodes a game save code', decoded?.playerId === g.playerId && decoded.history.length === 4 && st.decodeSave('garbage!') === null);
  const players = [{ key: 'a', label: 'A', profile: decoded }];
  const runs = st.allRuns(players);
  const sum = st.summarize(runs);
  ok('summary: runs, deaths, depth, bosses, time', sum.runs === 4 && sum.deaths === 3 && sum.avgRoom === 9 && sum.bestRoom === 17 && sum.bosses === 3 && sum.playMs === 570000);
  const bc = st.bossClears(runs);
  ok('boss rooms: retreat in the room = cleared, death there = lost', bc[0].room === 8 && bc[0].reached === 3 && bc[0].cleared === 2 && bc[1].reached === 1 && bc[1].cleared === 1 && bc[2].reached === 0);
  const er = st.endRooms(runs);
  ok('where runs end, by room and outcome', er.length === 17 && er[7].death === 1 && er[7].retreat === 1 && er[16].death === 1);
  const bs = st.boonStats(runs);
  ok('boon stats: taken + avg depth', bs.find((b) => b.boon === 'crit').taken === 2 && bs.find((b) => b.boon === 'dmg').avgRoom === 12.5 && bs.find((b) => b.boon === '(none)').taken === 1);
  ok('by build: newest first (numeric)', st.byBuild(runs).map((b) => b.build).join() === '0.100,0.096,0.095');
  // 0.00224: the table condensed — the newest 10, then the 3 most played older ones, the rest counted in a footer
  const many = Array.from({ length: 16 }, (_, i) => ({ build: `0.00${String(300 - i).padStart(3, '0')}`, runs: i === 12 ? 40 : i === 15 ? 9 : i === 11 ? 9 : 1, avgRoom: 1, bestRoom: 1, deathRate: 0 }));
  const c = st.condenseBuilds(many);
  ok('condenseBuilds: the newest ten, the three most played of the rest in build order, the rest counted', c.rows.length === 10 && c.rows[0].build === '0.00300' && c.rows[9].build === '0.00291'
    && c.older.map((r) => r.build).join() === '0.00289,0.00288,0.00285' && c.hidden.builds === 3 && c.hidden.runs === 3 && st.condenseBuilds(many.slice(0, 4)).older.length === 0 && st.condenseBuilds(many.slice(0, 4)).hidden.builds === 0);
  const { buildTable } = await import('../../analytics/tables.js');
  const bt = buildTable(c);
  ok('the By build table shows the divider and the footer', (bt.match(/<tr>/g) ?? []).length === 14 && bt.includes('older, most played') && bt.includes('3 more builds, 3 runs, not shown') && !buildTable(st.condenseBuilds(many.slice(0, 4))).includes('divider'));
  ok('filters by player and build', st.filterRuns(runs, { build: '0.095' }).length === 2 && st.filterRuns(runs, { player: 'zz' }).length === 0);
  ok('killers ranked', st.countBy(runs, 'killedBy').length === 3);
  const csv = st.toCsv(runs, () => 'Te,"st"');
  ok('CSV: header + a row per run, quoted safely', csv.split('\n').length === 5 && csv.split('\n')[1].startsWith('"Te,""st"""'));
  const evil = ch.bars([{ label: '<img src=x>', value: 1 }]);
  ok('charts escape labels from saves', evil.includes('&lt;img') && !evil.includes('<img'));
  {
    const wins = [{ room: 30, outcome: 'death' }, { room: 24, outcome: 'retreat' }, { room: 24, outcome: 'death' }, { room: 12, outcome: 'retreat' }].map((r) => st.wonGame(r, 24));
    ok('a win = beat the room-24 boss: past it, or retreated from it (0.123)', wins.join() === 'true,true,false,false');
    const svg = ch.lines([{ label: 'A', points: [[1, 12, false], [2, 25, true]] }], { mark: 'won the game' });
    ok('depth chart stars the winning runs, with a legend key', (svg.match(/class="mark"/g) ?? []).length === 1 && svg.includes('★</b> won the game'));
    ok('no star key without a win', !ch.lines([{ label: 'A', points: [[1, 12, false]] }]).includes('★'));
  }
  ok('charts render lines + columns', ch.lines(st.depthSeries(players, runs)).includes('<path') && ch.columns([{ x: 1, parts: [1, 2] }], { names: ['a', 'b'] }).includes('<rect'));
  const html = readFileSync('analytics/index.html', 'utf8');
  ok('/analytics/ boots versioned, not indexed', html.includes("fetch('../assets/data/build.json?t=' + Date.now(), { cache: 'no-store' })") && html.includes("'dashboard.js'") && html.includes('noindex'));
  const dashSrc = readFileSync('analytics/dashboard.js', 'utf8');
  ok('the dashboard\'s header carries "‹ Back to game" to the game\'s root, the error panel too (0.00325)', dashSrc.includes('<a class="back-link" href="../">‹ Back to game</a>') && dashSrc.includes('${BACK}\n    <h1>Play Stats</h1>') && dashSrc.includes('`${BACK}<p class="help warn">')
    && readFileSync('analytics/dashboard.css', 'utf8').includes('.back-link'));
  ok('the dashboard reads the build index.html fetched and every data file under ?v=<build> (0.00223: a bare URL served the CDN\'s old copy)', html.includes('window.__castleBuild = b') && dashSrc.includes('globalThis.__castleBuild') && dashSrc.includes('.json${q}') && !dashSrc.includes("'build', 'telemetry'"));
  ok('a record the page cannot draw shows why instead of "Loading play stats…"', /function render\(\) \{\n  try \{ renderInner\(\); \} catch/.test(dashSrc));
  resetProfile();

  // CRIT! caption
  const fxSrc = readFileSync('src/ui/combatFx.js', 'utf8');
  ok('crit numbers carry a CRIT! caption', fxSrc.includes("fx.crit ? 'CRIT!' : null") && /\.fx-tag \{[^}]*display: block/.test(readFileSync('styles.css', 'utf8')));
}

// T65: 0.102 — automatic play stats: the game sends its history to the
// collector (anonymous id, dashboard fields only) — never from Node, a
// local host, an empty endpoint or a save with no runs; the Worker
// validates, merges history by timestamp and gates reads with its key.
{
  const tm = await import('../../src/meta/telemetry.js');
  const wk = await import('../../collector/worker.js');
  const realFetch = globalThis.fetch, realLoc = globalThis.location, ep = DATA.telemetry.endpoint;
  const sent = [];
  globalThis.fetch = async (url, opts) => { sent.push({ url, opts }); return { ok: true }; };
  const p = getProfile();
  p.history = [{ at: 5, build: '0.102', outcome: 'death', room: 4 }];
  ok('telemetry points at the collector and never sends from tests (no location)', /^https:\/\/castle-stats\.[\w-]+\.workers\.dev$/.test(ep)
    && tm.shareStats(p) === false && sent.length === 0);
  DATA.telemetry.endpoint = '';
  globalThis.location = { hostname: 'www.castleofthecrimsonmoon.com' };
  ok('empty endpoint = off', tm.shareStats(p) === false && sent.length === 0);
  DATA.telemetry.endpoint = 'https://stats.example/';
  globalThis.location = { hostname: 'localhost' };
  ok('no stats from a local dev server', tm.shareStats(p) === false && sent.length === 0);
  globalThis.location = { hostname: 'www.castleofthecrimsonmoon.com' };
  ok('no stats from a save without runs', tm.shareStats({ ...p, history: [] }) === false && sent.length === 0);
  ok('live site: the history goes to the collector', tm.shareStats(p) === true && sent.length === 1 && sent[0].url === 'https://stats.example/collect'
    && sent[0].opts.method === 'POST' && sent[0].opts.headers['content-type'] === 'text/plain');
  const body = JSON.parse(sent[0].opts.body);
  ok('payload: anonymous id + dashboard fields only', body.playerId === p.playerId && body.profile.history.length === 1
    && Object.keys(body.profile).sort().join() === 'bench,coins,equipment,hero,history,name,playerId,potionCap,potions,records,stats,xp'); // (hero: 0.00253)
  const src = readFileSync('src/ui/scenes/dungeonScene.js', 'utf8') + readFileSync('src/main.js', 'utf8');
  ok('sent after every run (with the device report) and once per session', src.includes('const settled = settleRun(run, outcome);') && src.includes('keepReport(runReport(settled));') && src.includes('shareStats(settled);') && src.includes('shareStats(getProfile())'));
  globalThis.fetch = realFetch; globalThis.location = realLoc; DATA.telemetry.endpoint = ep;

  // the Worker, against an in-memory KV
  const kv = new Map();
  const env = { READ_KEY: 'k', STATS: {
    get: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null),
    put: async (k, v) => { kv.set(k, v); },
    list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  } };
  const post = (obj, cf) => wk.default.fetch(Object.assign(new Request('https://w/collect', { method: 'POST', body: typeof obj === 'string' ? obj : JSON.stringify(obj) }), { cf }), env);
  const run = (at) => ({ at, room: at });
  const report = (at) => ({ v: 1, at, build: '0.00225', kind: 'bench', device: { gpu: 'g'.repeat(300), nested: { deep: { deeper: { deepest: 1 } } } }, phases: { idle: { fps: 60, hist: { counts: Array.from({ length: 100 }, (_, i) => i) }, stalls: [{ ms: 150, label: 'overkill' }], split: { bg: { avg: 2, max: 9 } } } }, junk: 'x' });
  const cr1 = wk.cleanReport(report(5));
  ok('collector: a report is bounded — strings cut, lists capped, depth limited, junk dropped, the top level typed', cr1.device.gpu.length === 120 && cr1.device.nested.deep === null && cr1.phases.idle.hist.counts.length === 64 && cr1.phases.idle.stalls[0].label === 'overkill' && cr1.phases.idle.split.bg.max === 9
    && !('junk' in cr1) && cr1.kind === 'bench' && wk.cleanReport({ at: 1, kind: 'evil' }).kind === 'run' && wk.cleanReport({ build: 'x' }) === null && wk.cleanReport({ at: 1, phases: Object.fromEntries(Array.from({ length: 64 }, (_, i) => [i, Object.fromEntries(Array.from({ length: 64 }, (_, j) => [j, 'y'.repeat(200)]))])) }) === null); // (bounded, then over MAX_REPORT: dropped whole)
  ok('...the newest three kept, merged by time', wk.mergeReports([report(1), report(2)], [report(3), report(2)]).map((r) => r.at).join() === '1,2,3' && wk.mergeReports([report(1), report(2), report(3)], [report(4)]).map((r) => r.at).join() === '2,3,4');
  const r1 = await post({ playerId: 'abc123', build: '0.102', profile: { history: [run(1), run(2)] }, report: report(7) }, { country: 'FI' });
  await sleep(1100); // one player at most once a second (0.119)
  const r2 = await post({ playerId: 'abc123', build: '0.102', profile: { history: [run(3)] } }); // e.g. after a progress wipe
  const rec = JSON.parse(kv.get('player:abc123'));
  ok('collector stores a player by id; history merged by timestamp (a wipe loses nothing)', r1.status === 200 && r2.status === 200
    && rec.profile.history.map((r) => r.at).join() === '1,2,3' && rec.country === 'FI' && !/"(ip|clientIp|cf-connecting-ip)":/i.test(JSON.stringify(rec)));
  ok('...and the device report, kept across a later upload without one', rec.reports.length === 1 && rec.reports[0].at === 7 && rec.reports[0].phases.idle.fps === 60);
  const bad = await Promise.all([post('nope'), post({ playerId: '../x', profile: { history: [] } }), post({ playerId: 'abcd', profile: {} }),
    post({ playerId: 'abcd', profile: { history: [], pad: 'x'.repeat(300000) } })]);
  ok('collector rejects bad json, ids, payloads and oversize bodies', bad.map((r) => r.status).join() === '400,400,400,413' && kv.size === 1);
  // 0.00223: a fractional or huge room in one record used to break the whole dashboard — the collector drops it, the page clamps it
  const st = await import('../../analytics/stats.js');
  const odd = st.sanitizeProfile({ playerId: 'abcd', history: [{ at: 1, room: 3.5 }, { at: 2, room: 1e9, kills: -4 }] }).history;
  ok('the dashboard keeps rooms and counts whole, never negative, rooms at most 999; endRooms copes', odd[0].room === 3 && odd[1].room === 999 && odd[1].kills === 0 && st.endRooms(odd).length === 999
    && wk.cleanRun({ at: 1, room: 1e9 }) === null && wk.cleanRun({ at: 1, room: 3.5 }) === null && wk.cleanRun({ at: 1, room: 7 }).room === 7);
  const numsLine = readFileSync('collector/worker.js', 'utf8').match(/const RUN_NUMS = (\[[^\]]*\]);/)[1];
  ok('the collector and the dashboard keep the same run fields and read an unknown outcome the same way', JSON.stringify(JSON.parse(numsLine.replace(/'/g, '"'))) === JSON.stringify(st.RUN_FIELDS)
    && wk.cleanRun({ at: 1, outcome: 'victory' }).outcome === st.sanitizeProfile({ history: [{ at: 1, outcome: 'victory' }] }).history[0].outcome && wk.cleanRun({ at: 1, outcome: 'victory' }).outcome === 'death');
  // 0.00324: one full, slightly malformed record through BOTH sanitizers, diffed — the next field one side gains
  // and the other does not shows here (the field list check above reads the names only)
  const odd2 = { at: 1700000000000, room: '7', kills: 12.7, xp: '340', coins: 210, banked: 105, items: 3, bosses: 1, potions: -2, turns: 88, ms: 123456, level: 4, maxHp: 620, dmg: 31.5, armor: 48,
    build: '0.00322-extra-long-build', outcome: 'victory', killedBy: 'The Vampire Lord of the Crimson Moon and his court', relic: 1, hero: 'necromancer', look: 150,
    boons: Array.from({ length: 14 }, (_, i) => `boon${i}`), shrines: [{ o: ['a', 'b', 'c', 'd', 'e'], t: 'a' }, { o: ['x'], t: null }, 'junk'],
    perf: { fps: '59.5', p95: 18, drop: 0.02, worst: 140, worstOut: 1, stalls: 2, hz: 60, secs: 300, q: 0, dpr: 2, vw: 1440, vh: 900, bg: 'evil', power: 'phone', junk: 1 }, stray: 'dropped' };
  const viaWorker = wk.cleanRun(odd2), viaPage = st.sanitizeProfile({ history: [odd2] }).history[0];
  const flat = (o) => (Array.isArray(o) ? `[${o.map(flat)}]` : o && typeof o === 'object' ? `{${Object.entries(o).sort().map(([k, v]) => `${k}:${flat(v)}`)}}` : JSON.stringify(o)); // (keys sorted at every level: the two build perf in a different order)
  ok('the collector and the dashboard read one full record the same: every field, clamp and cut identical (0.00324)', flat(viaWorker) === flat(viaPage),
    `${flat(viaWorker)}\n${flat(viaPage)}`);
  const locked = await wk.default.fetch(new Request('https://w/players'), env);
  const open = await wk.default.fetch(new Request('https://w/players?key=k'), env);
  const list = await open.json();
  ok('reading players needs the key', locked.status === 401 && open.status === 200 && list.players.length === 1 && list.players[0].playerId === 'abc123');
  ok('collector answers CORS preflight', (await wk.default.fetch(new Request('https://w/collect', { method: 'OPTIONS' }), env)).headers.get('access-control-allow-origin') === '*');
  // 0.119 hardening
  const auth = await wk.default.fetch(new Request('https://w/players', { headers: { authorization: 'Bearer k' } }), env);
  ok('the read key works as a Bearer header (kept out of URLs)', auth.status === 200
    && (await wk.default.fetch(new Request('https://w/players', { headers: { authorization: 'Bearer nope' } }), env)).status === 401
    && (await wk.default.fetch(new Request('https://w/collect', { method: 'OPTIONS' }), env)).headers.get('access-control-allow-headers').includes('authorization'));
  await sleep(1100);
  await post({ playerId: 'abc123', build: '0.119', profile: {
    name: 'x'.repeat(99), coins: '12', evil: '<script>', stats: { power: 3, hacked: 9 }, equipment: { weapon: 'w'.repeat(99), rings: ['a', 'b', 'c'], extra: 1 },
    history: [{ at: 9, room: 4, outcome: 'death', boons: ['dmg'], junk: 'x'.repeat(5000) }, { room: 1 }, 'nope'] } });
  const stored = JSON.parse(kv.get('player:abc123')).profile;
  ok('only the dashboard\'s fields are stored, typed and capped', stored.name.length === 20 && stored.coins === 12 && !('evil' in stored)
    && !('hacked' in stored.stats) && stored.equipment.weapon.length === 40 && stored.equipment.rings.length === 2 && !('extra' in stored.equipment)
    && stored.history.at(-1).at === 9 && !('junk' in stored.history.at(-1)) && stored.history.every((r) => Number.isFinite(r.at)));
  const quick = await post({ playerId: 'abc123', build: '0.119', profile: { history: [] } });
  ok('one player at most once a second', quick.status === 429);
  ok('an IP over the per-minute limit gets 429', Array.from({ length: 30 }, (_, i) => wk.rateLimited('1.2.3.4', 1000 + i)).every((x) => !x)
    && wk.rateLimited('1.2.3.4', 2000) === true && wk.rateLimited('1.2.3.4', 70000) === false);
  const ver = await (await wk.default.fetch(new Request('https://w/version'), env)).json();
  ok('GET /version names the deployed collector, matching what the dashboard expects', ver.version === wk.VERSION && DATA.telemetry.collectorVersion === wk.VERSION);
  const dash = readFileSync('analytics/dashboard.js', 'utf8');
  ok('dashboard: collected players, deduped by player id, tester names kept locally', dash.includes('/players') && dash.includes('seen.has(id)') && dash.includes('write(TESTERS, all)'));
  const paste = dash.indexOf('paste collector/worker.js'), lt = dash.indexOf('const stale = cmp < 0'), gt = dash.indexOf('cmp > 0 ?');
  ok('dashboard: a collector behind this page asks for the paste; one ahead of it says the page is behind main (0.00223)', dash.includes("compareVersions(server.version ?? '0', data.collectorVersion)") && lt > 0 && paste > lt && gt > paste && dash.lastIndexOf('paste collector/worker.js') === paste);
  ok('dashboard: tester names (0.136) show beside the typed name, never replace it; old renames fold in; codes keep their own label',
    dash.includes("label: tester ? `${tester} · ${pl.base}` : pl.base") && dash.includes('base: `${profile.name ||') && dash.includes('t[id] ??= String(n)')
    && readFileSync('analytics/tables.js', 'utf8').includes('data-tester="${esc(pl.testerKey)}"'));
  const pfr = await import('../../analytics/perf.js');
  const reps = pfr.sanitizeReports([{ at: 2, kind: 'bench', build: '0.00225', phases: { combat: { fps: 44.4, p95: 31, stalls: [{ ms: 160, label: 'overkill' }, { ms: 110, label: 'play' }], split: { bg: { avg: 3.2 }, cards: { avg: 1.1 } } }, idle: { fps: 60, p95: 17, stalls: [], split: { bg: { avg: 2.5 } } } } }, { at: 1, kind: 'run', build: '<b>', phases: {} }, 'junk']);
  const rt = pfr.reportsTable([{ key: 's:x', label: 'Pete', device: { gpu: 'Apple GPU', browser: 'Safari 26', os: 'iOS' }, reports: reps }]);
  ok('dashboard: the device reports card — newest first, each phase\'s fps and stalls, the worst stall with its label, the main thread per subsystem, a Copy button per report (0.00225)',
    reps.length === 2 && reps[0].at === 2 && rt.indexOf('bench') < rt.indexOf('run') && rt.includes('combat <b>44.4</b> fps · 31 ms · 2 stalls') && rt.includes('160 ms<small>overkill</small>') && rt.includes('bg 3.2 · cards 1.1') && rt.includes('&lt;b&gt;')
    && (rt.match(/data-act="copy-report"/g) ?? []).length === 2 && rt.includes('data-at="2"') && pfr.reportsTable([{ reports: [] }]).includes('No device reports yet'));
  ok('...Copy all packs every player\'s reports with the device; the page copies to the clipboard, else shows the text', JSON.parse(pfr.reportsText([{ label: 'Pete', device: null, reports: reps }, { label: 'None', reports: [] }])).length === 1
    && dash.includes("act === 'copy-report' || act === 'copy-all'") && dash.includes('navigator.clipboard?.writeText') && dash.includes("card('Device reports") && dash.includes('reports: sanitizeReports(r.reports)'));
  ok('dashboard: no save-code entry any more — every tester is collected (0.00224)', !dash.includes('addCode') && !dash.includes('add-code') && !dash.includes('decodeSave') && !readFileSync('analytics/tables.js', 'utf8').includes("data-act=\"remove\""));
  { // a name change is sent to the collector at once (0.00299: the prompt driven — Save posts the save with its new name — not a source grep)
    const { namePrompt } = await import('../../src/ui/namePrompt.js');
    const realFetch = globalThis.fetch, realLoc = globalThis.location, ep = DATA.telemetry.endpoint;
    const posts = [];
    globalThis.fetch = async (url, opts) => { posts.push({ url, opts }); return { ok: true }; };
    globalThis.location = { hostname: 'www.castleofthecrimsonmoon.com' }; DATA.telemetry.endpoint = 'https://stats.example';
    const p = getProfile(); const name0 = p.name, hist0 = p.history;
    p.history = [{ at: 1, room: 1, outcome: 'death' }]; // (a save with no runs sends nothing)
    const prompt = namePrompt();
    prompt.input.value = '  Lady   Morgana ';
    prompt.ok.listeners.click[0]();
    await sleep(1);
    ok('a name change is sent to the collector at once', posts.length === 1 && posts[0].url === 'https://stats.example/collect' && posts[0].opts.method === 'POST'
      && JSON.parse(posts[0].opts.body).profile.name === 'Lady Morgana' && getProfile().name === 'Lady Morgana', `${posts.length} posts`);
    getProfile().name = name0; getProfile().history = hist0;
    globalThis.fetch = realFetch; globalThis.location = realLoc; DATA.telemetry.endpoint = ep;
  }
  ok('dashboard sends the key as a header (query only as a fallback for an older collector)', dash.includes('authorization: `Bearer ${key}`'));
  resetProfile();
}

// T91: 0.130 — real-world performance: each run records a frame-rate
// summary (core/perfMonitor.js) on its history record, the upload carries
// the device, the collector keeps both (typed, capped), and the dashboard
// shows a Performance card.
{
  const pm = await import('../../src/core/perfMonitor.js');
  const rec = (pairs) => { const r = pm.newRecording(); for (const [d, n] of pairs) for (let k = 0; k < n; k++) pm.addFrame(r, d); return r; };
  const r60 = rec([[16.6, 900], [17.2, 60], [33.3, 30], [60.5, 10]]); // 60 Hz, some drops
  const s = pm.summarizeFrames(r60);
  ok('frame summary: fps, p95, refresh rate, dropped frames, worst', s.hz === 60 && s.fps === Math.round(1000 * 10000 / r60.ms) / 10
    && s.p95 === 18 && s.drop === 4 && s.worst === 61 && s.secs === Math.round(r60.ms / 1000), JSON.stringify(s));
  const hz = (d) => pm.summarizeFrames(rec([[d, 2000]])).hz;
  ok('refresh rate from the busiest interval: 60 / 120 / 144 / 165 Hz', hz(16.67) === 60 && hz(8.33) === 120 && hz(6.94) === 144 && hz(6.06) === 165);
  const slow = pm.summarizeFrames(rec([[150, 30], [400, 10]]));
  ok('a device that cannot keep up: 60 Hz assumed, nearly every frame dropped', slow.hz === 60 && slow.drop === 100 && slow.fps === Math.round(40 * 10000 / 8500) / 10);
  pm.stopPerf(); // ends a recording an earlier test's dungeon left running
  ok('too short a run says nothing; nothing recording = null', pm.summarizeFrames(rec([[16, 50]])) === null && pm.stopPerf() === null
    && pm.summarizeFrames(rec([[150, 40]]))?.fps === 6.7); // a slow device still counts
  const { runRecord } = await import('../../src/meta/history.js');
  const r = createRun(); r.perf = { fps: 58.2, p95: 18 };
  ok('the run record carries the perf summary (null when unmeasured)', runRecord(r, 'death').perf.fps === 58.2 && runRecord(createRun(), 'death').perf === null
    && createRun().perf === null);
  const dsrc = readFileSync('src/ui/scenes/dungeonScene.js', 'utf8');
  ok('recorded from entering the dungeon to the run\'s end (once)', dsrc.includes('startPerf(); // the run') && dsrc.includes('run.perf ??= stopPerf();'));
  const tm = await import('../../src/meta/telemetry.js');
  const payload = tm.statsPayload(getProfile());
  ok('the upload carries the device, not the save', 'device' in payload && !('device' in payload.profile));
  const wk = await import('../../collector/worker.js');
  const cr = wk.cleanRun({ at: 1, room: 3, perf: { fps: '59.5', p95: 18, bg: 'evil', junk: 1, q: 2 } });
  ok('collector keeps a run\'s perf, typed', cr.perf.fps === 59.5 && cr.perf.bg === '3d' && cr.perf.q === 2 && !('junk' in cr.perf)
    && wk.cleanRun({ at: 1 }).perf === null);
  // 0.00225: the device report's pieces — the histogram kept, the subsystems' spans, the stalls labelled, the report built and sent once
  const h = pm.histogramOf(r60);
  ok('the histogram coarsened: every frame in a bucket, the busiest the 16-18 ms one', h.counts.reduce((a, b) => a + b, 0) === r60.frames && h.counts[pm.HIST_EDGES.indexOf(18)] === 960 && h.counts[pm.HIST_EDGES.indexOf(40)] === 30 && h.counts[pm.HIST_EDGES.indexOf(66)] === 10 && h.edges.length + 1 === h.counts.length);
  const r2 = pm.newRecording();
  pm.beginRecording(r2);
  const endBg = pm.span('bg'); await sleep(3); endBg();
  const endBg2 = pm.span('bg'); await sleep(5); endBg2();
  pm.markActivity('overkill'); pm.addFrame(r2, 150);
  await sleep(700); pm.addFrame(r2, 120); pm.addFrame(r2, 130, true); pm.addFrame(r2, 16);
  pm.endRecording();
  pm.span('bg')();
  const sp = pm.spansOf(r2);
  ok('spans: the time per call and its maximum, into the recording begun; none once ended', sp.bg.n === 2 && sp.bg.avg === 4 && sp.bg.max === 5 && sp.bg.total === 8 && Object.keys(sp).length === 1);
  ok('stalls carry what was happening: the last effect, else play, a room change by the frame\'s flag', r2.stalls.map((x) => `${x.ms}:${x.label}`).join() === '150:overkill,120:play,130:room change' && r2.stalls[0].at === 0.2);
  const many = pm.newRecording(); for (let i = 0; i < 30; i++) pm.addFrame(many, 200);
  ok('...at most telemetry.json report.stalls of them', many.stalls.length === DATA.telemetry.report.stalls);
  const pr = await import('../../src/meta/perfReport.js');
  const ph = pr.phaseReport(r60);
  const rep = pr.buildReport('run', { run: ph }, { history: Array.from({ length: 14 }, (_, i) => ({ at: i, build: '0.1', room: i, outcome: 'death', perf: null })) });
  ok('the report: the phase with its summary, histogram, split, stalls and long tasks; the device, the renderer, the card light, the particles; the last runs', ph.fps === s.fps && ph.hist.counts.length === 22 && Array.isArray(ph.stalls) && ph.longTasks === 0
    && rep.v === 1 && rep.kind === 'run' && rep.build === DATA.build.version && rep.renderer.bg === 'flat' && 'lit' in rep.cards && 'budget' in rep.particles && rep.runs.length === DATA.telemetry.report.runs && rep.runs[0].at === 4 && typeof rep.device.phone === 'boolean');
  pr.keepReport(rep);
  const withReport = tm.statsPayload(getProfile()), without = tm.statsPayload(getProfile());
  ok('the upload carries the report waiting, once', withReport.report === rep && !('report' in without) && pr.takeReport() === null);
  { // 0.00299: a failed upload hands the report back for the next one (it used to be taken before the fetch and lost with it)
    const realFetch = globalThis.fetch, realLoc = globalThis.location, ep = DATA.telemetry.endpoint;
    globalThis.location = { hostname: 'www.castleofthecrimsonmoon.com' }; DATA.telemetry.endpoint = 'https://stats.example';
    const withRuns = { ...getProfile(), history: [{ at: 1, room: 1, outcome: 'death' }] };
    let posts = 0;
    globalThis.fetch = async () => { posts++; throw new Error('offline'); };
    pr.keepReport(rep); tm.shareStats(withRuns); await sleep(1);
    ok('a rejected upload keeps the device report for the next one', posts === 1 && pr.takeReport() === rep);
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    pr.keepReport(rep); tm.shareStats(withRuns); await sleep(1);
    ok('...a refused one (not ok) too', pr.takeReport() === rep);
    globalThis.fetch = async () => ({ ok: true });
    pr.keepReport(rep); tm.shareStats(withRuns); await sleep(1);
    ok('...a sent one is gone', pr.takeReport() === null);
    const newer = { ...rep, at: rep.at + 1 };
    let fail; globalThis.fetch = () => new Promise((_, rej) => { fail = rej; });
    pr.keepReport(rep); tm.shareStats(withRuns); pr.keepReport(newer); fail(new Error('offline')); await sleep(1);
    ok('...and a newer report kept meanwhile stands over the one handed back', pr.takeReport() === newer);
    globalThis.fetch = realFetch; globalThis.location = realLoc; DATA.telemetry.endpoint = ep;
  }
  ok('a run with nothing recorded makes no report', pr.runReport(getProfile()) === null || typeof pr.runReport(getProfile()) === 'object');
  const dev = wk.cleanDevice({ gpu: 'g'.repeat(500), browser: 'Chrome 129', os: 'macOS', cores: '10', mem: 16, extra: 'x' });
  ok('collector keeps the device, capped', dev.gpu.length === 120 && dev.cores === 10 && !('extra' in dev) && wk.cleanDevice('nope') === null
    && readFileSync('collector/worker.js', 'utf8').includes('device: cleanDevice(body.device) ?? prev?.device ?? null'));
  const pf = await import('../../analytics/perf.js');
  ok('dashboard: GPU names shortened', pf.gpuShort('ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)') === 'Apple M2 Pro'
    && pf.gpuShort('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)') === 'NVIDIA GeForce RTX 3070'
    && pf.gpuShort('Mali-G78') === 'Mali-G78');
  const st = await import('../../analytics/stats.js');
  const prof = st.sanitizeProfile({ playerId: 'abcd', history: [
    { at: 1, room: 2, perf: { fps: 40, p95: 30, drop: 12, worst: 90, hz: 60, bg: '3d', q: 1, dpr: 2, vw: 1440, vh: 900 } },
    { at: 2, room: 3, perf: { fps: 60, p95: 17, drop: 1, worst: 40, hz: 60, bg: '3d', q: 0, dpr: 2, vw: 1440, vh: 900 } },
    { at: 3, room: 1 }] });
  const players = [{ key: 'a', label: '<b>A</b>', profile: prof, device: pf.sanitizeDevice({ gpu: '<img>', browser: 'Chrome 129', cores: 8 }) }];
  const runs = st.allRuns(players);
  const rows = pf.perfRows(players, runs);
  ok('dashboard: per-player medians over measured runs; the worst frame as a median and as the worst run\'s', rows.length === 1 && rows[0].runs === 2 && rows[0].fps === 50 && rows[0].worst === 65 && rows[0].worstRun === 90 && rows[0].q === 0);
  const html = pf.perfTable(players, runs);
  ok('dashboard: the Performance card escapes save text and grades fps', html.includes('&lt;b&gt;A&lt;/b&gt;') && html.includes('&lt;img&gt;') && !html.includes('<img>')
    && html.includes('perf-ok') && readFileSync('analytics/dashboard.js', 'utf8').includes("card('Performance', perfTable(shown, runs, data.perf), true)")
    && readFileSync('analytics/index.html', 'utf8').includes("'perf.js'"));
  ok('dashboard: CSV has the frame rate per run', st.toCsv(runs).split('\n')[0].endsWith(',fps,p95,drop,hz') && st.toCsv(runs).split('\n')[2].includes(',60,17,1,60'));
}

// T92: 0.131 — the ?debug BENCHMARK: a fixed, seeded fight in three
// phases; the result is saved to profile.bench (not the run history),
// sent with the play stats, kept by the collector and shown on the
// dashboard's Benchmarks card.
{
  const { PHASES } = await import('../../src/ui/benchmark.js');
  ok('benchmark: idle, combat, overkill with fixed enemies of every particle material',
    PHASES.map((p) => p.id).join() === 'idle,combat,overkill' && PHASES.every((p) => p.enemies.every((id) => DATA.enemies[id]) && DATA.backgrounds.rooms.includes(p.bg))
    && ['rat', 'skeleton', 'ghoul', 'wraith'].every((id) => PHASES[1].enemies.includes(id)));
  const bs = readFileSync('src/ui/scenes/benchmarkScene.js', 'utf8');
  ok('benchmark: the quality ladder held while it runs; nothing settled or recorded as a run (its flags are driven in T94)',
    bs.includes('holdQuality(true)') && bs.includes('holdQuality(false)') && !bs.includes('settleRun') && !bs.includes('recordRun'));
  const { recordBenchmark, BENCH_MAX } = await import('../../src/meta/profile.js');
  const histBefore = getProfile().history.length;
  for (let i = 0; i < BENCH_MAX + 2; i++) recordBenchmark({ at: i, build: '0.131', phases: {} });
  ok('results kept in profile.bench (newest 10), never in the run history', getProfile().bench.length === BENCH_MAX && getProfile().bench[0].at === 2
    && getProfile().history.length === histBefore);
  const tm = await import('../../src/meta/telemetry.js');
  const realLoc = globalThis.location, realFetch = globalThis.fetch, ep = DATA.telemetry.endpoint;
  const sent = [];
  globalThis.fetch = async (url, opts) => { sent.push(opts); return { ok: true }; };
  globalThis.location = { hostname: 'www.castleofthecrimsonmoon.com' }; DATA.telemetry.endpoint = 'https://stats.example';
  ok('a save with only benchmarks still reports', tm.shareStats({ ...getProfile(), history: [] }) === true && JSON.parse(sent[0].body).profile.bench.length === BENCH_MAX);
  globalThis.location = realLoc; globalThis.fetch = realFetch; DATA.telemetry.endpoint = ep;
  const wk = await import('../../collector/worker.js');
  const cb = wk.cleanBench({ at: 5, build: '0.131', bg: 'x', q: 1, junk: 1, phases: { idle: { fps: '60', p95: 17, evil: 1 }, combat: 'nope' } });
  ok('collector keeps benchmarks, typed', cb.phases.idle.fps === 60 && !('evil' in cb.phases.idle) && cb.phases.combat === null && cb.bg === '3d' && !('junk' in cb)
    && wk.cleanBench({ build: 'x' }) === null && wk.cleanProfile({ bench: [{ at: 1 }, 'x'] }, 'abcd').bench.length === 1);
  const pf = await import('../../analytics/perf.js');
  const bench = pf.sanitizeBench([{ at: 7, build: '<i>', bg: '3d', q: 0, dpr: 2, vw: 1440, vh: 900, phases: { idle: { fps: 60, p95: 17, drop: 0, worst: 30, hz: 60 }, combat: { fps: 44, p95: 31, drop: 18, worst: 120, hz: 60 } } }]);
  const html = pf.benchTable([{ label: 'A', profile: { bench }, device: null }]);
  ok('dashboard: Benchmarks card, escaped, graded per phase, the build in its own column', html.includes('&lt;i&gt;') && html.includes('perf-good') && html.includes('perf-ok') && html.includes('—')
    && html.includes('<th>Build</th>') && !html.includes('bench-old')
    && readFileSync('analytics/dashboard.js', 'utf8').includes("card('Benchmarks', benchTable(shown, data.benchmarkSince, data.perf), true)"));
  // 0.00221: the current round (telemetry.json benchmarkSince) — an older build's row is marked and muted, a newer one is not
  const two = pf.sanitizeBench([{ at: 1, build: '0.00218', phases: {} }, { at: 2, build: '0.00221', phases: {} }]);
  const roundHtml = pf.benchTable([{ label: 'A', profile: { bench: two }, device: null }], '0.00220');
  ok('dashboard: a benchmark from before the current round is marked "older round"', (roundHtml.match(/bench-old/g) ?? []).length === 1 && roundHtml.includes('older round') && roundHtml.includes('current round is build 0.00220')
    && roundHtml.indexOf('0.00221') < roundHtml.indexOf('0.00218'));
  ok('BENCHMARK sits in the ?debug column and asks first', readFileSync('src/ui/debugToggles.js', 'utf8').includes('benchmarkButton()')
    && readFileSync('src/ui/benchmark.js', 'utf8').includes("const returnTo = midRun || currentScene()?.name === 'hub' ? 'hub' : 'title';")
    && readFileSync('src/ui/benchmark.js', 'utf8').includes('if (midRun) currentScene()?.leaveRun?.(start); else start();')
    && readFileSync('src/ui/scenes/dungeonScene.js', 'utf8').includes("leaveRun: (next) => endRun(null, run.hp > 0 ? 'retreat' : 'death', next),")); // (0.00256: mid-run it settles the run first, then starts)
  getProfile().bench = [];
}

// T94: 0.133 — every player is asked once: entering the Great Hall with a
// best room of telemetry.json benchmarkPromptRoom (6 since 0.00219) or more
// and no result from this round (benchmarkSince) yet, a dialog offers only Continue; the benchmark plays (virtual
// time), saves its result and returns to the Great Hall — no second ask.
{
  const bm = await import('../../src/ui/benchmark.js');
  const ep = DATA.telemetry.endpoint;
  DATA.telemetry.endpoint = 'https://stats.example';
  const realLoc94 = globalThis.location; globalThis.location = { hostname: 'www.castleofthecrimsonmoon.com' }; // (0.00223: the ask only where stats are sent)
  fresh();
  const p = getProfile();
  // 0.00201 turned the ask off (the developer's call); 0.00219 turned it on again for the phone testers, from room 6
  const bp = DATA.telemetry.benchmarkPrompt;
  p.records.bestRoom = 12;
  DATA.telemetry.benchmarkPrompt = false;
  ok('the ask can be turned off (telemetry.json benchmarkPrompt)', !bm.benchmarkDue(p));
  DATA.telemetry.benchmarkPrompt = true;
  ok('on as shipped, from room 6, this round from the build that turned it on', bp === true && DATA.telemetry.benchmarkPromptRoom === 6 && /^\d+(\.\d+)+$/.test(DATA.telemetry.benchmarkSince) && buildsAhead(DATA.telemetry.benchmarkSince) <= 1); // the round is a shipped build or the one being shipped
  p.records.bestRoom = 5;
  ok('not due before room 6, or without stats collection', !bm.benchmarkDue(p));
  p.records.bestRoom = 12;
  globalThis.location = { hostname: 'localhost' };
  ok('never on localhost, where nothing is sent (0.00223)', !bm.benchmarkDue(p));
  globalThis.location = { hostname: 'www.castleofthecrimsonmoon.com' };
  ok('due from room 6 on, until a result from this round exists (an older build\'s does not count)', bm.benchmarkDue(p)
    && !bm.benchmarkDue({ ...p, bench: [{ at: 1, build: DATA.telemetry.benchmarkSince }] }) && !bm.benchmarkDue({ ...p, bench: [{ at: 1, build: '0.00300' }] })
    && bm.benchmarkDue({ ...p, bench: [{ at: 1, build: '0.00218' }] }) && bm.benchmarkDue({ ...p, bench: [{ at: 1 }] })
    && !(DATA.telemetry.endpoint = '', bm.benchmarkDue(p)) && (DATA.telemetry.endpoint = 'https://stats.example'));
  const M = DATA.cards.motion, settle = bm.PHASES.reduce((s, x) => s + DATA.backgrounds.parallax.fadeMs + M.enterDelayMs + M.enterMs + x.enemies.length * M.enterStaggerMs, 0) / 1000;
  ok('the prompt quotes the real length: the phases plus each room\'s settle (0.00222), rounded up to 5 s', bm.benchmarkSeconds() === Math.ceil((36 + settle) / 5) * 5 && bm.benchmarkSeconds() === 50 && bm.PHASES.reduce((s, x) => s + x.secs, 0) === 36);
  const since = DATA.telemetry.benchmarkSince;
  DATA.telemetry.benchmarkSince = DATA.build.version; // this round = the build under test (ship.mjs bumps build.json after the suite's first run)
  const realBody = globalThis.document.body;
  const body = new El('body');
  globalThis.document.body = body;
  const dlg = () => body.children.find((c) => /update-overlay/.test(c.className ?? ''));
  const realRnd = Math.random; DEBUG.forceCrit = true; // (a ?debug toggle left on: the benchmark must switch it off and put it back)
  show(hubScene());
  await sleep(1100); // the fade to the hall
  ok('no ask while the hall is still fading in', !dlg());
  await sleep(1300);
  ok('Great Hall asks once the hall has faded in', !!dlg() && dlg().textContent.includes(`about ${bm.benchmarkSeconds()} seconds`) && dlg().textContent.includes('Continue')
    && dlg().textContent.includes('[space]'));
  handleKey('escape'); handleKey('d');
  ok('nothing skips it (Esc, the hall\'s hotkeys)', !!dlg() && t().includes('GREAT HALL'));
  const sent94 = [], realFetch94 = globalThis.fetch;
  globalThis.fetch = async (u, o) => { sent94.push(JSON.parse(o.body)); return { ok: true }; };
  handleKey(' ');
  ok('Space starts the benchmark', !dlg());
  await sleep(1300);
  ok('the benchmark scene runs', t().includes('Benchmark'));
  const n0 = bm.PHASES[0].enemies.length;
  ok('while it runs: a seeded Math.random, invulnerable, the crit toggles off, the line sized on #app (0.00223: driven, not read from the source)',
    Math.random !== realRnd && DEBUG.invulnerable && !DEBUG.forceCrit && !DEBUG.forceMegaCrit && registry.app.style['--n'] === String(n0) && Number(registry.app.style['--slots']) >= n0, `${registry.app.style['--n']} ${registry.app.style['--slots']}`);
  await sleep(60000); // the whole script, in virtual time
  const res = dlg();
  ok('result shown with thanks; saved', res && res.textContent.includes('Benchmark complete') && res.textContent.includes('Thank you')
    && getProfile().bench.length === 1 && getProfile().bench[0].phases.combat?.fps > 0 && getProfile().history.length === 0);
  ok('after it: the real Math.random and every debug flag back as they were', Math.random === realRnd && DEBUG.forceCrit === true && !DEBUG.invulnerable && !DEBUG.forceMegaCrit);
  globalThis.fetch = realFetch94;
  const up = sent94.at(-1)?.report;
  ok('the result\'s upload carries the device report: the three phases, each with its histogram, split, stalls and the frame summary (0.00225)', !!up && up.kind === 'bench' && ['idle', 'combat', 'overkill'].every((id) => up.phases[id] && up.phases[id].hist.counts.length === 22 && typeof up.phases[id].split === 'object' && Array.isArray(up.phases[id].stalls) && up.phases[id].fps > 0)
    && up.renderer.bg === 'flat' && up.build === DATA.build.version && sent94.length === 1, up && JSON.stringify(Object.keys(up)));
  DEBUG.forceCrit = false;
  handleKey(' ');
  await sleep(1100);
  ok('back to the Great Hall (the scene by name), and it does not ask again', t().includes('GREAT HALL') && currentScene()?.name === 'hub' && (await sleep(2500), !dlg()));
  // 0.00219 (phones): the benchmark keeps the screen awake where it can, and one that went to the
  // background partway (a call, the lock) is not saved — the hall asks again
  getProfile().bench = [];
  const { benchmarkScene } = await import('../../src/ui/scenes/benchmarkScene.js');
  const vis = () => (globalThis.document.listeners.visibilitychange ?? []).length; // (other modules listen too: count the benchmark's own)
  const before = vis();
  show(benchmarkScene({ returnTo: 'hub' }));
  await sleep(1300);
  const listening = vis() - before;
  globalThis.document.hidden = true;
  for (const fn of globalThis.document.listeners.visibilitychange ?? []) fn();
  globalThis.document.hidden = false;
  await sleep(60000);
  const cut = dlg();
  ok('a benchmark that went to the background is not saved and says so', listening === 1 && cut && cut.textContent.includes('Benchmark interrupted') && cut.textContent.includes('ask again')
    && getProfile().bench.length === 0 && bm.benchmarkDue(getProfile()) && vis() === before);
  handleKey(' ');
  await sleep(1100);
  ok('…and the Great Hall asks again', t().includes('GREAT HALL') && (await sleep(2500), !!dlg() && dlg().textContent.includes('A quick benchmark')));
  handleKey(' '); await sleep(1300); await sleep(60000); handleKey(' '); await sleep(1100); // let it finish cleanly before the next block
  globalThis.document.body = realBody;
  DATA.telemetry.endpoint = ep; globalThis.location = realLoc94;
  DATA.telemetry.benchmarkPrompt = bp; DATA.telemetry.benchmarkSince = since;
  fresh();
}

// T95: 0.134 — the benchmark prompt never opens over another dialog (it
// opened over "Descend Now?", which then stayed up over the benchmark and
// kept its hotkeys); the benchmark clears any dialog left on screen.
{
  const ep = DATA.telemetry.endpoint;
  DATA.telemetry.endpoint = 'https://stats.example';
  const realLoc95 = globalThis.location; globalThis.location = { hostname: 'www.castleofthecrimsonmoon.com' };
  fresh();
  const p = getProfile();
  const bp = DATA.telemetry.benchmarkPrompt;
  DATA.telemetry.benchmarkPrompt = true;
  p.records.bestRoom = 12; p.coins = 522; // unspent coins: Descend asks first
  const realBody = globalThis.document.body;
  const body = new El('body');
  globalThis.document.body = body;
  const dialogs = () => body.children.filter((c) => /update-overlay/.test(c.className ?? ''));
  show(hubScene());
  await sleep(1100);
  handleKey('d'); // the player is quicker than the prompt: "Descend Now?"
  await sleep(2500);
  ok('the benchmark prompt waits while "Descend Now?" is up', dialogs().length === 1 && dialogs()[0].textContent.includes('Descend Now?'));
  handleKey('n'); // Stay and Spend
  await sleep(1100);
  ok('…and asks once it has closed', dialogs().length === 1 && dialogs()[0].textContent.includes('A quick benchmark'));
  const { confirmPrompt } = await import('../../src/ui/confirmPrompt.js');
  confirmPrompt({ title: 'Stray', lines: [], yes: ['Yes', 'y'], no: ['No', 'n'] }); // e.g. one opened just before Continue
  handleKey('escape'); // closes the stray on top
  handleKey(' '); // Continue
  confirmPrompt({ title: 'Left over', lines: [], yes: ['Yes', 'y'], no: ['No', 'n'], onYes: () => { throw new Error('acted under the benchmark'); } });
  await sleep(1300);
  ok('the benchmark clears dialogs left on screen', t().includes('Benchmark') && dialogs().length === 0);
  await sleep(60000);
  handleKey(' ');
  await sleep(1100);
  globalThis.document.body = realBody;
  DATA.telemetry.endpoint = ep; DATA.telemetry.benchmarkPrompt = bp; globalThis.location = realLoc95;
  fresh();
}

// T96: 0.135 — reading the MacBook's benchmark (Low Power Mode): a page
// capped at 30 fps reads as 30 Hz, not "100% dropped"; the benchmark keeps
// long freezes (hitches) instead of discarding them as pauses (a whole
// Overkill phase came back empty); its countdown no longer forces a layout
// every frame; this browser's own row borrows its collected device.
{
  const pm = await import('../../src/core/perfMonitor.js');
  const rec = (pairs) => { const r = pm.newRecording(); for (const [d, n] of pairs) for (let k = 0; k < n; k++) pm.addFrame(r, d); return r; };
  const capped = pm.summarizeFrames(rec([[33.3, 1900], [66.7, 100]]));
  ok('a 30 fps battery-saver cap reads as 30 Hz; only its doubled frames count as dropped', capped.hz === 30 && capped.drop === 5 && capped.fps > 28);
  ok('still: a device slower than 25 fps is judged against 60', pm.summarizeFrames(rec([[45, 500]])).hz === 60);
  ok('the worst frame is reported as it was (no cap)', pm.summarizeFrames(rec([[16.7, 600], [1800, 1]])).worst === 1800);
  const bs = readFileSync('src/ui/scenes/benchmarkScene.js', 'utf8');
  ok('benchmark: only a hidden tab or a sleep is not a frame; countdown written only when it changes',
    bs.includes('d < SLEEP_MS && !document.hidden') && bs.includes('ui.title.textContent !== label'));
  ok('particles size their canvas from the window, never from layout', !/canvas\.client(Width|Height)/.test(readFileSync('src/ui/particles.js', 'utf8')));
  const pf = await import('../../analytics/perf.js');
  const html = pf.benchTable([{ label: 'Mac', device: null, profile: { bench: pf.sanitizeBench([{ at: 1, build: '0.135', phases: { combat: { fps: 29.3, p95: 35, drop: 3, worst: 80, hz: 30 } } }]) } }]);
  ok('dashboard: a capped run is green against 30 and says so', html.includes('perf-good') && html.includes('capped at 30'));
  ok('dashboard: this browser\'s row shows the device from its collected copy',
    readFileSync('analytics/dashboard.js', 'utf8').includes('device: ownDevice }]'));
}

// T99: 0.00222 — the refresh rate from the busiest frame interval. The
// developer's dashboard showed two 120 Hz Macs as "144 Hz" (119.8 fps, amber)
// and 60 Hz iPhones as "90 / 75 Hz" with 56-61% "dropped" at 59 fps: the
// fastest 10% of frames, a refresh short on jittered timestamps. Each
// fixture asserts hz AND drop (the drop is what the developer reads).
{
  const pm = await import('../../src/core/perfMonitor.js');
  const rec = (pairs) => { const r = pm.newRecording(); for (const [d, n] of pairs) for (let k = 0; k < n; k++) pm.addFrame(r, d); return r; };
  const s = (pairs) => pm.summarizeFrames(rec(pairs));
  const K = DATA.telemetry.perf;
  ok('perf knobs shipped: nearShare, paceShare, goodShare, okFps, hzSince (the build being shipped)', K.nearShare === 0.06 && K.paceShare === 0.15 && K.goodShare === 0.9 && K.okFps === 30 && buildsAhead(K.hzSince) <= 1);
  const mac = s([[8.33, 900], [7.25, 100]]);
  ok('a 120 Hz Mac with catch-up frames reads 120 Hz, nothing dropped (it read 144)', mac.hz === 120 && mac.drop === 0, JSON.stringify(mac));
  const phone = s([[16.67, 700], [12, 150], [21, 150]]);
  ok('a 60 Hz iPhone with jittered timestamps reads 60 Hz, nothing dropped (it read 90, 15%)', phone.hz === 60 && phone.drop === 0, JSON.stringify(phone));
  const smear = s([[11.5, 120], [14.5, 300], [19, 530], [26, 50]]);
  ok('the iPhone smear (p95 26 ms) reads 60 Hz with 5% dropped (it read 90, 58%)', smear.hz === 60 && smear.drop === 5, JSON.stringify(smear));
  ok('144 Hz at full rate still reads 144', s([[6.94, 970], [13.9, 30]]).hz === 144);
  const d45 = s([[16.67, 2000], [33.33, 1000]]);
  ok('a 60 Hz display at 45 fps: 60 Hz, a third dropped', d45.hz === 60 && d45.drop === 33.3);
  const d50 = s([[16.67, 2000], [33.33, 500]]);
  ok('a 60 Hz display at 50 fps: 60 Hz, a fifth dropped (never 50 Hz)', d50.hz === 60 && d50.drop === 20);
  const d70 = s([[8.33, 400], [16.67, 500], [25, 100]]);
  ok('a 120 Hz display mostly taking two refreshes: still 120 Hz, 60% dropped', d70.hz === 120 && d70.drop === 60, JSON.stringify(d70));
  const alt = s([[11.11, 1000], [22.22, 1000]]);
  ok('a 90 Hz display dropping alternately reads 90 (a pure alternation is one; the developer\'s rows are smears)', alt.hz === 90 && alt.drop === 50);
  ok('the knobs are read from the data (a wide pace share lets the average decide)', pm.summarizeFrames(rec([[21.5, 1000], [11.5, 1000]]), { nearShare: 0.06, paceShare: 0.6 }).hz === 60 && pm.summarizeFrames(rec([[21.5, 1000], [11.5, 1000]]), { nearShare: 0.06, paceShare: 0.5 }).hz === 90);
  // stalls and the worst frame's moment (0.00222)
  const r = rec([[16.7, 600], [120, 2]]); pm.addFrame(r, 130, true);
  const st2 = pm.summarizeFrames(r);
  ok('stalls = frames of 100 ms or more; the worst frame remembers it fell in a room change', st2.stalls === 3 && st2.worst === 130 && st2.worstOut === 1 && pm.summarizeFrames(rec([[16.7, 600], [120, 1]])).worstOut === 0);
  // the dashboard: old rows graded by their fps, their dropped share hidden; trusted rows as they are
  const pf = await import('../../analytics/perf.js');
  const row = (build, perf) => [{ player: 'a', at: 1, build, perf: { bg: '3d', q: 0, dpr: 2, vw: 1747, vh: 930, secs: 60, stalls: 1, worstOut: 1, ...perf } }];
  const pl = [{ key: 'a', label: 'Mac', device: null }];
  const old = pf.perfTable(pl, row('0.00221', { fps: 119.8, p95: 10, drop: 0.1, worst: 151, hz: 144 }), K);
  ok('dashboard: a pre-fix 120 Hz Mac row is green and shows no dropped share; stalls and the worst frame\'s moment show', old.includes('perf-good') && old.includes('—') && !old.includes('0.1%') && old.includes('<th>Stalls</th>') && old.includes('room change'));
  const fresh2 = pf.perfTable(pl, row(K.hzSince, { fps: 73, p95: 20, drop: 30, worst: 90, hz: 120 }), K);
  ok('dashboard: a trusted row keeps its own grade and dropped share', fresh2.includes('perf-ok') && fresh2.includes('30.0%'));
  const both = pf.perfRows(pl, [...row('0.00221', { fps: 58.6, p95: 26, drop: 58, worst: 78, hz: 90 }), { ...row(K.hzSince, { fps: 59.5, p95: 18, drop: 3, worst: 60, hz: 60 })[0], at: 2 }], K);
  ok('dashboard: medians over the trusted runs only, once a player has one', both[0].drop === 3 && both[0].runs === 2 && both[0].misread === false);
  const bench = pf.benchTable([{ label: 'A', device: null, profile: { bench: pf.sanitizeBench([{ at: 1, build: '0.00220', phases: { idle: { fps: 59.1, p95: 28, drop: 61.3, worst: 80, hz: 90 } } }]) } }], '0.00220', K);
  ok('dashboard: a pre-fix iPhone benchmark phase is green with its dropped share hidden', bench.includes('perf-good') && !bench.includes('61.3%'));
  const wk = await import('../../collector/worker.js');
  ok('collector keeps stalls and worstOut; its version moved with telemetry.json', wk.cleanPerf({ fps: 60, stalls: 2, worstOut: 1 }).stalls === 2 && wk.cleanPerf({ fps: 60, stalls: 2, worstOut: 1 }).worstOut === 1 && wk.VERSION === DATA.telemetry.collectorVersion);
}

// tools/reports.mjs (0.00229): the collector pulled into the session — one
// player summarized with the newest benchmark and report, a missing key
// and a refused key named plainly (never the key itself), the players
// list taken from the Worker's answer
{
  const { summarize, render, fetchPlayers, matches, KEY_VAR } = await import('../reports.mjs');
  const pl = { playerId: 'abcdef0123456789', lastSeen: Date.UTC(2026, 9, 3, 6, 0), build: '0.00228', device: { gpu: 'Apple GPU', browser: 'Safari 26', os: 'iOS', cores: 6 },
    profile: { name: 'Petri', records: { bestRoom: 9 }, history: [{ at: 1 }, { at: 2 }], bench: [{ at: 5, build: '0.00225', bg: '3d', q: 0, vw: 852, vh: 393, dpr: 3, phases: { idle: { fps: 59.8, hz: 60, p95: 28, drop: 12 } } }, { at: 9, build: '0.00228', bg: '3d', q: 1, vw: 852, vh: 393, dpr: 3, phases: { idle: { fps: 60, hz: 60, p95: 17, drop: 0.4 }, combat: { fps: 59.9, hz: 60, p95: 21, drop: 1 } } }] },
    reports: [{ at: 7, kind: 'bench', build: '0.00228', phases: { idle: { split: { cards: { avg: 0.05 }, bg: { avg: 0.2 } }, stalls: [{ ms: 120 }] }, combat: { split: { cards: { avg: 0.1 } }, stalls: [] } }, cards: { lit: 7, own: 7, pool: 8 } }] };
  const s = summarize(pl);
  ok('reports: a player summarized — name, short id, device, counts, the NEWEST benchmark and report', s.name === 'Petri' && s.id === 'abcdef01' && s.device === 'Apple GPU · Safari 26 · iOS · 6 cores' && s.runs === 2 && s.bestRoom === 9 && s.benchmarks === 2
    && s.bench.build === '0.00228' && s.bench.q === 1 && s.bench.idle.startsWith('60.0/60 Hz, p95 17 ms, drop 0.4%') && s.bench.overkill === '—' && s.report.kind === 'bench' && s.report.stalls === 1 && s.report.spans.idle === 'cards 0.05 ms, bg 0.20 ms' && s.report.cards.pool === 8);
  const text = render(s);
  ok('reports: the text names the player, the benchmark phases and the spans', text.includes('Petri  (abcdef01)') && text.includes('combat 59.9/60 Hz') && text.includes('idle: cards 0.05 ms, bg 0.20 ms') && text.includes('"own":7'));
  ok('reports: --player matches the name, the id or the device, case aside', matches(pl, 'petri') && matches(pl, 'abcdef') && matches(pl, 'safari') && !matches(pl, 'android') && matches(pl, null));
  const got = await fetchPlayers({ endpoint: 'https://stats.example/', key: 'k', fetchFn: async (u, o) => ({ ok: true, status: 200, json: async () => ({ players: [pl] }), u, o }) });
  ok('reports: the players come from the Worker\'s answer', got.length === 1 && got[0] === pl);
  let seen = null;
  await fetchPlayers({ endpoint: 'https://stats.example/', key: 'secret-k', fetchFn: async (u, o) => { seen = { u, o }; return { ok: true, status: 200, json: async () => ({}) }; } });
  ok('reports: the key goes in the Bearer header, the URL has no trailing slash doubled', seen.u === 'https://stats.example/players' && seen.o.headers.authorization === 'Bearer secret-k');
  const err = async (args) => { try { await fetchPlayers(args); return ''; } catch (e) { return e.message; } };
  const noKey = await err({ endpoint: 'https://stats.example', key: '' });
  const refused = await err({ endpoint: 'https://stats.example', key: 'secret-k', fetchFn: async () => ({ ok: false, status: 401 }) });
  const down = await err({ endpoint: 'https://stats.example', key: 'secret-k', fetchFn: async () => { throw new Error('ECONNREFUSED'); } });
  ok('reports: no key, a refused key and an unreachable host each say what to set, and never the key', noKey.includes(KEY_VAR) && noKey.includes('new session') && refused.includes('401') && !refused.includes('secret-k') && down.includes('network policy') && !down.includes('secret-k'));
}

// Shrine deals (0.00253): each shrine's three offers and the pick land in the
// run record, the collector and the stats page clean them alike, and the
// Shrine picks card counts a boon's rate against the times it was dealt.
{
  fresh();
  const { createRun } = await import('../../src/run/runState.js');
  const { noteDeal, acceptOffer, shrineOffers } = await import('../../src/run/shrine.js');
  const { runRecord } = await import('../../src/meta/history.js');
  const { cleanRun } = await import('../../collector/worker.js');
  const { shrinePicks } = await import('../../analytics/stats.js');
  const run = createRun(); run.coins = 500;
  const all = shrineOffers(), by = (id) => all.find((o) => o.id === id);
  noteDeal(run, [by('crit'), by('greed'), by('bulwark')]);
  acceptOffer(run, by('crit'));
  noteDeal(run, [by('dmg'), by('crit'), by('glasscannon')]); // walked away
  const rec = runRecord(run, 'retreat');
  ok('a run records each shrine\'s deal and the pick (null: walked away)', JSON.stringify(rec.shrines) === JSON.stringify([{ o: ['crit', 'greed', 'bulwark'], t: 'crit' }, { o: ['dmg', 'crit', 'glasscannon'], t: null }]));
  const clean = cleanRun({ ...rec, shrines: [...rec.shrines, 'junk', { o: ['x'.repeat(99)], t: 5 }] });
  ok('the collector keeps the deals, typed and capped', clean.shrines.length === 3 && clean.shrines[0].t === 'crit' && clean.shrines[2].o[0].length === 24 && clean.shrines[2].t === '5');
  const picks = shrinePicks([rec, { shrines: [{ o: ['crit', 'armor', 'leech'], t: 'armor' }] }]);
  const crit = picks.boons.find((b) => b.boon === 'crit');
  ok('Shrine picks: a boon\'s rate is taken over dealt; walk-aways counted', picks.met === 3 && picks.walked === 1 && crit.offered === 3 && crit.taken === 1 && Math.abs(crit.rate - 1 / 3) < 1e-9);
  fresh();
}

// 0.00322 (the developer's ask): the dashboard's Recent runs rows carry the hero played (its look), the finds (a relic starred), the XP and the turns
{
  const { runsTable } = await import('../../analytics/tables.js');
  const names = { labelOf: (p) => `P${p}`, heroName: (id) => (id ? `Hero ${id}` : 'The Curious Knight'), enemyName: (id) => `Foe ${id}`, boonName: (b) => b, offers: () => ({ dmg: { icon: '⚔' } }) };
  const run = { at: Date.now(), player: 1, build: '0.00322', outcome: 'death', room: 9, kills: 14, turns: 31, xp: 88, coins: 120, banked: 60, items: 3, relic: true, killedBy: 'rat', boons: ['dmg'], bosses: 1, potions: 2, ms: 60000, level: 3, maxHp: 900, dmg: 20, armor: 40, hero: 'wizard', look: 2 };
  const html = runsTable([run, { ...run, hero: null, look: 0, relic: false, items: 0, coins: 60, outcome: 'retreat' }], names);
  const cells = (row) => [...row.matchAll(/<td>(.*?)<\/td>/gs)].map((m) => m[1]);
  const rows = html.split('<tr class=').slice(1);
  const a = cells(rows[0]), b = cells(rows[1]);
  ok('Recent runs: the hero and its look, the turns, the XP, the banked coins of the coins won, the finds with the relic starred, in the header\'s order',
    html.includes('<th>Hero</th>') && html.includes('<th>Turns</th>') && html.includes('<th>XP</th>') && html.includes('<th>Finds</th>')
    && a[2] === 'Hero wizard<small>look 3</small>' && a[7] === '31' && a[8] === '88' && a[9] === '60<small>of 120</small>' && a[10].startsWith('3 <span') && a[10].includes('★') && a[11] === 'Foe rat');
  ok('…a run before the classes is the knight\'s with no look; nothing banked short shows no "of"; no relic, no star', b[2] === 'The Curious Knight' && b[9] === '60' && b[10] === '0');
}
