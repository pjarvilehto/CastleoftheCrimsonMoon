// ui/titleIntro.js — the title's fly-in (0.00307, a prototype): a short clip
// flying from far across the valley into the title painting, played once per
// session over everything as the title scene enters. Its last frame IS the
// painting (cover-fit, like the renderer's rest pose), so the held frame's
// fade onto the 3D background is a seamless hand-over. Tuning
// `backgrounds.json intro`; how the clip is made: docs/video-prompts.md.
//
// Boot fetches it beside the art (preloadIntro) and waits at 100% for it a
// little (introReady: intro.waitMs, else the title shows as it always has).
// Where the browser can't play it, under reduced motion, or with the clip
// not ready, nothing is mounted: playIntro() answers null and the title is
// as before. A click, a tap or a key skips (the fade starts from where the
// clip is). Autoplay: muted + playsinline, allowed everywhere without a
// gesture; a phone plays it after its PLAY gate anyway.
import { DATA } from '../shared/data.js';
import { reducedMotion } from '../shared/motion.js';
import { transitionSfx } from '../audio/sfx.js';

let video = null;   // the preloaded <video>; null where there is nothing to play
let ready = null;   // resolves true once it can play through, false on an error
let played = false; // once per session

const cfg = () => DATA.backgrounds.intro;
// a real video element that can decode the clip (the test shim's element has no play(); headless Chromium has no H.264 —
// the codec is asked by name, 'video/mp4' alone answers "maybe" there and the file then fails to decode)
const TYPE = { mp4: 'video/mp4; codecs="avc1.640032"', webm: 'video/webm; codecs="vp9"' }; // (H.264 High 5.0, the clips' encode; VP9 for a WebM)
const canPlay = (v, file) => typeof v?.play === 'function' && !!v.canPlayType?.(TYPE[file.split('.').pop()] ?? '');

/** Boot, once the data is in: start fetching the clip while the loader gathers the art. */
export function preloadIntro() {
  const c = cfg();
  if (!c?.enabled || video || reducedMotion()) return;
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

/** The loader at 100%: true when the clip can play through, false after intro.waitMs (the title shows without it). */
export function introReady() {
  if (!video) return Promise.resolve(false);
  return Promise.race([ready, new Promise((resolve) => setTimeout(() => resolve(false), cfg().waitMs))]);
}

/**
 * The title scene's enter (the windows are out, the painting just set):
 * play the clip over everything and fade it out over intro.fadeMs onto the
 * renderer's rest pose — the fade starting intro.leadMs before the film's
 * end (0.00308), or intro.holdMs after it when leadMs is 0. A promise that
 * resolves once the layer is gone — or null at once when there is nothing
 * to play (no clip, reduced motion, already played, not decoded yet).
 */
export function playIntro() {
  const v = video;
  if (!v || played || !(v.readyState >= 3)) return null; // (HAVE_FUTURE_DATA: it can start now)
  played = true;
  const c = cfg();
  const layer = document.createElement('div');
  layer.id = 'intro';
  layer.style.setProperty('--fade', `${c.fadeMs}ms`);
  layer.append(v);
  document.body.append(layer);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener('ended', onEnd);
      clearTimeout(lead);
      globalThis.removeEventListener('keydown', skip, true);
      layer.classList.add('fading'); // styles.css: opacity to 0 over --fade
      setTimeout(() => { v.pause(); layer.remove(); resolve(true); }, c.fadeMs);
    };
    const onEnd = () => setTimeout(finish, c.holdMs); // (the element keeps its last frame up; the backstop)
    // 0.00308: the fade begins intro.leadMs BEFORE the film's end, the film still playing under it (its last stretch is the painting)
    const lead = setTimeout(finish, Math.max(0, (v.duration || 0) * 1000 - c.leadMs));
    // a skip: any key but the browser's own (F-keys, Tab), any press on the layer; the key goes no further (the title's hotkeys would act under the clip)
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
    v.play().then(() => transitionSfx(c.whooshAtMs)).catch(finish); // refused (no autoplay): nothing to see, fade at once; playing: a room change's whoosh, its peak intro.whooshAtMs into the flight (0.00309)
  });
}
