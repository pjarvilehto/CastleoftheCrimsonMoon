// ui/combatPlayback.js — owns the log drip queue and the replay VIEW of the
// fight. Combat resolves instantly; the scene turns its events into queue
// items and this module plays them back one per tick (logDelayMs apart),
// locking input until the queue is empty.
//
// The view (0.086) is what the screen shows while printing: enemy HPs,
// player HP and which enemy cards are down. Each item may carry
//   snap  — { enemies: [hp...], hp } from the combat event: the view jumps
//           to it as the line prints, so HP bars move WITH the log
//   sink  — enemy index whose card goes down one tick after its death line
//   fx    — effect descriptor handed to onFx as the line prints (ui/combatFx.js)
//   hold  — ms to wait after this item instead of logDelayMs (animations)
//   sfx   — sound, synced to the printed line
//   vo    — a narrator line id (audio/narrator.js), said as the line prints (0.161)
//
// Hooks (injected by the scene):
//   logEl()   — the persistent log element
//   onTick()  — patch the battle line from the current view
//   onEmpty() — queue drained: victory counters, death flash, etc.
//   onFx(fx)  — play an effect (no-op until effects exist)
//   onSfx(item) — play the line's sound (0.107: the scene places it in
//                 stereo and times it to the blow — ui/combatSfx.js)
//   onVo(id)  — say the line's narration (default: the narrator, undelayed)

import { DATA } from '../shared/data.js';
import { sfx } from '../audio/sfx.js';
import { narrate } from '../audio/narrator.js';
import { logLine } from './hud.js';

export function createPlayback({ logEl, onTick, onEmpty, onFx = () => {}, onSfx = (item) => sfx(item.sfx), onVo = (id) => narrate(id) }) {
  let queue = [];
  let printing = false;
  let pendingSink = null; // enemy index whose card goes down on the next tick
  let view = null;        // { hp: [], php, dead: [], meters: [] } while printing; null = show real state
  let timer = null;       // pending drain tick — cancelled on reset()

  // Single pending timer: starting a new chain cancels the old one, so a
  // stale tick can never fire after reset() (new room / new combat).
  const schedule = (fn, ms) => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };

  const isPrinting = () => printing;
  // What the screen shows for enemy i / the player: the replay view while
  // printing, the real combat state otherwise.
  const hpOf = (i, realHp) => (view ? view.hp[i] : realHp);
  const deadOf = (i, realHp) => (view ? view.dead[i] : realHp <= 0);
  const playerHpOf = (realHp) => (view ? view.php : realHp);
  // Boss summon meters, and how many enemies exist yet (summons join
  // mid-fight — their card appears when the summon line prints; 0.092).
  const meterOf = (i, real) => (view ? view.meters[i] ?? null : real);
  const enemyCount = (real) => (view ? view.hp.length : real);

  // New combat (room): tear down any in-flight chain so stale ticks can't
  // touch the new room's state.
  function reset() {
    clearTimeout(timer);
    queue = [];
    printing = false;
    pendingSink = null;
    view = null;
  }

  function enqueue(item) {
    queue.push(item);
  }

  // Drain: one item per tick. pre = the state BEFORE the action resolved
  // ({ enemies: [hp...], hp }) — the replay starts from there.
  function begin(pre) {
    view = { hp: [...pre.enemies], php: pre.hp, dead: pre.enemies.map((h) => h <= 0), meters: [...(pre.meters ?? [])] };
    printing = true;
    onTick();
    const delay = DATA.difficulty.logDelayMs;
    const step = () => {
      // A queued card sink fires one tick after its death line printed.
      if (pendingSink !== null) {
        const i = pendingSink;
        pendingSink = null;
        if (view) view.dead[i] = true;
        onFx({ kind: 'die', to: i });
        onTick();
        schedule(step, delay);
        return;
      }
      const item = queue.shift();
      if (!item) {
        printing = false;
        view = null; // replay done — show the real state
        onTick();
        onEmpty();
        return;
      }
      if (item.snap && view) {
        view.hp = [...item.snap.enemies];
        view.php = item.snap.hp;
        if (item.snap.meters) view.meters = [...item.snap.meters];
      }
      if (item.text) logLine(logEl(), item.text, item.cls); // (scrolls the log)
      if (item.sink !== undefined && item.sink !== null) pendingSink = item.sink;
      onTick(); // before the effect: a summon's card must exist to animate in
      if (item.text && item.sfx) onSfx(item); // synced to the printed line, not the click
      if (item.vo) onVo(item.vo);
      if (item.fx) onFx(item.fx);
      schedule(step, item.hold ?? delay);
    };
    step();
  }

  return { enqueue, begin, reset, isPrinting, hpOf, deadOf, playerHpOf, meterOf, enemyCount };
}
