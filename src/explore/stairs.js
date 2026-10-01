// explore/stairs.js — the way down (0.144): past the boss chamber a
// stairwell sinks into the dark (build.js makes the pit and the steps);
// from below it a light breathes slowly in the NEXT depth's colour (its
// tier's `glow`), with a soft glow over the pit. One light for the whole
// lab, moved from floor to floor (a fixed light count keeps three.js from
// recompiling shaders). walkDown() is the knight's descent: down the
// steps, the view fading to black.

import * as THREE from 'three';
import { glowTexture } from './textures.js';

export function createStairs(scene, cfg) {
  const S = cfg.stairs, C = cfg.cell;
  const light = new THREE.PointLight(0xffffff, 0, S.lightDistance, 2);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(S.glowSize);
  scene.add(light, glow);
  let stairs = null;

  return {
    // put the glow in this floor's stairwell, in the next depth's colour
    place(floor, color) {
      stairs = floor.stairs;
      const [dx, dz] = stairs.down;
      const x = (stairs.x + 0.5 + dx * 0.3) * C, z = (stairs.z + 0.5 + dz * 0.3) * C;
      light.position.set(x, -S.depth * 0.55, z);
      glow.position.set(x, -S.depth * 0.35, z);
      light.color.set(color); glow.material.color.set(color);
    },
    update(t) {
      const p = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * S.pulse);
      light.intensity = S.light * (0.3 + 0.7 * p);
      glow.material.opacity = S.glowOpacity * (0.35 + 0.65 * p);
    },
    // k: 0..1 through the descent — where the knight's eye is, and how dark
    walkDown(k, from) {
      const [dx, dz] = stairs.down, e = k * k * (3 - 2 * k);
      return {
        x: from.x + dx * e * C * 0.8, z: from.z + dz * e * C * 0.8,
        y: cfg.eyeHeight - e * S.depth * 0.8, yaw: Math.atan2(dx, dz), pitch: -0.25 * e,
        fade: Math.min(1, k * 1.4),
      };
    },
  };
}
