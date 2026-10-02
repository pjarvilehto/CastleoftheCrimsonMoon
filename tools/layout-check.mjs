#!/usr/bin/env node
// tools/layout-check.mjs — the layout contract, desktop AND phone (0.00209).
//
// The game has two layouts in one code path: the desktop's (tablets too)
// and the phone's (styles.css section 16 under platform.js PHONE_MQ,
// hubScene's phoneHall, the ☰ column, the gate). A change to combat's
// chrome, the Great Hall, a panel room or a dialog must hold on both — this
// drives the REAL game headless through the title, the Great Hall, a fight,
// a shrine and a treasure room at four screens and asserts what each layout
// promises (every card on one line on a phone, the log one line, the foes'
// Attack buttons gone; the desktop's column, log box and Attack buttons
// untouched; Descend and Push Deeper on screen everywhere; nothing
// overflowing sideways). Screenshots land in --out for a look.
//
//   node tools/layout-check.mjs [--only phone|phone-small|tablet|desktop] [--out dir]
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
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.bin': 'application/octet-stream' };
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
  tablet: { viewport: { width: 1180, height: 820 }, screen: { width: 1024, height: 1366 }, userAgent: IPAD, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 852, height: 393 }, screen: { width: 390, height: 844 }, userAgent: IPHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  'phone-small': { viewport: { width: 740, height: 360 }, screen: { width: 360, height: 740 }, userAgent: IPHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};

let failed = 0;
const check = (profile, name, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${profile.padEnd(11)} ${name}${detail ? `  (${detail})` : ''}`); if (!pass) failed++; };

// what the page reports about an element
const rect = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; })()`;

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
    // the Great Hall (a named, spent-out profile: no name prompt, no "Descend Now?" confirm, no benchmark ask)
    await page.evaluate(async () => {
      const { getProfile, persist } = await import('/src/meta/profile.js'); const p = getProfile(); p.name = 'Layout'; p.coins = 0; p.xp = 0; persist();
      const { go, isTransitioning } = await import('/src/core/scene.js');
      // go() is dropped during a transition (the title's fade may still run): ask until the hall is up
      for (let i = 0; i < 40 && !document.body.textContent.toUpperCase().includes('GREAT HALL'); i++) { if (!isTransitioning()) go('hub'); await new Promise((r) => setTimeout(r, 500)); }
    });
    await page.waitForFunction(() => document.body.textContent.toUpperCase().includes('GREAT HALL'), null, { timeout: 20000 });
    await page.waitForTimeout(2200);
    const inner = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth }));
    check(name, 'hub: nothing overflows sideways', inner.scrollW <= inner.w, `${inner.scrollW} of ${inner.w}`);
    const descend = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Descend/.test(x.textContent)); const r = b?.getBoundingClientRect(); return r ? { bottom: r.bottom, h: r.height } : null; });
    check(name, 'hub: Descend on screen', descend && descend.bottom <= inner.h + 0.5, descend ? `bottom ${Math.round(descend.bottom)} of ${inner.h}` : 'no button');
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
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Descend/.test(x.textContent)).click());
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
    } else {
      check(name, 'fight: an Attack button under every foe', fight.atk.length >= 1 && fight.atk.every((b) => b.height >= 20), `${fight.atk.length} buttons`);
      check(name, 'fight: the log box', fight.log.height >= 90 && fight.log.shown === fight.log.lines, `h ${Math.round(fight.log.height)}`);
      if (name === 'tablet') check(name, 'fight: the last card keeps clear of the corner column', fight.lastRight <= fight.barLeft + 1, `${Math.round(fight.lastRight)} vs ${Math.round(fight.barLeft)}`);
    }
    await page.evaluate(() => document.querySelector('.enemy-char.targetable')?.click());
    await page.waitForTimeout(1500);
    await shot('6-fight-hit');
    // the panel rooms, rendered in place (a shrine is rooms away)
    // the run's end (0.00216: its button clipped on a phone)
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
      await page.evaluate(async (kind) => {
        const [{ renderShrineRoom }, { renderTreasureRoom }, { generateInterlude }, { createRun }, { el }, { dealOffers }] = await Promise.all([import('/src/ui/shrineUI.js'), import('/src/ui/treasureUI.js'), import('/src/run/roomGen.js'), import('/src/run/runState.js'), import('/src/core/dom.js'), import('/src/run/shrine.js')]);
        const run = createRun(); run.roomNumber = 5; const room = generateInterlude(kind, 6, run); if (kind === 'shrine') room.dealtOffers = dealOffers(run, room);
        const h = { title: [room.name], logEl: el('div'), buffBar: el('div'), coins: 120, xp: 40, onDeeper() {}, onRetreat() {}, refresh() {}, onDeath() {} };
        (kind === 'shrine' ? renderShrineRoom : renderTreasureRoom)(document.getElementById('app'), run, room, h);
      }, kind);
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Push Deeper/.test(x.textContent)); const rr = b?.getBoundingClientRect(); return rr ? { bottom: rr.bottom, h: innerHeight } : null; });
      check(name, `${kind}: Push Deeper on screen`, r && r.bottom <= r.h + 0.5, r ? `bottom ${Math.round(r.bottom)} of ${r.h}` : 'no button');
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
