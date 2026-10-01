// ui/combatSfx.js — where and when a combat line's sound plays (0.107).
// Stereo: the knight stands on the left, the enemies across the right, so
// each sound comes from the card it belongs to (audioMath.panForX, scaled
// by audio.json pan.width). Timing: an attack's sound lands on the blow
// (combatFx.strikeMs after the line prints), not ~130ms before it.
// Tiers: crits add a metallic ring, MEGA CRITS a louder lower ring plus a
// deep second hit, OVERKILL a low boom (audio/synth.js; levels in
// audio.json sweeteners).

import { DATA } from '../shared/data.js';
import { sfx } from '../audio/sfx.js';
import { panForX } from '../audio/audioMath.js';
import { strikeMs } from './combatFx.js';

let lastPan = 0; // loot lines follow a death line: they come from that card

// Stereo position of a unit's card ('player' or enemy index).
export function panOf(ctx, who) {
  const r = ctx?.unit?.(who)?.card?.getBoundingClientRect?.();
  return r ? panForX(r.left + r.width / 2, globalThis.innerWidth || 0, DATA.audio?.pan?.width ?? 0.6) : 0;
}

// item: a playback queue item with .sfx (and maybe .fx / .sink).
// play: injectable for tests (default: audio/sfx.js).
export function combatSfx(item, ctx, play = sfx) {
  const fx = item.fx;
  const S = DATA.audio?.sweeteners ?? {};
  if (fx?.kind === 'attack') {
    const opts = { pan: panOf(ctx, fx.to), delayMs: strikeMs(fx) };
    play(item.sfx, opts);
    if (fx.mega) {
      play('ring', { ...opts, rate: 0.8, gainDb: S.mega?.ringDb ?? -10 });
      play('kill', { ...opts, rate: S.mega?.deepRate ?? 0.72, gainDb: S.mega?.deepDb ?? -5 });
    } else if (fx.crit) play('ring', { ...opts, gainDb: S.crit?.ringDb ?? -14 });
    return;
  }
  if (fx?.kind === 'smash') {
    play(item.sfx, { pan: lastPan = 0.3 * (DATA.audio?.pan?.width ?? 0.6) });
    play('boom', { gainDb: S.overkill?.boomDb ?? -4 });
    return;
  }
  let pan = 0;
  if (item.sink !== undefined && item.sink !== null) pan = lastPan = panOf(ctx, item.sink); // a death line
  else if (fx?.to !== undefined) pan = panOf(ctx, fx.to);                               // spill, thorns, dodge, heal, summon
  else if (!fx) pan = lastPan;                                                           // loot after a death
  play(item.sfx, { pan });
}
