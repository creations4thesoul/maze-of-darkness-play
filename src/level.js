// Maze generation and the static, per-level data the renderer and lighting need.
import {T, H, ART, mulberry32, hsh, clamp, hex, scl, sample, noise} from "./art.js";
import {TEX, frontDeco, setLevel, regionOf, wetAt, glowFor, NEON_COLS} from "./textures.js";
import {GATES, RELIC_KINDS, ABILITY_FLOOR, gateTex} from "./gates.js";

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const FLOOR_TINT = hex(ART.floorTint);
const NEON_REGION = 4;

function sep(g, MW, MH, x, y) {  // a wall tile with floor on two opposite sides (a hole candidate)
  if (x <= 0 || y <= 0 || x >= MW - 1 || y >= MH - 1 || g[y * MW + x] !== 1) return null;
  if (!g[y * MW + x - 1] && !g[y * MW + x + 1] && g[(y - 1) * MW + x] && g[(y + 1) * MW + x]) return "h";
  if (!g[(y - 1) * MW + x] && !g[(y + 1) * MW + x] && g[y * MW + x - 1] && g[y * MW + x + 1]) return "v";
  return null;
}

function genMaze(MW, MH, seed) {
  const r = mulberry32(seed), g = new Uint8Array(MW * MH).fill(1);
  g[MW + 1] = 0;
  const st = [[1, 1]];
  while (st.length) {
    const [x, y] = st[st.length - 1], nb = [];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && ny > 0 && nx < MW - 1 && ny < MH - 1 && g[ny * MW + nx] === 1) nb.push([nx, ny, dx, dy]);
    }
    if (nb.length) {
      const [nx, ny, dx, dy] = nb[Math.floor(r() * nb.length)];
      g[(y + dy / 2) * MW + x + dx / 2] = 0; g[ny * MW + nx] = 0; st.push([nx, ny]);
    } else st.pop();
  }
  for (let i = 0, n = MW * MH / 20; i < n; i++) {  // braid some loops so it is not a pure tree
    const x = 1 + Math.floor(r() * (MW - 2)), y = 1 + Math.floor(r() * (MH - 2));
    if (sep(g, MW, MH, x, y)) g[y * MW + x] = 0;
  }
  // rooms: the narrow tunnels open into wide chambers with room to roll and shoot, some with pillars for cover
  const rooms = [], want = Math.round(MW * MH / 140) + 1;
  for (let tries = 0; tries < 200 && rooms.length < want; tries++) {
    const w = [5, 7, 7, 9][r() * 4 | 0], h = [5, 5, 7][r() * 3 | 0];
    const x0 = 1 + 2 * Math.floor(r() * ((MW - 1 - w) / 2)), y0 = 1 + 2 * Math.floor(r() * ((MH - 1 - h) / 2));
    if (x0 + w > MW - 1 || y0 + h > MH - 1) continue;
    if (rooms.some(o => x0 < o.x + o.w + 2 && o.x < x0 + w + 2 && y0 < o.y + o.h + 2 && o.y < y0 + h + 2)) continue;
    rooms.push({x: x0, y: y0, w, h});
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y * MW + x] = 0;
    // pillars to duck behind, never on the room's edge so every doorway stays open
    if (w >= 7 && h >= 5 && r() < .75) {
      const px = h >= 7 ? [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]] : [[2, 2], [w - 3, 2]];
      for (const [dx, dy] of px) g[(y0 + dy) * MW + x0 + dx] = 1;
    } else if (w >= 5 && h >= 5 && r() < .5) g[(y0 + (h >> 1)) * MW + x0 + (w >> 1)] = 1;
  }
  return widen(g, rooms, MW, MH);
}

// The maze is carved on a grid where odd columns are the paths and even columns the walls between them. Each path
// column is then stretched WIDEN tiles wide, so the passages that run up and down the screen (which read as thin
// slits between wall tops in this three-quarter view) open out to two tiles; rooms widen with them.
const WIDEN = 2;
function widen(g, rooms, MW, MH) {
  const start = [], span = [];
  let x2 = 0;
  for (let x = 0; x < MW; x++) { start.push(x2); span.push(x % 2 ? WIDEN : 1); x2 += span[x]; }
  const W2 = x2, g2 = new Uint8Array(W2 * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) g2.fill(g[y * MW + x], y * W2 + start[x], y * W2 + start[x] + span[x]);
  const rooms2 = rooms.map(o => ({x: start[o.x], y: o.y, w: start[o.x + o.w - 1] + span[o.x + o.w - 1] - start[o.x], h: o.h}));
  return {g: g2, rooms: rooms2, MW: W2};
}

