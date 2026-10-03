// ui/scenes/index.js — the scenes (title, hero, hub, dungeon, run end, benchmark), registered by name with the router
// (core/scene.js go(), 0.117). Scenes switch with go('hub') etc. and never
// import each other; main.js (and the test harness) import this once.

import { registerScene } from '../../core/scene.js';
import { titleScene } from './titleScene.js';
import { hubScene } from './hubScene.js';
import { dungeonScene } from './dungeonScene.js';
import { runEndScene } from './runEndScene.js';
import { benchmarkScene } from './benchmarkScene.js';
import { heroScene } from './heroScene.js';

registerScene('title', titleScene);
registerScene('hero', heroScene); // CHOOSE YOUR HERO (0.00248), between the title and the hall
registerScene('hub', hubScene);
registerScene('dungeon', dungeonScene);
registerScene('runEnd', runEndScene);
registerScene('benchmark', benchmarkScene); // ?debug BENCHMARK (0.131)

export { titleScene, heroScene, hubScene, dungeonScene, runEndScene, benchmarkScene };
