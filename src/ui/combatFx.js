// ui/combatFx.js — combat animation layer (0.086+). The playback queue
// hands every printed line's `fx` descriptor to playFx(), so animations
// land on the same beat as the log line and its sound.
//
// Descriptor shape: { kind, from?, to?, dmg?, crit?, heavy?, amount? }
//   from / to: an enemy index, or 'player'
//   kinds: attack, hit, dodge, heal, smash, multi, revive, die, enter
//
// 0.086 ships the plumbing only; the visuals arrive in 0.087+.

// Combat event (run/combat.js) -> effect descriptor, or null.
export function fxFor(ev) {
  switch (ev.type) {
    case 'atk': return { kind: 'attack', from: 'player', to: ev.target, dmg: ev.dmg, crit: !!ev.crit, heavy: !!ev.heavy };
    case 'spill': return { kind: 'hit', to: ev.target, dmg: ev.dmg };
    case 'thorns': return { kind: 'hit', to: ev.target, dmg: ev.dmg, thorns: true };
    case 'dmg': return { kind: 'attack', from: ev.source, to: 'player', dmg: ev.taken };
    case 'dodge': return { kind: 'dodge', from: ev.source, to: 'player' };
    case 'heal': return { kind: 'heal', to: 'player', amount: ev.healed };
    case 'smash': return { kind: 'smash', dmg: ev.dmg };
    case 'multi': return { kind: 'multi' };
    case 'revive': return { kind: 'revive', to: 'player' };
    default: return null;
  }
}

// Play one effect. ctx gives access to the live battle line:
//   ctx.unit(i | 'player') -> { el, card } or null
// (no visuals yet — 0.087 fills this in)
export function playFx(fx, ctx) {
  void fx; void ctx;
}
