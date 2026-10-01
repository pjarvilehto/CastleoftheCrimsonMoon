// ui/combatQueue.js — combat events (run/combat.js) -> playback queue
// items (0.098: split out of dungeonScene). Each printed line carries its
// state snapshot, effect, pacing hold and sound; kills route their loot
// through the run (runState.applyLoot) as they're queued, and the loot
// lines print right after the death line.

import { applyLoot } from '../run/runState.js';
import { fxFor, holdFor } from './combatFx.js';
import { isLowHp } from './hud.js';

// Combat event -> sound effect, fired when its line PRINTS (not on click).
const EV_SFX = {
  atk: 'attack', spill: 'attack', thorns: 'attack',
  dmg: 'hurt', dodge: 'swoosh', heal: 'heal',
  kill: 'kill', multi: 'kill', smash: 'kill', revive: 'shrine', summon: 'shrine',
};

// Combat event -> narrator line (audio/narrator.js decides whether it is
// said; 0.157): OVERKILL, a multi-kill ("SMASH"), a mega crit, the revive
// relic, a boss summon, the room cleared (not a boss's: that fight has its
// own line) and the knight's HP falling low.
export function voFor(ev, { run, combat }) {
  if (ev.type === 'smash') return 'overkill';
  if (ev.type === 'multi') return 'smash';
  if (ev.type === 'atk' && ev.megaCrit) return 'mega_crit';
  if (ev.type === 'revive') return 'revive';
  if (ev.type === 'summon') return 'boss_summon';
  if (ev.type === 'sys' && combat.over && combat.victory && !combat.isBoss) return 'room_cleared';
  if (ev.type === 'dmg' && ev.snap && isLowHp(ev.snap.hp, run.maxHp)) return 'low_hp';
  return undefined;
}

export function queueEvents(events, { run, combat, playback }) {
  for (const ev of events) {
    if (ev.type === 'kill' && ev.enemy) {
      // SMASH kill: loot silently — the one OVERKILL line plus the
      // room-cleared summary carry the whole event.
      if (ev.silent) { applyLoot(run, ev.enemy, () => {}); continue; }
      // Death line prints on one tick; the card goes down on the next.
      playback.enqueue({ text: ev.text, cls: 'atk', snap: ev.snap, sink: combat.enemies.indexOf(ev.enemy), sfx: 'kill' });
      applyLoot(run, ev.enemy, (text, cls) => playback.enqueue({ text, cls, sfx: cls === 'relic' ? 'rare' : 'loot', vo: cls === 'relic' ? 'relic_found' : undefined }));
      continue;
    }
    const cls = ev.type === 'multi' ? 'multi' : (ev.type === 'dmg' || ev.type === 'spill') ? 'atk' : ev.type;
    const fx = fxFor(ev, { maxHp: run.maxHp });
    playback.enqueue({ text: ev.text, cls, snap: ev.snap, fx, hold: holdFor(fx), sfx: EV_SFX[ev.type], vo: voFor(ev, { run, combat }) });
  }
}
