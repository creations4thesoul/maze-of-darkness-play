// Procedural pixel-art materials for the one art direction: a woodland swamp keep after John Bauer
// (concept/STYLE_GUIDE.md). The maze is split into five biomes of the same world, all in one muted palette and
// at one scale: stone courses are 8 pixels tall everywhere, blocks 6 to 10 pixels long, floor slabs 8 pixels.
// floor(X, Y) and sludge(X, Y) take world pixels; top(u, v, tx, ty) and front(u, v, tx) a pixel inside a wall tile.
import {T, H, hsh, clamp, scl, noise, hex, glowCol, mulberry32} from "./art.js";

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const tone = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

// the palette: Bauer's forest
const P = {
  moss: [.30, .38, .20], deepMoss: [.17, .23, .12], lichen: [.56, .58, .46], bark: [.30, .22, .14], peat: [.15, .12, .09],
  stone: [.36, .38, .33], warmStone: [.43, .39, .31], ochre: [.58, .46, .24], gold: [.62, .52, .28], dusk: [.26, .30, .36],
  bog: [.10, .15, .13], birch: [.74, .72, .64], cap: [.52, .25, .16], cream: [.78, .72, .58], root: [.24, .17, .10], reed: [.36, .40, .22],
};
// masonry courses shared by every biome: 8-pixel rows, blocks offset each row
function course(x, y, len, seed) {
  const row = y >> 3, ly = y & 7, off = (hsh(row, seed, 11) * len) | 0, bx = Math.floor((x + off) / len), lx = (x + off) % len;
  return {row, ly, lx, id: hsh(bx, row, seed)};
}
const seam = (k, c) => k.lx === 0 || k.ly === 0 ? scl(c, .35) : k.ly === 1 || k.lx === 1 ? scl(c, 1.1) : k.ly === 7 ? scl(c, .8) : c;

// ------------------------------------------------------------------ 0 MOSSWOOD HALLS: old flagstones gone green
const mosswood = {
  floor(X, Y) {
    const k = course(X, Y, 10, 3);
    let c = seam(k, tone(P.stone, .78 + .4 * k.id));
    if ((k.lx === 0 || k.ly === 0) && noise(X * .15, Y * .15) > .45) c = P.deepMoss;   // moss in the seams
    const m = noise(X * .07, Y * .07);
    if (m > .62) c = mix(c, P.moss, smooth(.62, .8, m) * .7);
    return c;
  },
  top(u, v, tx, ty) {
    const X = tx * T + u, Y = ty * T + v, k = course(X, Y, 10, 7);
    let c = seam(k, tone(P.stone, .72 + .4 * k.id));
    const m = noise(X * .11, Y * .11);
    if (m > .55) c = mix(c, P.moss, smooth(.55, .75, m) * .85);
    return c;
  },
  front(u, v, tx) {
    if (v === 0) return P.deepMoss;
    const k = course(u + tx * T, v + 3, 10, 9);
    let c = seam(k, tone(P.stone, (.7 + .35 * k.id) * (.6 + .4 * v / (H - 1))));
    if (hsh(u + tx * T, 2, 9) > .8 && v <= 1 + (hsh(u + tx * T, 3, 9) * 4 | 0)) c = P.moss;   // moss hanging over the lip
    return c;
  },
};

// ------------------------------------------------------------------ 1 ROOT CELLARS: earth walls shored with old timber
const rootcellar = {
  floor(X, Y) {
    const n = noise(X * .12, Y * .12), h = hsh(X, Y, 4);
    let c = tone(P.peat, 1.2 + .7 * n);
    if (h > .96) c = tone(P.warmStone, .8 + .3 * h);                               // pebbles
    if (Math.abs(noise(X * .05 + 9, Y * .05) - .5) < .02) c = P.root;               // a root across the floor
    return c;
  },
  top(u, v, tx, ty) {
    const X = tx * T + u, Y = ty * T + v;
    let c = tone(P.bark, .8 + .5 * noise(X * .15, Y * .15));
    if (Math.abs(noise(X * .2 + 3, Y * .2) - .5) < .06) c = P.root;                 // tangled roots
    if (hsh(X, Y, 8) > .97) c = P.lichen;
    return c;
  },
  front(u, v, tx) {
    if (v === 0) return P.root;
    const X = u + tx * T, plank = (X & 7) === 0;                                     // a timber every 8 pixels
    let c = plank ? tone(P.bark, .9) : tone(P.peat, (1.3 + .5 * hsh(X, v, 4)) * (.6 + .4 * v / (H - 1)));
    if (!plank && hsh(X, 5, 13) < .08 && v < 6) c = P.root;
    return c;
  },
};

