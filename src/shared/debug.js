// shared/debug.js — session-only testing switches. Never persisted, never
// balance data — just a flag object the combat engine and the corner
// toggle button (main.js) share. Default everything OFF so the smoke
// test and real players always get honest combat.

export const DEBUG = { invulnerable: false };
