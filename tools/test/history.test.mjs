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
  ok('v2 save migrates: history + player id', SAVE_VERSION === 3 && getProfile().saveVersion === 3 && Array.isArray(getProfile().history) && typeof getProfile().playerId === 'string');

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
