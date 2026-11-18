// The renderer. The CPU lights and composes the scene as pixel art, and gathers a coarse grid of the light on
// screen; gl.js draws the pixels and lays the fog, the god rays and the post effects over them.
import {T, H, OUT_W, OUT_H, MAT, BAND, PAL, BAYER, FONT, SPR, EMISSIVE, BASECOL, FOE_PAL, NG, ART,
  PIXEL, CODE_FRINGE, CODE_RAIN, CODE_EMIS, CODE_BEAM, hsh, clamp, hex, scl, mixW, noise, glowCol, colOf, mulberry32} from "./art.js";
import {LIGHT_FX, lanternAt, facing} from "./light.js";
import {uploadLight, uploadBloom, uploadScene, drawGL} from "./gl.js";
import {lookOf} from "./items.js";
import {RELICS, ABILITIES} from "./gates.js";
import {heroFrames, FALLEN, shadeHero, WALK_BOB, HERO_OX} from "./heroes.js";
import {shadeSprite} from "./shade.js";
import {FOE} from "./combat.js";
import {GEAR_ICONS, RARITY} from "./gear.js";
// gear icons as floor sprites: a dark edge, the material, and a gem that glows in the piece's rarity colour
const GEAR_SPR = Object.fromEntries(Object.entries(GEAR_ICONS).map(([k, rows]) => [k, rows.map(r => r.replace(/X/g, "k").replace(/o/g, "w"))]));

let lv = null, S, M, Lf, frameEm = [], spores = [], drips = [], dripAcc = 0;
const MIST = glowCol("mist");
const TLh = new Float32Array((T + 4) * T * 3), TL = new Float32Array(T * T * 3);  // one wall block's top-face light
const FALL = Float32Array.from({length: 4096}, (_, i) => Math.pow(i / 1024, ART.falloff) * 1.3);  // light falloff lookup
export const prof = {};  // smoothed milliseconds per render stage (shown with the ` key)

export function attach(level) {
  lv = level;
  S = new Float32Array(lv.W * lv.SH * 3); M = new Uint8Array(lv.W * lv.SH);
  Lf = new Float32Array(lv.W * lv.WH * 3);
  spores = []; drips = []; dripAcc = 0;
}

// ------------------------------------------------------------------ ambient particles
export function updateFx(hero, dt) {
  if (!hero || !lv) return;
  const htx = hero.fx / T, hty = hero.fy / T, R = Math.random;
  const near = lv.sporeSrc.filter(p => Math.abs(p.tx - htx) < 14 && Math.abs(p.ty - hty) < 9);
  for (let i = 0; i < ART.spores && near.length; i++) {
    let s = spores[i];
    if (!s || s.life <= 0) {
      const p = near[Math.floor(R() * near.length)], life = 2 + R() * 3;
      s = spores[i] = {x: p.tx * T + 8 + (R() - .5) * 10, y: p.ty * T + 6 + H, vy: 5 + R() * 8, life, max: life, ph: R() * 6.28, t: 0, c: p.col};
    }
    s.t += dt; s.life -= dt; s.y -= s.vy * dt; s.x += Math.sin(s.t * 2 + s.ph) * 6 * dt;
  }
  const ft = lv.frontTiles.filter(t => Math.abs(t[0] - htx) < 10 && Math.abs(t[1] - hty) < 7);
  dripAcc += ART.drips * dt;
  while (dripAcc >= 1 && ft.length) {
    dripAcc--;
    const t = ft[Math.floor(R() * ft.length)], y = (t[1] + 1) * T + H - 1;
    drips.push({x: t[0] * T + 2 + Math.floor(R() * 12), y, floor: y + 6 + R() * 10, v: 0, splash: 0});
  }
  if (!ft.length) dripAcc = 0;
  for (const d of drips) { if (d.y < d.floor) { d.v += 120 * dt; d.y = Math.min(d.y + d.v * dt, d.floor); } else d.splash += dt; }
  drips = drips.filter(d => d.splash < .25);
}

// ------------------------------------------------------------------ scene
function drawSprite(spr, x0, y0, cols, light, mat, flip) {
  const {W, SH} = lv;
  for (let j = 0; j < spr.length; j++) {
    const row = spr[j], n = row.length;
    for (let i = 0; i < n; i++) {
      const ch = row[flip ? n - 1 - i : i], x = x0 + i, y = y0 + j;
      if (ch === "." || x < 0 || y < 0 || x >= W || y >= SH) continue;
      const si = y * W + x, c = cols[ch], em = EMISSIVE.has(ch);
      const r = em ? c[0] : c[0] * light[0], g = em ? c[1] : c[1] * light[1], b = em ? c[2] : c[2] * light[2];
      M[si] = mat; S[si * 3] = r; S[si * 3 + 1] = g; S[si * 3 + 2] = b;
      if (em && mat === MAT.SPRITE) frameEm.push(x, y, c);
    }
  }
}

// a hero: pre-shaded pixels lit by the light where they stand, with fading afterimages after a roll
// how a creature's attack shows: rearing back and trembling with a red glow as it winds up, thrown forward as it
// strikes, sagging as it recovers
function poseOf(f, time) {
  const a = f.ang || 0, s = f.state;
  if (s === "wind" || s === "cwind") return {dx: -Math.cos(a) * 2 + (Math.random() - .5) * 1.5, dy: -Math.sin(a) * 2, tint: .12 + .2 * Math.abs(Math.sin(time * 16))};
  if (s === "strike" || s === "charge") return {dx: Math.cos(a) * 2, dy: Math.sin(a) * 2, tint: 0};
  if (s === "recover" || s === "stun") return {dx: 0, dy: 1, tint: 0};
  return idlePose(f, time);
}
// between attacks every creature keeps moving in its own way: crawlers twitch and skitter, trolls heave slow
// breaths, bloaters swell and sag, lurkers drift up and down, rats sniff about; sleeping guards breathe slowly
function idlePose(f, time) {
  const ph = f.seed ?? (f.seed = Math.random() * 6.28), sl = f.asleep ? .45 : 1, t = time * sl + ph;
  switch (f.type) {
    case "crawler": return {dx: Math.sin(t * 9.1) > .93 ? Math.sign(Math.sin(t * 3.7)) : 0, dy: Math.sin(t * 5.3) > .7 ? -1 : 0, tint: 0};
    case "brute": case "hulk": case "king": return {dx: 0, dy: Math.sin(t * 1.4) > .35 ? -1 : 0, tint: 0};
    case "bloater": return {dx: 0, dy: Math.round(Math.sin(t * 2.6) * 1.1), tint: Math.max(0, Math.sin(t * 2.6)) * .06};
    case "lurker": return {dx: Math.round(Math.sin(t * .9) * .8), dy: Math.round(Math.sin(t * 1.7) * 1.6), tint: 0};
    case "spitter": return {dx: 0, dy: Math.sin(t * 3.1) > .5 ? -1 : 0, tint: 0};
    case undefined: return {dx: Math.sin(t * 6.3) > .85 ? 1 : 0, dy: Math.sin(t * 11) > .9 ? -1 : 0, tint: 0};  // a rat sniffing
    default: return {dx: 0, dy: Math.sin(t * 2.2) > .6 ? -1 : 0, tint: 0};
  }
}
// A hero standing still: they blink now and then, the body and cape sway a pixel side to side, and a fidget may
// lift them a pixel (settling their stance, or raising the lantern). Variants are built once per frame and kept.
const variants = new WeakMap();
function idleVariant(spr, h, time, i) {
  const ph = time + i * 1.7, blink = ph % 3.3 < .13 || (ph % 9.9 > 3.45 && ph % 9.9 < 3.56);
  const sw = h.fidget && h.fidget.kind === "look" ? 0 : Math.round(Math.sin(ph * 1.6) * 1.2);
  const key = (blink ? "b" : "") + sw;
  if (key === "0") return spr;
  let m = variants.get(spr);
  if (!m) variants.set(spr, m = new Map());
  if (!m.has(key)) {
    const n = spr.length, top = Math.floor(n * .3), bot = Math.floor(n * .8);
    m.set(key, spr.map((row, j) => {
      let r = blink && j < n * .4 ? row.replace(/i/g, "S") : row;  // eyes shut (only in the head)
      if (sw && j >= top && j < bot) {  // the body and cape lean, the feet stay planted
        const k = Math.min(1, (j - top) / (bot - top) + .3) > .5 ? sw : 0;
        if (k > 0) r = "." + r.slice(0, -1); else if (k < 0) r = r.slice(1) + ".";
      }
      return r;
    }));
  }
  return m.get(key);
}
// creatures that grow moss: trolls and the hag
const MOSSY = new Set("SC"), RAT_PAL = Object.assign({}, BASECOL, {e: [.86, .16, .24]});
// a shaded sprite (hero or creature): lit by the light where it stands; fade < 1 draws a faint afterimage over the
// floor; white draws the flash of a creature that was just hit
function drawShaded(px, x0, y0, light, mat, flip, fade = 1, white = false, tint = 0) {
  const {W, SH} = lv;
  for (let j = 0; j < px.length; j++) {
    const row = px[j], n = row.length;
    for (let i = 0; i < n; i++) {
      const p = row[flip ? n - 1 - i : i], x = x0 + i, y = y0 + j;
      if (!p || x < 0 || y < 0 || x >= W || y >= SH) continue;
      const si = y * W + x, c = p.c, k = fade;
      if (fade < 1 && M[si] !== MAT.FLOOR) continue;  // afterimages only ghost over the floor
      let r = white ? 1 : p.em ? c[0] : c[0] * light[0], g = white ? 1 : p.em ? c[1] : c[1] * light[1], b = white ? 1 : p.em ? c[2] : c[2] * light[2];
      if (tint) { r = r * (1 - tint) + tint * .9; g *= 1 - tint * .55; b *= 1 - tint * .55; }  // a wind-up flushes red
      if (p.em && mat === MAT.SPRITE && fade === 1) frameEm.push(x, y, c);
      S[si * 3] = S[si * 3] * (1 - k) + r * k; S[si * 3 + 1] = S[si * 3 + 1] * (1 - k) + g * k; S[si * 3 + 2] = S[si * 3 + 2] * (1 - k) + b * k;
      if (fade === 1) M[si] = mat;
    }
  }
}