export function bfs(g, MW, sx, sy) {
  const d = new Int16Array(g.length).fill(-1), q = [sy * MW + sx];
  d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (const j of [i - 1, i + 1, i - MW, i + MW]) if (!g[j] && d[j] < 0) { d[j] = d[i] + 1; q.push(j); }
  }
  return d;
}

// the run is ten sewers deep; these floors end in a boss arena around the grate instead of rune keys
export const FINAL_FLOOR = 10;
export const BOSS_FLOORS = {2: "hulk", 4: "brood", 7: "warden", 10: "king"};

export function makeLevel(n, versus, seed) {
  const odd = v => v | 1;
  const MW0 = versus ? 31 : odd(Math.min(21 + 4 * (n - 1), 49)), MH = versus ? 21 : odd(Math.min(15 + 2 * (n - 1), 33));
  const rng = mulberry32(seed * 7 + 1), {g, rooms, MW} = genMaze(MW0, MH, seed), floors = [];
  setLevel(n, versus, seed, MW, MH);  // decide which style each part of this map is drawn in
  const inRoom = new Uint8Array(MW * MH);
  for (const o of rooms) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) inRoom[y * MW + x] = 1;
  // gates (solo only): seal a few dead-end branches; a relic waits at the far end of each
  const gates = [], relics = [], gateLoot = [], gr = mulberry32(seed * 11 + 3);
  if (!versus) {
    const d0 = bfs(g, MW, 1, 1), used = new Uint8Array(MW * MH);
    const nbs = i => [i - 1, i + 1, i - MW, i + MW].filter(j => !g[j]);
    const ends = [];
    for (let i = 0; i < MW * MH; i++) if (!g[i] && !inRoom[i] && nbs(i).length === 1 && d0[i] > 6) ends.push(i);
    const want = Math.min(4, 2 + (n >> 2));
    for (const e of sample(gr, ends, ends.length)) {
      if (gates.length >= want) break;
      const path = [e];
      for (let prev = -1, cur = e; path.length < 7;) {  // walk back up the branch to where it meets the maze
        const nxt = nbs(cur).find(j => j !== prev);
        if (nxt === undefined || inRoom[nxt] || nbs(nxt).length !== 2) break;
        prev = cur; cur = nxt; path.push(cur);
      }
      const mouth = path[path.length - 1];
      if (path.length < 2 || path.some(i => used[i] || i === MW + 1) || d0[mouth] < 4) continue;
      for (const i of path) for (const j of [i, i - 1, i + 1, i - MW, i + MW]) used[j] = 1;
      g[mouth] = 2;
      const tx = mouth % MW, ty = mouth / MW | 0;
      gates.push({tx, ty, style: regionOf(tx, ty), open: false});
      relics.push({tx: e % MW, ty: e / MW | 0, kind: RELIC_KINDS[gr() * RELIC_KINDS.length | 0], taken: false});
      if (path.length >= 5) gateLoot.push(path[1]);
    }
  }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (!g[y * MW + x]) floors.push([x, y]);
  const K = (x, y) => y * MW + x, md = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const nearest = (tx, ty) => floors.reduce((b, p) => md(p, [tx, ty]) < md(b, [tx, ty]) ? p : b);

  const starts = versus ? [nearest(1, MH >> 1), nearest(MW - 2, MH >> 1)] : [[1, 1]];
  const d1 = bfs(g, MW, ...starts[0]), d2 = versus ? bfs(g, MW, ...starts[1]) : null;
  const dist = p => versus ? Math.min(d1[K(...p)], d2[K(...p)]) : d1[K(...p)];
  const fair = p => !versus || Math.abs(d1[K(...p)] - d2[K(...p)]) <= 4;  // equally far for both racers

  let exit;
  if (versus) {
    const even = floors.filter(p => Math.abs(d1[K(...p)] - d2[K(...p)]) <= 2);
    exit = (even.length ? even : floors).reduce((b, p) => dist(p) > dist(b) ? p : b);
  } else exit = floors.reduce((b, p) => d1[K(...p)] > d1[K(...b)] ? p : b);
  // a boss floor's grate sits at the back of the furthest big chamber: the boss's arena
  const bossType = versus ? null : BOSS_FLOORS[n] || null;
  let arena = null;
  if (bossType) {
    const reach = rooms.filter(o => d1[K(o.x, o.y)] > 6 || d1[K(o.x + 1, o.y + 1)] > 6), big = reach.filter(o => o.w >= 7 && o.h >= 5);
    arena = (big.length ? big : reach.length ? reach : rooms).reduce((b, o) => d1[K(o.x + (o.w >> 1), o.y)] > d1[K(b.x + (b.w >> 1), b.y)] ? o : b);
    let far = null;
    for (let y = arena.y; y < arena.y + arena.h; y++) for (let x = arena.x; x < arena.x + arena.w; x++)
      if (!g[K(x, y)] && d1[K(x, y)] >= 0 && (!far || d1[K(x, y)] > d1[K(...far)])) far = [x, y];
    if (far) exit = far;
  }
  const maxD = dist(exit);
  const taken = new Set([K(...exit), ...starts.map(p => K(...p))]);
  const take = (pool, count, spacing) => {
    const out = [];
    for (const p of sample(rng, pool, pool.length)) {
      if (out.length >= count) break;
      if (taken.has(K(...p)) || out.some(o => md(o, p) < spacing)) continue;
      out.push(p); taken.add(K(...p));
    }
    return out;
  };

  // keys: strict about fairness and spread first, relaxing until there are enough
  const wantKeys = versus ? 5 : bossType ? 0 : 3, keyList = [];  // a boss is the lock on its floor
  for (const [slack, spacing, far] of [[4, 5, .3], [8, 4, .2], [14, 3, .1], [99, 2, 0]]) {
    if (keyList.length >= wantKeys) break;
    const pool = floors.filter(p => (!versus || Math.abs(d1[K(...p)] - d2[K(...p)]) <= slack) && dist(p) > Math.max(4, maxD * far)
      && keyList.every(o => md(o, p) >= spacing));
    keyList.push(...take(pool, wantKeys - keyList.length, spacing));
  }
  const keys = keyList.map(([tx, ty]) => ({tx, ty, taken: false}));
  const oils = take(floors.filter(p => dist(p) > 6), versus ? 6 : 3 + n, 4).map(([tx, ty]) => ({tx, ty, taken: false}));
  // tonics and rune slates lying in the muck, still unidentified
  const loot = take(floors.filter(p => dist(p) > 5), versus ? 4 : 2 + (n >> 1), 4)
    .map(([tx, ty]) => ({tx, ty, kind: rng() < .55 ? "tonic" : "rune", idx: rng() * 6 | 0, taken: false}));
  for (const i of gateLoot) loot.push({tx: i % MW, ty: i / MW | 0, kind: gr() < .55 ? "tonic" : "rune", idx: gr() * 6 | 0, taken: false});
  // an ability shrine, out in a chamber on the floors that have one
  let shrine = null;
  if (!versus && ABILITY_FLOOR[n]) {
    const pool = floors.filter(p => dist(p) > maxD * .3), inside = pool.filter(p => inRoom[K(...p)]);
    const [p] = take(inside.length ? inside : pool, 1, 0);
    if (p) shrine = {tx: p[0], ty: p[1], ability: ABILITY_FLOOR[n], taken: false};
  }
  const rats = take(floors.filter(p => dist(p) > (versus ? 8 : 12)), versus ? 4 : Math.min(1 + n, 10), 6);
  // shooters: spitters from the start, wisps from the second sewer
  // enemies hold the chambers where there is space to dodge; any left over go in the tunnels
  const placeFoes = (far, count, spacing) => {
    const pool = floors.filter(p => dist(p) > far && !g[K(...p)]), out = take(pool.filter(p => inRoom[K(...p)]), count, spacing);
    return out.concat(take(pool, count - out.length, spacing));
  };
  const foes = placeFoes(10, versus ? 2 : Math.min(1 + n, 8), 4).map(([tx, ty]) => ({type: "spitter", tx, ty}));
  if (versus || n >= 2) for (const [tx, ty] of placeFoes(12, versus ? 2 : Math.min(n - 1, 6), 5)) foes.push({type: "wisp", tx, ty});
  // the newer creatures arrive a floor at a time: crawlers that hunt you, bloaters that burst, brutes that charge,
  // and lurkers that wait unseen in the dark
  for (const [type, from, count] of [["crawler", 1, Math.min(1 + (n >> 1), 6)], ["bloater", 2, Math.min(n - 1, 4)],
    ["brute", 3, Math.min((n - 1) >> 1, 3)], ["lurker", 4, Math.min(n - 3, 4)]])
    if (versus ? type === "crawler" : n >= from) for (const [tx, ty] of placeFoes(9, versus ? 2 : count, 4)) foes.push({type, tx, ty});

  // holes: a few always near each start so the mechanic shows up right away
  const holes = new Map();
  const seps = [];
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) { const s = sep(g, MW, MH, x, y); if (s) seps.push([x, y, s]); }
  for (const s of starts) for (const [x, y, o] of sample(rng, seps.filter(p => md(p, s) <= 4), 2)) holes.set(K(x, y), o);
  for (const [x, y, o] of seps) if (rng() < ART.holeChance * 1.5) holes.set(K(x, y), o);

  // decorative props, scaled to the map size; a few placed near the start so the first screen glows
  const scale = MW * MH / 825, props = [];
  for (const s of starts) {
    const near = floors.filter(p => Math.abs(p[0] - s[0]) <= 6 && Math.abs(p[1] - s[1]) <= 4 && md(p, s) >= 2);
    for (const [kind, c] of [["shaft", 1], ["flower", 2], ["crystal", 2], ["bugs", 1]])
      for (const p of take(near, c, 0)) props.push({kind, tx: p[0], ty: p[1]});
  }
  for (const [kind, c] of [["shaft", ART.shafts], ["flower", ART.flowers], ["crystal", ART.crystals], ["bugs", ART.bugs], ["fungus", ART.fungus + 1]])
    for (const p of take(floors, Math.round(c * scale), 0)) props.push({kind, tx: p[0], ty: p[1]});

  const deco = new Map(), th = [.07, .15, .24, .36, .45, .52].map(v => v * ART.decoDensity);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (g[K(x, y)] !== 1 || holes.has(K(x, y))) continue;
    const r = rng(), front = y + 1 < MH && !g[K(x, y + 1)];
    let kd = r < th[0] ? "wallcrystal" : r < th[1] ? "vein" : !front ? null : r < th[2] ? "rune" : r < th[3] ? "pipe" : r < th[4] ? "grate" : r < th[5] ? "skull" : null;
    // neon tubes along wall faces, only in the neon region
    if (!kd && front && regionOf(x, y) === NEON_REGION && r < th[5] + .3) kd = "neon";  // foxfire strung along the bog walls
    if (kd) deco.set(K(x, y), kd);
  }

  // sludge channels from smoothed noise
  let nz = Float32Array.from({length: MW * MH}, () => rng());
  for (let it = 0; it < 3; it++) {
    const m = new Float32Array(MW * MH), at = (x, y) => nz[((y + MH) % MH) * MW + (x + MW) % MW];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) m[K(x, y)] = (at(x, y) + at(x, y - 1) + at(x, y + 1) + at(x - 1, y) + at(x + 1, y)) / 5;
    nz = m;
  }
  const cut = Array.from(nz).sort((a, b) => a - b)[Math.floor(MW * MH * .72)];
  const sludge = new Uint8Array(MW * MH);
  for (let i = 0; i < MW * MH; i++) sludge[i] = nz[i] > cut && !g[i] ? 1 : 0;
  for (const s of starts) sludge[K(...s)] = 0;

  // unlit torches on each chamber's back wall, lit once the room is cleared
  for (const o of rooms) {
    o.lit = false; o.torches = [];
    for (let x = o.x + 1; x < o.x + o.w - 1 && o.torches.length < 3; x += 3) if (g[K(x, o.y - 1)] === 1) o.torches.push({tx: x, ty: o.y - 1});
  }
  // loot rooms (solo and co-op): a chamber with a chest and sleeping guards; step in and its doors seal shut
  // until every guard is dead
  const vaults = [];
  if (!versus) {
    const vr = mulberry32(seed * 17 + 9), inRect = (o, x, y) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;
    const sealsOf = o => {  // the doorways: open tiles just outside a room that lead into it
      const seals = [];
      for (let y = o.y - 1; y <= o.y + o.h; y++) for (let x = o.x - 1; x <= o.x + o.w; x++) {
        if (inRect(o, x, y) || g[K(x, y)]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inRect(o, x + dx, y + dy) && !g[K(x + dx, y + dy)])) seals.push({tx: x, ty: y, style: 5, open: true});
      }
      return seals;
    };
    if (arena) {  // the boss waits in the middle of its arena; whatever else stands there fights beside it
      const o = arena, vi = vaults.length, tiles = [];
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (!g[K(x, y)]) tiles.push([x, y]);
      const mid = [o.x + (o.w >> 1), o.y + (o.h >> 1)];
      tiles.sort((a, b) => md(a, mid) - md(b, mid));
      for (const f of foes) if (inRect(o, f.tx, f.ty)) f.vault = vi;
      foes.push({type: bossType, tx: tiles[0][0], ty: tiles[0][1], vault: vi});
      const chest = tiles.find(p => md(p, tiles[0]) >= 2 && md(p, exit) >= 2) || tiles[tiles.length - 1];
      vaults.push({x: o.x, y: o.y, w: o.w, h: o.h, chest: {tx: chest[0], ty: chest[1]}, seals: sealsOf(o), state: "idle", looted: false, boss: bossType});
    }
    const pool = sample(vr, rooms.filter(o => o !== arena && !inRect(o, 1, 1) && !inRect({x: o.x - 1, y: o.y - 1, w: o.w + 2, h: o.h + 2}, ...exit)
      && dist([o.x, o.y]) > 6 && !(shrine && inRect(o, shrine.tx, shrine.ty))), rooms.length);
    for (const o of pool.slice(0, n >= 5 ? 2 : 1)) {
      const tiles = [];
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (!g[K(x, y)]) tiles.push([x, y]);
      const cx = o.x + (o.w >> 1), cy = o.y + (o.h >> 1);
      tiles.sort((a, b) => md(a, [cx, cy]) - md(b, [cx, cy]));
      const chest = tiles[0];
      // guards: whatever already stood here, plus enough to make it a fight
      const vi = vaults.length;
      for (const f of foes) if (inRect(o, f.tx, f.ty)) f.vault = vi;
      const want = Math.min(5, 2 + (n >> 1)) - foes.filter(f => f.vault === vi).length;
      for (const [tx, ty] of sample(vr, tiles.slice(3).filter(p => md(p, chest) >= 2), Math.max(0, want)))
        foes.push({type: n >= 2 && vr() < .4 ? "wisp" : "spitter", tx, ty, vault: vi});
      vaults.push({x: o.x, y: o.y, w: o.w, h: o.h, chest: {tx: chest[0], ty: chest[1]}, seals: sealsOf(o), state: "idle", looted: false});
    }
  }

  const lv = {n, versus, seed, MW, MH, W: MW * T, WH: MH * T, SH: MH * T + H, g, holes, props, deco, sludge,
    // racing for a shared pool: with k keys someone can always reach floor((k+1)/2), so a race never deadlocks
    starts, exit, keys, oils, loot, rats, foes, rooms, inRoom, gates, relics, shrine, vaults, boss: bossType, need: versus ? Math.max(1, Math.floor((keys.length + 1) / 2)) : Math.min(3, keys.length)};
  buildStatic(lv);
  return lv;
}

