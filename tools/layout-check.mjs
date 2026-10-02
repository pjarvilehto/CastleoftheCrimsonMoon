#!/usr/bin/env node
// tools/layout-check.mjs — the layout contract, desktop AND phone (0.00209).
//
// The game has two layouts in one code path: the desktop's (tablets too)
// and the phone's (styles.css section 16 under platform.js PHONE_MQ,
// hubScene's phoneHall, the ☰ column, the gate). A change to combat's
// chrome, the Great Hall, a panel room or a dialog must hold on both — this
// drives the REAL game headless through the title, the Great Hall, a fight,
// a shrine and a treasure room at five screens (a desktop, a narrow desktop
// window, a tablet, a phone, the smallest phone) and asserts what each
// layout promises (every card on one line on a phone, the log one line, the
// foes' Attack buttons gone, the room title clear of the counters, the
// boons clear of a panel room's log; the desktop's column, log box and
// Attack buttons untouched; Descend and Push Deeper on screen everywhere —
// a desktop window too short for a panel room scrolls the panel to it, a
// phone never scrolls; nothing overflowing sideways). Screenshots land in
// --out for a look.
//
//   node tools/layout-check.mjs [--only phone|phone-small|tablet|desktop|narrow] [--out dir]
//
// Needs Playwright and a Chromium (PLAYWRIGHT_PATH / CHROMIUM env; the
// cloud container's defaults below). Software GL: slow, so no timing is
// judged here — only geometry. Not part of the smoke suite (it needs a
// browser); run it before shipping a layout change (CLAUDE.md rule 8).

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const only = arg('--only', null);
const OUT = resolve(arg('--out', '/tmp/layout-check'));
const PW = process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.bin': 'application/octet-stream' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 813 } },
  narrow: { viewport: { width: 960, height: 720 } }, // a desktop window under 1000px: the hall in one column, scrolling (0.00223)
  tablet: { viewport: { width: 1180, height: 820 }, screen: { width: 1024, height: 1366 }, userAgent: IPAD, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 852, height: 393 }, screen: { width: 390, height: 844 }, userAgent: IPHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  'phone-small': { viewport: { width: 740, height: 360 }, screen: { width: 360, height: 740 }, userAgent: IPHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};