// ------------------------------------------------------------------ 2 BONE BARROWS: dry-stone burial mounds
const barrows = {
  floor(X, Y) {
    const h = hsh(X >> 1, Y >> 1, 4), n = noise(X * .1, Y * .1);
    let c = tone(P.warmStone, .7 + .4 * n);                                          // gravel
    if (h > .82) c = scl(c, .78); else if (h < .08) c = tone(P.birch, .8);
    return c;
  },
  top(u, v, tx, ty) {
    const X = tx * T + u, Y = ty * T + v, k = course(X, Y, 6, 5);                   // small rounded dry stones
    let c = tone(P.warmStone, .7 + .45 * k.id);
    if (k.lx === 0 || k.ly === 0 || (k.lx === 5 && k.ly === 7)) c = scl(c, .35);
    if (hsh(X, Y, 3) > .985) c = P.lichen;
    return c;
  },
  front(u, v, tx) {
    if (v === 0) return scl(P.warmStone, .4);
    const k = course(u + tx * T, v + 3, 6, 6);
    let c = tone(P.warmStone, (.68 + .4 * k.id) * (.6 + .4 * v / (H - 1)));
    if (k.lx === 0 || k.ly === 0) c = scl(c, .35);
    return c;
  },
};

// ------------------------------------------------------------------ 3 MUSHROOM KEEP: keep stones taken by fungus
const mushkeep = {
  floor(X, Y) {
    const k = course(X, Y, 8, 2);                                                    // square keep tiles
    let c = seam(k, tone(k.id > .5 ? P.warmStone : P.stone, .75 + .3 * k.id));
    if (hsh(X >> 2, Y >> 2, 31) > .985) c = (X & 3) < 2 && (Y & 3) < 2 ? P.cap : P.cream;   // a tiny toadstool
    return c;
  },
  top(u, v, tx, ty) {
    const X = tx * T + u, Y = ty * T + v, k = course(X, Y, 8, 4);
    let c = seam(k, tone(P.stone, .7 + .35 * k.id));
    const f = hsh(tx, ty, 21);
    if (f > .55) {  // a shelf of caps growing over the stone
      const cx = 4 + (f * 9 | 0), cy = 3 + (f * 31 | 0) % 8, d = ((u - cx) / 3.2) ** 2 + ((v - cy) / 2) ** 2;
      if (d < 1) c = v < cy ? P.cap : scl(P.cap, .7);
      if (d < 1 && hsh(X, Y, 3) > .8) c = P.cream;
    }
    return c;
  },
  front(u, v, tx) {
    if (v === 0) return scl(P.stone, .4);
    const k = course(u + tx * T, v + 3, 8, 8);
    let c = seam(k, tone(P.stone, (.7 + .35 * k.id) * (.6 + .4 * v / (H - 1))));
    if (hsh(tx, 1, 41) > .5 && v >= 3 && v <= 4 && u >= 4 && u <= 11) c = v === 3 ? P.cap : P.cream;  // bracket fungus
    return c;
  },
};

// ------------------------------------------------------------------ 4 WILLOW BOG: peat banks, reeds and boardwalks
const willowbog = {
  floor(X, Y) {
    if (noise(X * .04 + 4, Y * .04) > .56) {                                         // a boardwalk of old planks
      const plank = (Y >> 2) & 1, gap = (Y & 3) === 0 || ((X + plank * 5) % 14) === 0;
      return gap ? scl(P.bark, .35) : tone(P.bark, .85 + .35 * hsh(X >> 3, Y >> 2, 6));
    }
    const n = noise(X * .1, Y * .1);
    let c = tone(P.peat, 1 + .6 * n);
    if (n > .6) c = mix(c, P.deepMoss, .6);
    return c;
  },
  top(u, v, tx, ty) {
    const X = tx * T + u, Y = ty * T + v;
    let c = tone(P.deepMoss, .8 + .5 * noise(X * .14, Y * .14));
    if ((u + (hsh(tx, ty, 3) * 5 | 0)) % 4 === 0 && hsh(X, ty, 5) > .3) c = P.reed;  // reeds
    if (Math.abs(noise(X * .18 + 2, Y * .18) - .5) < .05) c = P.root;
    return c;
  },
  front(u, v, tx) {
    if (v === 0) return P.reed;
    const X = u + tx * T;
    let c = tone(P.peat, (1.2 + .5 * hsh(X, v, 4)) * (.6 + .4 * v / (H - 1)));
    if (hsh(X, 1, 17) > .62 && v <= 2 + (hsh(X, 2, 17) * 5 | 0)) c = (X & 1) ? P.moss : P.reed;  // willow fronds hanging down
    return c;
  },
};

// still, dark bog water with flecks of duckweed: every biome's low ground
function bogWater(X, Y) {
  if (hsh(X >> 1, Y >> 1, 9) > .975) return P.reed;
  return tone(P.bog, .75 + .4 * noise(X * .2, Y * .2));
}

