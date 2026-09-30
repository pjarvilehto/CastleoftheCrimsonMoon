// main.js — entry point: boot loader (data + fully decoded images),
// stamp build number, show title. The loader exists because art only
// starts loading when first rendered — without preloading, backgrounds
// and portraits painted half-drawn on first view.

import { show, initHotkeys, el, setBackground, onBackgroundChange } from './core/scene.js';
import { initBg3d, showBackground3d, isBg3dActive, bgView, setBgView } from './core/bg3d.js';
import { bgTunerToggle } from './ui/bgTuner.js';
import { loadData, DATA } from './shared/data.js';
import { preloadAssets } from './shared/preload.js';
import { titleScene } from './ui/scenes/titleScene.js';
import { DEBUG } from './shared/debug.js';
import { initMusic, isMuted, toggleMuted } from './audio/music.js';
import { initSfx, sfx, isMuted as sfxMuted, toggleMuted as toggleSfx } from './audio/sfx.js';

async function boot() {
  // The display font is a lazily-fetched @font-face (font-display: swap) —
  // without gating on it, the loader and title painted in a fallback font,
  // then visibly flipped. The <link rel=preload> in index.html starts the
  // fetch at parse time; here we just await it (capped, so a failed fetch
  // can never hang boot).
  const fontReady = (document.fonts?.load('32px "DIN Condensed"', 'C') ?? Promise.resolve()).catch(() => {});
  await Promise.race([fontReady, new Promise((r) => setTimeout(r, 800))]);
  // Render the loader directly (not via show()) — there is nothing to
  // fade out from yet, and #app starts hidden in index.html.
  const app = document.getElementById('app');
  app.classList.remove('hidden');
  const fill = el('div', { class: 'loader-fill' });
  const pct = el('div', { class: 'subtitle loader-pct' }, '0%');
  app.append(el('div', { class: 'panel loader' },
    el('h1', {}, 'CASTLE OF THE CRIMSON MOON'),
    el('div', { class: 'subtitle' }, 'Gathering the castle’s shadows…'),
    el('div', { class: 'loader-track' }, fill),
    pct));

  await loadData();
  await preloadAssets((loaded, total) => {
    const p = Math.round((loaded / total) * 100);
    fill.style.width = `${p}%`;
    pct.textContent = `${p}%`;
  });

  await fontReady; // images took seconds — the font is long done, this is free
  initHotkeys();
  const tag = document.createElement('div');
  tag.className = 'build-tag';
  tag.textContent = `build v${DATA.build.version}`;
  // Testing aid (upper right): invulnerability toggle, session-only. Only
  // with ?debug in the URL (0.079) — players never see it.
  const debugMode = new URLSearchParams(globalThis.location?.search ?? '').has('debug');
  if (debugMode) document.body.classList.add('debug');
  const inv = debugMode && el('button', {
    class: 'debug-toggle',
    onclick: (e) => {
      DEBUG.invulnerable = !DEBUG.invulnerable;
      e.currentTarget.classList.toggle('on', DEBUG.invulnerable);
      e.currentTarget.textContent = `INVULNERABLE: ${DEBUG.invulnerable ? 'ON' : 'OFF'}`;
    },
  }, 'INVULNERABLE: OFF');
  // Music toggle, under the debug toggle: persists across sessions.
  const music = el('button', {
    class: `debug-toggle music-toggle${isMuted() ? '' : ' on'}`,
    onclick: (e) => {
      const m = toggleMuted();
      e.currentTarget.classList.toggle('on', !m);
      e.currentTarget.textContent = `MUSIC: ${m ? 'OFF' : 'ON'}`;
    },
  }, `MUSIC: ${isMuted() ? 'OFF' : 'ON'}`);
  // Fullscreen toggle, under the music toggle. The label tracks the real
  // fullscreen state — Esc/F11 also exits fullscreen without this button.
  const fsBtn = el('button', {
    class: 'debug-toggle fs-toggle',
    onclick: async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen?.();
        else await document.documentElement.requestFullscreen?.();
      } catch { /* fullscreen denied/unavailable (e.g. iframe) — label stays */ }
    },
  }, 'FULLSCREEN: OFF');
  document.addEventListener?.('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    fsBtn.classList.toggle('on', on);
    fsBtn.textContent = `FULLSCREEN: ${on ? 'ON' : 'OFF'}`;
  });
  // Sound-effects toggle, under fullscreen: persists across sessions.
  const snd = el('button', {
    class: `debug-toggle sfx-toggle${sfxMuted() ? '' : ' on'}`,
    onclick: (e) => {
      const m = toggleSfx();
      e.currentTarget.classList.toggle('on', !m);
      e.currentTarget.textContent = `SOUND: ${m ? 'OFF' : 'ON'}`;
    },
  }, `SOUND: ${sfxMuted() ? 'OFF' : 'ON'}`);
  document.body.append(...[tag, inv, music, fsBtn, snd, ...(debugMode ? bgDebugToggles() : [])].filter(Boolean));
  // Living 3D backgrounds (0.083). Software-rendered GL is allowed only
  // under ?debug (headless testing); real players on a GPU-less machine,
  // or with reduced motion requested, keep the flat CSS backgrounds.
  if (initBg3d({ allowSoftware: debugMode })) onBackgroundChange(showBackground3d);
  // Every button in the game clicks (delegated, so dynamically rendered
  // scenes need no per-button wiring).
  document.addEventListener?.('click', (e) => {
    if (e.target?.closest?.('button')) sfx('click');
  });
  initMusic();
  initSfx();
  show(titleScene());
}