function buildStatic(lv) {
  const {MW, MH, W, WH, SH, g, holes, props, sludge, deco, exit} = lv;
  const solid = lv.solid = new Uint8Array(W * WH);
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) if (g[ty * MW + tx])
    for (let v = 0; v < T; v++) solid.fill(1, (ty * T + v) * W + tx * T, (ty * T + v) * W + tx * T + T);
  const m = T >> 1;
  for (const [key, o] of holes) {  // a 3px slit through the wall that light (not players) passes
    const x = key % MW, y = key / MW | 0;
    if (o === "h") for (let v = m - 1; v <= m + 1; v++) solid.fill(0, (y * T + v) * W + x * T, (y * T + v) * W + x * T + T);
    else for (let v = 0; v < T; v++) for (let u = m - 1; u <= m + 1; u++) solid[(y * T + v) * W + x * T + u] = 0;
  }

  // floor albedo: stone slabs, toxic sludge, puddles and the exit grate, darkened where walls meet the floor
  lv.alb = new Float32Array(W * WH * 3);
  lv.wet = new Uint8Array(W * WH);
  for (let Y = 0; Y < WH; Y++) for (let X = 0; X < W; X++) floorPx(lv, X, Y);
  lv.sludgePx = new Uint8Array(W * WH);
  for (let i = 0; i < W * WH; i++) lv.sludgePx[i] = sludge[((i / W | 0) / T | 0) * MW + ((i % W) / T | 0)];
  lv.motes = new Uint8Array(W * WH);
  const mr = mulberry32(lv.seed + 99);
  for (let i = 0; i < W * WH; i++) lv.motes[i] = mr() < .004 ? 1 : 0;
  lv.sporeSrc = props.filter(p => p.kind === "fungus" || p.kind === "flower" || p.kind === "crystal");
  lv.frontTiles = [];
  for (let ty = 0; ty < MH - 1; ty++) for (let tx = 0; tx < MW; tx++) if (g[ty * MW + tx] && !g[(ty + 1) * MW + tx]) lv.frontTiles.push([tx, ty]);

  lv.bugs = [];
  for (const p of props) if (p.kind === "bugs") {
    const r = mulberry32(p.tx * 131 + p.ty), n = 5 + Math.floor(r() * 4), c = glowFor("bug", p.tx, p.ty);
    for (let i = 0; i < n; i++) {
      const bx = p.tx * T + 8 + Math.floor(r() * 21) - 10, by = p.ty * T + 5 + Math.floor(r() * 13) - 6;
      if (bx >= 0 && by >= 0 && bx < W && by < WH && !solid[by * W + bx]) lv.bugs.push({x: bx, y: by, ph: r() * 6.28, c});
    }
  }
  for (const p of props) p.col = glowFor(p.kind === "bugs" ? "bug" : p.kind, p.tx, p.ty);  // each prop glows in its region's colour

  // surface-light beams, as (screen index, strength, counts-as-haze) triples
  lv.beams = [];
  for (const p of props) if (p.kind === "shaft") {
    const cx = p.tx * T + 8, cy = p.ty * T + 5 + H, len = 84, w0 = 7, w1 = 17;
    let dx = -.35, dy = -1; const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    const y0 = Math.max(Math.floor(cy - len) - 5, 0), y1 = Math.min(Math.floor(cy + w0) + 2, SH);
    const x0 = Math.max(Math.floor(cx - len * .4 - w1) - 2, 0), x1 = Math.min(Math.floor(cx + w1) + 2, W);
    for (let Y = y0; Y < y1; Y++) for (let X = x0; X < x1; X++) {
      const rx = X - cx, ry = Y - cy, t = rx * dx + ry * dy, perp = -rx * dy + ry * dx;
      const wid = w0 + (w1 - w0) * clamp(t / len, 0, 1);
      const a = clamp(1 - Math.abs(perp) / wid, 0, 1) * clamp(1 - t / len, 0, 1) * (t > -2 ? 1 : 0);
      if (a > 0) lv.beams.push(Y * W + X, Math.pow(a, 1.1) * (.55 + .45 * Math.sin(perp * 1.4 + .3)), a > .12 ? 1 : 0);
    }
  }

  // glowing wall decorations
  lv.decoEm = []; lv.decoLights = [];
  for (const [key, kind] of deco) {
    if (kind !== "rune" && kind !== "wallcrystal" && kind !== "vein" && kind !== "neon") continue;
    const tx = key % MW, ty = key / MW | 0, r = mulberry32(tx * 977 + ty * 31);
    const rune = glowFor("rune", tx, ty), crystal = glowFor("crystal", tx, ty), vein = glowFor("vein", tx, ty);
    if (kind === "neon") {  // a glowing tube along the foot of the wall face
      const c = NEON_COLS[(tx + ty) % NEON_COLS.length];
      for (let u = 1; u <= 14; u++) lv.decoEm.push({x: tx * T + u, y: (ty + 1) * T + H - 2, c, f: 1});
      lv.decoLights.push({x: tx * T + 8, y: (ty + 1) * T + 2, r: 30, c, f: .75});
      continue;
    }
    if (kind === "rune") {
      for (let j = 0; j < H - 3; j++) for (let i = 0; i < 5; i++) if (r() < .55) lv.decoEm.push({x: tx * T + 5 + i, y: (ty + 1) * T + 1 + j, c: rune, f: 1});
      lv.decoLights.push({x: tx * T + 8, y: (ty + 1) * T + 1, r: 18, c: rune, f: .55});
      continue;
    }
    let px = tx * T + 3 + Math.floor(r() * 10), py = ty * T + 3 + Math.floor(r() * 10);
    for (let i = 0; i < (kind === "wallcrystal" ? 5 : 11); i++) {
      lv.decoEm.push({x: px, y: py, c: kind === "wallcrystal" ? crystal : vein, f: kind === "wallcrystal" ? 1 : .7});
      px = clamp(px + Math.floor(r() * 3) - 1, tx * T + 1, tx * T + T - 2);
      py = clamp(py + (kind === "wallcrystal" ? -Math.floor(r() * 2) : Math.floor(r() * 3) - 1), ty * T + 1, ty * T + T - 2);
    }
    if (kind === "wallcrystal") for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = tx + dx, ny = ty + dy;
      if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && !g[ny * MW + nx]) { lv.decoLights.push({x: nx * T + 8 - dx * 6, y: ny * T + 8 - dy * 6, r: 22, c: crystal, f: .6}); break; }
    }
  }
  // wall colours, computed once: top faces in world layout, front faces per tile row
  const wt = hex(ART.wallTint);
  lv.topAlb = new Float32Array(W * WH * 3);
  lv.frontAlb = new Float32Array(W * MH * H * 3);
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    if (!g[ty * MW + tx]) continue;
    for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
      const c = chips(TEX.top(u, v, tx, ty), tx * T + u, ty * T + v), i = ((ty * T + v) * W + tx * T + u) * 3;
      lv.topAlb[i] = c[0] * wt[0]; lv.topAlb[i + 1] = c[1] * wt[1]; lv.topAlb[i + 2] = c[2] * wt[2];
    }
    if (ty + 1 < MH && !g[(ty + 1) * MW + tx]) paintFront(lv, tx, ty);
  }
  for (const gt of lv.gates) if (!gt.open) paintGate(lv, gt);
  lv.Ls = new Float32Array(W * WH * 3);
  lv.Ld = new Float32Array(W * WH * 3);
  lv.ldBoxes = [];
}

