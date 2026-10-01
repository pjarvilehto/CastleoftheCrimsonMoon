// ui/scenes/index.js — the four scenes, registered by name with the router
// (core/scene.js go(), 0.117). Scenes switch with go('hub') etc. and never
// import each other; main.js (and the test harness) import this once.

import { registerScene } from '../../core/scene.js';
import { titleScene } from './titleScene.js';
import { hubScene } from './hubScene.js';
import { dungeonScene } from './dungeonScene.js';
import { runEndScene } from './runEndScene.js';

registerScene('title', titleScene);
registerScene('hub', hubScene);
registerScene('dungeon', dungeonScene);
registerScene('runEnd', runEndScene);

export { titleScene, hubScene, dungeonScene, runEndScene };
