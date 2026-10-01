// shared/version.js — build numbers (0.115): "0.100" is newer than "0.099",
// so compare the dot-separated parts as numbers, never as strings. Used by
// the update prompt, the changelist, the analytics page and tools/bump.mjs.

// < 0 if a is older than b, 0 if equal, > 0 if newer (a sort comparator).
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export const isNewer = (a, b) => compareVersions(a, b) > 0;
