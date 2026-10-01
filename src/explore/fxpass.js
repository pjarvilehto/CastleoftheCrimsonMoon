// explore/fxpass.js — one full-screen shader pass (0.147): a quad, an
// orthographic camera, a ShaderMaterial; render(target) draws it into a
// render target (or the screen with null). Used by the post stack: bloom,
// SSAO and the ink-and-paint pass.

import * as THREE from 'three';

const VERT = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const quadGeo = new THREE.PlaneGeometry(2, 2);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export function fxPass(renderer, fragmentShader, uniforms, extra = {}) {
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...extra });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(quadGeo, material));
  return {
    material,
    uniforms: material.uniforms,
    render(target) {
      renderer.setRenderTarget(target);
      renderer.render(scene, ortho);
    },
  };
}

// a colour render target for the post stack (half floats: HDR survives)
export const fxTarget = (w = 1, h = 1) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