// Bounce light. Whatever the rays light up throws some of it back, tinted by what it landed on (moss bounces
// green, stone grey), and that spreads through open air on a coarse grid: round corners, into side passages and
// across the shadows creatures throw, fading a little with every cell. Walls take it in but never pass it on.
const BC = 4, B_FADE = .86, B_AMT = .4;
let bG = new Float32Array(0), bOpen = new Uint8Array(0);
function bounce(lx0, ly0, lx1, ly1) {
  const {W, solid, alb, topAlb} = lv, gx0 = Math.floor(lx0 / BC), gy0 = Math.floor(ly0 / BC);
  const gw = Math.ceil(lx1 / BC) - gx0, gh = Math.ceil(ly1 / BC) - gy0, n = gw * gh;
  if (bG.length < n * 3) { bG = new Float32Array(n * 3); bOpen = new Uint8Array(n); }
  // what each cell throws back: four samples of the light times the colour of what it hit
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const c = cy * gw + cx, px = (gx0 + cx) * BC, py = (gy0 + cy) * BC;
    let r = 0, g = 0, b = 0, k = 0;
    for (let q = 0; q < 4; q++) {
      const x = px + 1 + (q & 1) * 2, y = py + 1 + (q >> 1) * 2;
      if (x < lx0 || x >= lx1 || y < ly0 || y >= ly1) continue;
      const w = y * W + x, i = w * 3, a = solid[w] ? topAlb : alb;
      r += Lf[i] * a[i]; g += Lf[i + 1] * a[i + 1]; b += Lf[i + 2] * a[i + 2]; k++;
    }
    const f = k ? B_AMT / k : 0, mid = Math.min(py + 2, lv.WH - 1) * W + Math.min(px + 2, W - 1);
    bG[c * 3] = r * f; bG[c * 3 + 1] = g * f; bG[c * 3 + 2] = b * f;
    bOpen[c] = solid[mid] ? 0 : 1;
  }
  // spread it: sweeps down-right then up-left, twice, so it can turn a corner or two; a cell takes the brighter of
  // its own light and a faded neighbour's, and only open cells pass light on
  for (let pass = 0; pass < 2; pass++) for (let dir = 0; dir < 2; dir++) {
    const fwd = dir === 0, step = fwd ? 1 : -1;
    for (let cy = fwd ? 0 : gh - 1; fwd ? cy < gh : cy >= 0; cy += step) {
      for (let cx = fwd ? 0 : gw - 1; fwd ? cx < gw : cx >= 0; cx += step) {
        const c = cy * gw + cx, c3 = c * 3;
        let r = bG[c3], g = bG[c3 + 1], b = bG[c3 + 2];
        const h = c - step, v = c - step * gw;  // the neighbours already swept: beside and above (or below)
        if ((fwd ? cx > 0 : cx < gw - 1) && bOpen[h]) {
          const o = h * 3, f = B_FADE;
          if (bG[o] * f > r) r = bG[o] * f; if (bG[o + 1] * f > g) g = bG[o + 1] * f; if (bG[o + 2] * f > b) b = bG[o + 2] * f;
        }
        if ((fwd ? cy > 0 : cy < gh - 1) && bOpen[v]) {
          const o = v * 3, f = B_FADE;
          if (bG[o] * f > r) r = bG[o] * f; if (bG[o + 1] * f > g) g = bG[o + 1] * f; if (bG[o + 2] * f > b) b = bG[o + 2] * f;
        }
        bG[c3] = r; bG[c3 + 1] = g; bG[c3 + 2] = b;
      }
    }
  }
  // and lay it smoothly back over every pixel
  for (let y = ly0; y < ly1; y++) {
    const fy = Math.min(Math.max((y + .5) / BC - .5 - gy0, 0), gh - 1.001), cy = fy | 0, ty = fy - cy;
    for (let x = lx0, i = (y * W + lx0) * 3; x < lx1; x++, i += 3) {
      const fx = Math.min(Math.max((x + .5) / BC - .5 - gx0, 0), gw - 1.001), cx = fx | 0, tx = fx - cx;
      const a = (cy * gw + cx) * 3, b = a + 3, c = a + gw * 3, d = c + 3;
      const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
      Lf[i] += bG[a] * wa + bG[b] * wb + bG[c] * wc + bG[d] * wd;
      Lf[i + 1] += bG[a + 1] * wa + bG[b + 1] * wb + bG[c + 1] * wc + bG[d + 1] * wd;
      Lf[i + 2] += bG[a + 2] * wa + bG[b + 2] * wb + bG[c + 2] * wc + bG[d + 2] * wd;
    }
  }
}

