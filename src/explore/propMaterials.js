// explore/propMaterials.js — the themed rooms' materials (0.146), made once,
// by name: furnish.js merges each room's pieces per name. Names with a
// number carry a hue: banner<hue>, glass<hue>, shaft<hue>, cloth<hue>.
// The depth tier's own stone, wood, iron and wax come from build.js (M).

import * as THREE from 'three';
import { booksTexture, bannerTexture, glassTexture, doorTexture, clothTexture, skullsTexture, cobwebTexture, strawTexture } from './propTextures.js';

const made = new Map();

// A beam of light through dusty air (window shafts): an open cone, added on
// top of the scene, brightest where the eye looks through the most of it
// (facing the camera) and fading to nothing at its silhouette and its end,
// and into the dark with distance (60% of the scene's fog — a bright
// volume carries further than a wall, but without any fog a far beam
// glowed through doorways as a grey wedge, 0.146).
let fogDensity = 0;
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: color }, strength: { value: 0.15 }, fogDensity: { value: fogDensity } },
    vertexShader: `varying float vFace; varying float vAlong; varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFace = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        vAlong = uv.y; // 1 at the window, 0 at the far end
        vDist = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 color; uniform float strength, fogDensity; varying float vFace; varying float vAlong; varying float vDist;
      void main() {
        float fog = exp(-pow(fogDensity * vDist, 2.0));
        gl_FragColor = vec4(color * strength * pow(vFace, 3.0) * pow(vAlong, 1.4) * fog, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}
const hueOf = (name) => Number(name.replace(/\D+/g, ''));

const MAKERS = {
  books: () => new THREE.MeshStandardMaterial({ map: booksTexture(), roughness: 0.9 }),
  banner: (n) => new THREE.MeshStandardMaterial({ map: bannerTexture(hueOf(n)), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }),
  glass: (n) => new THREE.MeshStandardMaterial({ map: glassTexture(hueOf(n)), emissiveMap: glassTexture(hueOf(n)), emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.4 }),
  shaft: (n) => beamMaterial(new THREE.Color().setHSL(hueOf(n) / 360, 0.45, 0.6)),
  cloth: (n) => new THREE.MeshStandardMaterial({ map: clothTexture(hueOf(n)), roughness: 1, side: THREE.DoubleSide }),
  door: () => new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.9 }),
  skulls: () => new THREE.MeshStandardMaterial({ map: skullsTexture(), roughness: 1 }),
  cobweb: () => new THREE.MeshBasicMaterial({ map: cobwebTexture(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  straw: () => new THREE.MeshStandardMaterial({ map: strawTexture(), alphaTest: 0.35, roughness: 1 }),
  ember: () => new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
  potion: () => new THREE.MeshStandardMaterial({ color: 0x2e8a3a, emissive: 0x3cff6a, emissiveIntensity: 0.55, roughness: 0.2 }),
  amber: () => new THREE.MeshStandardMaterial({ color: 0x6a3a14, emissive: 0xffa040, emissiveIntensity: 0.35, roughness: 0.2 }),
  brew: () => new THREE.MeshBasicMaterial({ color: 0x58ff7a }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0x6b5426, roughness: 0.45, metalness: 0.7 }),
  bone: () => new THREE.MeshStandardMaterial({ color: 0xb8ad8e, roughness: 0.85 }),
  black: () => new THREE.MeshBasicMaterial({ color: 0x020202 }),
};

export function propMaterials(cfg) {
  fogDensity = cfg.fog.density * 0.6;
  return {
    get(name, M) {
      if (M[name]) return M[name]; // stone, wood, iron, wax: the tier's own
      if (!made.has(name)) {
        const key = Object.keys(MAKERS).find((k) => name === k || (name.startsWith(k) && /\d/.test(name.slice(k.length))));
        if (!key) throw new Error(`no prop material ${name}`);
        made.set(name, MAKERS[key](name));
      }
      return made.get(name);
    },
  };
}
