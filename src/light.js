// Ray-traced lighting. Rays leave every light, stop at walls, slip through the slits in holed walls, and fade as
// they pass through creatures, heroes and chests, so everything solid throws a shadow that swings as it moves.
// Light that lands on stone bounces on round corners; render.js spreads that part (see bounce there).
import {T, ART, hex, norm, scl, glowCol, colOf} from "./art.js";
import {lookOf} from "./items.js";
import {RELICS, ABILITIES} from "./gates.js";
import {RARITY} from "./gear.js";

let tmpL = new Float32Array(400 * 400);
const SELF = 9;  // a light ignores whatever stands this close to it, so a lantern isn't shadowed by its own bearer
export const LIGHT_FX = {shadows: true, bounce: true};  // creature shadows and bounce light, each can be switched off

// how much light each pixel lets through per half-pixel step (1 = clear air); creatures and chests are stamped
// in every frame as soft discs around their feet, densest in the middle
export function stampOccluders(lv, things) {
  const {W, WH} = lv;
  if (!lv.occ) { lv.occ = new Float32Array(W * WH).fill(1); lv.occBoxes = []; }
  for (const [x0, y0, x1, y1] of lv.occBoxes) for (let y = y0; y < y1; y++) lv.occ.fill(1, y * W + x0, y * W + x1);
  lv.occBoxes = [];
  for (const t of things) {
    const r = t.r, x0 = Math.max(0, Math.floor(t.x - r)), x1 = Math.min(W, Math.ceil(t.x + r) + 1);
    const y0 = Math.max(0, Math.floor(t.y - r * .8)), y1 = Math.min(WH, Math.ceil(t.y + r * .5) + 1);
    if (x0 >= x1 || y0 >= y1) continue;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = (x + .5 - t.x) / r, dy = (y + .5 - t.y) / (y + .5 < t.y ? r * .8 : r * .5), d = dx * dx + dy * dy;
      if (d >= 1) continue;
      const k = y * W + x, a = 1 - t.k * (1 - d * .6);
      if (a < lv.occ[k]) lv.occ[k] = a;
    }
    lv.occBoxes.push([x0, y0, x1, y1]);
  }
}

// cast one light into a box buffer; returns the box, or null off the map. With occ, rays fade through creatures.
function trace(lv, lx, ly, rad, power, occ) {
  const {W, WH, solid} = lv;
  const r = Math.ceil(rad) + 1, bx0 = Math.max(0, Math.floor(lx) - r), by0 = Math.max(0, Math.floor(ly) - r);
  const bx1 = Math.min(W, Math.floor(lx) + r + 1), by1 = Math.min(WH, Math.floor(ly) + r + 1), bw = bx1 - bx0, bh = by1 - by0;
  if (bw <= 0 || bh <= 0) return null;
  if (tmpL.length < bw * bh) tmpL = new Float32Array(bw * bh);
  tmpL.fill(0, 0, bw * bh);
  const steps = Math.ceil(rad / .5), inten = new Float32Array(steps);
  for (let s = 0; s < steps; s++) inten[s] = Math.pow(1 - s * .5 / rad, power);
  const n = Math.max(64, Math.ceil(2 * Math.PI * rad * 2.2));
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n, ca = Math.cos(a), sa = Math.sin(a);
    // tr: how much light is left past the creatures this ray has crossed. A creature is lit all over by what
    // reaches it (tin, the light as the ray went in), and its shadow starts behind it.
    let tr = 1, tin = -1;
    for (let s = 0; s < steps; s++) {
      const d = s * .5, xi = Math.floor(lx + ca * d), yi = Math.floor(ly + sa * d);
      if (xi < bx0 || yi < by0 || xi >= bx1 || yi >= by1) break;
      const w = yi * W + xi, o = occ && d > SELF ? occ[w] : 1;
      if (o < 1) { if (tin < 0) tin = tr; tr *= o; } else { if (tin >= 0 && tr < .02) break; tin = -1; }
      const k = (yi - by0) * bw + xi - bx0, v = inten[s] * (tin >= 0 ? tin : tr);
      if (tmpL[k] < v) tmpL[k] = v;
      if (solid[w]) break;  // the first wall pixel is lit, nothing behind it
    }
  }
  return [bx0, by0, bx1, by1, bw, bh];
}

export function cast(lv, lx, ly, rad, power, col, target, occ = lv.occ) {
  const box = trace(lv, lx, ly, rad, power, LIGHT_FX.shadows ? occ : null);
  if (!box) return null;
  const [bx0, by0, , , bw, bh] = box, W = lv.W;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const v = tmpL[y * bw + x];
    if (!v) continue;
    const i = ((y + by0) * W + x + bx0) * 3;
    target[i] += v * col[0]; target[i + 1] += v * col[1]; target[i + 2] += v * col[2];
  }
  return box.slice(0, 4);
}

