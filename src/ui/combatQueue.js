// ui/combatQueue.js — combat events (run/combat.js) -> playback queue
// items (0.098: split out of dungeonScene). Each printed line carries its
// state snapshot, effect, pacing hold and sound; kills route their loot
// through the run (runState.applyLoot) as they're queued, and the loot
// lines print right after the death line.

import { applyLoot } from '../run/runState.js';
import { fxFor, holdFor } from './combatFx.js';

// Combat event -> sound effect, fired when its line PRINTS (not on click).
const EV_SFX = {
  atk: 'attack', spill: 'attack', thorns: 'attack',
  dmg: 'hurt', dodge: 'swoosh', heal: 'heal',
  kill: 'kill', multi: 'kill', smash: 'kill', revive: 'shrine', summon: 'shrine',
};

export function queueEvents(events, { run, combat, playback }) {
  for (const ev of events) {
    if (ev.type === 'kill' && ev.enemy) {
      // SMASH kill: loot silently — the one OVERKILL line plus the
      // room-cleared summary carry the whole event.
      if (ev.silent) { applyLoot(run, ev.enemy, () => {}); continue; }
      // Death line prints on one tick; the card goes down on the next.
      playback.enqueue({ text: ev.text, cls: 'atk', snap: ev.snap, sink: combat.enemies.indexOf(ev.enemy), sfx: 'kill' });
      applyLoot(run, ev.enemy, (text, cls) => playback.enqueue({ text, cls, sfx: cls === 'relic' ? 'rare' : 'loot' }));
      continue;
    }
    const cls = ev.type === 'multi' ? 'multi' : (ev.type === 'dmg' || ev.type === 'spill') ? 'atk' : ev.type;
    const fx = fxFor(ev, { maxHp: run.maxHp });
    playback.enqueue({ text: ev.text, cls, snap: ev.snap, fx, hold: holdFor(fx), sfx: EV_SFX[ev.type] });
  }
}