// surface detail laid over every region's own textures, one pixel at a time
// floors: hairline cracks, loose pebbles and dark pits
function grime(c, X, Y) {
  if (Math.abs(noise(X * .11 + 7, Y * .11 + 3) - .5) < .018) return scl(c, .6);
  const r = hsh(X, Y, 11);
  return r > .985 ? c.map(v => Math.min(1, v * 1.4 + .04)) : r < .012 ? scl(c, .65) : c;
}
// the forest floor laid over every region's stone (concept/STYLE_GUIDE.md): moss, lichen, roots and leaves
const MOSS = [[.24, .33, .15], [.33, .43, .19]], LICHEN = [.6, .64, .5], ROOT = [.3, .2, .11];
const LEAVES = [[.62, .46, .18], [.55, .27, .12], [.42, .3, .16]];
const mix = (c, t, f) => c.map((v, k) => v * (1 - f) + t[k] * f);
// wall tops: chipped stone and fine cracks, under patches of moss and flecks of pale lichen
function chips(c, X, Y) {
  const m = noise(X * .08 + 3, Y * .08 + 5);
  if (m > .6) c = mix(c, MOSS[hsh(X, Y, 2) > .5 ? 1 : 0], Math.min(.75, (m - .6) * 5));
  if (hsh(X, Y, 17) > .987) return mix(c, LICHEN, .7);
  if (Math.abs(noise(X * .14 + 21, Y * .14 + 9) - .5) < .014) return scl(c, .68);
  return hsh(X, Y, 5) > .975 ? scl(c, .62) : c;
}
// wall faces: a fringe of moss along the top edge, roots pushing down through the stone, and water stains
function stains(c, X, ty, v) {
  if (v === 0 && noise(X * .2, ty * 3.1) > .45) return mix(c, MOSS[1], .6);
  const root = hsh(X, ty, 13);
  if (root < .06 && v < 3 + root * 80) return mix(c, ROOT, .75);
  const r = hsh(X, ty, 9);
  return r < .16 && v < 2 + r * 40 ? scl(c, .72) : c;
}

