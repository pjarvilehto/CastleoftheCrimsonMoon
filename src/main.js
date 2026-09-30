// main.js — entry point: boot loader (data + fully decoded images),
// stamp build number, show title. The loader exists because art only
// starts loading when first rendered — without preloading, backgrounds
// and portraits painted half-drawn on first view.

import { show, initHotkeys, el } from './core/scene.js';
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
  // Testing aid (upper right): invulnerability toggle, session-only.
  const inv = el('button', {
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
  document.body.append(tag, inv, music, fsBtn, snd);
  // Every button in the game clicks (delegated, so dynamically rendered
  // scenes need no per-button wiring).
  document.addEventListener?.('click', (e) => {
    if (e.target?.closest?.('button')) sfx('click');
  });
  initMusic();
  initSfx();
  show(titleScene());
}

boot();
