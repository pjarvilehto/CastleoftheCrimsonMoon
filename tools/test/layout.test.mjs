// tools/test/layout.test.mjs — the two layouts stay one code path (0.00209).
// styles.css section 16 (the phone layer) is a set of `html.phone` rules,
// each the twin of a desktop rule: the boot puts the class on <html> from
// platform.js PHONE_MQ (the stylesheet carries no query of its own). Every
// class the layer names must be one the code produces (a rename in src/
// that leaves a phone rule behind fails here), every twin must still have
// its desktop rule (a desktop rule removed without its twin fails here),
// every rule must carry the html.phone prefix (so it always outranks the
// desktop's), and the layer stays last so equal rules fall its way. The
// geometry itself is tools/layout-check.mjs (a browser).

import { ok, readFileSync } from './harness.mjs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

{
  const css = readFileSync('styles.css', 'utf8');
  const start = css.indexOf('/* ================= 16 Phones');
  const base = css.slice(0, start), phone = css.slice(start);
  const marker = "/* -- html.phone: the desktop rules' twins -- */";
  ok('the phone layer is the last section, after the touch blocks, and carries no media query of its own', start > 0 && base.includes('@media (pointer: coarse) {')
    && base.lastIndexOf('@media (pointer: coarse)') < start && phone.includes(marker) && !/@media \(max-height: 500px\)/.test(phone) && !/@media[^{]*orientation/.test(phone));
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ''); // (comments name files and builds: not selectors, not classes)
  const block = strip(phone.slice(phone.indexOf(marker) + marker.length));
  // every rule head after the marker: html.phone first, then the desktop rule's own selector
  const heads = [...block.matchAll(/([^{}@]+)\{/g)].map((m) => m[1].trim()).filter((h) => !/^\d+%|^from$|^to$|^(media|supports|keyframes)\b/.test(h));
  // (split on top-level commas only: a :has(a, b) list is one selector — 0.00223, the save dialogs' twin repeated the prefix inside it to pass here and never matched)
  const splitTop = (h) => { const out = []; let d = 0, cur = ''; for (const ch of h) { if (ch === '(') d++; else if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } return [...out, cur]; };
  const sels = heads.flatMap((h) => splitTop(h).map((x) => x.trim())).filter(Boolean);
  ok('a :has() list inside a twin is one selector, prefixed once', sels.includes('html.phone .update-overlay:has(.name-input, .save-code)') && !/:(has|is|where|not)\([^)]*html\.phone/.test(block));
  const unprefixed = sels.filter((x) => !/^html\.phone(\s|$)/.test(x));
  ok('every rule in the layer is an html.phone rule', sels.length > 60 && unprefixed.length === 0, unprefixed.join(' | '));
  // every twin still has its desktop rule above it — derived from the block itself, so a new override is checked the day it
  // lands; the phone's own pieces (the hall's sheets and tabs, the gate, ☰) and two classes only the phone styles are the exceptions
  const phoneOnly = /^(\.phone-hub|\.gate-card|\.phone-gate|\.corner-bar(\.open| > \.menu-toggle|:not)|\.player-unit$|\.player-unit |\.treasure-cards |#app > \.panel\.title-panel)/; // (.player-unit, .treasure-cards, .title-panel: classes the code makes that only the phone styles)
  const firsts = [...new Set(sels.map((x) => x.replace(/^html\.phone\s*/, '')).filter((x) => x && !phoneOnly.test(x)).map((x) => x.match(/^[.#][\w-]+/)?.[0]).filter(Boolean))];
  const missing = firsts.filter((sel) => !new RegExp(`(^|[\\s,}])${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,{:>.#\\[]`, 'm').test(base));
  ok('every rule the phone layer overrides still has its desktop rule', firsts.length > 20 && missing.length === 0, missing.join(', ') || `${firsts.length} selectors`);
  // every class the layer names is produced by the code (src, index.html) — not merely styled by the base
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
  const code = walk('src').map((p) => readFileSync(p, 'utf8')).join('\n') + readFileSync('index.html', 'utf8');
  const classes = [...new Set([...strip(phone).matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))];
  const stateOnly = new Set(['on', 'open', 'pick-3', 'spend', 'docked', 'targetable', 'active', 'primary', 'phone', 'rarity-2', 'rarity-3', 'rarity-4']); // set by classList or a class string the code builds (hud.js rarityClass: `rarity-${t}`)
  const orphans = classes.filter((c) => !stateOnly.has(c) && !new RegExp('(^|[^\\w-])' + c + '([^\\w-]|$)', 'm').test(code));
  ok('every class the phone layer names is one the code produces', orphans.length === 0, orphans.join(', '));
  ok('the phone layer uses no !important, and animates only opacity and transform in its loops', !phone.includes('!important') && !/animation:[^;]*(box-shadow|filter)/.test(phone));
  ok('reduced motion stops the sheets\' lift and the log\'s flash', phone.includes('@media (prefers-reduced-motion: reduce)') && /prefers-reduced-motion[\s\S]*transition: none[\s\S]*animation: none/.test(phone));
  // the one number the layer and the code share: the card budget's ratios and the corner column's reach live in :root
  ok('the card ratios and the corner reach are declared once', (base.match(/--ratio-p: 0\.605/g) || []).length === 1 && !/0\.605 \+/.test(css) && !/padding-right: (calc\(1\.6vw \+ )?150px/.test(css));
  // every loop in the stylesheet is compositor-only (0.00223): a box-shadow, text-shadow or filter loop repaints its
  // element every frame it is on screen — the hall's rarity lines, the low-HP chip, the death and victory titles did
  const blocks = {}; const kf = /@keyframes ([\w-]+)\s*\{/g; let m;
  while ((m = kf.exec(css))) { let d = 1, i = kf.lastIndex; while (d && i < css.length) { if (css[i] === '{') d++; else if (css[i] === '}') d--; i++; } blocks[m[1]] = css.slice(kf.lastIndex, i - 1); }
  const loops = [...new Set([...strip(css).matchAll(/animation:([^;]*infinite[^;]*);/g)].flatMap((x) => x[1].split(',').map((a) => a.trim().split(/\s+/)[0])))];
  const props = (b) => [...b.matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
  const bad = loops.filter((n) => !blocks[n] || props(blocks[n]).some((p) => !['opacity', 'transform', 'translate', 'rotate', 'scale'].includes(p)));
  ok('every infinite loop animates opacity or a transform only', loops.length >= 10 && bad.length === 0, bad.join(', ') || `${loops.length} loops`);
  ok('the one-column hall scrolls inside its container under 1000px, Descend reachable (0.00223)', /@media \(max-width: 1000px\) \{[^}]*\}[\s\S]*?\.hub-container:not\(\.phone-hub\) \{ max-height: 100%; overflow-y: auto; \}/.test(css));
}
