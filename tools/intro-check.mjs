#!/usr/bin/env node
// tools/intro-check.mjs — the title's fly-in (ui/titleIntro.js, 0.00315)
// driven headless in the real game, on a desktop window and on a phone:
//
//   node tools/intro-check.mjs [--only desktop|phone] [--out /tmp/intro-check]
//
// Headless Chromium plays no H.264, so the films the data names are
// transcoded to VP9 WebM once (ffmpeg, cached under --out by name and
// size) and the page is served with backgrounds.json pointing at them —
// the game's own code path otherwise (the codec asked for by name,
// titleIntro.js TYPE). Per profile: the layer comes up over the title with
// the panel held under it; the film plays; the fade begins before the end
// by the film's own clock; the layer leaves and the panel comes back; a key
// skips it and goes no further; and the HAND-OVER — the renderer frozen at
// rest (sway and fog off) against the film's last frame cover-fit to the
// screen under the layer's vignette, SSIM over `MIN_SSIM` (a sway left
// running scores ~0.6). The phone profile taps the PLAY gate first.
// Needs Playwright (PLAYWRIGHT_PATH / CHROMIUM, the cloud container's /opt
// paths by default) and ffmpeg.
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('--only', null);
const OUT = resolve(arg('--out', '/tmp/intro-check'));
const PW = process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const MIN_SSIM = 0.85;

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
const PROFILES = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 852, height: 393 }, screen: { width: 390, height: 844 }, userAgent: IPHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};