// A sword stroke: the steel blade itself sweeps through the arc, whipping fast then settling, and leaves a
// bright crescent behind it that thins and fades. It is drawn as glowing pixels so it reads in any light.
export const BLADE_TIME = .24;
function drawBlade(w) {
  const p = Math.min(1, w.t / BLADE_TIME), e = 1 - Math.pow(1 - p, 3);  // ease out: a fast cut that settles
  const span = w.arc, a0 = -span * w.dir, a1 = span * w.dir, now = a0 + (a1 - a0) * e;
  const ox = w.x, oy = w.y + H - 4, fade = p < .75 ? 1 : 1 - (p - .75) / .25;
  // the crescent: from where the blade started up to where it is now, thickest just behind the blade and mid-arc,
  // thinning away behind it; a warm gold core, a white edge along the tip's path, and a dark rim so it reads on
  // bright stone as well as in the dark
  const steps = Math.ceil(Math.abs(now - a0) / .03);
  if (fade > .05) for (let k = 0; k <= steps; k++) {
    const a = a0 + (now - a0) * k / Math.max(1, steps), fresh = k / Math.max(1, steps);  // 1 at the blade, 0 at the start
    const thick = Math.pow(fresh, .7) * 7 * fade * Math.sin(Math.PI * Math.min(1, Math.abs(a - a0) / (2 * span) + .15)) + .6;
    if (thick < 1.2) continue;
    const ca = Math.cos(w.ang + a), sa = Math.sin(w.ang + a), r0 = 22 - thick;
    for (let r = r0; r <= 22; r += .7) {
      const edge = (r - r0) / thick;
      frameEm.push(Math.round(ox + ca * r), Math.round(oy + sa * r), edge > .7 ? [1, .98, .9] : [1, .82 + .12 * edge, .42 + .4 * edge]);
    }
    const rim = [.14, .09, .05];
    frameEm.push(Math.round(ox + ca * 23.2), Math.round(oy + sa * 23.2), rim);
    if (thick > 2) frameEm.push(Math.round(ox + ca * (r0 - 1.2)), Math.round(oy + sa * (r0 - 1.2)), rim);
  }
  if (fade <= 0) return;
  // the blade: steel from the hilt out to the tip with dark edges either side, a gold crossguard and grip
  const ca = Math.cos(w.ang + now), sa = Math.sin(w.ang + now), px = -sa, py = ca;
  for (let r = 7; r <= 21; r += .5) {
    const tip = r > 19;
    for (const s of [-1.2, 1.2]) frameEm.push(Math.round(ox + ca * r + px * s), Math.round(oy + sa * r + py * s), [.12, .1, .09]);
    frameEm.push(Math.round(ox + ca * r), Math.round(oy + sa * r), scl(tip ? [1, 1, .95] : [.86, .9, .95], fade));
  }
  for (let s = -2.5; s <= 2.5; s += .5) frameEm.push(Math.round(ox + ca * 6.5 + px * s), Math.round(oy + sa * 6.5 + py * s), scl([.95, .72, .3], fade));
  for (let r = 3; r <= 5.5; r += .5) frameEm.push(Math.round(ox + ca * r), Math.round(oy + sa * r), scl([.45, .3, .18], fade));
}

