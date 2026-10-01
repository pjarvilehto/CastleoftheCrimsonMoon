// explore/themes.js — every room has a theme (0.146): the floor runs
// corridor -> themed room -> corridor -> themed room, each fight in a
// place of its own. Pure (tested in Node): which theme each room gets
// (explore.json themes + the depth tier's `themes` weights; the start is
// an antechamber, the shrine a chapel of candles, the boss hall a throne
// room), and where things can go in it without blocking the way:
//   path   the room's centre row and column (corridors arrive along them,
//          the enemy stands at the crossing) and every cell a corridor
//          runs through (floor.trail: a bend can fall inside a room) — clear
//   free   every other cell: furniture goes here
//   walls  each wall face around the room: { x, z, n: [nx, nz] } (n points
//          into the room) — shelves, bars, banners, windows hang here
//   doors  the openings to corridors
// themeRooms(floor, depth, cfg, rnd) -> [{ ...rect, theme, height, vault,
//   centre, path(x, z), free: [{x, z}], walls: [...], doors: [...] }]

const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function themeRooms(floor, depth, cfg, rnd) {
  const tier = cfg.tiers[Math.min(depth, cfg.tiers.length) - 1];
  const weights = Object.entries(tier.themes);
  const total = weights.reduce((n, [, w]) => n + w, 0);
  const pick = (room) => {
    const fits = weights.filter(([name]) => fitsTheme(cfg.themes[name], room));
    const sum = fits.reduce((n, [, w]) => n + w, 0) || total;
    let r = rnd() * sum;
    for (const [name, w] of fits) if ((r -= w) <= 0) return name;
    return fits[0]?.[0] ?? 'crypt';
  };
  const open = (x, z) => floor.rows[z]?.[x] !== undefined && floor.rows[z][x] !== '#';
  const trail = new Set(floor.trail);
  let last = null;
  return floor.rooms.map((r) => {
    let theme;
    if (r === floor.rooms[0]) theme = 'antechamber';
    else if (r === floor.shrine.room) theme = 'sanctum';
    else if (r === floor.boss.room) theme = 'throne';
    else { do theme = pick(r); while (theme === last && weights.length > 1 && rnd() < 0.85); } // (no twice in a row)
    last = theme;
    const T = cfg.themes[theme], cx = r.x + (r.w >> 1), cz = r.z + (r.h >> 1);
    const inside = (x, z) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h;
    const path = (x, z) => x === cx || z === cz || trail.has(`${x},${z}`);
    const free = [], walls = [], doors = [];
    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!path(x, z)) free.push({ x, z });
        for (const [dx, dz] of SIDES) {
          if (inside(x + dx, z + dz)) continue;
          (open(x + dx, z + dz) ? doors : walls).push({ x, z, n: [-dx, -dz] });
        }
      }
    }
    return { ...r, theme, height: T.height, vault: !!T.vault, centre: { x: cx, z: cz }, path, free, walls, doors };
  });
}

// can the theme's furniture fit the room (min cells a side)?
const fitsTheme = (T, r) => Math.min(r.w, r.h) >= (T.minSide ?? 1);
