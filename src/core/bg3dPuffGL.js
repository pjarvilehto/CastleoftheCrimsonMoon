// core/bg3dPuffGL.js — draws the fog puffs (0.101, core/bg3dPuffs.js).
// Soft mist needs no sharp pixels, so the puffs render into a buffer at
// half the canvas resolution (a quarter of the pixels — big overlapping
// sprites are the expensive part), which one pass then blends over the
// scene. Premultiplied alpha, drawn back to front (the far ones first).

import { program, LIGHT_GLSL, VIGNETTE_GLSL } from './bg3dGL.js';
import { puffSprites, puffVertices, puffIndices, PUFF_FLOATS, SHADE } from './bg3dPuffs.js';
import { fogNoise } from './bg3dFog.js';

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
// 0.164 (parallax.puffs / mist, tuned in the Fog Lab): flow = tileable
// noise scrolled across each puff thins and thickens it so the mist churns
// inside; the lit and shaded sides get their own tints; sceneLight adds
// the painting's own bright pixels (torches, windows) behind the puff —
// read blurred (a mip bias) so it glows rather than speckles; nearBright
// lifts the near puffs. Every one of them off = the 0.101 look.
const FS = `
precision mediump float;
uniform sampler2D uSprite, uDepthMap, uFlow, uArt;
uniform vec2 uUvScale, uPlane; uniform float uDepthScale, uPivot, uSoft, uAmount;
uniform vec3 uFogColor, uFlowP, uMist, uLitTint, uShadeTint; // flow: t, scale, amount; mist: shade, sceneLight, nearBright
varying vec3 vWorld, vExtra, vLit; varying vec2 vUv;
void main() {
  vec4 s = texture2D(uSprite, vUv);
  float a = s.r * vExtra.y * uAmount;
  if (uFlowP.z > 0.0) {
    float n = texture2D(uFlow, vUv * uFlowP.y + vec2(uFlowP.x, uFlowP.x * 0.61) + vWorld.xy * 0.8).r;
    a *= mix(1.0 - uFlowP.z, 1.0 + uFlowP.z, n);
  }
  if (a < 0.004) discard; // invisible: skip the depth read
  float d = -vWorld.z;
  vec2 g = vec2(vWorld.x / (d * uPlane.x) + 1.0, 1.0 - vWorld.y / (d * uPlane.y)) * 0.5;
  vec2 uv = clamp(0.5 + (g - 0.5) * uUvScale, 0.0, 1.0);
  float depth = texture2D(uDepthMap, uv).r;
  float surf = max(0.4, 1.0 + uDepthScale * (uPivot - depth));
  a = clamp(a * clamp((surf - d) / uSoft, 0.0, 1.0), 0.0, 1.0);
  float lit = s.a; // 0 = in its own shade, 1 = lit from above
  float shade = vExtra.z * mix(1.0, ${SHADE[0]} + lit * ${(SHADE[1] - SHADE[0]).toFixed(2)}, uMist.x) * (0.9 + 0.12 * vExtra.x);
  vec3 c = uFogColor * mix(uShadeTint, uLitTint, lit) * shade;
  c *= 1.0 + uMist.z * clamp(1.4 - d, 0.0, 1.0);
  if (uMist.y > 0.0) c += texture2D(uArt, uv, 4.0).rgb * uMist.y;
  c += vLit; // flashes light the mist too (0.100)
  gl_FragColor = vec4(c * a, a);
}`;

const CVS = `
attribute vec2 aQuad; varying vec2 vUv;
void main() { vUv = aQuad * 0.5 + 0.5; gl_Position = vec4(aQuad, 0.0, 1.0); }`;
const CFS = `
precision mediump float;
uniform sampler2D uBuf; uniform float uAlpha; varying vec2 vUv;
${VIGNETTE_GLSL}
void main() { gl_FragColor = texture2D(uBuf, vUv) * uAlpha; gl_FragColor.rgb *= vignette(); }`; // (premultiplied: darkening the colour alone keeps the mist's cover)

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
export function depthTexture(gl, img, pivot) { // (the layer's tune.pivot; no default copy, rule 2)
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
  const P = locate(gl, prog, ['aPos', 'aUv', 'aExtra'], ['uMVP', 'uSprite', 'uDepthMap', 'uFlow', 'uArt', 'uUvScale', 'uPlane',
    'uDepthScale', 'uPivot', 'uSoft', 'uAmount', 'uFogColor', 'uFlowP', 'uMist', 'uLitTint', 'uShadeTint', 'uLightPos', 'uLightCol', 'uLightR2']);
  const C = locate(gl, comp, ['aQuad'], ['uBuf', 'uAlpha', 'uRes']);
  const sprite = texture(gl, () => {
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, 256, 256, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, puffSprites(128));
    // no mipmaps: a puff is never much smaller on screen than its 128px
    // cell, and plain bilinear is the cheaper read on weak GPUs
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  });
  // the flow noise (0.164): tileable, so it scrolls forever (REPEAT)
  const flow = texture(gl, () => {
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 128, 128, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, fogNoise(128, 23));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  });
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const vbuf = gl.createBuffer(), ibuf = gl.createBuffer(), quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  let fbo = null, buf = null, fw = 0, fh = 0, indexed = 0, verts = null;

  // the mist buffer at 1/div of the canvas (parallax.puffDiv, 0.00222: the
  // 2 was a constant here; a phone draws it at a third)
  function target(w, h, div) {
    const tw = Math.max(1, Math.ceil(w / div)), th = Math.max(1, Math.ceil(h / div));
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
  // { mvp, plane, uvScale, depthScale, pivot, depthTex, artTex, mist, lights,
  //   lights (pos, col, r2 — each light's reach, 0.00320), soft, amount, alpha (the layer's crossfade), width, height,
  //   flow: [t, scale, amount], light: parallax.mist, div: parallax.puffDiv }.
  function draw(frame, u) {
    if (!frame.length) return;
    target(u.width, u.height, u.div);
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
    gl.uniform3fv(P.uFlowP, u.flow);
    gl.uniform3f(P.uMist, u.light.shade, u.light.sceneLight, u.light.nearBright);
    gl.uniform3fv(P.uLitTint, u.light.litTint);
    gl.uniform3fv(P.uShadeTint, u.light.shadeTint);
    gl.uniform3fv(P.uLightPos, u.lights.pos);
    gl.uniform3fv(P.uLightCol, u.lights.col);
    gl.uniform1fv(P.uLightR2, u.lights.r2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, sprite);
    gl.uniform1i(P.uSprite, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, u.depthTex);
    gl.uniform1i(P.uDepthMap, 3);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, flow);
    gl.uniform1i(P.uFlow, 5);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, u.artTex);
    gl.uniform1i(P.uArt, 6);
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
    gl.uniform2f(C.uRes, u.width, u.height);
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
    for (const t of [sprite, flow, buf]) if (t) gl.deleteTexture(t);
    if (fbo) gl.deleteFramebuffer(fbo);
    for (const b of [vbuf, ibuf, quad]) gl.deleteBuffer(b);
    gl.deleteProgram(prog);
    gl.deleteProgram(comp);
  }

  return { draw, dispose };
}
