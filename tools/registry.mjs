// tools/registry.mjs — the candidate registries the generating tools keep
// (0.00322; each tool carried its own copy): a JSON file under
// assets/data with one collection (`chars` for the portraits, `rooms` for
// the paintings, `beds` for the scores, `items` for the gear's pictures,
// `trainings` for the LoRAs) whose entries list numbered candidates with the
// labs' verdicts. The file's own `_doc` is written by `doc`; `stamp` adds a
// `generated` time (the portraits' registry carries one).
//
//   const reg = registry(path, { key: 'rooms', doc: '...' });
//   const r = reg.load();            // the file, or an empty collection
//   reg.save(r);                     // _doc, (generated,) the collection — in that order, 2-space JSON
//   nextN(entry)                     // the next free candidate number of an entry
//   applyVerdicts(entries, req)      // a lab's { approved: [{ file, note? }], rejected: [{ file, note? }] }
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function registry(path, { key, doc = null, stamp = false, empty = {} } = {}) {
  return {
    path,
    load: () => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { [key]: structuredClone(empty) }),
    save(reg) {
      const out = { _doc: doc ?? reg._doc };
      if (stamp) out.generated = reg.generated = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      if (doc) reg._doc = doc;
      for (const [k, v] of Object.entries(reg)) if (k !== '_doc' && k !== 'generated') out[k] = v;
      writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    },
  };
}

/** The next free candidate number of an entry (numbering goes on, nothing is overwritten — rule 7). */
export const nextN = (entry) => entry.candidates.reduce((m, k) => Math.max(m, k.n), 0) + 1;

/**
 * A lab's verdicts into the candidates (pure): every approved file gets
 * verdict 'ok', every rejected one 'no'; a note given stays with the verdict,
 * none given clears the old one (0.00322: the Background Lab's approvals used
 * to drop their note, the Music Lab's kept it — one rule now). `onApprove(k,
 * a)` lets a tool keep more of an approval (the Art Lab's flip). Returns the
 * counts asked for, matched or not.
 */
export function applyVerdicts(entries, req, { onApprove = null } = {}) {
  const all = entries.flatMap((e) => e.candidates);
  const note = (k, v) => { if (v.note) k.note = v.note; else delete k.note; };
  for (const a of req.approved ?? []) { const k = all.find((x) => x.file === a.file); if (k) { k.verdict = 'ok'; note(k, a); onApprove?.(k, a); } }
  for (const r of req.rejected ?? []) { const k = all.find((x) => x.file === r.file); if (k) { k.verdict = 'no'; note(k, r); } }
  return { approved: (req.approved ?? []).length, rejected: (req.rejected ?? []).length };
}