// a fixed light: baked into Ls past the walls and chests only, with its own copy kept so that when a creature
// walks into its reach it can be traced again with the creature in the way, and the difference (the shadow)
// added to the moving light for that frame
function fixed(lv, x, y, r, power, col) {
  const box = trace(lv, x, y, r, power, lv.occS);
  if (!box) return;
  const [bx0, by0, bx1, by1, bw, bh] = box, W = lv.W, Ls = lv.Ls, base = tmpL.slice(0, bw * bh);
  for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
    const v = base[yy * bw + xx];
    if (!v) continue;
    const i = ((yy + by0) * W + xx + bx0) * 3;
    Ls[i] += v * col[0]; Ls[i + 1] += v * col[1]; Ls[i + 2] += v * col[2];
  }
  lv.fixed.push({x, y, r, power, col, box: [bx0, by0, bx1, by1], bw, base});
}

// Everything that glows on its own. Rebuilt when a pickup is taken or the exit opens.
export function buildLights(lv, exitOpen) {
  const {Ls} = lv, gl = ART.propGlow;
  Ls.fill(.004); lv.fixed = [];
  // chests block light for good; creatures are stamped each frame
  lv.occS = new Float32Array(lv.W * lv.WH).fill(1);
  for (const vt of lv.vaults) if (!vt.looted) {
    const cx = vt.chest.tx * T + 8, cy = vt.chest.ty * T + 10;
    for (let y = cy - 5; y < cy + 3; y++) for (let x = cx - 6; x < cx + 6; x++) lv.occS[y * lv.W + x] = .72;
  }
  for (const p of lv.props) {
    const x = p.tx * T + 8, y = p.ty * T;
    if (p.kind === "fungus") fixed(lv, x, y + 6, 26, 2.2, scl(p.col, .55 * gl));
    else if (p.kind === "flower") fixed(lv, x, y + 6, 24, 2, scl(p.col, .6 * gl));
    else if (p.kind === "crystal") fixed(lv, x, y + 5, 30, 1.8, scl(p.col, .84 * gl));
    else if (p.kind === "shaft") fixed(lv, x, y + 5, 46, 1, scl(p.col, .9 * gl));
  }
  for (const b of lv.bugs) fixed(lv, b.x, b.y, 12, 2, scl(b.c, .45 * gl));
  for (const d of lv.decoLights) fixed(lv, d.x, d.y, d.r, 2, scl(colOf(d.c), d.f * gl));
  for (const k of lv.keys) if (!k.taken) fixed(lv, k.tx * T + 8, k.ty * T + 6, 20, 1.8, scl(glowCol("rune"), .8));
  for (const gi of lv.gearItems || []) if (!gi.taken) fixed(lv, gi.x, gi.y, 16, 2, scl(RARITY[gi.item.rarity].col, .45));
  for (const r of lv.relics) if (!r.taken) fixed(lv, r.tx * T + 8, r.ty * T + 6, 22, 1.8, scl(RELICS[r.kind].col, .7));
  for (const o of lv.rooms) if (o.lit) for (const t of o.torches)  // a lit chamber's torches fill it with warm light
    fixed(lv, t.tx * T + 8, (t.ty + 1) * T + 3, 92, 1.1, [.7, .64, .5]);  // warm but not orange, so greens and greys survive
  for (const vt of lv.vaults) if (vt.state === "cleared" && !vt.looted) fixed(lv, vt.chest.tx * T + 8, vt.chest.ty * T + 6, 34, 1.6, [1, .75, .3]);
  if (lv.shrine && !lv.shrine.taken) fixed(lv, lv.shrine.tx * T + 8, lv.shrine.ty * T + 5, 40, 1.4, scl(ABILITIES[lv.shrine.ability].col, 1));
  if (lv.n > 1 && !lv.versus) fixed(lv, lv.starts[0][0] * T + 8, lv.starts[0][1] * T + 6, 30, 1.6, [.42, .38, .3]);  // daylight down the ladder
  for (const it of lv.loot) if (!it.taken) fixed(lv, it.tx * T + 8, it.ty * T + 7, 16, 2, scl(lookOf(it).col, .5));
  for (const o of lv.oils) if (!o.taken) fixed(lv, o.tx * T + 8, o.ty * T + 7, 14, 2, scl(glowCol("oil"), .6));
  const [ex, ey] = lv.exit;
  if (exitOpen) fixed(lv, ex * T + 8, ey * T + 4, 60, 1.2, scl(glowCol("rune"), 1.1));
  else fixed(lv, ex * T + 8, ey * T + 4, 18, 2, [.35, .1, .12]);  // a faint red warning glow
}

