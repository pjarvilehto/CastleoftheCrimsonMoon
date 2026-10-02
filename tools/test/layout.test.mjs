// tools/test/layout.test.mjs — the two layouts stay one code path (0.00209).
// styles.css section 16 (the phone layer, under platform.js PHONE_MQ)
// overrides the desktop's rules: every class it names must be one the code
// produces (a rename in src/ that leaves a phone rule behind fails here),
// every rule it overrides must still have its desktop rule above it (a
// desktop rule removed without its phone twin fails here), and the layer
// stays where it is — at the end, after the touch blocks, so it wins ties.
// The geometry itself is tools/layout-check.mjs (a browser).

import { ok, readFileSync } from './harness.mjs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

{
  const { PHONE_MQ } = await import('../../src/shared/platform.js');
  const css = readFileSync('styles.css', 'utf8');
  const start = css.indexOf('/* ================= 16 Phones');
  const base = css.slice(0, start), phone = css.slice(start);
  ok('the phone layer is the last section, after the touch blocks', start > 0 && base.includes('@media (pointer: coarse) {') && base.lastIndexOf('@media (pointer: coarse)') < start);
  const block = phone.slice(phone.indexOf(`@media ${PHONE_MQ} {`));
  ok('the phone layer opens with the platform query', block.length > 0);
  // every class the phone layer names is produced somewhere (src, index.html) or is a CSS-only state the base defines
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
  const code = walk('src').map((p) => readFileSync(p, 'utf8')).join('\n') + readFileSync('index.html', 'utf8');
  const classes = [...new Set([...phone.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))].filter((c) => !/^\d/.test(c));
  const stateOnly = new Set(['on', 'open', 'pick-3', 'spend', 'docked', 'targetable', 'active', 'primary']); // set by classList / a class string the code builds
  const orphans = classes.filter((c) => !stateOnly.has(c) && !new RegExp(`['"\`\\s]${c}['"\`\\s:]`).test(code) && !code.includes(`'${c}'`) && !code.includes(`${c} `) && !base.includes(`.${c}`));
  ok('every class the phone layer names is one the code produces', orphans.length === 0, orphans.join(', '));
  // every selector the layer overrides still has its desktop rule above it — derived from the block itself, so a new
  // override is checked the day it lands; the phone's own pieces (the hall's sheets, the gate, ☰) are the exceptions
  const phoneOnly = /^(:root|\.phone-hub|\.gate-card|\.phone-gate|\.corner-bar(\.open| > \.menu-toggle|:not)|\.player-unit$|\.player-unit |\.title-panel)/; // (.player-unit and .title-panel: classes the code makes that only the phone styles)
  const heads = [...block.matchAll(/([^{}@]+)\{/g)].map((m) => m[1].trim()).filter((h) => !/^\d+%|^from$|^to$/.test(h));
  const firsts = [...new Set(heads.flatMap((h) => h.split(',').map((x) => x.trim())).filter((x) => x && !phoneOnly.test(x)).map((x) => x.match(/^[.#][\w-]+/)?.[0]).filter(Boolean))];
  const missing = firsts.filter((sel) => !new RegExp(`(^|[\\s,}])${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,{:>.#\\[]`, 'm').test(base));
  ok('every rule the phone layer overrides still has its desktop rule', firsts.length > 20 && missing.length === 0, missing.join(', ') || `${firsts.length} selectors`);
  ok('the phone layer uses no !important, and animates only opacity and transform in its loops', !block.includes('!important') && !/animation:[^;]*(box-shadow|filter)/.test(block));
  // the layer's reduced-motion escape and the gate are outside the media block (the gate's overlay is mounted by phoneGate.js on a phone only)
  ok('reduced motion stops the sheets\' lift and the log\'s flash', phone.includes('@media (prefers-reduced-motion: reduce)') && /prefers-reduced-motion[\s\S]*transition: none[\s\S]*animation: none/.test(phone));
}