// seen: this view's map memory; static glows (props, wall runes, beacons, light shafts) only show where it's set,
// so undiscovered parts of the sewer stay dark and the focus stays on the hero's own light
function compose(game, sx0, sy0, cw, ch, time, seen) {
  const {g, holes, props, MW, MH, W, WH, topAlb, frontAlb} = lv, sx1 = sx0 + cw, sy1 = sy0 + ch;
  const lx0 = Math.max(0, sx0 - T - 4), lx1 = Math.min(W, sx1 + T + 4), ly0 = Math.max(0, sy0 - H - T - 4), ly1 = Math.min(WH, sy1 + 4);
  const Ls = lv.Ls, Ld = lv.Ld;
  let tp = performance.now();
  const sub = k => { const n = performance.now(); prof[k] = (prof[k] || 0) * .9 + (n - tp) * .1; tp = n; };
  for (let y = ly0; y < ly1; y++) {
    const row = Math.floor(y / T) * MW;
    for (let x = lx0, i = (y * W + lx0) * 3; x < lx1; x++, i += 3) {
      const known = seen[row + Math.floor(x / T)];
      for (let c = 0; c < 3; c++) { const v = (known ? Ls[i + c] : 0) + Ld[i + c]; Lf[i + c] = v > 0 ? v : 0; }
    }
  }
  sub("c.light");
  if (LIGHT_FX.bounce) bounce(lx0, ly0, lx1, ly1);
  sub("c.bounce");
  for (let y = ly0; y < ly1; y++) for (let x = lx0, i = (y * W + lx0) * 3; x < lx1; x++, i += 3)
    for (let c = 0; c < 3; c++) { const v = Lf[i + c]; Lf[i + c] = v <= 0 ? 0 : v >= 4 ? Math.pow(v, ART.falloff) * 1.3 : FALL[v * 1024 | 0]; }
  sub("c.falloff");
  // floor
  const shim = ART.sludgeShimmer;
  for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
    const si = y * W + x;
    M[si] = MAT.FLOOR;
    if (y < H) { S[si * 3] = S[si * 3 + 1] = S[si * 3 + 2] = 0; continue; }
    const wi = (y - H) * W + x, w3 = wi * 3, s3 = si * 3;
    S[s3] = lv.alb[w3] * Lf[w3]; S[s3 + 1] = lv.alb[w3 + 1] * Lf[w3 + 1]; S[s3 + 2] = lv.alb[w3 + 2] * Lf[w3 + 2];
    if (lv.motes[wi] && !lv.solid[wi] && (Lf[w3] + Lf[w3 + 1] + Lf[w3 + 2]) / 3 > .35)
      for (let c = 0; c < 3; c++) S[s3 + c] = Math.min(S[s3 + c] * 1.8 + .12, 1);
    if (lv.wet[wi]) {  // puddles catch the light
      const l = (Lf[w3] + Lf[w3 + 1] + Lf[w3 + 2]) / 3, sp = l * l * .14 * (.75 + .25 * Math.sin(x * .7 + y * .3 + time * 3));
      S[s3] += sp * .8; S[s3 + 1] += sp * .9; S[s3 + 2] += sp;
    }
    if (shim > 0 && lv.sludgePx[wi]) {
      const s = Math.sin(x * .45 + (y - H) * .25 + time * 2.6) * Math.sin(x * .17 - (y - H) * .31 + time * 1.9);
      if (s > 0) { const v = Math.pow(s, 6) * shim; S[s3] += .3 * v * Lf[w3]; S[s3 + 1] += .9 * v * Lf[w3 + 1]; S[s3 + 2] += .8 * v * Lf[w3 + 2]; }
    }
  }
  sub("c.floor");
  // things that stand in the maze, drawn row by row so walls in front cover them
  const rows = new Map(), add = (ty, s) => { if (!rows.has(ty)) rows.set(ty, []); rows.get(ty).push(s); };
  const fc = glowCol("flower"), cc = glowCol("crystal"), kc = glowCol("rune");
  const cols = Object.assign({}, BASECOL, {p: fc, P: mixW(fc, .6), x: cc, X: mixW(cc, .7), g: glowCol("fungus"), q: kc, Q: mixW(kc, .5)});
  const known = (wx, wy) => { const tx = Math.floor(wx / T), ty = Math.floor(wy / T); return tx >= 0 && ty >= 0 && tx < MW && ty < MH && seen[ty * MW + tx]; };
  for (const o of lv.rooms) for (const t of o.torches) if (o.lit || known(t.tx * T + 8, (t.ty + 1) * T + 4)) {
    const spr = !o.lit ? SPR.TORCH : Math.floor(time * 8 + t.tx) % 2 ? SPR.TORCH_LIT : SPR.TORCH_LIT2;
    add(t.ty, {spr, x: t.tx * T + 6, y: (t.ty + 1) * T - 1, lit: true, cols});
  }
  for (const p of props) {  // each glowing prop wears its own region's colour
    if (!seen[p.ty * MW + p.tx]) continue;
    const c = p.col;
    if (p.kind === "fungus") add(p.ty, {spr: SPR.FUNGUS, x: p.tx * T + 9, y: p.ty * T + 9, lit: false, cols: Object.assign({}, cols, {g: c})});
    else if (p.kind === "flower") add(p.ty, {spr: SPR.FLOWER, x: p.tx * T + 6, y: p.ty * T + 9, lit: true, cols: Object.assign({}, cols, {p: c, P: mixW(c, .6)})});
    else if (p.kind === "crystal") add(p.ty, {spr: SPR.CRYSTAL, x: p.tx * T + 5, y: p.ty * T + 9, lit: true, cols: Object.assign({}, cols, {x: c, X: mixW(c, .7)})});
  }
  lv.keys.forEach((k, i) => { if (!k.taken && seen[k.ty * MW + k.tx]) add(k.ty, {spr: SPR.KEY, x: k.tx * T + 6, y: k.ty * T + 8 + Math.round(Math.sin(time * 3 + i) * 1.2), lit: true, cols}); });
  for (const o of lv.oils) if (!o.taken && seen[o.ty * MW + o.tx]) add(o.ty, {spr: SPR.OIL, x: o.tx * T + 6, y: o.ty * T + 9, lit: true, cols});
  lv.loot.forEach((it, i) => {  // each look wears its own colour; the glow pulses gently
    if (it.taken || !seen[it.ty * MW + it.tx]) return;
    const c = lookOf(it).col, pulse = .8 + .2 * Math.sin(time * 2.5 + i), lit = scl(c, pulse);
    const lc = it.kind === "tonic" ? Object.assign({}, cols, {f: scl(c, .55), F: lit}) : Object.assign({}, cols, {Z: lit});
    add(it.ty, {spr: it.kind === "tonic" ? SPR.TONIC : SPR.RUNE, x: it.tx * T + (it.kind === "tonic" ? 6 : 5), y: it.ty * T + 9, lit: true, cols: lc});
  });
  for (const gi of lv.gearItems || []) if (!gi.taken && known(gi.x, gi.y)) {
    const gc = Object.assign({}, cols, {k: [.08, .06, .04], w: gi.item.col, g: scl(RARITY[gi.item.rarity].col, .75 + .25 * Math.sin(time * 4 + gi.x))});
    add(Math.floor(gi.y / T), {spr: GEAR_SPR[gi.item.kind], x: Math.round(gi.x) - 4, y: Math.round(gi.y) + 2 + Math.round(Math.sin(time * 2 + gi.y)), lit: true, cols: gc});
  }
  for (const r of lv.relics) if (!r.taken && seen[r.ty * MW + r.tx]) {
    const c = RELICS[r.kind].col, p = .75 + .25 * Math.sin(time * 3 + r.tx);
    add(r.ty, {spr: SPR.RELIC, x: r.tx * T + 6, y: r.ty * T + 9 + Math.round(Math.sin(time * 2.4 + r.ty) * 1.2), lit: true,
      cols: Object.assign({}, cols, {a: scl(c, .5), A: scl(c, p)})});
  }
  for (const vt of lv.vaults) {  // loot-room chests: dull while guarded, glowing once the room is cleared
    const {tx, ty} = vt.chest, ready = vt.state === "cleared" && !vt.looted;
    if (!seen[ty * MW + tx]) continue;
    const c = ready ? Object.assign({}, cols, {O: [1, .8, .3], Y: [1, .95, .55]}) : Object.assign({}, cols, {O: [.35, .25, .12], Y: [.4, .3, .15]});
    add(ty, {spr: vt.looted ? SPR.CHEST_OPEN : SPR.CHEST, x: tx * T + 3, y: ty * T + 11, lit: true, cols: c});
  }
  if (lv.shrine && !lv.shrine.taken && seen[lv.shrine.ty * MW + lv.shrine.tx]) {
    const sh = lv.shrine, c = ABILITIES[sh.ability].col;
    add(sh.ty, {spr: SPR.ALTAR, x: sh.tx * T + 5, y: sh.ty * T + 11, lit: true, cols: Object.assign({}, cols, {a: scl(c, .55), A: c})});
  }
  if ((game.mode === "solo" || game.mode === "coop") && game.level > 1) {
    const [lx, ly] = lv.starts[0];
    add(ly, {spr: SPR.LADDER, x: lx * T + 5, y: ly * T + 12, lit: true, cols});
  }
  for (const r of game.rats) {
    const v = r.face === "U" || r.face === "D", spr = r.face === "U" ? SPR.RAT_UP : r.face === "D" ? SPR.RAT_DOWN : SPR.RAT;
    const pose = poseOf(r, time);
    add(Math.floor(r.y / T), {px: shadeSprite(spr, RAT_PAL, "rat"), x: Math.round(r.x + pose.dx) - (v ? 3 : 6), y: Math.round(r.y + pose.dy) + (v ? 4 : 1), lit: true,
      white: r.flash > 0, tint: pose.tint, flip: r.face === "R"});
  }
  for (const f of game.foes) {  // forest folk: wisps and the Warden float and bob, the rest breathe slowly
    if (f.type === "lurker" && !f.shown) continue;  // a lurker is invisible until your light finds it
    const spr = SPR[f.type.toUpperCase()], float = f.type === "wisp" || f.type === "warden", spec = FOE[f.type];
    const bob = float ? Math.round(Math.sin(time * 3 + f.ph) * 1.5) : f.type === "crawler" ? 0 : (Math.floor(time * 2.2 + f.ph) % 2);
    const px = shadeSprite(spr, FOE_PAL, "foe", {moss: MOSSY}), pose = poseOf(f, time);
    add(Math.floor(f.y / T), {px, x: Math.round(f.x + pose.dx) - (spr[0].length >> 1), y: Math.round(f.y + pose.dy) + Math.max(2, spec.r >> 1) + bob,
      lit: !float && f.type !== "lurker" && !spec.boss, white: f.flash > 0, tint: Math.max(pose.tint, f.elite ? .1 : 0), flip: (f.dx || 0) < 0 && !float});
  }
  game.heroes.forEach((h, i) => {
    if (h.down) {  // a fallen co-op partner lies in the muck, lantern guttering beside them
      add(Math.floor(h.fy / T), {spr: FALLEN, x: Math.round(h.fx) - 2, y: Math.round(h.fy), lit: true, cols: Object.assign({}, BASECOL, h.pal)});
      return;
    }
    if (h.invuln > 0 && Math.floor(h.invuln * 12) % 2) return;  // blink while hurt
    // standing: a slow breath; walking: a four-step cycle with a one-pixel bounce on the passing steps
    const fr = heroFrames(h.look), step = Math.floor(h.walk / 5) % 4;
    const spr = h.moving ? fr.walk[step] : idleVariant(fr.idle[Math.floor(time * 2.2 + i * .5) % 2], h, time, i);
    const fg = h.fidget, settle = fg && fg.kind === "settle" ? (fg.t % .35 < .12 ? -1 : 0) : 0;
    const bob = h.moving ? WALK_BOB[step] : settle - (h.lift > .4 ? 1 : 0);
    const px = shadeHero(spr, h.pal, h.lookKey);
    for (const g of h.ghosts) add(Math.floor((g.y - 4) / T), {ghost: px, x: Math.round(g.x) - HERO_OX, y: Math.round(g.y), a: g.a * .35, hero: h, idx: i});
    // sorted by the tile the hero stands in, so the wall row below is drawn over their tucked-in feet
    // a sword swing carries the hero a step into it
    const sw = game.swings.find(w => w.hero === h), lunge = sw ? Math.sin(Math.min(1, sw.t / BLADE_TIME) * Math.PI) * 2.5 : 0;
    add(Math.floor((h.fy - 4) / T), {px, x: Math.round(h.fx + (sw ? Math.cos(sw.ang) * lunge : 0)) - HERO_OX,
      y: Math.round(h.fy + (sw ? Math.sin(sw.ang) * lunge : 0)) + bob, hero: h, idx: i});
  });
  const m = T >> 1;
  const tyA = Math.max(0, Math.floor((sy0 - H) / T) - 1), tyB = Math.min(MH - 1, Math.floor(sy1 / T) + 1);
  const txA = Math.max(0, Math.floor(sx0 / T)), txB = Math.min(MW - 1, Math.floor((sx1 - 1) / T));
  for (let ty = tyA; ty <= tyB; ty++) {
    for (let tx = txA; tx <= txB; tx++) {
      if (!g[ty * MW + tx]) continue;
      const x0 = tx * T, o = holes.get(ty * MW + tx);
      if (ty + 1 < MH && !g[(ty + 1) * MW + tx]) {  // front face, lit by the corridor below it
        const row = Math.min((ty + 1) * T, WH - 1);
        for (let v = 0; v < H; v++) {
          const sh = .55 + .45 * v / (H - 1);
          for (let u = 0; u < T; u++) {
            const si = ((ty + 1) * T + v) * W + x0 + u, ai = ((ty * H + v) * W + x0 + u) * 3, li = (row * W + x0 + u) * 3;
            if (o === "v" && u >= m - 1 && u <= m + 1) {
              const hi = ((ty * T + 2) * W + x0 + u) * 3;
              S[si * 3] = Math.min(Lf[hi] * 1.3, 1); S[si * 3 + 1] = Math.min(Lf[hi + 1] * 1.3, 1); S[si * 3 + 2] = Math.min(Lf[hi + 2] * 1.3, 1);
            } else {
              S[si * 3] = frontAlb[ai] * Lf[li] * sh; S[si * 3 + 1] = frontAlb[ai + 1] * Lf[li + 1] * sh; S[si * 3 + 2] = frontAlb[ai + 2] * Lf[li + 2] * sh;
            }
            M[si] = MAT.FRONT;
          }
        }
      }
      // the brightest light just around this wall block: only the 2-pixel ring outside it, since light never
      // reaches inside the stone (this used to scan the whole block and was the slowest part of a frame)
      let t0 = 0, t1 = 0, t2 = 0;
      const ya = Math.max(ty * T - 2, 0), yb = Math.min(ty * T + T + 2, WH), xa = Math.max(x0 - 2, 0), xb = Math.min(x0 + T + 2, W);
      for (let y = ya; y < yb; y++) {
        const edge = y < ty * T || y >= ty * T + T;
        for (let x = xa, i = (y * W + x) * 3; x < xb; x++, i += 3) {
          if (!edge && x === x0) { x = x0 + T - 1; i += (T - 1) * 3; continue; }  // skip the block itself
          if (Lf[i] > t0) t0 = Lf[i]; if (Lf[i + 1] > t1) t1 = Lf[i + 1]; if (Lf[i + 2] > t2) t2 = Lf[i + 2];
        }
      }
      // top-face light = local max of the light (radius 2), separable, worked out for this block's pixels only
      TLh.fill(0); TL.fill(0);
      for (let v = -2; v < T + 2; v++) {
        const y = ty * T + v;
        if (y < ly0 || y >= ly1) continue;
        for (let u = 0; u < T; u++) {
          const x = x0 + u, xa = x - 2 < lx0 ? lx0 : x - 2, xb = x + 2 >= lx1 ? lx1 - 1 : x + 2;
          let m0 = 0, m1 = 0, m2 = 0;
          for (let i = (y * W + xa) * 3, e = (y * W + xb) * 3; i <= e; i += 3) {
            if (Lf[i] > m0) m0 = Lf[i]; if (Lf[i + 1] > m1) m1 = Lf[i + 1]; if (Lf[i + 2] > m2) m2 = Lf[i + 2];
          }
          const o = ((v + 2) * T + u) * 3; TLh[o] = m0; TLh[o + 1] = m1; TLh[o + 2] = m2;
        }
      }
      for (let v = 0; v < T; v++) {
        const y = ty * T + v;
        if (y < ly0 || y >= ly1) continue;
        const va = (y - 2 < ly0 ? ly0 : y - 2) - ty * T + 2, vb = (y + 2 >= ly1 ? ly1 - 1 : y + 2) - ty * T + 2;
        for (let u = 0; u < T; u++) {
          let m0 = 0, m1 = 0, m2 = 0;
          for (let vv = va; vv <= vb; vv++) {
            const i = (vv * T + u) * 3;
            if (TLh[i] > m0) m0 = TLh[i]; if (TLh[i + 1] > m1) m1 = TLh[i + 1]; if (TLh[i + 2] > m2) m2 = TLh[i + 2];
          }
          const o = (v * T + u) * 3; TL[o] = m0; TL[o + 1] = m1; TL[o + 2] = m2;
        }
      }
      const up = ty > 0 && !g[(ty - 1) * MW + tx], dn = ty + 1 < MH && !g[(ty + 1) * MW + tx];
      const lf = tx > 0 && !g[ty * MW + tx - 1], rt = tx + 1 < MW && !g[ty * MW + tx + 1];
      for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
        const wi = (ty * T + v) * W + x0 + u, i = wi * 3;
        // wall tops take light fairly evenly from whatever lights the tile, so the stone reads as a solid mass
        const k = (v * T + u) * 3, l0 = .45 * t0 + .55 * TL[k], l1 = .45 * t1 + .55 * TL[k + 1], l2 = .45 * t2 + .55 * TL[k + 2];
        if ((o === "h" && v >= m - 1 && v <= m + 1) || (o === "v" && u >= m - 1 && u <= m + 1)) {
          S[i] = Math.min(Lf[i] * 1.2, 1) * .9 + .01; S[i + 1] = Math.min(Lf[i + 1] * 1.2, 1) * .9 + .01; S[i + 2] = Math.min(Lf[i + 2] * 1.2, 1) * .9 + .01;
        } else {
          // the lip where the wall meets a corridor catches the light
          const lip = (v === 0 && up) || (v === T - 1 && dn) || (u === 0 && lf) || (u === T - 1 && rt) ? 1.7 : 1;
          S[i] = topAlb[i] * l0 * lip; S[i + 1] = topAlb[i + 1] * l1 * lip; S[i + 2] = topAlb[i + 2] * l2 * lip;
        }
        M[wi] = MAT.TOP;
      }
    }
    for (const s of rows.get(ty) || []) {
      if (s.hero) {  // lit by the light at their feet, the same as everything else in the sewer
        const px = s.px || s.ghost, li = (clamp(s.y, 0, WH - 1) * W + clamp(s.x + 8, 0, W - 1)) * 3;
        // a touch under full, so a hero standing in their own lantern's glare keeps their colours and texture
        const light = [Math.min(Lf[li] * .8 + .05, .88), Math.min(Lf[li + 1] * .8 + .05, .88), Math.min(Lf[li + 2] * .8 + .05, .88)];
        drawShaded(px, s.x, s.y - px.length + 1 + H, light, s.idx ? MAT.P2 : MAT.P1, facing(s.hero) < 0, s.ghost ? s.a : 1);
      } else if (s.px) {  // a shaded creature
        const li = (clamp(s.y, 0, WH - 1) * W + clamp(s.x + 4, 0, W - 1)) * 3;
        // creatures keep a faint, cool silhouette even in the dark, so their shapes read beyond the lantern
        const light = s.lit ? [Math.min(Math.max(Lf[li] + .04, .13), 1.1), Math.min(Math.max(Lf[li + 1] + .04, .14), 1.1), Math.min(Math.max(Lf[li + 2] + .04, .2), 1.1)] : [.9, .9, .9];
        drawShaded(s.px, s.x, s.y - s.px.length + 1 + H, light, MAT.SPRITE, s.flip, 1, s.white, s.tint || 0);
      } else {
        const li = (clamp(s.y, 0, WH - 1) * W + clamp(s.x + 4, 0, W - 1)) * 3;
        const light = s.lit ? [Math.min(Lf[li], 1.2), Math.min(Lf[li + 1], 1.2), Math.min(Lf[li + 2], 1.2)] : [.8, .8, .8];
        drawSprite(s.spr, s.x, s.y - s.spr.length + 1 + H, s.cols, light, MAT.SPRITE, s.flip, null);
      }
    }
  }
  sub("c.walls");
  // light shafts from the surface
  const bc = scl(glowCol("shaft"), .8 * ART.beamStrength);
  for (let i = 0; i < lv.beams.length; i += 3) {
    const si = lv.beams[i], a = lv.beams[i + 1], bx = si % W, by = si / W | 0;
    if (!seen[Math.min(MH - 1, Math.max(0, Math.floor((by - H) / T))) * MW + Math.floor(bx / T)]) continue;
    if (bx < sx0 || bx >= sx1 || by < sy0 || by >= sy1) continue;
    S[si * 3] += a * bc[0]; S[si * 3 + 1] += a * bc[1]; S[si * 3 + 2] += a * bc[2];
    if (lv.beams[i + 2] && M[si] !== MAT.P1 && M[si] !== MAT.P2) M[si] = MAT.BEAM;
  }
  // drifting mist, only where light reaches it
  if (ART.mist > 0) for (let y = Math.max(sy0, H); y < sy1; y++) for (let x = sx0; x < sx1; x++) {
    const wi = (y - H) * W + x, lm = (Lf[wi * 3] + Lf[wi * 3 + 1] + Lf[wi * 3 + 2]) / 3;
    if (lm < .02) continue;
    const n = noise(x * .09 + time * .35, y * .13 + time * .1) * .6 + noise(x * .21 - time * .5, y * .17 + 40) * .4;
    const v = clamp(n * 1.8 - .55, 0, 1) * ART.mist * Math.min(lm, 1.2) * .5, si = y * W + x;
    S[si * 3] += MIST[0] * v; S[si * 3 + 1] += MIST[1] * v; S[si * 3 + 2] += MIST[2] * v;
  }
  sub("c.beam+mist");
  const lightAt = (x, y) => {
    const wy = clamp(Math.floor(y) - H, 0, WH - 1), wx = clamp(Math.floor(x), 0, W - 1), i = (wy * W + wx) * 3;
    return wx < lx0 || wx >= lx1 || wy < ly0 || wy >= ly1 ? 0 : (Lf[i] + Lf[i + 1] + Lf[i + 2]) / 3;
  };
  for (const s of spores) {
    if (!s || s.life <= 0 || !known(s.x, s.y - H)) continue;  // spores only drift where the map is known
    const fade = Math.min(1, s.life * 2, (s.max - s.life) * 2) * .9;
    frameEm.push(Math.round(s.x), Math.round(s.y), scl(s.c, fade));
  }
  for (const d of drips) {
    const b = Math.min(lightAt(d.x, d.y), 1) * .55;  // a glint of water, not a light source
    if (b < .04) continue;
    const c = scl([.55, .8, 1], b), x = Math.round(d.x), y = Math.round(d.y);
    if (d.y < d.floor) frameEm.push(x, y, c, x, y - 1, scl(c, .5));
    else { const f = 1 - d.splash / .25, o = 1 + Math.round(d.splash * 8); frameEm.push(x - o, y, scl(c, f), x + o, y, scl(c, f), x - o - 1, y - 1, scl(c, f * .6), x + o + 1, y - 1, scl(c, f * .6)); }
  }
  for (const s of game.shots) {  // bolts and bullets: a fading tail, then a bright cross-shaped core that reads in the dark
    const x = Math.round(s.x), y = Math.round(s.y) + H - 4, sp = Math.hypot(s.vx, s.vy) || 1;
    if (s.kind === "arrow") {  // a dim shaft with a pale head, so a hunter's shots don't light up the dark
      for (let k = 0; k < 5; k++) frameEm.push(Math.round(s.x - s.vx / sp * k), Math.round(s.y - s.vy / sp * k) + H - 4, k ? [.32, .24, .14] : [.85, .8, .7]);
      continue;
    }
    if (s.kind === "fire") {  // a flickering ball of flame with a smoky tail
      for (const k of [3, 5, 7]) frameEm.push(Math.round(s.x - s.vx / sp * k + (Math.random() - .5) * 2), Math.round(s.y - s.vy / sp * k) + H - 4, scl(s.col, .8 - k * .08));
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const r = Math.abs(dx) + Math.abs(dy);
        if (r <= 3 && Math.random() > r * .12) frameEm.push(x + dx, y + dy, r < 2 ? [1, .95, .7] : s.col);
      }
      continue;
    }
    for (const k of [2, 4]) frameEm.push(Math.round(s.x - s.vx / sp * k), Math.round(s.y - s.vy / sp * k) + H - 4, scl(s.col, .7 - k * .1));
    const core = s.hero ? mixW(s.col, .7) : mixW(s.col, .35);
    frameEm.push(x - 1, y - 1, scl(s.col, .6), x + 1, y - 1, scl(s.col, .6), x - 1, y + 1, scl(s.col, .6), x + 1, y + 1, scl(s.col, .6),
      x, y - 1, s.col, x - 1, y, s.col, x + 1, y, s.col, x, y + 1, s.col, x, y, core);
  }
  for (const f of game.fires) {  // the mage's trail of fire, flickering as it burns down
    for (let k = 0; k < 4; k++) if (Math.random() < f.t / 1.6 + .2)
      frameEm.push(Math.round(f.x + (Math.random() - .5) * 8), Math.round(f.y + H - 1 - Math.random() * 4), Math.random() < .5 ? [1, .5, .12] : [1, .8, .3]);
  }
  for (const t of [...game.foes, ...game.rats]) if (t.burn > 0)  // burning creatures throw off sparks
    for (let k = 0; k < 2; k++) frameEm.push(Math.round(t.x + (Math.random() - .5) * 8), Math.round(t.y + H - 4 - Math.random() * 8), [1, .55, .15]);
  for (const w of game.swings) if (w.blade) drawBlade(w);  // a hero's sword
  for (const w of game.swings) if (!w.blade) {  // a creature's claw or club: an arc that sweeps across and fades
    const span = w.arc || 1.2, r0 = w.r0 || 14, r1 = w.r1 || 23, col = w.col || [.45, .85, 1];
    const f = 1 - w.t / .26, sweep = w.t / .26 * span * 2 - span;
    for (let a = -span; a <= span; a += .04) for (let r = r0; r <= r1; r++) {
      if (a > sweep + .2 || a < sweep - 1.4) continue;  // the stroke's bright leading edge with a fading wake
      frameEm.push(Math.round(w.x + Math.cos(w.ang + a) * r), Math.round(w.y + Math.sin(w.ang + a) * r) + H - 4, scl(col, f * (r > r0 + 1 && r < r1 - 1 ? 1 : .5)));
    }
  }
  for (const h of game.heroes) if (h.blocking) {  // a raised lantern shield: a curved wall of light in front
    const [hx, hy] = [h.fx + 5, h.fy - 4], ang = Math.atan2(h.aimY, h.aimX);
    for (let a = -1; a <= 1; a += .05) for (const r of [13, 14, 15, 16])
      frameEm.push(Math.round(hx + Math.cos(ang + a) * r), Math.round(hy + Math.sin(ang + a) * r) + H - 4, r === 14 || r === 15 ? [1, .7, .12] : [.6, .3, .05]);
  }
  for (const p of game.parts) {  // particles: glowing ones shine, dust and debris take the light where they are
    const x = Math.round(p.x), y = Math.round(p.y - p.z) + H, f = Math.min(1, p.life / Math.min(.35, p.max));
    if (x < sx0 || y < sy0 || x >= sx0 + cw || y >= sy0 + ch) continue;
    if (p.kind === "spark" || p.kind === "ember") { frameEm.push(x, y, scl(p.col, f * (p.kind === "ember" ? .5 + .5 * Math.abs(Math.sin(p.life * 9 + p.ph)) : 1))); continue; }
    const wy = clamp(Math.round(p.y), 0, WH - 1), li = (wy * W + clamp(x, 0, W - 1)) * 3, si = y * W + x;
    const l = (Lf[li] + Lf[li + 1] + Lf[li + 2]) / 3;
    if (p.kind === "mote" && l < .25) continue;  // motes only show where light catches them
    const a = p.kind === "debris" ? f : f * (p.kind === "mote" ? .6 : .5);
    for (let k = 0; k < 3; k++) S[si * 3 + k] = S[si * 3 + k] * (1 - a) + p.col[k] * Math.min(1.1, Lf[li + k] + .05) * a;
  }
  for (const b of game.bursts) {  // sparks flying out from a pickup
    const f = 1 - b.t / .6, rad = 2 + b.t * 38;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * 6.283 + b.t * 2;
      frameEm.push(Math.round(b.x + Math.cos(a) * rad), Math.round(b.y + H + Math.sin(a) * rad * .6), scl(b.col, f));
    }
  }
  for (const d of lv.decoEm) if (known(d.x, d.y) || known(d.x, d.y - T)) frameEm.push(d.x, d.y, scl(colOf(d.c), d.f));
  for (const b of lv.bugs) if (known(b.x, b.y)) {  // fireflies: wandering lazily and blinking on and off
    const blink = Math.sin(time * 1.3 + b.ph * 3);
    if (blink < -.35) continue;
    frameEm.push(Math.round(b.x + Math.sin(time * .9 + b.ph) * 5 + Math.sin(time * 2.3 + b.ph) * 1.5),
      Math.round(b.y + H - 3 + Math.cos(time * .7 + b.ph) * 3.5), scl(b.c, .45 + .55 * Math.min(1, blink + .35)));
  }
  if (game.exitGlow && seen[lv.exit[1] * MW + lv.exit[0]]) {  // the unlocked grate pulses
    const ex = lv.exit[0] * T + 8, ey = lv.exit[1] * T + 5 + H, p = .7 + .3 * Math.sin(time * 4);
    for (let a = 0; a < 40; a++) frameEm.push(Math.round(ex + Math.cos(a / 40 * 6.283) * 6), Math.round(ey + Math.sin(a / 40 * 6.283) * 6), scl(glowCol("rune"), p));
  }
}

