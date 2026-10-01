// explore/lightField.js — every light, everywhere (0.146). The light pool
// (lights.js) can only give a few sources a real point light, so before
// this a torch further down the corridor lit nothing until the knight came
// near — then switched on. Now each floor bakes a light map over its plan:
// every source's light (colour x strength / distance², out to its reach)
// summed into a texture a few texels per cell, walls blocking it (line of
// sight across the grid). Every lit surface reads it (patchMaterial: a
// texture read in the shader, added as soft light), so distant torches
// glow from afar; the pool's dynamic lights only add the near detail —
// flicker, shadows, highlights — fading in with distance, never popping.
// bakeLightField(grid, sources, cfg) -> fills the shared field uniforms

import * as THREE from 'three';
import { isOpen } from './grid.js';

// shared by every patched material: a new floor only swaps the values
export const FIELD = {
  lightField: { value: null },
  fieldScale: { value: new THREE.Vector2(1, 1) },
  fieldStrength: { value: 0 },
};

export function bakeLightField(grid, sources, cfg) {
  const F = cfg.field, C = cfg.cell, K = F.texelsPerCell, base = cfg.light.torch.intensity;
  const W = grid.w * K, H = grid.h * K, sum = new Float32Array(W * H * 3);
  const open = (x, z) => isOpen(grid, Math.floor(x), Math.floor(z));
  // can light get from (ax, az) to (bx, bz)? (cells; quarter-cell steps)
  const sees = (ax, az, bx, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 4);
    for (let i = 1; i < n; i++) if (!open(ax + (bx - ax) * (i / n), az + (bz - az) * (i / n))) return false;
    return true;
  };
  const col = new THREE.Color();
  for (const s of sources) {
    const reach = (s.reach ?? cfg.light.torch.distance) * F.reach, sx = s.position.x / C, sz = s.position.z / C;
    const I = base * s.power, dy = s.position.y - F.height;
    col.copy(s.color ?? new THREE.Color(cfg.light.torch.color));
    const r = reach / C;
    for (let j = Math.max(0, Math.floor((sz - r) * K)); j < Math.min(H, Math.ceil((sz + r) * K)); j++) {
      for (let i = Math.max(0, Math.floor((sx - r) * K)); i < Math.min(W, Math.ceil((sx + r) * K)); i++) {
        const tx = (i + 0.5) / K, tz = (j + 0.5) / K;
        if (!open(tx, tz)) continue;
        const dx = (tx - sx) * C, dz = (tz - sz) * C, d2 = dx * dx + dz * dz + dy * dy, d = Math.sqrt(d2);
        if (d >= reach || !sees(sx, sz, tx, tz)) continue;
        const win = (1 - (d / reach) ** 4) ** 2; // three.js's own smooth cut-off
        const e = (I * win) / (d2 + F.soften);
        const k = (j * W + i) * 3;
        sum[k] += col.r * e; sum[k + 1] += col.g * e; sum[k + 2] += col.b * e;
      }
    }
  }
  // walls take their open neighbours' light (no dark seam where the
  // texture filters across a wall's edge)
  const out = sum.slice();
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (open((i + 0.5) / K, (j + 0.5) / K)) continue;
    let n = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + a, jj = j + b;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H || !open((ii + 0.5) / K, (jj + 0.5) / K)) continue;
      for (let c = 0; c < 3; c++) out[(j * W + i) * 3 + c] += sum[(jj * W + ii) * 3 + c];
      n++;
    }
    if (n) for (let c = 0; c < 3; c++) out[(j * W + i) * 3 + c] /= n;
  }
  const data = new Uint16Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    for (let c = 0; c < 3; c++) data[p * 4 + c] = THREE.DataUtils.toHalfFloat(out[p * 3 + c]);
    data[p * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  FIELD.lightField.value?.dispose();
  FIELD.lightField.value = tex;
  FIELD.fieldScale.value.set(1 / (grid.w * C), 1 / (grid.h * C));
  FIELD.fieldStrength.value = F.strength;
  return tex;
}

// Teach a lit material to read the field: its world position (nudged off
// the surface along its normal, so a wall reads the air in front of it)
// picks a texel; the light found there joins the indirect light.
export function patchMaterial(m) {
  if (!m?.isMeshStandardMaterial || m.userData.field) return;
  m.userData.field = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FIELD);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFieldPos;\nvarying vec3 vFieldN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFieldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFieldN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFieldPos;\nvarying vec3 vFieldN;\nuniform sampler2D lightField;\nuniform vec2 fieldScale;\nuniform float fieldStrength;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n{ vec3 fp = vFieldPos + normalize(vFieldN) * 0.4;\n  reflectedLight.indirectDiffuse += texture2D(lightField, fp.xz * fieldScale).rgb * fieldStrength * BRDF_Lambert(diffuseColor.rgb); }');
  };
  m.customProgramCacheKey = () => 'lightfield';
  m.needsUpdate = true;
}

// every lit surface under a group
export function patchAll(group) {
  group.traverse((o) => { if (o.isMesh) patchMaterial(o.material); });
}
