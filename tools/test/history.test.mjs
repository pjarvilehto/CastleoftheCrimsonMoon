// tools/test/history.test.mjs — run history (profile) and the /analytics/ dashboard.
// Run via tools/smoke-test.mjs (0.098 split; T-numbers are historical).

import { ok, sleep, t, fresh, registry, El, DATA, show, handleKey, setBackground, transitionTo, createRun, generateRoom,
  scaleEnemy, createCombat, playerAttack, shrineOffers, canAffordOffer, acceptOffer, dungeonScene, hubScene, titleScene,
  resetProfile, getProfile, loadData, readFileSync, readdirSync, statSync } from './harness.mjs';

fresh();

// T57: 0.095 — run history (settleRun records every run; save v3 adds it
// + a stable player id), the /analytics/ dashboard's stats module, and
// the CRIT! caption on crit numbers.
{
  const { settleRun, drinkPotion } = await import('../../src/run/runState.js');
  const { HISTORY_MAX } = await import('../../src/meta/history.js');
  const { importSave, exportSave, SAVE_VERSION } = await import('../../src/meta/profile.js');
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
  ok('/analytics/ boots versioned, not indexed', html.includes("fetch('../assets/data/build.json', { cache: 'no-store' })") && html.includes("'dashboard.js'") && html.includes('noindex'));
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
    && Object.keys(body.profile).sort().join() === 'bench,coins,equipment,history,name,playerId,potionCap,potions,records,stats,xp');
  const src = readFileSync('src/ui/scenes/dungeonScene.js', 'utf8') + readFileSync('src/main.js', 'utf8');
  ok('sent after every run and once per session', src.includes('shareStats(settleRun(run, outcome))') && src.includes('shareStats(getProfile())'));
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
  const r1 = await post({ playerId: 'abc123', build: '0.102', profile: { history: [run(1), run(2)] } }, { country: 'FI' });
  await sleep(1100); // one player at most once a second (0.119)
  const r2 = await post({ playerId: 'abc123', build: '0.102', profile: { history: [run(3)] } }); // e.g. after a progress wipe
  const rec = JSON.parse(kv.get('player:abc123'));
  ok('collector stores a player by id; history merged by timestamp (a wipe loses nothing)', r1.status === 200 && r2.status === 200
    && rec.profile.history.map((r) => r.at).join() === '1,2,3' && rec.country === 'FI' && !/"(ip|clientIp|cf-connecting-ip)":/i.test(JSON.stringify(rec)));
  const bad = await Promise.all([post('nope'), post({ playerId: '../x', profile: { history: [] } }), post({ playerId: 'abcd', profile: {} }),
    post({ playerId: 'abcd', profile: { history: [], pad: 'x'.repeat(300000) } })]);
  ok('collector rejects bad json, ids, payloads and oversize bodies', bad.map((r) => r.status).join() === '400,400,400,413' && kv.size === 1);
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
  ok('dashboard: tester names (0.136) show beside the typed name, never replace it; old renames fold in; codes keep their own label',
    dash.includes("label: tester ? `${tester} · ${pl.base}` : pl.base") && dash.includes('base: `${profile.name ||') && dash.includes('t[id] ??= String(n)')
    && dash.includes('({ key, label: base, profile, importedAt })') && readFileSync('analytics/tables.js', 'utf8').includes('data-tester="${esc(pl.testerKey)}"'));
  ok('a name change is sent to the collector at once', readFileSync('src/ui/namePrompt.js', 'utf8').includes('shareStats(getProfile())'));
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
  ok('refresh rate snapped from the fastest frames: 60 / 120 / 144 / 165 Hz', hz(16.67) === 60 && hz(8.33) === 120 && hz(6.94) === 144 && hz(6.06) === 165);
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
  ok('dashboard: per-player medians over measured runs', rows.length === 1 && rows[0].runs === 2 && rows[0].fps === 50 && rows[0].worst === 90 && rows[0].q === 0);
  const html = pf.perfTable(players, runs);
  ok('dashboard: the Performance card escapes save text and grades fps', html.includes('&lt;b&gt;A&lt;/b&gt;') && html.includes('&lt;img&gt;') && !html.includes('<img>')
    && html.includes('perf-ok') && readFileSync('analytics/dashboard.js', 'utf8').includes("card('Performance', perfTable(shown, runs), true)")
    && readFileSync('analytics/index.html', 'utf8').includes("'perf.js'"));
  ok('dashboard: CSV has the frame rate per run', st.toCsv(runs).split('\n')[0].endsWith(',fps,p95,drop,hz') && st.toCsv(runs).split('\n')[2].includes(',60,17,1,60'));
}