// ------------------------------------------------------------------ code blocks
let qbuf = new Uint8Array(0), mbuf = new Uint8Array(0);
function quantizeRegion(sx0, sy0, cw, ch, seen) {
  const {W, MW} = lv;
  if (qbuf.length < cw * ch * 3) { qbuf = new Uint8Array(cw * ch * 3); mbuf = new Uint8Array(cw * ch); }
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const sx = sx0 + x, sy = sy0 + y, si = sy * W + sx, o = y * cw + x;
    let r = clamp(S[si * 3], 0, 1), g = clamp(S[si * 3 + 1], 0, 1), b = clamp(S[si * 3 + 2], 0, 1);
    mbuf[o] = M[si];
    if (ART.palette) {
      const amt = Math.min(Math.max(r, g, b) * 6, 1) * .09, d = (BAYER[((sy0 + y) & 3) * 4 + ((sx0 + x) & 3)] - .5) * amt;
      r = clamp(r + d, 0, 1) * 255; g = clamp(g + d, 0, 1) * 255; b = clamp(b + d, 0, 1) * 255;
      let best = 0, bd = 1e9;
      for (let k = 0; k < PAL.length; k++) { const p = PAL[k], dd = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
      qbuf[o * 3] = PAL[best][0]; qbuf[o * 3 + 1] = PAL[best][1]; qbuf[o * 3 + 2] = PAL[best][2];
    } else { qbuf[o * 3] = r * 255; qbuf[o * 3 + 1] = g * 255; qbuf[o * 3 + 2] = b * 255; }
  }
  for (let i = 0; i < frameEm.length; i += 3) {
    const x = frameEm[i] - sx0, y = frameEm[i + 1] - sy0;
    if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
    const c = frameEm[i + 2], o = y * cw + x;
    qbuf[o * 3] = clamp(c[0], 0, 1) * 255; qbuf[o * 3 + 1] = clamp(c[1], 0, 1) * 255; qbuf[o * 3 + 2] = clamp(c[2], 0, 1) * 255;
    mbuf[o] = MAT.EMIS;
  }
}

