// ui/titleIntro.js — the title's fly-in (0.00307; shipping since 0.00311):
// a short film flying from far across the valley into the title painting,
// played once per session over everything as the title scene enters. Its
// last stretch IS the painting (cover-fit, like the renderer's rest pose),
// so as it fades the renderer is put back at rest (bg3d.js bgArrive) and
// what the fade reveals is the frame the film ends on; the mist and the
// sway rise after. Tuning `backgrounds.json intro` (a phone's own file in
// its `phone` block, shared/platform.js deviceBlock); how the film is made:
// docs/video-prompts.md; `node tools/intro-check.mjs` drives it headless.
//
// Boot fetches it beside the art (preloadIntro) and waits for it a little
// before the title (introReady: intro.waitMs; on a phone after the PLAY
// tap). Where the browser can't play it, under reduced motion, or with the
// film not ready, nothing is mounted: playIntro() answers null and the
// title is as before. A click, a tap or a key skips (the fade starts from
// where the film is). Autoplay: muted + playsinline, allowed everywhere
// without a gesture (iOS Low Power Mode refuses: play() rejects and the
// layer fades at once). The vignette over the film is the game's own CSS
// ellipse (styles.css #intro::after), the screen's, on every aspect ratio.
import { DATA } from '../shared/data.js';
import { reducedMotion } from '../shared/motion.js';
import { deviceBlock } from '../shared/platform.js';
import { transitionSfx } from '../audio/sfx.js';
import { bgArrive } from '../core/bg3d.js';

let video = null;   // the preloaded <video>; null where there is nothing to play (or once it has played)
let ready = null;   // resolves true once it can play through, false on an error
let played = false; // once per session

const cfg = () => deviceBlock(DATA.backgrounds.intro);
// a real video element that can decode the film (the test shim's element has no play(); headless Chromium has no H.264 —
// the codec is asked by name, 'video/mp4' alone answers "maybe" there and the file then fails to decode)
const TYPE = { mp4: 'video/mp4; codecs="avc1.640032"', webm: 'video/webm; codecs="vp9"' }; // (H.264 High 5.0, the films' encode; VP9 for a WebM — the headless check's transcode)
const canPlay = (v, file) => typeof v?.play === 'function' && !!v.canPlayType?.(TYPE[file.split('.').pop()] ?? '');

/** Boot, once the data is in: start fetching the film while the loader gathers the art. */
export function preloadIntro() {
  const c = cfg();
  if (!c?.enabled || video || played || reducedMotion()) return;
  const v = document.createElement('video');
  if (!canPlay(v, c.file)) return;
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.src = `assets/video/${c.file}`;
  ready = new Promise((resolve) => {
    v.addEventListener('canplaythrough', () => resolve(true), { once: true });
    v.addEventListener('error', () => resolve(false), { once: true });
  });
  v.load();
  video = v;
}

/** The fly-in is about to play (ready, not yet played): the boot's own transition keeps its whoosh for it (0.00310). */
export const introPending = () => !!video && !played && video.readyState >= 3;

/** Before the title: true when the film can play through, false after intro.waitMs (the title shows without it). */
export function introReady() {
  if (!video) return Promise.resolve(false);
  return Promise.race([ready, new Promise((resolve) => setTimeout(() => resolve(false), cfg().waitMs))]);
}

/**
 * The title scene's enter (the windows are out, the painting just set):
 * play the film over everything and fade it out over intro.fadeMs onto the
 * renderer's rest pose — the fade starting intro.leadMs before the film's
 * end by the film's OWN clock (a stalled download never fades mid-flight),
 * or intro.holdMs after it when leadMs is 0. A promise that resolves once
 * the layer is gone — or null at once when there is nothing to play (no
 * film, reduced motion, already played, not decoded yet).
 */
export function playIntro() {
  const v = video;
  if (!v || played || !(v.readyState >= 3)) return null; // (HAVE_FUTURE_DATA: it can start now)
  played = true;
  video = null;
  const c = cfg();
  const layer = document.createElement('div');
  layer.id = 'intro';
  layer.style.setProperty('--fade', `${c.fadeMs}ms`);
  layer.append(v);
  document.body.append(layer);
  return new Promise((resolve) => {
    let done = false, poll = 0;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(poll);
      v.removeEventListener('ended', onEnd);
      globalThis.removeEventListener('keydown', skip, true);
      bgArrive(); // (0.00310: the renderer back to its rest pose and its mist rising, under the still-opaque film — what the fade reveals is the frame the film ends on)
      layer.classList.add('fading'); // styles.css: opacity to 0 over --fade
      setTimeout(() => {
        v.pause();
        layer.remove();
        v.removeAttribute('src'); v.load(); // (the decoder and its buffers released: the film played once, 0.00311)
        resolve(true);
      }, c.fadeMs);
    };
    const onEnd = () => setTimeout(finish, c.holdMs); // (the element keeps its last frame up; the backstop under leadMs)
    // the fade begins leadMs before the end by the film's own clock, read every frame
    const watch = () => {
      if (done) return;
      if (c.leadMs > 0 && v.duration > 0 && v.currentTime >= v.duration - c.leadMs / 1000) { finish(); return; }
      poll = requestAnimationFrame(watch);
    };
    // a skip: any key but the browser's own (F-keys, Tab), any press on the layer; the key goes no further (the title's hotkeys would act under the film)
    const skip = (e) => {
      if (e.key && /^(F\d+|Tab)$/.test(e.key)) return;
      e.stopPropagation?.();
      finish();
    };
    v.addEventListener('ended', onEnd);
    v.addEventListener('error', finish, { once: true });
    layer.addEventListener('pointerdown', skip);
    globalThis.addEventListener('keydown', skip, true);
    v.currentTime = 0;
    v.play().then(() => { transitionSfx(c.whooshAtMs, { gainDb: c.whooshDb }); poll = requestAnimationFrame(watch); }) // playing: a room change's whoosh, its peak intro.whooshAtMs into the flight, intro.whooshDb under the game's level (0.00309 / 0.00310)
      .catch(finish); // refused (no autoplay): nothing to see, fade at once
  });
}
