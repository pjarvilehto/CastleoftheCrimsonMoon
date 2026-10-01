// explore/quality.js — the lab keeps its frame rate (0.145), like the game's
// 3D backgrounds do: while the frame rate stays under `minFps` for
// `seconds`, it steps down once — first the shadows go (the cube maps are
// the dearest thing on screen), then the render resolution, x0.75 at a
// time down to `minScale`. Never back up within a visit.
// createQuality(cfg, { lights, setScale }) -> { tick(dt), level() }

export function createQuality(cfg, { lights, setScale }) {
  const Q = cfg.quality;
  let slow = 0, frames = 0, time = 0, step = 0, scale = 1;
  function stepDown() {
    if (step === 0 && lights.pool.some((l) => l.castShadow)) {
      for (const l of lights.pool) l.castShadow = false; // (one shader rebuild, once)
    } else if (scale * 0.75 >= Q.minScale) {
      scale *= 0.75;
      setScale(scale);
    } else return;
    step += 1;
  }
  return {
    // every frame: is the last second under minFps? for `seconds` running?
    tick(dt) {
      frames += 1; time += dt;
      if (time < 1) return;
      const fps = frames / time;
      frames = 0; time = 0;
      slow = fps < Q.minFps ? slow + 1 : 0;
      if (slow >= Q.seconds) { slow = 0; stepDown(); }
    },
    level: () => step,
  };
}