let failed = 0;
const check = (profile, name, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${profile.padEnd(8)} ${name}${detail ? `  (${detail})` : ''}`); if (!pass) failed++; };

await mkdir(OUT, { recursive: true });
const data = JSON.parse(await readFile(join(ROOT, 'assets/data/backgrounds.json'), 'utf8'));
const intro = data.intro;
const films = [...new Set([intro.file, intro.phone?.file].filter(Boolean))];

// the films as VP9 (headless Chromium has no H.264), once per file and size
const webmOf = {};
for (const f of films) {
  const src = join(ROOT, 'assets/video', f);
  const { size } = await stat(src);
  const out = join(OUT, `${f.replace(/\.\w+$/, '')}-${size}.webm`);
  if (!existsSync(out)) {
    console.log(`transcoding ${f} -> ${out}`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', out]);
  }
  webmOf[f] = out;
}
const swapped = JSON.parse(JSON.stringify(data));
swapped.intro.file = `${intro.file}.webm`;
if (swapped.intro.phone?.file) swapped.intro.phone.file = `${intro.phone.file}.webm`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      let body;
      if (path === '/assets/data/backgrounds.json') body = Buffer.from(JSON.stringify(swapped));
      else if (path.startsWith('/assets/video/') && path.endsWith('.webm')) body = await readFile(webmOf[path.slice('/assets/video/'.length).replace(/\.webm$/, '')]);
      else body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'content-length': body.length });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

// the SSIM between two pictures (ffmpeg)
function ssim(a, b) {
  const log = spawnSync('ffmpeg', ['-i', a, '-i', b, '-lavfi', '[0][1]ssim', '-f', 'null', '-'], { encoding: 'utf8' }).stderr; // (ffmpeg prints the figure on stderr)
  return Number(/All:([\d.]+)/.exec(log)?.[1] ?? 0);
}

const STATE = () => ({
  video: !!document.querySelector('#intro video'), t: document.querySelector('#intro video')?.currentTime ?? null, duration: document.querySelector('#intro video')?.duration ?? null,
  ended: document.querySelector('#intro video')?.ended ?? null, fading: document.getElementById('intro')?.classList.contains('fading') ?? null, gone: !document.getElementById('intro'),
  held: document.querySelector('.title-panel')?.classList.contains('intro-hold') ?? null, panelOpacity: document.querySelector('.title-panel') ? getComputedStyle(document.querySelector('.title-panel')).opacity : null,
  gl: document.getElementById('bg-stack').classList.contains('gl'),
});

async function open(browser, name, opts, url, before = null) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (before) await before(page);
  await page.goto(`${url}?debug`);
  if (name === 'phone') {
    const gate = await page.waitForSelector('.phone-gate', { timeout: 90000 }).catch(() => null);
    if (gate) await page.click('.phone-gate button.primary');
  }
  const up = await page.waitForSelector('#intro', { state: 'attached', timeout: 120000 }).then(() => true, () => false);
  return { ctx, page, errors, up };
}

async function run(name, opts, url) {
  const { chromium } = await import(PW);
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const file = name === 'phone' && intro.phone?.file ? intro.phone.file : intro.file;
  try {
    // 1. the whole sequence
    {
      const { ctx, page, errors, up } = await open(browser, name, opts, url);
      check(name, 'the layer comes up over the title', up);
      if (up) {
        const state = () => page.evaluate(STATE);
        await page.waitForTimeout(700);
        const s1 = await state();
        check(name, 'the film plays, the panel held under it, the renderer live', s1.video && s1.t > 0.2 && !s1.fading && s1.held && s1.panelOpacity === '0' && s1.gl, JSON.stringify(s1));
        check(name, 'a phone plays its own film', name !== 'phone' || await page.evaluate(() => document.querySelector('#intro video')?.getAttribute('src')?.includes('720')), file);
        await page.screenshot({ path: join(OUT, `${name}-1-flight.png`) });
        await page.waitForFunction(() => document.getElementById('intro')?.classList.contains('fading'), null, { timeout: 15000 }).catch(() => {});
        const s2 = await state();
        check(name, 'the fade begins before the end, by the film\'s own clock', s2.fading && !s2.ended && s2.duration - s2.t <= intro.leadMs / 1000 + 0.2 && s2.duration - s2.t >= 0, `${(s2.duration - s2.t).toFixed(2)} s before the end`);
        await page.screenshot({ path: join(OUT, `${name}-2-fade.png`) });
        await page.waitForSelector('#intro', { state: 'detached', timeout: intro.fadeMs + 3000 }).catch(() => {});
        await page.waitForTimeout(1200);
        const s3 = await state();
        check(name, 'the layer leaves and the title\'s panel comes back', s3.gone && !s3.held && s3.panelOpacity === '1', JSON.stringify(s3));
        await page.screenshot({ path: join(OUT, `${name}-3-title.png`) });
      }
      check(name, 'no page errors', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    // 2. the hand-over: what the fade crosses, as the screen shows it — the film's last frame under the layer's own
    // vignette against the renderer at rest, the same pixels, DPR and crop. This page alone is served a 60 s fade with
    // no lead (the layer stays up, opaque, past the film's end; finish() has put the renderer at rest), the sway and the
    // fog frozen; the renderer is then shown by making the layer transparent
    {
      const slow = JSON.stringify({ ...swapped, intro: { ...swapped.intro, leadMs: 0, holdMs: 0, fadeMs: 60000 } });
      const { ctx, page, up } = await open(browser, name, opts, url, (page) => page.route('**/assets/data/backgrounds.json*', (route) => route.fulfill({ contentType: 'application/json', body: slow })));
      if (up) {
        await page.evaluate(async () => { const m = await import('/src/core/bg3d.js'); m.setLiveTuning({ speed: 0, fogScale: 0 }); document.body.classList.add('fg-hidden'); });
        await page.waitForFunction(() => document.querySelector('#intro video')?.ended, null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(200);
        const held = join(OUT, `${name}-4-held.png`), rest = join(OUT, `${name}-4-rest.png`);
        await page.screenshot({ path: held });
        await page.evaluate(() => { const l = document.getElementById('intro'); l.style.transition = 'none'; l.style.opacity = '0'; });
        await page.waitForTimeout(300);
        await page.screenshot({ path: rest });
        const s = ssim(held, rest);
        check(name, `the hand-over: the renderer at rest IS the film's last frame under the vignette (SSIM >= ${MIN_SSIM})`, s >= MIN_SSIM, s.toFixed(3));
      } else check(name, 'the hand-over', false, 'no layer');
      await ctx.close();
    }
    // 3. a key skips, and goes no further than the film
    {
      const { ctx, page, up } = await open(browser, name, opts, url);
      if (up) {
        await page.waitForTimeout(600);
        await page.keyboard.press('e'); // the title's own key: Enter the Castle, if it got through
        await page.waitForTimeout(80);
        const s1 = await page.evaluate(STATE);
        const gone = await page.waitForSelector('#intro', { state: 'detached', timeout: intro.fadeMs + 2000 }).then(() => true, () => false);
        await page.waitForTimeout(600);
        const text = await page.evaluate(() => document.body.textContent);
        check(name, 'a key skips the film and goes no further', s1.fading && gone && text.includes('Enter the Castle') && !text.includes('CHOOSE YOUR HERO'), JSON.stringify(s1));
      } else check(name, 'the skip', false, 'no layer');
      await ctx.close();
    }
  } finally { await browser.close(); }
}

const { server, url } = await serve();
try {
  for (const [name, opts] of Object.entries(PROFILES)) {
    if (only && name !== only) continue;
    await run(name, opts, url);
  }
} finally { server.close(); }
console.log(failed ? `${failed} check(s) FAILED — screenshots in ${OUT}` : `all passed — screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
