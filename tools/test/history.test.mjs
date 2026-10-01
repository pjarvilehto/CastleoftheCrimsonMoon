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
    && Object.keys(body.profile).sort().join() === 'coins,equipment,history,name,playerId,potionCap,potions,records,stats,xp');
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
  const r2 = await post({ playerId: 'abc123', build: '0.102', profile: { history: [run(3)] } }); // e.g. after a progress wipe
  const rec = JSON.parse(kv.get('player:abc123'));
  ok('collector stores a player by id; history merged by timestamp (a wipe loses nothing)', r1.status === 200 && r2.status === 200
    && rec.profile.history.map((r) => r.at).join() === '1,2,3' && rec.country === 'FI' && !JSON.stringify(rec).includes('ip'));
  const bad = await Promise.all([post('nope'), post({ playerId: '../x', profile: { history: [] } }), post({ playerId: 'abcd', profile: {} }),
    post({ playerId: 'abcd', profile: { history: [], pad: 'x'.repeat(300000) } })]);
  ok('collector rejects bad json, ids, payloads and oversize bodies', bad.map((r) => r.status).join() === '400,400,400,413' && kv.size === 1);
  const locked = await wk.default.fetch(new Request('https://w/players'), env);
  const open = await wk.default.fetch(new Request('https://w/players?key=k'), env);
  const list = await open.json();
  ok('reading players needs the key', locked.status === 401 && open.status === 200 && list.players.length === 1 && list.players[0].playerId === 'abc123');
  ok('collector answers CORS preflight', (await wk.default.fetch(new Request('https://w/collect', { method: 'OPTIONS' }), env)).headers.get('access-control-allow-origin') === '*');
  const dash = readFileSync('analytics/dashboard.js', 'utf8');
  ok('dashboard: collected players, deduped by player id, names kept locally', dash.includes('/players?key=') && dash.includes('seen.has(id)') && dash.includes("write(NAMES,"));
  resetProfile();
}
