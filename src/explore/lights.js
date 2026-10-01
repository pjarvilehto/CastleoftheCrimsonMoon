// explore/lights.js — the dungeon's light (0.145, out of lab.js). The
// knight's torch rides with the camera; every other source on the floor —
// wall torches, candelabras, braziers, a fireplace, a cauldron, moonlit
// windows — is a light entry from build.js / furnish.js, and a fixed pool
// of point lights follows the nearest ones (a fixed light count keeps
// three.js from recompiling shaders). The nearest `shadows.count` of them
// cast shadows (cube maps, redrawn only when the pool moves to other
// sources or every `shadows.everyFrames` frames — the scene barely
// changes), so pillars, bars, furniture and the enemies throw long
// shadows across the stone. Their colours and strengths also feed the
// paint pass's haze (post.js: light scattered in the air).
// 0.146: every source also lights the floor from afar through the baked
// light field (lightField.js), so the pool only adds the near detail: a
// source's dynamic light fades in with distance (field.dynamic near..far),
// ramps up when it takes a light, and a light stays with its source until
// a newcomer is clearly stronger — no light switching on as you approach.
//
// A light entry: { position, color?, power, phase, flames: [sprite],
// halos: [sprite], still? } — sprites with their resting scale in
// userData.base; `still` sources (windows) don't flicker.

import * as THREE from 'three';

// a cheap, smooth flicker: three detuned sines
const flicker = (t, phase, amount) => 1 - amount * 0.5 + amount * 0.5 * (Math.sin(t * 7.3 + phase) * 0.5 + Math.sin(t * 13.1 + phase * 1.7) * 0.3 + Math.sin(t * 23.7 + phase * 0.3) * 0.2);

export function createLights(scene, camera, renderer, cfg) {
  const L = cfg.light, SH = cfg.shadows;
  renderer.shadowMap.enabled = SH.count > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const party = new THREE.PointLight(L.party.color, L.party.intensity, L.party.distance, L.party.decay);
  party.position.set(0.35, -0.15, -0.3); // the torch in the right hand
  camera.add(party);
  const pool = Array.from({ length: L.pool }, (_, i) => {
    const l = new THREE.PointLight(L.torch.color, 0, L.torch.distance, L.torch.decay);
    if (i < SH.count) {
      l.castShadow = true;
      l.shadow.mapSize.set(SH.mapSize, SH.mapSize);
      l.shadow.bias = SH.bias;
      l.shadow.radius = 2;
      l.shadow.camera.near = 0.08;
      l.shadow.camera.far = L.torch.distance;
    }
    scene.add(l);
    return l;
  });
  const torchColor = new THREE.Color(L.torch.color);
  const D = cfg.field.dynamic;
  const slots = pool.map(() => ({ source: null, level: 0 })); // which source each light serves
  let frame = 0, shadowed = [];
  const haze = []; // { position, color, intensity } for the paint pass
  // a source's pull on a light: its strength, faded out with distance
  const fade = (s) => 1 - THREE.MathUtils.smoothstep(s.position.distanceTo(camera.position), D.near, D.far);
  const weight = (s) => s.power * fade(s);

  function update(t, all, dt = 1 / 60) {
    const sources = all.filter((s) => !s.bakedOnly); // (bounce fills live in the baked field only)
    // keep each light on its source unless a newcomer pulls clearly harder
    const w = new Map(sources.map((s) => [s, weight(s)]));
    const held = new Set(slots.map((sl) => sl.source).filter(Boolean));
    const free = sources.filter((s) => !held.has(s) && w.get(s) > 0).sort((a, b) => w.get(b) - w.get(a));
    for (const sl of [...slots].sort((a, b) => (w.get(a.source) ?? -1) - (w.get(b.source) ?? -1))) { // weakest first
      const best = free[0];
      if (!best) break;
      if (!sl.source || (w.get(sl.source) ?? 0) < w.get(best) * D.swap) { sl.source = free.shift(); sl.level = 0; }
    }
    // the strongest two (by pull) wear the shadow-casting lights
    const order = [...slots].sort((a, b) => (w.get(b.source) ?? -1) - (w.get(a.source) ?? -1));
    const now = order.slice(0, SH.count).map((sl) => sl.source);
    if (now.some((s, i) => s !== shadowed[i]) || ++frame % SH.everyFrames === 0) renderer.shadowMap.needsUpdate = true;
    shadowed = now;
    haze.length = 0;
    order.forEach((sl, i) => {
      const l = pool[i], s = sl.source;
      if (!s || !(w.get(s) > 0)) { l.intensity = 0; return; }
      sl.level = Math.min(1, sl.level + dt / D.rampSecs);
      l.position.copy(s.position);
      l.color.copy(s.color ?? torchColor);
      l.distance = s.reach ?? L.torch.distance;
      l.intensity = L.torch.intensity * s.power * D.share * fade(s) * sl.level * (s.still ? 1 : flicker(t, s.phase, L.flicker));
      haze.push({ position: l.position, color: l.color, intensity: l.intensity * (s.haze ?? 1) });
    });
    for (const s of all) {
      const f = s.still ? 1 : flicker(t, s.phase, L.flicker * 1.6);
      for (const sp of s.flames) {
        const [w, h] = sp.userData.base;
        sp.scale.set(w * (0.9 + 0.1 * f), h * f, 1);
        sp.material.opacity = 0.75 + 0.25 * f;
      }
      for (const sp of s.halos) {
        const [w, h] = sp.userData.base;
        sp.scale.set(w * (0.95 + 0.05 * f), h * (0.95 + 0.05 * f), 1);
        sp.material.opacity = (sp.userData.opacity ?? cfg.decor.haloOpacity) * (0.75 + 0.25 * f);
      }
    }
    party.intensity = L.party.intensity * flicker(t, 3.1, L.flicker);
    return haze;
  }

  // a new floor: the lights let go of the old sources, the shadows redraw
  const reset = () => { for (const sl of slots) { sl.source = null; sl.level = 0; } shadowed = []; renderer.shadowMap.needsUpdate = true; };
  return { update, reset, party, pool };
}

// Everything solid casts and takes shadows (sprites, mist and glow don't).
export function shadowAll(group) {
  group.traverse((o) => {
    if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; }
    else if (o.isMesh) o.receiveShadow = true;
  });
}