// ------------------------------------------------------------------ regions
// Every tile belongs to one biome. Sewers 1-5 are one biome each, in order; deeper maps (and head to head) split
// into 2-4 biomes with organic borders. Materials, wetness, decor and glow colours all follow the border.
const STYLES = [mosswood, rootcellar, barrows, mushkeep, willowbog];
export const REGION_NAMES = ["THE MOSSWOOD HALLS", "THE ROOT CELLARS", "THE BONE BARROWS", "THE MUSHROOM KEEP", "THE WILLOW BOG"];
const WETNESS = [.68, .72, 2, .66, .5];  // noise level above which floors are puddled (2 = bone dry)
let regionMap = new Uint8Array(1), regionW = 1, regionH = 1;

export function setLevel(n, versus, seed, MW, MH) {
  regionW = MW; regionH = MH; regionMap = new Uint8Array(MW * MH);
  if (!versus && n <= 5) { regionMap.fill((n - 1) % 5); return; }
  const r = mulberry32(seed * 13 + 5), order = [0, 1, 2, 3, 4];
  for (let i = 4; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const k = versus ? 3 : Math.min(2 + ((n - 6) >> 1), 4), seeds = [];
  for (let s = 0; s < k; s++) {  // spread region centres apart: best of a few random tries
    let best = null, bestD = -1;
    for (let t = 0; t < 12; t++) {
      const p = [1 + r() * (MW - 2), 1 + r() * (MH - 2)];
      const d = seeds.length ? Math.min(...seeds.map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))) : 0;
      if (d > bestD) { bestD = d; best = p; }
    }
    seeds.push([...best, order[s]]);
  }
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    const wx = tx + (noise(tx * .2 + seed % 97, ty * .2) - .5) * 7, wy = ty + (noise(tx * .2 + 30, ty * .2 + seed % 89) - .5) * 7;
    let bi = 0, bd = 1e9;
    seeds.forEach((q, i) => { const d = Math.hypot(wx - q[0], wy - q[1]); if (d < bd) { bd = d; bi = i; } });
    regionMap[ty * MW + tx] = seeds[bi][2];
  }
}
export const regionOf = (tx, ty) => regionMap[clamp(ty, 0, regionH - 1) * regionW + clamp(tx, 0, regionW - 1)];
const at = (X, Y) => STYLES[regionOf(X / T | 0, Y / T | 0)];
export const wetAt = (X, Y) => noise(X * .05 + 10, Y * .05) > WETNESS[regionOf(X / T | 0, Y / T | 0)];

export const TEX = {
  floor: (X, Y) => at(X, Y).floor(X, Y),
  sludge: (X, Y) => bogWater(X, Y),
  top: (u, v, tx, ty) => STYLES[regionOf(tx, ty)].top(u, v, tx, ty),
  front: (u, v, tx, ty) => STYLES[regionOf(tx, ty)].front(u, v, tx),
};

// glow colours, muted to sit in the same world: each biome tints its flowers, crystals, glow-bugs and fungus a little
const REGION_GLOW = [
  {flower: [.7, .6, .78], crystal: [.56, .72, .64], bug: [.88, .78, .42], fungus: [.6, .8, .7]},     // mosswood halls
  {flower: [.82, .68, .5], crystal: [.8, .62, .4], bug: [.9, .74, .4], fungus: [.72, .78, .5]},      // root cellars
  {flower: [.8, .74, .6], crystal: [.74, .7, .6], bug: [.86, .8, .58], fungus: [.78, .76, .62]},     // bone barrows
  {flower: [.8, .52, .5], crystal: [.6, .78, .6], bug: [.86, .8, .5], fungus: [.62, .86, .74]},      // mushroom keep
  {flower: [.6, .72, .66], crystal: [.52, .76, .74], bug: [.7, .9, .66], fungus: [.5, .84, .76]},    // willow bog
];
export const glowFor = (name, tx, ty) => REGION_GLOW[regionOf(tx, ty)][name] || glowCol(name);
// foxfire: the cold glowing fungus strung along the bog's walls
export const NEON_COLS = ["#8fd3b8", "#c9e08a", "#a9c9e0"].map(hex);

// wall-face details laid over any biome: a knot of roots, an iron grille, a skull in a niche, a string of foxfire
export function frontDeco(c, u, v, kd) {
  if (kd === "pipe") {
    if (Math.abs(u - 8 + Math.sin(v * 1.3) * 2) < 1.2) c = P.root;
  } else if (kd === "grate") {
    if (v >= 1 && v <= H - 2 && u >= 4 && u <= 11) c = u % 2 === 0 ? scl(P.dusk, .9) : [.02, .02, .02];
  } else if (kd === "skull") {
    if (v >= 1 && v <= H - 2 && u >= 5 && u <= 10) c = [.03, .03, .02];
    const rows = [".XXX.", "XXXXX", "X.X.X", ".XXX."], j = v - 2, i = u - 5;
    if (j >= 0 && j < 4 && i >= 0 && i < 5 && rows[j][i] === "X") c = tone(P.birch, .9);
  } else if (kd === "neon" && (v === H - 3 || v === H - 1) && u >= 1 && u <= 14) c = [.03, .04, .03];
  return c;
}