function floorPx(lv, X, Y) {
  const {MW, MH, W, g, sludge, exit, alb} = lv, ft = FLOOR_TINT;
  const ex = exit[0] * T + 8, ey = exit[1] * T + 5, wall = (tx, ty) => tx < 0 || ty < 0 || tx >= MW || ty >= MH || g[ty * MW + tx] === 1;
  const tx = X / T | 0, ty = Y / T | 0, u = X & 15, v = Y & 15, i = (Y * W + X) * 3;
  let c;
  if (sludge[ty * MW + tx]) c = TEX.sludge(X, Y);
  else {
    c = TEX.floor(X, Y);
    if (wetAt(X, Y)) { c = scl(c, .7); lv.wet[Y * W + X] = 1; }
  }
  c = grime(c, X, Y);
  const d = Math.hypot(X - ex, Y - ey);
  if (Math.abs(d - 6) < .8 || (d < 6 && X % 3 === 0)) c = [.7, .6, .9]; else if (d < 6) c = [.02, .02, .02];
  // contact shadow: how close this pixel is to a wall tile
  let dw = 9;
  if (wall(tx - 1, ty)) dw = Math.min(dw, u); if (wall(tx + 1, ty)) dw = Math.min(dw, 15 - u);
  if (wall(tx, ty - 1)) dw = Math.min(dw, v * .6); if (wall(tx, ty + 1)) dw = Math.min(dw, 15 - v);
  if (wall(tx - 1, ty - 1)) dw = Math.min(dw, Math.hypot(u, v)); if (wall(tx + 1, ty - 1)) dw = Math.min(dw, Math.hypot(15 - u, v));
  if (wall(tx - 1, ty + 1)) dw = Math.min(dw, Math.hypot(u, 15 - v)); if (wall(tx + 1, ty + 1)) dw = Math.min(dw, Math.hypot(15 - u, 15 - v));
  // moss creeps out from the foot of the walls, and dead leaves lie scattered in pairs of pixels
  if (dw < 4 && !sludge[ty * MW + tx]) { const m = noise(X * .09 + 11, Y * .09 + 2); if (m > .5) c = mix(c, MOSS[0], Math.min(.6, (m - .5) * 3) * (1 - dw / 4)); }
  if (hsh(X >> 1, Y, 21) > .994) c = mix(c, LEAVES[(hsh(X >> 1, Y, 22) * 3) | 0], .8);
  const ao = .42 + .58 * smooth(0, 6, dw);
  alb[i] = c[0] * ft[0] * ao; alb[i + 1] = c[1] * ft[1] * ao; alb[i + 2] = c[2] * ft[2] * ao;
}