// T92: 0.131 — the ?debug BENCHMARK: a fixed, seeded fight in three
// phases; the result is saved to profile.bench (not the run history),
// sent with the play stats, kept by the collector and shown on the
// dashboard's Benchmarks card.
{
  const { PHASES } = await import('../../src/ui/scenes/benchmarkScene.js');
  ok('benchmark: idle, combat, overkill with fixed enemies of every particle material',
    PHASES.map((p) => p.id).join() === 'idle,combat,overkill' && PHASES.every((p) => p.enemies.every((id) => DATA.enemies[id]) && DATA.backgrounds.rooms.includes(p.bg))
    && ['rat', 'skeleton', 'ghoul', 'wraith'].every((id) => PHASES[1].enemies.includes(id)));
  const bs = readFileSync('src/ui/scenes/benchmarkScene.js', 'utf8');
  ok('benchmark: seeded and invulnerable while it runs, everything restored after; quality ladder held',
    bs.includes('Math.random = seeded(') && bs.includes('Math.random = realRandom;') && bs.includes('Object.assign(DEBUG, debugWas);')
    && bs.includes('holdQuality(true)') && bs.includes('holdQuality(false)') && !bs.includes('settleRun') && !bs.includes('recordRun'));
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
  ok('dashboard: Benchmarks card, escaped, graded per phase', html.includes('&lt;i&gt;') && html.includes('perf-good') && html.includes('perf-ok') && html.includes('—')
    && readFileSync('analytics/dashboard.js', 'utf8').includes("card('Benchmarks', benchTable(shown), true)"));
  ok('BENCHMARK sits in the ?debug column and asks first', readFileSync('src/ui/debugToggles.js', 'utf8').includes('benchmarkButton()')
    && readFileSync('src/ui/benchmark.js', 'utf8').includes("onYes: () => go('benchmark')"));
  getProfile().bench = [];
}

// T94: 0.133 — every player is asked once: entering the Great Hall with a
// best room of telemetry.json benchmarkPromptRoom (10) or more and no
// result yet, a dialog offers only Continue; the benchmark plays (virtual
// time), saves its result and returns to the Great Hall — no second ask.
{
  const bm = await import('../../src/ui/benchmark.js');
  const ep = DATA.telemetry.endpoint;
  DATA.telemetry.endpoint = 'https://stats.example';
  fresh();
  const p = getProfile();
  p.records.bestRoom = 9;
  ok('not due before room 10, or without stats collection', !bm.benchmarkDue(p) && DATA.telemetry.benchmarkPromptRoom === 10);
  p.records.bestRoom = 12;
  ok('due from room 10 on, until a result exists', bm.benchmarkDue(p) && !bm.benchmarkDue({ ...p, bench: [{ at: 1 }] })
    && !(DATA.telemetry.endpoint = '', bm.benchmarkDue(p)) && (DATA.telemetry.endpoint = 'https://stats.example'));
  ok('the prompt quotes the real length', bm.benchmarkSeconds() === 40 && bm.PHASES.reduce((s, x) => s + x.secs, 0) === 36);
  const realBody = globalThis.document.body;
  const body = new El('body');
  globalThis.document.body = body;
  const dlg = () => body.children.find((c) => /update-overlay/.test(c.className ?? ''));
  show(hubScene());
  await sleep(1100); // the fade to the hall
  ok('no ask while the hall is still fading in', !dlg());
  await sleep(1300);
  ok('Great Hall asks once the hall has faded in', !!dlg() && dlg().textContent.includes('about 40 seconds') && dlg().textContent.includes('Continue')
    && dlg().textContent.includes('[space]'));
  handleKey('escape'); handleKey('d');
  ok('nothing skips it (Esc, the hall\'s hotkeys)', !!dlg() && t().includes('GREAT HALL'));
  handleKey(' ');
  ok('Space starts the benchmark', !dlg());
  await sleep(1300);
  ok('the benchmark scene runs', t().includes('Benchmark'));
  await sleep(45000); // the whole script, in virtual time
  const res = dlg();
  ok('result shown with thanks; saved', res && res.textContent.includes('Benchmark complete') && res.textContent.includes('Thank you')
    && getProfile().bench.length === 1 && getProfile().bench[0].phases.combat?.fps > 0 && getProfile().history.length === 0);
  handleKey(' ');
  await sleep(1100);
  ok('back to the Great Hall, and it does not ask again', t().includes('GREAT HALL') && (await sleep(2500), !dlg()));
  globalThis.document.body = realBody;
  DATA.telemetry.endpoint = ep;
  fresh();
}

// T95: 0.134 — the benchmark prompt never opens over another dialog (it
// opened over "Descend Now?", which then stayed up over the benchmark and
// kept its hotkeys); the benchmark clears any dialog left on screen.
{
  const ep = DATA.telemetry.endpoint;
  DATA.telemetry.endpoint = 'https://stats.example';
  fresh();
  const p = getProfile();
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
  await sleep(45000);
  handleKey(' ');
  await sleep(1100);
  globalThis.document.body = realBody;
  DATA.telemetry.endpoint = ep;
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
