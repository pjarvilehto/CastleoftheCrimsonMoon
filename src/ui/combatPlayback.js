// ui/combatPlayback.js — owns the log drip queue and the replay-view HP
// snapshot. The scene converts combat events to queue items via enqueue();
// this module prints them one by one (logDelayMs apart), sinks dead enemy
// cards one tick after their death line, and locks input for the duration.
//
// Hooks (injected by the scene):
//   logEl()    — the persistent log element
//   renderNow()— re-render the scene (locked/unlocked state, replay HP)
//   onEmpty()  — queue drained: victory summary counters, death flash, etc.

import { DATA } from '../shared/data.js';
import { sfx } from '../audio/sfx.js';
import { logLine } from './hud.js';

export function createPlayback({ logEl, renderNow, onEmpty }) {
  let queue = [];
  let printing = false;
  let pendingSink = null; // enemy index whose card sinks on the next tick
  let shownHp = null;     // replay-view HP; null = show real HP
  let timer = null;       // pending drain tick — cancelled on reset()

  // Single pending timer: starting a new chain cancels the old one, so a
  // stale tick can never fire after reset() (new room / new combat).
  const schedule = (fn, ms) => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };

  const isPrinting = () => printing;

  // Displayed HP for enemy i: replay snapshot while printing, real HP after.
  const hpOf = (i, realHp) => (shownHp ? shownHp[i] : realHp);

  // Called when a new combat starts. Tears down any in-flight chain so
  // stale ticks can't touch the new room's state.
  function reset(combat) {
    clearTimeout(timer);
    queue = [];
    printing = false;
    pendingSink = null;
    shownHp = combat.enemies.map((e) => e.maxHp);
  }

  function enqueue(item) {
    queue.push(item);
  }

  // Drain: one item per tick. Input stays locked until the queue is empty.
  function begin() {
    printing = true;
    renderNow();
    const delay = DATA.difficulty.logDelayMs ?? 100;
    const step = () => {
      // A queued card sink fires one tick after its death line printed.
      if (pendingSink !== null) {
        if (shownHp) shownHp[pendingSink] = 0; // replay view may be torn down
        pendingSink = null;
        renderNow();
        schedule(step, delay);
        return;
      }
      const item = queue.shift();
      if (item) {
        if (item.text) {
          if (item.sfx) sfx(item.sfx); // synced to the printed line, not the click
          const log = logEl();
          logLine(log, item.text, item.cls);
          log.scrollTop = log.scrollHeight;
        }
        if (item.sink !== undefined && item.sink !== null) pendingSink = item.sink;
        schedule(step, delay);
      } else {
        printing = false;
        shownHp = null; // replay view done — show real HP
        renderNow();
        onEmpty();
      }
    };
    step();
  }

  return { enqueue, begin, reset, isPrinting, hpOf };
}
