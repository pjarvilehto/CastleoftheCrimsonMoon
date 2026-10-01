// meta/names.js — player names (0.109; its own file since 0.116, shared by
// the profile, its migrations and the name prompt): trimmed, inner
// whitespace collapsed, no control characters, at most NAME_MAX characters.

export const NAME_MAX = 20;

export function cleanName(n) {
  return String(n ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}
