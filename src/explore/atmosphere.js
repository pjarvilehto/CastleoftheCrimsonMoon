// explore/atmosphere.js — the air of the dungeon (0.147): dust motes
// turning slowly in the window beams, embers rising from braziers,
// hearths and torches, smoke drifting up and spreading. Emitters come
// from build.js / furnish.js ({ kind, at, ... }); each kind is ONE point
// cloud (one draw call), and every particle is animated in its vertex
// shader from a single time uniform — its own phase, speed and drift — so
// nothing runs per particle in JavaScript. Fogged like the scene.
// createAtmosphere(emitters, cfg, rnd) -> { group, update(t, pxScale), dispose() }

import * as THREE from 'three';

const KINDS = {
  // gl_PointSize = size * pxScale / depth; colour * alpha written as the pass blends
  dust: {
    blending: THREE.AdditiveBlending,
    vertex: `float k = fract(uTime * a.y + a.x);
      vec3 p = position + vec3(sin(uTime * 0.21 + a.x * 17.0), sin(uTime * 0.13 + a.x * 29.0) * 0.6, cos(uTime * 0.17 + a.x * 11.0)) * a.z;
      vAlpha = (0.55 + 0.45 * sin(uTime * 1.3 + a.x * 40.0)) * smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.85, 1.0, k));`,
    fragment: `float r = length(gl_PointCoord - 0.5) * 2.0; float s = 1.0 - smoothstep(0.2, 1.0, r);
      gl_FragColor = vec4(vColor * s * vAlpha * fog, 1.0);`,
  },
  ember: {
    blending: THREE.AdditiveBlending,
    vertex: `float k = fract(uTime * a.y + a.x);
      vec3 p = position + vec3(sin(uTime * 2.3 + a.x * 13.0) * 0.12 * k, k * a.z, cos(uTime * 1.9 + a.x * 7.0) * 0.12 * k);
      vAlpha = (1.0 - k) * smoothstep(0.0, 0.08, k) * (0.6 + 0.4 * sin(uTime * 17.0 + a.x * 50.0));
      vColor = mix(vColor, vec3(0.9, 0.18, 0.04), k);`,
    fragment: `float r = length(gl_PointCoord - 0.5) * 2.0; float s = 1.0 - smoothstep(0.0, 1.0, r);
      gl_FragColor = vec4(vColor * s * vAlpha * fog * 3.0, 1.0);`,
  },
  smoke: {
    blending: THREE.NormalBlending,
    vertex: `float k = fract(uTime * a.y + a.x);
      vec3 p = position + vec3(sin(uTime * 0.4 + a.x * 9.0) * 0.35 * k, k * a.z, cos(uTime * 0.33 + a.x * 5.0) * 0.35 * k);
      vAlpha = sin(k * 3.14159) * 0.7;
      size *= 0.4 + 1.6 * k;`,
    fragment: `float r = length(gl_PointCoord - 0.5) * 2.0; float s = 1.0 - smoothstep(0.05, 1.0, r);
      gl_FragColor = vec4(vColor, s * vAlpha * fog);`,
  },
};

function material(kind, fogDensity, maxPx) {
  const K = KINDS[kind];
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, pxScale: { value: 500 }, maxPx: { value: maxPx }, fogDensity: { value: fogDensity } },
    vertexShader: `attribute vec4 a; attribute vec3 color; attribute float psize;
      uniform float uTime, pxScale, maxPx; varying vec3 vColor; varying float vAlpha, vDist;
      void main() {
        vColor = color; float size = psize;
        ${K.vertex}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_PointSize = min(size * pxScale / max(vDist, 0.1), maxPx); // (a mote by the eye stays a mote)
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float fogDensity; varying vec3 vColor; varying float vAlpha, vDist;
      void main() { float fog = exp(-pow(fogDensity * vDist, 2.0)); ${K.fragment} }`,
    transparent: true, depthWrite: false, blending: K.blending,
  });
}

export function createAtmosphere(emitters, cfg, rnd) {
  const A = cfg.atmosphere, group = new THREE.Group(), mats = [];
  const between = (a, b) => a + rnd() * (b - a);
  for (const kind of Object.keys(KINDS)) {
    const K = A[kind], pos = [], a = [], col = [], size = [];
    const c = new THREE.Color();
    for (const e of emitters.filter((x) => x.kind === kind)) {
      c.set(e.color ?? K.color);
      const n = Math.round(K.count * (e.amount ?? 1));
      for (let i = 0; i < n; i++) {
        let p;
        if (e.cone) { // dust: anywhere inside the beam's cone
          const t = Math.sqrt(rnd()), rr = (e.cone.r0 + (e.cone.r1 - e.cone.r0) * t) * Math.sqrt(rnd()) * 0.8, ang = rnd() * Math.PI * 2;
          p = e.cone.from.clone().addScaledVector(e.cone.dir, t * e.cone.len).addScaledVector(e.cone.u, Math.cos(ang) * rr).addScaledVector(e.cone.v, Math.sin(ang) * rr);
        } else p = new THREE.Vector3(e.at.x + between(-1, 1) * (e.spread ?? 0.1), e.at.y, e.at.z + between(-1, 1) * (e.spread ?? 0.1));
        pos.push(p.x, p.y, p.z);
        a.push(rnd(), K.speed * between(0.6, 1.4), K.travel * between(0.6, 1.3), 0);
        col.push(c.r, c.g, c.b);
        size.push(K.size * between(0.6, 1.4) * (e.size ?? 1));
      }
    }
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('a', new THREE.Float32BufferAttribute(a, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('psize', new THREE.Float32BufferAttribute(size, 1));
    const m = material(kind, cfg.fog.density, K.maxPx);
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; // (they drift off their start points)
    pts.renderOrder = kind === 'smoke' ? 1 : 2;
    group.add(pts); mats.push(m);
  }
  return {
    group,
    update(t, pxScale) { for (const m of mats) { m.uniforms.uTime.value = t; m.uniforms.pxScale.value = pxScale; } },
    dispose() { group.traverse((o) => { if (o.isPoints) { o.geometry.dispose(); o.material.dispose(); } }); },
  };
}