// ?debug background evaluation (0.083): hide the UI, compare 3D / flat /
// the depth map itself, and step through every background without playing.
function bgDebugToggles() {
  const fg = el('button', {
    class: 'debug-toggle bg-fg-toggle',
    onclick: (e) => {
      const hidden = document.body.classList.toggle('fg-hidden');
      e.currentTarget.classList.toggle('on', hidden);
      e.currentTarget.textContent = `HIDE FOREGROUND: ${hidden ? 'ON' : 'OFF'}`;
    },
  }, 'HIDE FOREGROUND: OFF');
  const modes = ['3d', 'flat', 'depth'];
  const viewBtn = el('button', {
    class: 'debug-toggle bg-view-toggle',
    onclick: (e) => {
      if (!isBg3dActive()) { e.currentTarget.textContent = 'BG VIEW: NO WEBGL'; return; }
      setBgView(modes[(modes.indexOf(bgView()) + 1) % modes.length]);
      e.currentTarget.textContent = `BG VIEW: ${bgView().toUpperCase()}`;
    },
  }, 'BG VIEW: 3D');
  const b = DATA.backgrounds;
  const all = [...new Set([b.title, b.hub, b.boss, b.death, b.shrine, ...b.rooms])];
  let i = -1;
  const next = el('button', {
    class: 'debug-toggle bg-next-toggle',
    onclick: (e) => {
      i = (i + 1) % all.length;
      setBackground(all[i]);
      e.currentTarget.textContent = `NEXT BG (${i + 1}/${all.length}: ${all[i].replace(/^castle_|\.jpg$/g, '')})`;
    },
  }, 'NEXT BG');
  // 0.089 experiment: keep enemy figures inside their card frames.
  const clip = el('button', {
    class: 'debug-toggle bg-clip-toggle',
    onclick: (e) => {
      const on = document.body.classList.toggle('clip-enemies');
      e.currentTarget.classList.toggle('on', on);
      e.currentTarget.textContent = `CLIP ENEMIES: ${on ? 'ON' : 'OFF'}`;
    },
  }, 'CLIP ENEMIES: OFF');
  return [fg, viewBtn, next, bgTunerToggle(), clip];
}

boot();