const B = ART.block, GW = Math.ceil(OUT_W / B), GH = Math.ceil(OUT_H / B);
// per screen block: the light falling there (rgb), which the GPU stretches smoothly into fog glow and god rays
const lightBuf = new Uint8Array(GW * GH * 4);
const SCENE_H = Math.ceil(GH * B / PIXEL) + 1;  // one spare row (and column, per view) for sub-pixel scrolling
let sceneBuf = new Uint8Array(0);
const bloomG = new Float32Array(GW * GH * 3), bloomT = new Float32Array(GW * GH * 3), bloomBuf = new Uint8Array(GW * GH * 4);
const GAM = new Float32Array(256);
for (let i = 0; i < 256; i++) GAM[i] = Math.pow(i / 255, ART.glyphGamma);

// One view's worth of blocks: the light at four spots in each, and its average colour for the bloom.
function lightGrid(cw, ch, cols, rows, gx0, sx0, sy0) {
  const {W, WH} = lv, k = B / PIXEL;  // world pixels per block
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let lr = 0, lg = 0, lb = 0, br = 0, bg = 0, bb = 0;
    for (let q = 0; q < 4; q++) {
      const x = Math.min(cw - 1, Math.floor((c + .25 + (q & 1) * .5) * k)), y = Math.min(ch - 1, Math.floor((r + .25 + (q >> 1) * .5) * k));
      const sx = sx0 + x, sy = sy0 + y, si = sy * W + sx;
      const wy = M[si] === MAT.TOP ? sy : sy - H;  // wall tops sit H pixels higher than the floor they cover
      if (wy >= 0 && wy < WH) { const i = (wy * W + sx) * 3; lr += Lf[i]; lg += Lf[i + 1]; lb += Lf[i + 2]; }
      const o = (y * cw + x) * 3;
      br += qbuf[o]; bg += qbuf[o + 1]; bb += qbuf[o + 2];
    }
    const gx = gx0 + c, li = (r * GW + gx) * 4, bi = (r * GW + gx) * 3;
    lightBuf[li] = Math.min(1, lr / 4) * 255; lightBuf[li + 1] = Math.min(1, lg / 4) * 255; lightBuf[li + 2] = Math.min(1, lb / 4) * 255;
    bloomG[bi] = br / 1020; bloomG[bi + 1] = bg / 1020; bloomG[bi + 2] = bb / 1020;
  }
}