// Each hero's lantern (its reach and brightness come from how much oil is left), plus any moving lights
// such as bolts, bullets and wisps.
export function lanterns(lv, heroes, time, extra = []) {
  const {Ld, W} = lv;
  for (const b of lv.ldBoxes) for (let y = b[1]; y < b[3]; y++) Ld.fill(0, (y * W + b[0]) * 3, (y * W + b[2]) * 3);
  lv.ldBoxes = [];
  heroes.forEach((h, i) => {
    const n = ART.flicker * (Math.sin(time * 13 + i) * .6 + Math.sin(time * 7.3 + 1 + i) * .4) + (h.oil < 15 ? (Math.random() - .5) * .25 : 0);
    const col = i === 0 ? norm(hex(ART.lanternColor)) : [.52, 1, .43];
    // the lantern hangs off the hero's side; pressed against a wall, pull it back so it never sits inside one
    let [lx, ly] = lanternAt(h);
    const cx = h.fx + 5;
    while (lv.solid[Math.floor(ly) * W + Math.floor(lx)] && Math.abs(lx - cx) > .5) lx += lx > cx ? -1 : 1;
    const b = cast(lv, lx, ly, h.lightR * (1 + .05 * n), 1.4, scl(col, h.lightP * (1 + .12 * n)), Ld);
    if (b) lv.ldBoxes.push(b);
  });
  shadeFixed(lv, heroes);
  for (const l of extra) {
    if (l.x < 0 || l.y < 0 || l.x >= W || l.y >= lv.WH || lv.solid[(l.y | 0) * W + (l.x | 0)]) continue;
    const b = cast(lv, l.x, l.y, l.r, 2, l.col, Ld);
    if (b) lv.ldBoxes.push(b);
  }
}

// creatures walking through a fixed light's reach throw shadows from it too: the nearest few such lights to the
// heroes are traced again with the creatures in the way, and the light they block is taken off for this frame
const SHADE_BUDGET = 60000;  // roughly how many pixels of fixed light may be re-traced in a frame
function shadeFixed(lv, heroes) {
  if (!LIGHT_FX.shadows || !lv.fixed || !lv.occBoxes?.length) return;
  const {W, Ld} = lv, near = [];
  for (const f of lv.fixed) {
    const [x0, y0, x1, y1] = f.box;
    if (!lv.occBoxes.some(b => b[0] < x1 && b[2] > x0 && b[1] < y1 && b[3] > y0)) continue;
    const d = Math.min(...heroes.map(h => Math.hypot(h.fx - f.x, h.fy - f.y)));
    if (d < 260) near.push([d, f]);
  }
  near.sort((a, b) => a[0] - b[0]);
  let spent = 0;
  for (const [, f] of near) {
    const area = f.bw * (f.box[3] - f.box[1]);
    if (spent + area > SHADE_BUDGET && spent) break;
    spent += area;
    const box = trace(lv, f.x, f.y, f.r, f.power, lv.occ);
    if (!box) continue;
    const [bx0, by0, , , bw, bh] = box;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const k = y * bw + x, lost = f.base[k] - tmpL[k];
      if (lost <= 0) continue;
      const i = ((y + by0) * W + x + bx0) * 3;
      Ld[i] -= lost * f.col[0]; Ld[i + 1] -= lost * f.col[1]; Ld[i + 2] -= lost * f.col[2];
    }
    lv.ldBoxes.push(f.box);
  }
}

// how much of a light's straight line to a point gets through: none past a wall, little through a creature
export function exposure(lv, x0, y0, x1, y1) {
  const {W, solid, occ} = lv, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / .5);
  let tr = 1;
  for (let s = 1; s < n; s++) {
    const w = Math.floor(y0 + (y1 - y0) * s / n) * W + Math.floor(x0 + (x1 - x0) * s / n);
    if (solid[w]) return 0;
    if (occ && s * .5 > SELF) tr *= occ[w];
  }
  return tr;
}
// where a hero's lantern hangs: off the side they face (or the other side while they glance back), swaying on
// its hook, raised when they lift it
export const facing = h => (h.fidget && h.fidget.kind === "look" && h.fidget.t > .15 && h.fidget.t < .9 ? -h.face : h.face);
export const lanternAt = h => {
  const s = Math.sin(h.swayT || 0), f = facing(h);
  return [(f > 0 ? h.fx + 8.5 : h.fx + .5) + s * .8 * f, h.fy - 4.5 - Math.abs(s) * .5 - 3 * (h.lift || 0)];
};

export function lightAt(lv, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= lv.W || yi >= lv.WH) return 0;
  const i = (yi * lv.W + xi) * 3;
  return (lv.Ls[i] + lv.Ld[i] + lv.Ls[i + 1] + lv.Ld[i + 1] + lv.Ls[i + 2] + lv.Ld[i + 2]) / 3;
}
