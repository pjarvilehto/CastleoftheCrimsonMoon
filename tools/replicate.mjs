// The Replicate client the art tools share (0.00236): the token, the
// Files API upload, a prediction on an official model (`predict`) or on a
// community model by version (`predictVersion`), and `latestVersion`.
// Needs REPLICATE_API_TOKEN (REPLICATE_KEY is read too) in the environment;
// in a container whose outbound traffic goes through a proxy, run with
// NODE_USE_ENV_PROXY=1 (Node's fetch ignores HTTPS_PROXY otherwise). Nothing
// here prints the token.
import { readFileSync } from 'node:fs';

export const API = 'https://api.replicate.com/v1';
export const token = () => process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_KEY;
export const headers = () => ({ Authorization: `Bearer ${token()}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', zip: 'application/zip' };
/** Upload a file to the Files API; the URL the models fetch it from. */
export async function upload(path) {
  const form = new FormData();
  const ext = path.split('.').pop();
  form.append('content', new Blob([readFileSync(path)], { type: TYPES[ext] ?? 'application/octet-stream' }), path.split('/').pop());
  const res = await fetch(`${API}/files`, { method: 'POST', headers: headers(), body: form });
  if (!res.ok) throw new Error(`upload ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).urls.get;
}

export async function latestVersion(model) {
  const res = await fetch(`${API}/models/${model}`, { headers: headers() });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
  return (await res.json()).latest_version.id;
}

async function finish(res, what, pollMs) {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  let p = await res.json();
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    await sleep(pollMs);
    const poll = await fetch(p.urls.get, { headers: headers() });
    if (!poll.ok) throw new Error(`${what} poll: HTTP ${poll.status}`);
    p = await poll.json();
  }
  if (p.status !== 'succeeded') throw new Error(`${what}: ${p.status}: ${p.error ?? '?'}`);
  const url = Array.isArray(p.output) ? p.output[0] : p.output;
  const img = await fetch(url);
  if (!img.ok) throw new Error(`${what} download: HTTP ${img.status}`);
  return { bytes: Buffer.from(await img.arrayBuffer()), version: p.version, id: p.id, metrics: p.metrics };
}
/** A prediction on an official model (owner/name); resolves with its first output's bytes. */
export async function predict(model, input) {
  const res = await fetch(`${API}/models/${model}/predictions`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'wait=60' }, body: JSON.stringify({ input }) });
  return finish(res, 'predict', 2500);
}
/** A prediction on a community model by version id. */
export async function predictVersion(version, input) {
  const res = await fetch(`${API}/predictions`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'wait=60' }, body: JSON.stringify({ version, input }) });
  return finish(res, 'predict', 1500);
}