// ------------------------------------------------------------------ frame
const cams = {};  // eased camera centres, so the view glides when co-op switches between shared and split
// Draws the world on the GPU; returns where each player's view landed.
export function renderWorld(game, time) {
  lightBuf.fill(0); bloomG.fill(0);
  // co-op partners share one full view while they're close, and split the screen when they wander apart;
  // head to head always splits so neither racer sees the other's side
  const two = game.heroes.length > 1, views = [];
  if (two && game.mode === "coop") {
    const [a, b] = game.heroes, vw = GW * B / PIXEL, vh = SCENE_H;
    const dx = Math.abs(a.fx - b.fx), dy = Math.abs(a.fy - b.fy);
    game.camShared = game.camShared ? dx < vw * .62 && dy < vh * .62 : dx < vw * .5 && dy < vh * .5;
  } else game.camShared = false;
  if (two && !game.camShared) { const cols = Math.floor(GW / 2) - 1; views.push({hero: 0, cols, gx0: 0}, {hero: 1, cols, gx0: GW - cols}); }
  else views.push({hero: 0, cols: GW, gx0: 0, shared: two});
  let t = performance.now();
  const lap = k => { const n = performance.now(); prof[k] = (prof[k] || 0) * .9 + (n - t) * .1; t = n; };
  // each view shows the scene at a whole-number pixel scale, so the pixel art stays crisp
  let texW = 0;
  for (const v of views) { v.cw = Math.min(lv.W, Math.ceil(v.cols * B / PIXEL) + 1); v.texX = texW; texW += v.cw; }
  if (sceneBuf.length !== texW * SCENE_H * 4) sceneBuf = new Uint8Array(texW * SCENE_H * 4);
  for (const v of views) {
    const cw = v.cw, ch = Math.min(lv.SH, SCENE_H);
    const h = game.heroes[v.hero], sh = (game.shake || 0) * 5, key = v.shared ? "s" : v.hero;
    let tx = h.fx + 5, ty = h.fy + H - 4;
    if (v.shared) { const o = game.heroes[1]; tx = (tx + o.fx + 5) / 2; ty = (ty + o.fy + H - 4) / 2; }
    const c = cams[key] && cams[key].lv === lv && Math.hypot(cams[key].x - tx, cams[key].y - ty) < 400 ? cams[key]
      : (cams[key] = {lv, x: tx, y: ty, fresh: true});
    if (c.fresh && v.shared && cams[0] && cams[0].lv === lv) { c.x = cams[0].x; c.y = cams[0].y; }  // glide in from P1's view
    if (c.fresh && !v.shared && cams.s && cams.s.lv === lv) { c.x = cams.s.x; c.y = cams.s.y; }  // and back out again
    c.fresh = false;
    const ease = two ? .22 : .35;  // the camera glides after the hero instead of being bolted to them
    c.x += (tx - c.x) * ease; c.y += (ty - c.y) * ease;
    const cx = c.x + (Math.random() - .5) * sh, cy = c.y + (Math.random() - .5) * sh;
    // the scene is drawn at whole pixels from (sx0, sy0); the leftover fraction slides the finished image on the
    // GPU, so the view scrolls smoothly instead of stepping a whole pixel at a time
    const fx = clamp(cx - (cw - 1) / 2, 0, lv.W - cw), fy = clamp(cy - (ch - 1) / 2, 0, lv.SH - ch);
    const sx0 = Math.floor(fx), sy0 = Math.floor(fy);
    v.off = [(fx - sx0) * PIXEL, (fy - sy0) * PIXEL];
    v.sx0 = fx; v.sy0 = fy;  // kept so a mouse position can be turned back into a spot in the maze
    frameEm = [];
    compose(game, sx0, sy0, cw, ch, time, lv.seen[v.hero]); lap("compose");
    quantizeRegion(sx0, sy0, cw, ch, lv.seen[v.hero]);
    lightGrid(cw, ch, v.cols, GH, v.gx0, sx0, sy0); lap("light grid");
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {  // the lit pixel-art layer
      const q = (y * cw + x) * 3, o = (y * texW + v.texX + x) * 4;
      sceneBuf[o] = Math.min(GAM[qbuf[q]] * ART.glyphBoost, 1) * 255;
      sceneBuf[o + 1] = Math.min(GAM[qbuf[q + 1]] * ART.glyphBoost, 1) * 255;
      sceneBuf[o + 2] = Math.min(GAM[qbuf[q + 2]] * ART.glyphBoost, 1) * 255;
      const m = mbuf[y * cw + x];
      sceneBuf[o + 3] = m === MAT.FLOOR || m === MAT.BEAM ? 255 : 0;  // open floor: the only place god rays may fall
    }
    v.outX = v.gx0 * B; v.w = v.cols * B;
  }
  for (const k of Object.keys(cams)) if (!views.some(w => (w.shared ? "s" : String(w.hero)) === k)) delete cams[k];
  // bloom: bright-pass and blur the block grid, the GPU stretches it smoothly over the screen
  if (ART.bloom > 0) {
    const R = ART.bloomRadius | 0;
    for (let i = 0; i < bloomG.length; i++) bloomG[i] = Math.max(0, bloomG[i] - .3) * 1.4;
    for (let pass = 0; pass < 2; pass++) {
      const [src, dst] = pass ? [bloomT, bloomG] : [bloomG, bloomT];
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) for (let c = 0; c < 3; c++) {
        let s = 0, n = 0;
        for (let k = -R; k <= R; k++) {
          const xx = pass ? x : x + k, yy = pass ? y + k : y;
          if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
          s += src[(yy * GW + xx) * 3 + c]; n++;
        }
        dst[(y * GW + x) * 3 + c] = s / n;
      }
    }
    for (let i = 0, j = 0; i < bloomG.length; i += 3, j += 4) { bloomBuf[j] = Math.min(bloomG[i], 1) * 255; bloomBuf[j + 1] = Math.min(bloomG[i + 1], 1) * 255; bloomBuf[j + 2] = Math.min(bloomG[i + 2], 1) * 255; }
    uploadBloom(bloomBuf, GW, GH);
  }
  uploadLight(lightBuf, GW, GH);
  uploadScene(sceneBuf, texW, SCENE_H, views.map(v => [v.outX, v.w, v.texX]), views.map(v => v.off));
  // each lantern on screen, for the fog's reach and the god rays; a flare throws it wider and brighter
  const lamps = game.heroes.map((h, i) => {
    const v = views.find(w => w.hero === i || w.shared);
    if (!v || h.down) return [0, 0, 1, 0];
    const [lx, ly] = lanternAt(h);
    return [v.outX + (lx - v.sx0) * PIXEL - v.off[0], (ly + H - v.sy0) * PIXEL - v.off[1], h.lightR * PIXEL, Math.min(1.6, h.lightP / 1.3)];
  });
  drawGL(time, Math.max(0, ...game.heroes.map(h => h.hurtFlash || 0)), lamps);
  lap("gpu");
  return views;
}

