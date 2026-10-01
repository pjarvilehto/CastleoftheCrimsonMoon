// core/bg3dPuffGL.js — draws the fog puffs (0.101, core/bg3dPuffs.js).
// Soft mist needs no sharp pixels, so the puffs render into a buffer at
// half the canvas resolution (a quarter of the pixels — big overlapping
// sprites are the expensive part), which one pass then blends over the
// scene. Premultiplied alpha: the puffs pile up in any order.

import { program, LIGHT_GLSL } from './bg3dGL.js';
import { puffSprites, puffVertices, puffIndices, PUFF_FLOATS, SHADE } from './bg3dPuffs.js';

// The flash lights (0.100) per corner: they are big soft falloffs, so four
// samples per puff are plenty and the pixels skip the loop.
const VS = `
attribute vec3 aPos; attribute vec2 aUv; attribute vec3 aExtra; // local height, alpha, shade
uniform mat4 uMVP;
${LIGHT_GLSL}
varying vec3 vWorld, vExtra, vLit; varying vec2 vUv;
void main() {
  vWorld = aPos; vUv = aUv; vExtra = aExtra; vLit = lightAt(aPos) * 0.9;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

// Soft occlusion: this pixel's ray from the rest camera meets the focal
// plane at vWorld.xy / d; the depth map there gives the painted surface's
// distance (the same rule the background mesh uses), and the puff fades
// out as it reaches it. The sprite's alpha channel is its baked light.
const FS = `
precision mediump float;
uniform sampler2D uSprite, uDepthMap;
uniform vec2 uUvScale, uPlane; uniform float uDepthScale, uPivot, uSoft, uAmount;
uniform vec3 uFogColor;
varying vec3 vWorld, vExtra, vLit; varying vec2 vUv;
void main() {
  vec4 s = texture2D(uSprite, vUv);
  float a = s.r * vExtra.y * uAmount;
  if (a < 0.004) discard; // invisible: skip the depth read
  float d = -vWorld.z;
  vec2 g = vec2(vWorld.x / (d * uPlane.x) + 1.0, 1.0 - vWorld.y / (d * uPlane.y)) * 0.5;
  float depth = texture2D(uDepthMap, clamp(0.5 + (g - 0.5) * uUvScale, 0.0, 1.0)).r;
  float surf = max(0.4, 1.0 + uDepthScale * (uPivot - depth));
  a = clamp(a * clamp((surf - d) / uSoft, 0.0, 1.0), 0.0, 1.0);
  float shade = vExtra.z * (${SHADE[0]} + s.a * ${(SHADE[1] - SHADE[0]).toFixed(2)}) * (0.9 + 0.12 * vExtra.x);
  vec3 c = uFogColor * shade + vLit; // flashes light the mist too (0.100)
  gl_FragColor = vec4(c * a, a);
}`;

const CVS = `
attribute vec2 aQuad; varying vec2 vUv;
void main() { vUv = aQuad * 0.5 + 0.5; gl_Position = vec4(aQuad, 0.0, 1.0); }`;
const CFS = `
precision mediump float;
uniform sampler2D uBuf; uniform float uAlpha; varying vec2 vUv;
void main() { gl_FragColor = texture2D(uBuf, vUv) * uAlpha; }`;

function locate(gl, prog, attribs, uniforms) {
  const loc = {};
  for (const n of attribs) loc[n] = gl.getAttribLocation(prog, n);
  for (const n of uniforms) loc[n] = gl.getUniformLocation(prog, n);
  return loc;
}

function texture(gl, setup) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  setup();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// A layer's depth map on the GPU (the puffs' soft occlusion). No map: one
// texel at the pivot depth (a flat scene).
export function depthTexture(gl, img, pivot = 0.5) {
  return texture(gl, () => {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    else {
      const v = Math.round(pivot * 255);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([v, v, v, 255]));
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  });
}

const ATTRS = [['aPos', 3, 0], ['aUv', 2, 3], ['aExtra', 3, 5]], STRIDE = PUFF_FLOATS * 4; // name, floats, offset

export function createPuffRenderer(gl) {
  const prog = program(gl, VS, FS), comp = program(gl, CVS, CFS);
  if (!prog || !comp) return null;
  const P = locate(gl, prog, ['aPos', 'aUv', 'aExtra'], ['uMVP', 'uSprite', 'uDepthMap', 'uUvScale', 'uPlane',
    'uDepthScale', 'uPivot', 'uSoft', 'uAmount', 'uFogColor', 'uLightPos', 'uLightCol', 'uLightR2']);
  const C = locate(gl, comp, ['aQuad'], ['uBuf', 'uAlpha']);
  const sprite = texture(gl, () => {
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, 256, 256, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, puffSprites(128));
    // no mipmaps: a puff is never much smaller on screen than its 128px
    // cell, and plain bilinear is the cheaper read on weak GPUs
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  });
  const vbuf = gl.createBuffer(), ibuf = gl.createBuffer(), quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  let fbo = null, buf = null, fw = 0, fh = 0, indexed = 0, verts = null;

  function target(w, h) {
    const tw = Math.max(1, Math.ceil(w / 2)), th = Math.max(1, Math.ceil(h / 2));
    if (fbo && tw === fw && th === fh) return;
    if (fbo) { gl.deleteFramebuffer(fbo); gl.deleteTexture(buf); }
    [fw, fh] = [tw, th];
    buf = texture(gl, () => {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    });
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, buf, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // One scene's puffs over what is drawn so far. frame: puffFrame(); u:
  // { mvp, plane, uvScale, depthScale, pivot, depthTex, mist, lights, r2,
  //   soft, amount, alpha (the layer's crossfade), width, height }.
  function draw(frame, u) {
    if (!frame.length) return;
    target(u.width, u.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, fw, fh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(P.uMVP, false, u.mvp);
    gl.uniform2fv(P.uUvScale, u.uvScale);
    gl.uniform2fv(P.uPlane, u.plane);
    gl.uniform1f(P.uDepthScale, u.depthScale);
    gl.uniform1f(P.uPivot, u.pivot);
    gl.uniform1f(P.uSoft, u.soft);
    gl.uniform1f(P.uAmount, u.amount);
    gl.uniform3fv(P.uFogColor, u.mist);
    gl.uniform3fv(P.uLightPos, u.lights.pos);
    gl.uniform3fv(P.uLightCol, u.lights.col);
    gl.uniform1f(P.uLightR2, u.r2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, sprite);
    gl.uniform1i(P.uSprite, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, u.depthTex);
    gl.uniform1i(P.uDepthMap, 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    const n = frame.length * 4 * PUFF_FLOATS;
    if (!verts || verts.length < n) verts = new Float32Array(n * 2); // reused: no per-frame garbage
    gl.bufferData(gl.ARRAY_BUFFER, puffVertices(frame, verts).subarray(0, n), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
    if (indexed < frame.length) { indexed = frame.length * 2; gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, puffIndices(indexed), gl.STATIC_DRAW); }
    for (const [n, size, off] of ATTRS) {
      gl.enableVertexAttribArray(P[n]);
      gl.vertexAttribPointer(P[n], size, gl.FLOAT, false, STRIDE, off * 4);
    }
    gl.drawElements(gl.TRIANGLES, frame.length * 6, gl.UNSIGNED_SHORT, 0);
    for (const [n] of ATTRS) gl.disableVertexAttribArray(P[n]);
    // blend the half-resolution mist over the scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, u.width, u.height);
    gl.useProgram(comp);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, buf);
    gl.uniform1i(C.uBuf, 4);
    gl.uniform1f(C.uAlpha, u.alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(C.aQuad);
    gl.vertexAttribPointer(C.aQuad, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(C.aQuad);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
  }

  // Free everything (the renderer shuts down: context loss, the quality ladder's last step).
  function dispose() {
    for (const t of [sprite, buf]) if (t) gl.deleteTexture(t);
    if (fbo) gl.deleteFramebuffer(fbo);
    for (const b of [vbuf, ibuf, quad]) gl.deleteBuffer(b);
    gl.deleteProgram(prog);
    gl.deleteProgram(comp);
  }

  return { draw, dispose };
}
