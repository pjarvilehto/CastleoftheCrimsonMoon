// tools/util.mjs — the small helpers the generating tools share (0.00299;
// each tool carried its own copy):
//
//   fnv1a(str)            FNV-1a, 32 bits, over the string's code units
//   seedFor(...parts)     a stable seed from the parts joined by '/' (fnv1a mod
//                         2^31-1: gen-art, gen-bg, gen-score — the same seed a
//                         tool's own copy gave, so a re-roll comes out alike;
//                         gen-vo keeps its own modulus, see there)
//   cli(argv)             { argv, flag(name), opt(name, def) } over the command
//                         line: flag = the switch is there; opt = the word after
//                         the switch, or def when the switch is missing or last

export function fnv1a(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export const seedFor = (...parts) => fnv1a(parts.join('/')) % 2147483647;

export function cli(argv = process.argv.slice(2)) {
  return {
    argv,
    flag: (name) => argv.includes(name),
    opt: (name, def) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] ?? def) : def; },
  };
}
