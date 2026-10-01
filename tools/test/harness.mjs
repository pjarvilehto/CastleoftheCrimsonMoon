// tools/test/harness.mjs — shared setup for the smoke suite (split out of
// tools/smoke-test.mjs in 0.098). Every *.test.mjs file imports its helpers
// from here; tools/smoke-test.mjs runs the files in order.
//
// The DOM shim deliberately models browser constraints the easy version
// missed — `children` is getter-only (assigning to it threw on real DOM
// and shipped broken in 0.031), style lives behind setAttribute, etc.

import { readFileSync, readdirSync, statSync } from 'fs';
export { readFileSync, readdirSync, statSync };
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(ROOT);

export const counts = { passed: 0, failed: 0 };
export const ok = (name, cond, info = '') => {
  if (cond) { counts.passed++; console.log(`PASS  ${name}`); }
  else { counts.failed++; console.log(`FAIL  ${name}${info ? ' — ' + info : ''}`); }
};

// ---------- virtual clock (0.098) ----------
// The game paces everything with real timers (log drip, 1s scene fades,
// animation holds), which made the suite wait ~90s. Timers now run on a
// virtual clock: sleep(ms) advances it and fires every timer that falls
// due, in order, letting promise jobs settle between them. Tests keep
// their sleep() calls with the same meaning; they just cost no wall time.
const realImmediate = setImmediate;
const flush = () => new Promise((r) => realImmediate(r));
const EPOCH = Date.UTC(2026, 0, 1);
let clock = 0, seq = 0;
const timers = new Map(); // id -> { at, fn, args, every }
globalThis.setTimeout = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { id, at: clock + Math.max(0, Number(ms) || 0), fn, args }); return id; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
globalThis.setInterval = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { id, at: clock + Math.max(1, ms), fn, args, every: Math.max(1, ms) }); return id; };
globalThis.clearInterval = globalThis.clearTimeout;
Date.now = () => EPOCH + clock;
export const clockNow = () => clock;

// Advance virtual time by ms, running due timers in (time, creation) order.
export async function sleep(ms) {
  const target = clock + ms;
  await flush();
  for (;;) {
    let next = null;
    for (const tm of timers.values()) if (tm.at <= target && (!next || tm.at < next.at || (tm.at === next.at && tm.id < next.id))) next = tm;
    if (!next) break;
    clock = next.at;
    if (next.every) next.at += next.every; else timers.delete(next.id);
    try { next.fn(...next.args); } catch (e) {
      // Same as a real timer: an exception escapes to uncaughtException.
      if (process.listenerCount('uncaughtException')) process.emit('uncaughtException', e); else throw e;
    }
    await flush();
  }
  clock = target;
  await flush();
}

// ---------- DOM shim ----------
export class El {
  constructor(tag) {
    this.tagName = tag;
    this.attrs = {};
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.parent = null;
    this._text = '';
    const kids = [];
    // READ-ONLY children, like real DOM. Internal pushes go through the
    // array reference; assignments throw in module strict mode.
    Object.defineProperty(this, 'children', { get: () => kids, enumerable: true });
    const s = new Set();
    this.classList = {
      add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c),
      toggle: (c, on = !s.has(c)) => { if (on) s.add(c); else s.delete(c); return on; },
    };
  }
  set className(v) { this._cls = v; String(v).split(' ').filter(Boolean).forEach((c) => this.classList.add(c)); }
  get className() { return this._cls || ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  append(...nodes) {
    for (const n of nodes) {
      if (n instanceof El) { n.parent = this; this.children.push(n); }
      else if (typeof n === 'string') this.children.push({ text: n, textContent: n, walk() {} });
      else if (n && typeof n.textContent === 'string') this.children.push(n);
      else this.children.push({ text: String(n), textContent: String(n), walk() {} });
    }
  }
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); } }
  insertBefore(n, ref) {
    if (n.remove) n.remove();
    n.parent = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    this.children.splice(i < 0 ? this.children.length : i, 0, n);
  }
  get parentNode() { return this.parent ?? null; }
  after(...nodes) { // real DOM: insert right after this element
    if (!this.parent) return;
    const kids = this.parent.children;
    let i = kids.indexOf(this) + 1;
    for (const n of nodes) { if (n.remove) n.remove(); n.parent = this.parent; kids.splice(i++, 0, n); }
  }
  getBoundingClientRect() { return { left: 50, top: 50, width: 100, height: 20 }; }
  set innerHTML(v) { if (v === '') this.children.length = 0; }
  get innerHTML() { return ''; }
  get scrollHeight() { return 100; }
  get offsetWidth() { return 0; }
  // Like real DOM: setting textContent replaces the children (0.086 — the
  // persistent battle line patches text in place).
  set textContent(v) { this.children.length = 0; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(''); }
  click() { for (const fn of this.listeners.click || []) fn({}); }
  walk(fn) { fn(this); for (const c of this.children) if (c.walk) c.walk(fn); }
  all(pred) { const out = []; this.walk((e) => { if (pred(e)) out.push(e); }); return out; }
}