function paintFront(lv, tx, ty) {
  const wt = hex(ART.wallTint), {W, MW, deco} = lv;
  for (let v = 0; v < H; v++) for (let u = 0; u < T; u++) {
    const c = stains(frontDeco(TEX.front(u, v, tx, ty), u, v, deco.get(ty * MW + tx)), tx * T + u, ty, v), i = ((ty * H + v) * W + tx * T + u) * 3;
    lv.frontAlb[i] = c[0] * wt[0]; lv.frontAlb[i + 1] = c[1] * wt[1]; lv.frontAlb[i + 2] = c[2] * wt[2];
  }
}

// a sealed gate: its own texture on top and front, glowing bits, and a faint light on the open side as a hint
function paintGate(lv, gt) {
  const {W, MW, MH, g} = lv, {tx, ty, style} = gt, key = ty * MW + tx, col = GATES[style].col;
  for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
    const c = gateTex(style, u, v, tx, ty), i = ((ty * T + v) * W + tx * T + u) * 3;
    lv.topAlb[i] = c[0]; lv.topAlb[i + 1] = c[1]; lv.topAlb[i + 2] = c[2];
    if (c[3]) lv.decoEm.push({x: tx * T + u, y: ty * T + v, c: c.slice(0, 3), f: .8, gate: key});
  }
  if (ty + 1 < MH && !g[(ty + 1) * MW + tx]) for (let v = 0; v < H; v++) for (let u = 0; u < T; u++) {
    const c = gateTex(style, u, v + 8, tx, ty), i = ((ty * H + v) * W + tx * T + u) * 3;
    lv.frontAlb[i] = c[0] * .8; lv.frontAlb[i + 1] = c[1] * .8; lv.frontAlb[i + 2] = c[2] * .8;
    if (c[3]) lv.decoEm.push({x: tx * T + u, y: (ty + 1) * T + v, c: c.slice(0, 3), f: .8, gate: key});
  }
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = tx + dx, ny = ty + dy;
    if (!g[ny * MW + nx]) lv.decoLights.push({x: nx * T + 8 - dx * 6, y: ny * T + 8 - dy * 6, r: 26, c: col, f: .55, gate: key});
  }
}