// ------------------------------------------------------------------ text
// Every word in the game is set in one book serif, bold capitals drawn smoothly, the same face as the tarot cards.
// sc keeps the old pixel-font sizing (a capital is about 5 sc tall) so layouts stay where they were; the text sits
// on the same baseline the pixel glyphs did.
export const UI_FONT = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, "Times New Roman", serif';
export const textMin = {sc: 1};  // touch.js raises this on phones, where the smallest text would be unreadable
const measure = document.createElement("canvas").getContext("2d");
function setFont(ctx, sc) {
  ctx.font = `bold ${Math.round(sc * 5.8)}px ${UI_FONT}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${(sc * .35).toFixed(1)}px`;
}
export function text(ctx, s, x, y, col, sc = 3, shadow = "#000") {
  s = String(s).toUpperCase(); sc = Math.max(sc, textMin.sc);
  setFont(ctx, sc);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const base = y + sc * 5, maxW = OUT_W - Math.max(0, x) - 8;
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(s, x + Math.max(1, sc * .45), base + Math.max(1, sc * .45), maxW); }
  ctx.fillStyle = col; ctx.fillText(s, x, base, maxW);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}
export const textW = (s, sc = 3) => {
  sc = Math.max(sc, textMin.sc);
  setFont(measure, sc);
  return Math.min(OUT_W - 16, measure.measureText(String(s).toUpperCase()).width);
};
export const textC = (ctx, s, cx, y, col, sc = 3) => text(ctx, s, Math.round(cx - textW(s, sc) / 2), y, col, sc);
