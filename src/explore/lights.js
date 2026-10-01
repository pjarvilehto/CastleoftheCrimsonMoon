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
  let assigned = [], frame = 0;
  const haze = []; // { position, color, intensity } for the paint pass

  function update(t, sources) {
    const byDist = [...sources].sort((a, b) => a.position.distanceToSquared(camera.position) - b.position.distanceToSquared(camera.position));
    const now = byDist.slice(0, pool.length);
    // the shadow maps follow the nearest lights: redraw when they change
    if (now.slice(0, SH.count).some((s, i) => s !== assigned[i]) || ++frame % SH.everyFrames === 0) renderer.shadowMap.needsUpdate = true;
    assigned = now;
    haze.length = 0;
    pool.forEach((l, i) => {
      const s = now[i];
      if (!s) { l.intensity = 0; return; }
      l.position.copy(s.position);
      l.color.copy(s.color ?? torchColor);
      l.distance = s.reach ?? L.torch.distance;
      l.intensity = L.torch.intensity * s.power * (s.still ? 1 : flicker(t, s.phase, L.flicker));
      haze.push({ position: l.position, color: l.color, intensity: l.intensity * (s.haze ?? 1) });
    });
    for (const s of sources) {
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

  // a new floor: redraw the shadows at once
  const reset = () => { assigned = []; renderer.shadowMap.needsUpdate = true; };
  return { update, reset, party, pool };
}

// Everything solid casts and takes shadows (sprites, mist and glow don't).
export function shadowAll(group) {
  group.traverse((o) => {
    if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; }
    else if (o.isMesh) o.receiveShadow = true;
  });
}