// seal a doorway in place (the reverse of opening a gate)
export function sealTile(lv, b) {
  const {MW, MH, W, g, solid} = lv, {tx, ty} = b;
  b.open = false; g[ty * MW + tx] = 2;
  for (let v = 0; v < T; v++) solid.fill(1, (ty * T + v) * W + tx * T, (ty * T + v) * W + tx * T + T);
  paintGate(lv, b);
  lv.frontTiles = [];
  for (let y = 0; y < MH - 1; y++) for (let x = 0; x < MW; x++) if (g[y * MW + x] && !g[(y + 1) * MW + x]) lv.frontTiles.push([x, y]);
}

// open a gate in place: clear the tile and repaint just the pixels around it, no full rebuild
export function openGate(lv, gt) {
  const {MW, MH, W, WH, g, solid} = lv, {tx, ty} = gt, key = ty * MW + tx;
  gt.open = true; g[key] = 0;
  for (let v = 0; v < T; v++) solid.fill(0, (ty * T + v) * W + tx * T, (ty * T + v) * W + tx * T + T);
  for (let Y = Math.max(0, (ty - 1) * T); Y < Math.min(WH, (ty + 2) * T); Y++)
    for (let X = Math.max(0, (tx - 1) * T); X < Math.min(W, (tx + 2) * T); X++) if (!g[(Y / T | 0) * MW + (X / T | 0)]) floorPx(lv, X, Y);
  if (ty > 0 && g[(ty - 1) * MW + tx]) paintFront(lv, tx, ty - 1);  // the wall above now shows its face
  lv.frontTiles = [];
  for (let y = 0; y < MH - 1; y++) for (let x = 0; x < MW; x++) if (g[y * MW + x] && !g[(y + 1) * MW + x]) lv.frontTiles.push([x, y]);
  lv.decoEm = lv.decoEm.filter(d => d.gate !== key);
  lv.decoLights = lv.decoLights.filter(d => d.gate !== key);
}
