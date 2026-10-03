// ui/combatQueue.js — combat events (run/combat.js) -> playback queue
// items (0.098: split out of dungeonScene). Each printed line carries its
// state snapshot, effect, pacing hold and sound; kills route their loot
// through the run (runState.applyLoot) as they're queued, and the loot
// lines print right after the death line.

import { applyLoot } from '../run/runState.js';
import { fxFor, holdFor } from './combatFx.js';
import { isLowHp } from './hud.js';
import { DATA } from '../shared/data.js';
import { getProfile } from '../meta/profile.js';
import { heroOf } from '../shared/heroes.js';

// Combat event -> sound effect, fired when its line PRINTS (not on click).
const EV_SFX = {
  atk: 'attack', spill: 'attack', thorns: 'attack',
  dmg: 'hurt', dodge: 'swoosh', heal: 'heal',
  kill: 'kill', multi: 'kill', overkill: 'kill', revive: 'shrine', summon: 'shrine',
  // the classes' events (0.00270): the hex a chime, the blight a hiss, the roots a thud and a bound foe's strain a swoosh, a charge back a zap, the thrall's rise a wail, its blows and fall a thud (audio/synth.js)
  mark: 'chime', blight: 'hiss', entangle: 'thud', entangled: 'swoosh', charge: 'zap', thrall: 'wail', thrallhit: 'thud', thrallfall: 'thud',
};
// The class's own sounds (0.00270, the developer's ask): the hero's blow
// is atk_<class>, its heavy heavy_<class>, a blow on the hero hurt_<class>
// (audio.json clips: the two recordings pitched per class, the class's
// synth layers under them); a class without the clip falls back to the
// plain one, so the registry can grow a class at a time.
export function sfxFor(ev, hero = heroOf(getProfile())) {
  const plain = EV_SFX[ev.type];
  const own = ev.type === 'atk' ? (ev.heavy ? `heavy_${hero.id}` : `atk_${hero.id}`) : ev.type === 'spill' ? `atk_${hero.id}` : ev.type === 'dmg' ? `hurt_${hero.id}` : null;
  return own && DATA.audio.clips[own] ? own : plain;
}

// Combat event -> narrator line (audio/narrator.js decides whether it is
// said; 0.161): OVERKILL, a multi-kill ("SMASH"), a mega crit, the revive
// relic, a boss summon, the room cleared (not a boss's: that fight has its
// own line) and the knight's HP falling low.
export function voFor(ev, { run, combat }) {
  if (ev.type === 'overkill') return 'overkill';
  if (ev.type === 'multi') return 'smash'; // (the narration id and the script's name for a multi-kill)
  if (ev.type === 'atk' && ev.megaCrit) return 'mega_crit';
  if (ev.type === 'revive') return 'revive';
  if (ev.type === 'summon') return 'boss_summon';
  if (ev.type === 'sys' && combat.over && combat.victory && !combat.isBoss) return 'room_cleared';
  if (ev.type === 'dmg' && ev.snap && isLowHp(ev.snap.hp, run.maxHp)) return 'low_hp';
  return undefined;
}

// potionQueued (0.00263): a found potion's line was queued — the hero card
// holds the count back until its card has flown in (battleLine.js holdPotion).
export function queueEvents(events, { run, combat, playback, potionQueued = () => {} }) {
  for (const ev of events) {
    if (ev.type === 'kill' && ev.enemy) {
      // OVERKILL kill: loot silently — the one OVERKILL line plus the
      // room-cleared summary carry the whole event.
      if (ev.silent) { applyLoot(run, ev.enemy, () => {}); continue; }
      // Death line prints on one tick; the card goes down on the next.
      playback.enqueue({ text: ev.text, cls: 'atk', snap: ev.snap, sink: combat.enemies.indexOf(ev.enemy), sfx: 'kill' });
      applyLoot(run, ev.enemy, (text, cls, extra) => {
        if (extra?.potion) potionQueued();
        playback.enqueue({ text, cls, sfx: cls === 'relic' ? 'rare' : 'loot', vo: cls === 'relic' ? 'relic_found' : undefined,
          fx: extra?.find ? { kind: 'find', ...extra.find } : extra?.potion ? { kind: 'potion' } : undefined }); // (0.00260: a kept find rises as a card; 0.00263 a potion — ui/findFx.js)
      });
      continue;
    }
    const cls = ev.type === 'multi' ? 'multi' : (ev.type === 'dmg' || ev.type === 'spill') ? 'atk' : ev.type;
    const fx = fxFor(ev, { maxHp: run.maxHp });
    playback.enqueue({ text: ev.text, cls, snap: ev.snap, fx, hold: holdFor(fx), sfx: sfxFor(ev), vo: voFor(ev, { run, combat }) });
  }
}
