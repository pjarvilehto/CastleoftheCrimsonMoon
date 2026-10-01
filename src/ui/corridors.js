// ui/corridors.js — the 3D corridors between rooms (0.150, a ?debug test of
// the owner's idea): with 3D CORRIDORS on (the ?debug column; remembered
// per browser), leaving the Great Hall fades into the 3D dungeon, the
// knight walks on his own to the first room, and its painting and fight
// fade in where he stops; after each room he walks on to the next. The
// run is the game's own — rooms, fights, shrine, retreat, settling — only
// the way between rooms changes (ui/scenes/dungeonScene.js walkOn).
// The game reaches src/explore/ only here, by a dynamic import: three.js
// and the explore modules load when the mode is first used, and a browser
// that can't run them (no WebGL2) keeps the classic room-to-room fades.

import { getPref, setPref } from '../shared/prefs.js';
import { DATA } from '../shared/data.js';
import { onOffToggle } from './cornerToggles.js';

const KEY = 'corridors3d';
let viewPromise = null, factory = null;

const debugMode = () => new URLSearchParams(globalThis.location?.search ?? '').has('debug');
const wanted = () => getPref(KEY, 'on') === 'on';

// is the mode on for the run about to start?
export const corridorsOn = () => (factory ? true : debugMode() && wanted());

// the ?debug column's switch
export function corridorsToggle() {
  return onOffToggle('3D CORRIDORS', {
    cls: 'corridors-toggle', get: wanted,
    flip: () => { setPref(KEY, wanted() ? 'off' : 'on'); return wanted(); },
  });
}

// The view, made once per page and kept between runs (its WebGL context and
// shaders survive); null where it can't run. Called early (the Great Hall)
// so the first descent doesn't wait for three.js.
export function corridorView() {
  viewPromise ??= (factory ? Promise.resolve().then(factory) : (async () => {
    const [{ createCorridorView }, cfg] = await Promise.all([
      import('../explore/corridorView.js'),
      fetch('assets/data/explore.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]);
    return createCorridorView(cfg, { bossEvery: DATA.difficulty.bossEvery });
  })()).catch(() => null);
  return viewPromise;
}

// tests: a stand-in view (walkTo / reveal / close), the mode forced on; null = back to normal
export function setCorridorFactory(fn) { factory = fn; viewPromise = null; }