export const registry = { app: new El('main'), bg0: new El('div'), bg1: new El('div'), flash: new El('div') };
function findById(root, id) { let hit = null; root.walk((e) => { if (!hit && e.attrs && e.attrs.id === id) hit = e; }); return hit; }
function match(el, sel) {
  if (sel === 'button.primary:not([disabled])')
    return el.tagName === 'button' && el.className.split(' ').includes('primary') && el.attrs.disabled === undefined;
  const m = sel.match(/^button\[data-key="([a-z0-9])"\]:not\(\[disabled\]\)$/);
  if (m) return el.tagName === 'button' && el.attrs['data-key'] === m[1] && el.attrs.disabled === undefined;
  if (sel === 'button[data-key2=" "]:not([disabled])')
    return el.tagName === 'button' && el.attrs['data-key2'] === ' ' && el.attrs.disabled === undefined;
  if (sel === '.death-accept') return el.className.split(' ').includes('death-accept');
  return false;
}

globalThis.document = {
  getElementById: (id) => registry[id] || findById(registry.app, id),
  createElement: (t) => new El(t),
  createTextNode: (t) => ({ text: t, textContent: t, walk() {} }),
  listeners: {},
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
  querySelector: (sel) => { let hit = null; registry.app.walk((e) => { if (!hit && match(e, sel)) hit = e; }); return hit; },
  querySelectorAll: (sel) => { const out = []; registry.app.walk((e) => { if (match(e, sel)) out.push(e); }); return out; },
};
globalThis.Node = El;
globalThis.performance = { now: () => clock };
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(clock), 16);
globalThis.localStorage = {
  s: {},
  getItem(k) { return this.s[k] ?? null; },
  setItem(k, v) { this.s[k] = v; },
  removeItem(k) { delete this.s[k]; },
};
globalThis.confirm = () => true;
// Strip ?v= cachebust stamps so the suite also runs in the stamped deploy
// tree (app/) — the stamp is a browser-cache concern, not a file on disk.
globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(readFileSync(String(url).split('?')[0], 'utf8')) });

// ---------- boot ----------
export const { loadData, DATA } = await import('../../src/shared/data.js');
export const { show, handleKey, setBackground, transitionTo } = await import('../../src/core/scene.js');
export const { createRun } = await import('../../src/run/runState.js');
export const { generateRoom } = await import('../../src/run/roomGen.js');
export const { scaleEnemy } = await import('../../src/shared/balance.js');
export const { createCombat, playerAttack } = await import('../../src/run/combat.js');
export const { shrineOffers, canAffordOffer, acceptOffer } = await import('../../src/run/shrine.js');
export const { dungeonScene } = await import('../../src/ui/scenes/dungeonScene.js');
export const { hubScene } = await import('../../src/ui/scenes/hubScene.js');
export const { titleScene } = await import('../../src/ui/scenes/titleScene.js');
export const { resetProfile, getProfile } = await import('../../src/meta/profile.js');
await loadData();

export const t = () => registry.app.textContent;

// Each test file starts from a clean slate: fresh profile, empty screen.
export function fresh() {
  resetProfile();
  getProfile().name ||= 'Tester'; // 0.109: unnamed saves get the name prompt on the title screen
  registry.app.innerHTML = '';
}
