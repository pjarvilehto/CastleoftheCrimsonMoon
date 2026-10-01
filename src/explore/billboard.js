// explore/billboard.js — an enemy standing in the dungeon (0.141): its
// combat portrait (assets/chars/<id>.webp) on an upright card that turns
// about its own vertical axis to face the knight. It is lit like the walls
// (torchlight, the knight's torch) and alpha-cut, so it writes depth and
// the paint pass inks its silhouette like everything else. It breathes a
// little; when the room is cleared it fades into the dark.

import * as THREE from 'three';

const cache = new Map(); // portrait textures, shared between floors

// The portraits are cropped straight at the bottom (they fill a card);
// standing on a floor that edge would read as a cut, so it is torn away
// in ragged ink-like teeth over the bottom `tear` of the art.
function portrait(id, tear) {
  if (cache.has(id)) return cache.get(id);
  const ready = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = 'destination-out';
      let r = (id.length * 7919) % 997; // a fixed tear per enemy
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      const top = c.height * (1 - tear);
      x.beginPath(); x.moveTo(0, c.height);
      for (let px = 0; px <= c.width; px += c.width / 18) x.lineTo(px, top + rnd() * c.height * tear * 0.9);
      x.lineTo(c.width, c.height); x.closePath(); x.fill();
      // made only now, at its final size (a texture that grows after its
      // first upload trips WebGL)
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      resolve(tex);
    };
    img.onerror = () => resolve(null);
    img.src = `assets/chars/${id}.webp`;
  });
  cache.set(id, ready);
  return ready;
}

// id: the enemy's art; size: { height, lift } in metres (lift: a flyer
// hovers); at: floor position {x, z}; tear: share of the art torn off below;
// glow: its own light (emissive share of the art)
export function createBillboard(id, size, at, tear, glow) {
  const height = size.height, lift = size.lift ?? 0;
  let tex = null;
  // glow: a little light of its own, so a dark figure still reads in a dark room
  const mat = new THREE.MeshStandardMaterial({ alphaTest: 0.5, transparent: false, roughness: 1, metalness: 0, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: glow });
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // pivot at the feet
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(at.x, 0, at.z);
  mesh.visible = false; // until its art is in
  let gone = false;
  portrait(id, tear).then((t) => {
    if (!t || gone) return;
    tex = t; mat.map = t; mat.emissiveMap = t; mat.needsUpdate = true;
    mesh.visible = !fade;
  });
  const phase = at.x * 1.7 + at.z;
  let fade = null; // { t, secs, done } while fading out

  // the card's width follows the art's shape (known once it has loaded)
  const aspect = () => (tex ? tex.image.width / tex.image.height : 0.6);

  return {
    mesh,
    height,
    // face the camera (yaw only), breathe, fade
    update(camera, t, dt) {
      mesh.rotation.y = Math.atan2(camera.position.x - mesh.position.x, camera.position.z - mesh.position.z);
      mesh.scale.set(height * aspect(), height * (1 + Math.sin(t * 1.6 + phase) * 0.012), 1);
      mesh.position.y = lift + Math.sin(t * (lift ? 2.2 : 0.8) + phase) * (lift ? 0.08 : 0.015);
      if (fade) {
        fade.t += dt;
        const k = Math.min(1, fade.t / fade.secs);
        mat.opacity = 1 - k;
        mesh.position.y -= k * 0.3; // sinks as it fades
        if (k >= 1 && !fade.done) { fade.done = true; mesh.visible = false; fade.then?.(); }
      }
    },
    vanish(secs, then) {
      mat.transparent = true; mat.alphaTest = 0.02; mat.depthWrite = false; mat.needsUpdate = true;
      fade = { t: 0, secs, done: false, then };
    },
    dispose() { gone = true; geo.dispose(); mat.dispose(); },
  };
}