let failed = 0;
const check = (profile, name, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${profile.padEnd(11)} ${name}${detail ? `  (${detail})` : ''}`); if (!pass) failed++; };

// what the page reports about an element
const rect = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; })()`;
// the scene manager at rest: go() is dropped during a transition (0.00223 — Descend used to be clicked on a fixed timer while the hall's fade could still run)
const settled = (page) => page.evaluate(async () => { const { isTransitioning, whenWindowsBack } = await import('/src/core/scene.js'); while (isTransitioning()) await whenWindowsBack(); });
const longestRoomName = JSON.parse(await readFile(join(ROOT, 'assets/data/backgrounds.json'), 'utf8'));
const LONG_NAME = Object.values(longestRoomName.roomNames).reduce((a, b) => (b.length > a.length ? b : a), '');

async function run(name, opts, url) {
  const { chromium } = await import(PW);
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const phone = name.startsWith('phone');
  const shot = (s) => page.screenshot({ path: join(OUT, `${name}-${s}.png`) });
  try {
    await page.goto(`${url}?debug`);
    if (phone) {
      const gate = await page.waitForSelector('.phone-gate', { timeout: 90000 }).catch(() => null);
      check(name, 'the gate before the title', !!gate);
      await shot('0-gate');
      if (gate) await page.click('.phone-gate button.primary');
    }
    await page.waitForFunction(() => document.body.textContent.includes('Enter the Castle'), null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    if (!phone) check(name, 'no gate', !(await page.$('.phone-gate')));
    const menuDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('.corner-bar .menu-toggle')).display);
    check(name, phone ? '☰ shown' : '☰ hidden', phone ? menuDisplay !== 'none' : menuDisplay === 'none', menuDisplay);
    if (phone) {
      await page.click('.corner-bar .menu-toggle'); await page.waitForTimeout(200);
      const open = await page.evaluate(() => document.querySelector('.corner-bar').classList.contains('open'));
      await shot('1-menu');
      await page.mouse.click(60, 200); await page.waitForTimeout(200);
      const closed = await page.evaluate(() => !document.querySelector('.corner-bar').classList.contains('open'));
      check(name, '☰ opens the column, a tap elsewhere closes it', open && closed);
    }
    await shot('2-title');
    if (phone) { // the save dialogs sit high, above the on-screen keyboard (0.00223: their twin never matched)
      await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Import Save/.test(x.textContent)).click());
      await page.waitForTimeout(300);
      const dlg = await page.evaluate(() => { const o = document.querySelector('.update-overlay'); const m = o?.querySelector('.update-modal'); return o && m ? { align: getComputedStyle(o).alignItems, top: m.getBoundingClientRect().top } : null; });
      check(name, 'title: the Import Save dialog sits at the top for the keyboard', dlg && dlg.align === 'flex-start' && dlg.top <= 10, dlg ? `${dlg.align}, top ${Math.round(dlg.top)}` : 'no dialog');
      await shot('2b-import');
      await page.evaluate(() => [...document.querySelectorAll('.update-overlay button')].find((x) => /Cancel/.test(x.textContent)).click());
      await page.waitForTimeout(200);
    }
    // the Great Hall (a named, spent-out profile: no name prompt, no "Descend Now?" confirm, no benchmark ask)
    await page.evaluate(async () => {
      const { getProfile, persist } = await import('/src/meta/profile.js'); const p = getProfile(); p.name = 'Layout'; p.coins = 0; p.xp = 0; persist();
      const { go, isTransitioning } = await import('/src/core/scene.js');
      // go() is dropped during a transition (the title's fade may still run): ask until the hall is up
      for (let i = 0; i < 40 && !document.body.textContent.toUpperCase().includes('GREAT HALL'); i++) { if (!isTransitioning()) go('hub'); await new Promise((r) => setTimeout(r, 500)); }
    });
    await page.waitForFunction(() => document.body.textContent.toUpperCase().includes('GREAT HALL'), null, { timeout: 20000 });
    await page.waitForTimeout(2200); // (the hub screenshot wants the windows in)
    await settled(page);
    const inner = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth }));
    check(name, 'hub: nothing overflows sideways', inner.scrollW <= inner.w, `${inner.scrollW} of ${inner.w}`);
    const descend = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Descend/.test(x.textContent)); const r = b?.getBoundingClientRect(); const c = document.querySelector('.hub-container'); return r ? { bottom: r.bottom, h: r.height, scrolls: c ? c.scrollHeight > c.clientHeight : false } : null; });
    if (name === 'narrow') { // one column: taller than the window by design, so the container scrolls and Descend is reachable at its end (0.00223: it was not)
      const reach = descend && (descend.bottom <= inner.h + 0.5 || (descend.scrolls && await page.evaluate(() => { const c = document.querySelector('.hub-container'); c.scrollTop = c.scrollHeight; const b = [...document.querySelectorAll('button')].find((x) => /Descend/.test(x.textContent)); return b.getBoundingClientRect().bottom <= innerHeight + 0.5; })));
      check(name, 'hub: Descend on screen, or the one-column hall scrolls to it', !!reach, descend ? `bottom ${Math.round(descend.bottom)} of ${inner.h}, scrolls ${descend.scrolls}` : 'no button');
      await page.evaluate(() => { const c = document.querySelector('.hub-container'); if (c) c.scrollTop = 0; });
    } else check(name, 'hub: Descend on screen', descend && descend.bottom <= inner.h + 0.5, descend ? `bottom ${Math.round(descend.bottom)} of ${inner.h}` : 'no button');
    if (phone) {
      const hub = await page.evaluate(() => ({ phone: !!document.querySelector('.phone-hub'), tabs: document.querySelectorAll('.phone-hub .tabs button').length, sheets: document.querySelectorAll('.phone-hub .tab-body > .panel').length, first: document.querySelector('.phone-hub .tab-body > .panel')?.classList.contains('on') }));
      check(name, 'hub: the phone hall — three tabs, three sheets, the first up', hub.phone && hub.tabs === 3 && hub.sheets === 3 && hub.first, JSON.stringify(hub));
      await shot('3-hub');
      await page.evaluate(() => document.querySelectorAll('.phone-hub .tab-body > .panel')[2].click()); await page.waitForTimeout(350);
      const lifted = await page.evaluate(() => document.querySelectorAll('.phone-hub .tab-body > .panel')[2].classList.contains('on') && document.querySelectorAll('.phone-hub .tabs button')[2].classList.contains('on'));
      check(name, 'hub: a tap on a sheet behind lifts it (and its tab)', lifted);
      await shot('4-hub-equipment');
      await page.evaluate(() => document.querySelectorAll('.phone-hub .tabs button')[0].click()); await page.waitForTimeout(200);
    } else {
      const hub = await page.evaluate(() => { const left = document.querySelector('.hub-wrap > .panel'); const bar = document.querySelector('.corner-bar').getBoundingClientRect(); const wrap = document.querySelector('.hub-wrap').getBoundingClientRect(); return { phone: !!document.querySelector('.phone-hub'), wrap: !!left, scroll: left ? left.scrollHeight - left.clientHeight : -1, clear: wrap.right <= bar.left + 1 }; });
      check(name, 'hub: the desktop columns, no phone hall', hub.wrap && !hub.phone);
      if (name === 'desktop') check(name, 'hub: the left panel does not scroll', hub.scroll <= 0, `${hub.scroll}px hidden`); // (a tablet's 44px tap targets make it scroll, Descend on screen — 0.00205's call)
      if (name === 'tablet') check(name, 'hub: the columns keep clear of the corner column', hub.clear);
      await shot('3-hub');
    }
    // a fight
    await settled(page);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Descend/.test(x.textContent)).click());
    // (a not-yet-ready preload legitimately holds the descent — "Gathering shadows…" — but a dropped go() would wait here forever)
    const started = await page.waitForFunction(async () => { const { isTransitioning } = await import('/src/core/scene.js'); const b = [...document.querySelectorAll('button')].find((x) => /Descend|Gathering/.test(x.textContent)); return isTransitioning() || !!document.querySelector('.battle-line') || /Gathering/.test(b?.textContent ?? ''); }, null, { timeout: 5000 }).then(() => true, () => false);
    check(name, "hub: Descend starts the descent (its go('dungeon') is not dropped)", started);
    await page.waitForSelector('.battle-line', { state: 'attached', timeout: 150000 });
    await page.waitForTimeout(4500);
    const fight = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const atk = [...document.querySelectorAll('.enemy-unit .unit-actions button')].map((b) => r(b));
      const knight = [...document.querySelectorAll('.player-unit .unit-actions button')].map((b) => r(b));
      const cards = [...document.querySelectorAll('.char-card')].map((c) => Math.round(r(c).bottom));
      const log = document.querySelector('#combat-log'); const lr = r(log);
      const shown = [...log.children].filter((c) => getComputedStyle(c).display !== 'none').length;
      const bar = r(document.querySelector('.corner-bar')); const line = r(document.querySelector('.battle-line'));
      const last = [...document.querySelectorAll('.enemy-unit')].pop(); const lastRight = last ? r(last).right : 0;
      return { atk, knight, cards, log: { left: lr.left, right: lr.right, height: lr.height, lines: log.children.length, shown }, barLeft: bar.left, lastRight, lineRight: line.right, scrollW: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight };
    });
    await shot('5-fight');
    check(name, 'fight: nothing overflows sideways', fight.scrollW <= fight.w, `${fight.scrollW} of ${fight.w}`);
    if (phone) {
      check(name, 'fight: every card bottom on one line', new Set(fight.cards).size === 1, fight.cards.join(','));
      check(name, "fight: the foes' Attack buttons are gone (the card is the button)", fight.atk.every((b) => b.width === 0 && b.height === 0), `${fight.atk.length} buttons`);
      check(name, "fight: the knight's two buttons, 40px tall, under his card", fight.knight.length === 2 && fight.knight.every((b) => b.height >= 40 && b.bottom <= fight.h), fight.knight.map((b) => `${Math.round(b.width)}x${Math.round(b.height)}`).join(' '));
      const kRight = Math.max(...fight.knight.map((b) => b.right));
      check(name, 'fight: the log is a one-line strip beside the buttons', fight.log.height <= 44 && fight.log.shown === 1 && fight.log.left >= kRight && fight.log.right <= fight.w, `h ${Math.round(fight.log.height)}, ${fight.log.shown} of ${fight.log.lines} lines, left ${Math.round(fight.log.left)} vs buttons' right ${Math.round(kRight)}`);
      // the worst case for the top strip (0.00223): the longest room name with the record tag, four-digit XP and coins
      const title = await page.evaluate((longName) => {
        const t = document.querySelector('.room-title'); if (!t) return null;
        t.textContent = `Room 22 - ${longName}`;
        const tag = document.createElement('span'); tag.className = 'record-tag'; tag.textContent = '★ Record depth'; t.append(tag);
        document.getElementById('hud-coins').textContent = '4769'; document.getElementById('hud-xp').textContent = '1234';
        const r = t.getBoundingClientRect(), res = document.querySelector('.resources').getBoundingClientRect(), menu = document.querySelector('.corner-bar .menu-toggle').getBoundingClientRect();
        return { left: r.left, right: r.right, resRight: res.right, menuLeft: menu.left, clipped: t.scrollWidth <= t.clientWidth, overflow: getComputedStyle(t).textOverflow };
      }, LONG_NAME);
      check(name, 'fight: the room title sits between XP / COINS and ☰, an ellipsis past that', title && title.left >= title.resRight && title.right <= title.menuLeft + 1 && title.overflow === 'ellipsis', title ? `title ${Math.round(title.left)}-${Math.round(title.right)}, counters' right ${Math.round(title.resRight)}, ☰ at ${Math.round(title.menuLeft)}` : 'no title');
      await shot('5b-fight-long-title');
    } else {
      check(name, 'fight: an Attack button under every foe', fight.atk.length >= 1 && fight.atk.every((b) => b.height >= 20), `${fight.atk.length} buttons`);
      check(name, 'fight: the log box', fight.log.height >= 90 && fight.log.shown === fight.log.lines, `h ${Math.round(fight.log.height)}`);
      if (name === 'tablet') check(name, 'fight: the last card keeps clear of the corner column', fight.lastRight <= fight.barLeft + 1, `${Math.round(fight.lastRight)} vs ${Math.round(fight.barLeft)}`);
    }
    await settled(page);
    await page.evaluate(() => document.querySelector('.enemy-char.targetable')?.click());
    await page.waitForTimeout(1500);
    await shot('6-fight-hit');
    // the panel rooms, rendered in place (a shrine is rooms away)
    // the run's end (0.00216: its button clipped on a phone)
    await settled(page);
    await page.evaluate(async () => {
      const [{ runEndScene }, { show }, { createRun }] = await Promise.all([import('/src/ui/scenes/runEndScene.js'), import('/src/core/scene.js'), import('/src/run/runState.js')]);
      const run = createRun(); Object.assign(run, { roomNumber: 2, kills: 6, coins: 43, coinsRetrieved: 22, coinsLost: 21, tollPct: 0.5, xp: 40, itemsFound: [{ id: 'ring_of_might' }], potions: 4, equipSummary: { equipped: [{ name: 'Ring of Might', tier: 2 }], salvaged: [], coins: 0 } });
      show(runEndScene(run, 'death'));
    });
    await page.waitForTimeout(1800);
    const end = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Great Hall/.test(x.textContent)); const r = b?.getBoundingClientRect(); const p = document.querySelector('#app > .panel'); return r ? { bottom: r.bottom, h: innerHeight, scroll: p ? p.scrollHeight - p.clientHeight : 0 } : null; });
    check(name, 'run end: Return to the Great Hall on screen, nothing to scroll', end && end.bottom <= end.h + 0.5 && end.scroll <= 0, end ? `bottom ${Math.round(end.bottom)} of ${end.h}, ${end.scroll}px hidden` : 'no button');
    await shot('6b-runend');
    for (const kind of ['shrine', 'treasure']) {
      await settled(page); // (the run end's fade: the room is rendered into a settled window)
      await page.evaluate(async (kind) => {
        const [{ renderShrineRoom }, { renderTreasureRoom }, { generateInterlude }, { createRun }, { el }, { dealOffers }, { createBuffBar, updateBuffs }, { logLine }] = await Promise.all([import('/src/ui/shrineUI.js'), import('/src/ui/treasureUI.js'), import('/src/run/roomGen.js'), import('/src/run/runState.js'), import('/src/core/dom.js'), import('/src/run/shrine.js'), import('/src/ui/buffs.js'), import('/src/ui/hud.js')]);
        const run = createRun(); run.roomNumber = 5; const room = generateInterlude(kind, 6, run); if (kind === 'shrine') room.dealtOffers = dealOffers(run, room);
        // the real pieces (0.00223): the game's log with a line in it and the boons' bar with three boons — the panel's height is theirs too
        const logEl = el('div', { id: 'combat-log' }); logLine(logEl, 'You push deeper into the dark.', 'move');
        run.buffs.push(...dealOffers(run, room).slice(0, 3).map((o) => ({ icon: o.icon, img: o.img, label: o.short ?? o.buff, full: o.buff, id: o.id }))); // (the room's render fills the bar from run.buffs)
        const buffBar = createBuffBar(); updateBuffs(buffBar, run.buffs);
        const h = { title: [room.name], logEl, buffBar, coins: 120, xp: 40, onDeeper() {}, onRetreat() {}, refresh() {}, onDeath() {} };
        (kind === 'shrine' ? renderShrineRoom : renderTreasureRoom)(document.getElementById('app'), run, room, h);
      }, kind);
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Push Deeper/.test(x.textContent)); const rr = b?.getBoundingClientRect(); const p = document.querySelector('#app > .panel'); return rr ? { bottom: rr.bottom, h: innerHeight, scroll: p ? p.scrollHeight - p.clientHeight : 0 } : null; });
      if (phone || name === 'desktop') check(name, `${kind}: Push Deeper on screen, nothing to scroll`, r && r.bottom <= r.h + 0.5 && r.scroll <= 1, r ? `bottom ${Math.round(r.bottom)} of ${r.h}, ${r.scroll}px hidden` : 'no button'); // (1px: a fraction of rounding in the panel's rows, not a scroll)
      else { // a short desktop window (the tablet's, the narrow one's): the panel may scroll, and scrolled to its end the button is on screen
        const reach = r && (r.bottom <= r.h + 0.5 || (r.scroll > 0 && await page.evaluate(() => { const p = document.querySelector('#app > .panel'); p.scrollTop = p.scrollHeight; const b = [...document.querySelectorAll('button')].find((x) => /Push Deeper/.test(x.textContent)); return b.getBoundingClientRect().bottom <= innerHeight + 0.5; })));
        check(name, `${kind}: Push Deeper on screen, or the panel scrolls to it`, !!reach, r ? `bottom ${Math.round(r.bottom)} of ${r.h}, ${r.scroll}px hidden` : 'no button');
      }
      if (phone) { // the boons' bar (0.00223: top-right beside ☰; it used to sit on the panel's log and buttons)
        const hit = await page.evaluate(() => {
          const r = (e) => e.getBoundingClientRect();
          const b = r(document.querySelector('#buffs'));
          const over = (q) => b.width > 0 && q.left < b.right && q.right > b.left && q.top < b.bottom && q.bottom > b.top;
          const pieces = [...document.querySelectorAll('#app > .panel #combat-log, #app > .panel .btn-row, #app > .panel .run-hud > *, .corner-bar .menu-toggle')];
          return { shown: b.width > 0, hits: pieces.filter((e) => over(r(e))).map((e) => e.className || e.id) };
        });
        check(name, `${kind}: the boons keep clear of the log, the buttons, the counters and ☰`, hit.shown && hit.hits.length === 0, hit.hits.join(', ') || (hit.shown ? 'clear' : 'no bar'));
      }
      await shot(`7-${kind}`);
    }
    check(name, 'no page errors', errors.length === 0, errors.join(' | ').slice(0, 200));
  } catch (e) {
    check(name, 'the run itself', false, String(e.message ?? e).split('\n')[0].slice(0, 160));
    await shot('X-failed').catch(() => {});
  } finally {
    await browser.close();
  }
}

await mkdir(OUT, { recursive: true });
const { server, url } = await serve();
try {
  for (const [name, opts] of Object.entries(PROFILES)) {
    if (only && name !== only) continue;
    await run(name, opts, url);
  }
} finally { server.close(); }
console.log(failed ? `\n${failed} check(s) FAILED — screenshots in ${OUT}` : `\nall layouts hold — screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
