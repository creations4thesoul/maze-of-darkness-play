// How the newer creatures and the bosses behave. Spitters and wisps live in combat.js; everything here walks the
// maze (using the rats' distance-to-hero map to find its way) or, for the Warden, floats and blinks.
import {T} from "./art.js";
import {sfx} from "./audio.js";
import {spit, FOE, damageFoe} from "./combat.js";
import {lightAt} from "./light.js";

const ARENA_MAX = 6;  // most crawlers or lurkers a boss keeps around at once

// move with walls in the way: a small box around the creature's middle must stay clear of stone
function move(lv, f, dx, dy) {
  const b = Math.min(5, FOE[f.type].r - 2), free = (x, y) => [[-b, -b], [b, -b], [-b, b], [b, b]]
    .every(([ox, oy]) => { const xi = (x + ox) | 0, yi = (y + oy) | 0; return xi >= 0 && yi >= 0 && xi < lv.W && yi < lv.WH && !lv.solid[yi * lv.W + xi]; });
  let moved = false;
  if (dx && free(f.x + dx, f.y)) { f.x += dx; moved = true; }
  if (dy && free(f.x, f.y + dy)) { f.y += dy; moved = true; }
  if (dx) f.dx = Math.sign(dx);
  return moved;
}
// walk toward the nearest hero along the maze, using the distance map the rats share
function seek(game, f, n, speed, dt) {
  const lv = game.lv, {MW} = lv, d = game.dist, tx = f.x / T | 0, ty = f.y / T | 0;
  let gx = n.hx, gy = n.hy;
  if (d && d[ty * MW + tx] > 1) {
    let best = ty * MW + tx;
    for (const j of [best - 1, best + 1, best - MW, best + MW]) if (d[j] >= 0 && d[j] < d[best]) best = j;
    gx = (best % MW) * T + 8; gy = (best / MW | 0) * T + 8;
  }
  const l = Math.hypot(gx - f.x, gy - f.y) || 1;
  return move(lv, f, (gx - f.x) / l * speed * dt, (gy - f.y) / l * speed * dt);
}
const ring = (game, f, n, speed, col, ph = 0) => { for (let k = 0; k < n; k++) spit(game, f.x, f.y, ph + k * Math.PI * 2 / n, speed, col); };
const aimAt = (f, n) => Math.atan2(n.hy - f.y, n.hx - f.x);
const sees = (lv, f, n) => {
  const steps = Math.ceil(n.d / 3);
  for (let i = 1; i < steps; i++) { const x = f.x + (n.hx - f.x) * i / steps, y = f.y + (n.hy - f.y) * i / steps; if (lv.solid[(y | 0) * lv.W + (x | 0)]) return false; }
  return true;
};
// Every attack is telegraphed and only its strike can hurt, so a careful player can read it, step away or roll
// through, and punish the recovery. States: "wind" (rearing back, glowing red), "strike", "recover" for melee;
// "cwind", "charge", "stun" for charges.
const SLASH = [1, .4, .3];
// a charge: wind up, then run straight until something stops it; it can hit once on the way
function charge(game, f, n, dt, spec, onWall) {
  if (f.state === "cwind") {
    f.t -= dt;
    if (f.t <= 0) { f.state = "charge"; f.t = spec.chargeTime; f.hit = false; sfx("roll", {pan: game.panOf(f.x)}); }
    return true;
  }
  if (f.state === "charge") {
    f.t -= dt;
    if (!f.hit && n.d < spec.r + 6) f.hit = game.hurt(n.h, n.i, 2, f) || true;
    if (!move(game.lv, f, Math.cos(f.ang) * spec.chargeSpeed * dt, Math.sin(f.ang) * spec.chargeSpeed * dt) || f.t <= 0) {
      f.state = "stun"; f.t = spec.stun; game.shake = Math.max(game.shake, spec.boss ? .9 : .4);
      sfx("boom", {pan: game.panOf(f.x)});
      if (onWall) onWall();
    }
    return true;
  }
  if (f.state === "stun") { f.t -= dt; if (f.t <= 0) f.state = "walk"; return true; }
  return false;
}
const startCharge = (f, n, wind) => { f.state = "cwind"; f.t = wind; f.ang = aimAt(f, n); };

// the melee cycle: hold a set distance (circling a little), then wind up, strike, and recover while backing off.
//   o.keep: distance held   o.speed: walking speed   o.wind / o.strike / o.recover: how long each part lasts
//   o.lunge: speed of a lunging strike   o.arc + o.reach: a sweeping slash instead   o.dmg   o.cd: rest between attacks
function melee(game, f, n, dt, o) {
  const lv = game.lv, away = () => { const l = n.d || 1; move(lv, f, -(n.hx - f.x) / l * o.speed * .7 * dt, -(n.hy - f.y) / l * o.speed * .7 * dt); };
  f.cd -= dt;
  if (f.state === "wind") {
    f.t -= dt;
    if (f.t > 0) return true;
    f.state = "strike"; f.t = o.strike; f.hit = false;
    sfx(o.arc ? "swing" : "bite", {pan: game.panOf(f.x)});
    if (o.arc) {  // a sweeping slash: everything in the arc in front is hit at once
      game.swings.push({x: f.x, y: f.y, ang: f.ang, t: 0, col: SLASH, r0: Math.max(6, o.reach - 14), r1: o.reach, arc: o.arc / 2});
      const da = Math.abs(((aimAt(f, n) - f.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (n.d < o.reach + 4 && da < o.arc / 2) game.hurt(n.h, n.i, o.dmg, f);
      if (o.onSlash) o.onSlash();
    }
    return true;
  }
  if (f.state === "strike") {
    f.t -= dt;
    if (o.lunge) move(lv, f, Math.cos(f.ang) * o.lunge * dt, Math.sin(f.ang) * o.lunge * dt);
    if (!o.arc && !f.hit && n.d < FOE[f.type].r + 6) f.hit = game.hurt(n.h, n.i, o.dmg, f) || true;
    if (f.t <= 0) { f.state = "recover"; f.t = o.recover; f.cd = o.cd * (.8 + Math.random() * .4); }
    return true;
  }
  if (f.state === "recover") { f.t -= dt; if (n.d < o.keep) away(); if (f.t <= 0) f.state = "walk"; return true; }
  // walking: close to the holding distance, edge sideways a little, and attack once rested and in sight
  if (n.d > o.keep + 6) seek(game, f, n, o.speed, dt);
  else {
    if (n.d < o.keep - 4) away();
    f.side = f.side || (Math.random() < .5 ? 1 : -1);
    const l = n.d || 1;
    if (!move(lv, f, -(n.hy - f.y) / l * f.side * o.speed * .35 * dt, (n.hx - f.x) / l * f.side * o.speed * .35 * dt)) f.side = -f.side;
    if (f.cd <= 0 && sees(lv, f, n)) { f.state = "wind"; f.t = o.wind; f.ang = aimAt(f, n); sfx("squeak", {vol: .5, pan: game.panOf(f.x)}); }
  }
  return false;
}
// how lit a creature is on the side facing the hero (its own body shades its far side)
export const litSide = (lv, f, n) => {
  const l = n.d || 1, r = FOE[f.type].r * .8;
  return lightAt(lv, f.x + (n.hx - f.x) / l * r, f.y + (n.hy - f.y) / l * r);
};
const isAttacking = f => f.state === "wind" || f.state === "strike" || f.state === "recover" || f.state === "cwind" || f.state === "charge" || f.state === "stun";

// creatures a boss calls up join its fight (and its arena's seal)
function summon(game, f, type, count) {
  const mine = game.foes.filter(o => o.summoner === f && o.hp > 0).length;
  for (let k = 0; k < Math.min(count, ARENA_MAX - mine); k++) {
    const a = Math.random() * 6.28, x = f.x + Math.cos(a) * 20, y = f.y + Math.sin(a) * 20;
    if (game.lv.solid[(y | 0) * game.lv.W + (x | 0)]) continue;
    game.foes.push({type, x, y, hp: FOE[type].hp, vault: f.vault, summoner: f, cd: 1, flash: 0, ph: 0, state: "walk", t: 0});
    game.burst(x, y, FOE[type].col);
  }
}

// one creature's turn; n is its nearest standing hero. Nothing hurts on contact: only telegraphed strikes,
// charges and bullets do.
export function think(game, f, n, dt, live, ear) {
  const lv = game.lv, spec = FOE[f.type];
  f.state = f.state || "walk"; f.t = f.t || 0; f.cd = f.cd || 0;
  if (!live) return;
  switch (f.type) {
    case "crawler":  // skitters in, rears up, and darts forward to bite
      if (isAttacking(f) || n.d < 150 * ear)
        melee(game, f, n, dt, {keep: 26, speed: 50, wind: .38, strike: .2, lunge: 150, recover: .55, cd: 1.3, dmg: 1});
      break;
    case "bloater":  // waddles close, swells, and bursts (its swelling is the warning)
      if (f.fuse > 0) { f.fuse -= dt; if (f.fuse <= 0) { f.burst = true; burstBloater(game, f); f.hp = 0; } break; }
      if (n.d < 130 * ear) seek(game, f, n, 17, dt);
      if (n.d < 20) { f.fuse = .7; f.state = "wind"; sfx("spit", {pan: game.panOf(f.x)}); }
      break;
    case "brute": {  // the troll: charges from afar, and up close raises its club for a heavy sweep
      if (charge(game, f, n, dt, spec)) break;
      f.cd2 = (f.cd2 || 0) - dt;
      if (!isAttacking(f) && n.d > 70 && n.d < 130 && f.cd2 <= 0 && sees(lv, f, n)) { startCharge(f, n, .7); f.cd2 = 4; break; }
      if (isAttacking(f) || n.d < 150 * ear)
        melee(game, f, n, dt, {keep: 30, speed: 22, wind: .6, strike: .18, arc: 1.9, reach: 32, lunge: 40, recover: .8, cd: 1.7, dmg: 2});
      break;
    }
    case "lurker": {  // a shadow creature: unseen in the dark, it burns in strong light and slinks back out of it,
      // so it waits at the edge of your lantern, or creeps up through the shadows other creatures throw, then lunges
      const lit = litSide(lv, f, n);
      f.shown = lit > .3 || n.d < 26 || isAttacking(f);
      if (lit > .45 && !isAttacking(f)) {
        f.scorch = (f.scorch || 0) + dt * 1.6 * Math.min(2, lit);
        if (f.scorch >= 1) { f.scorch -= 1; damageFoe(game, f, 1, n.h, null, true); sfx("sizzle", {pan: game.panOf(f.x)}); }
        if (Math.random() < dt * 14) game.puff("dust", f.x, f.y - 4, 1, [[.16, .1, .24], [.3, .2, .45]], .6);
        const l = n.d || 1;
        move(lv, f, -(n.hx - f.x) / l * 46 * dt, -(n.hy - f.y) / l * 46 * dt);
        break;
      }
      if (isAttacking(f) || n.d < 110 * ear)
        melee(game, f, n, dt, {keep: 48, speed: 24, wind: .32, strike: .32, lunge: 170, recover: 1, cd: 2.2, dmg: 1});
      break;
    }

    case "hulk": {  // THE RUST HULK: charges into walls; up close it slams down, shaking loose a ring of rust
      if (charge(game, f, n, dt, spec, () => ring(game, f, 14, 58, spec.col, Math.random()))) break;
      f.cd2 = (f.cd2 || 2.5) - dt; f.t2 = (f.t2 || 2) - dt;
      if (!isAttacking(f) && f.cd2 <= 0 && n.d > 50) { startCharge(f, n, .8); f.cd2 = f.hp < spec.hp / 2 ? 2.6 : 3.6; break; }
      if (!isAttacking(f) && f.t2 <= 0) { f.t2 = 2; const a = aimAt(f, n); for (const o of [-.2, 0, .2]) spit(game, f.x, f.y, a + o, 80, spec.col); sfx("spit"); }
      melee(game, f, n, dt, {keep: 40, speed: 18, wind: .75, strike: .2, arc: 2.4, reach: 42, recover: 1, cd: 2.2, dmg: 2,
        onSlash: () => ring(game, f, 10, 50, spec.col, Math.random())});
      break;
    }
    case "brood": {  // THE BROOD MOTHER: births crawlers, spits fans, spirals once wounded, and sweeps a claw at anyone close
      f.t1 = (f.t1 || 4.5) - dt; f.t2 = (f.t2 || 2) - dt; f.t3 = (f.t3 || 5) - dt;
      if (f.t1 <= 0) { f.t1 = 4.5; summon(game, f, "crawler", 2); sfx("squeak"); }
      if (!isAttacking(f) && f.t2 <= 0) { f.t2 = 2.2; const a = aimAt(f, n); for (let k = -2; k <= 2; k++) spit(game, f.x, f.y, a + k * .22, 66, spec.col); sfx("spit"); }
      if (f.hp < spec.hp / 2) {
        if (f.t3 <= 0) { f.spin = 2; f.t3 = 5; }
        if (f.spin > 0) { f.spin -= dt; f.ph += dt * 3.2; f.st = (f.st || 0) - dt; if (f.st <= 0) { f.st = .12; spit(game, f.x, f.y, f.ph, 55, spec.col); spit(game, f.x, f.y, f.ph + Math.PI, 55, spec.col); } }
      }
      if (isAttacking(f) || n.d < 52) melee(game, f, n, dt, {keep: 44, speed: 7, wind: .7, strike: .2, arc: 2.6, reach: 48, recover: .8, cd: 2.5, dmg: 1});
      else if (n.d > 60) seek(game, f, n, 7, dt);
      break;
    }
    case "warden": {  // THE WISP WARDEN: blinks around its arena and fills it with patterns of light
      f.cd -= dt; f.t2 = (f.t2 || 1) - dt;
      if (f.cd <= 0) {
        f.cd = f.hp < spec.hp / 2 ? 3 : 4.2;
        const vt = lv.vaults[f.vault], spots = [];
        if (vt) for (let y = vt.y; y < vt.y + vt.h; y++) for (let x = vt.x; x < vt.x + vt.w; x++)
          if (!lv.g[y * lv.MW + x] && Math.hypot(x * T + 8 - n.hx, y * T + 8 - n.hy) > 40) spots.push([x, y]);
        if (spots.length) { game.burst(f.x, f.y, spec.col); const [x, y] = spots[Math.random() * spots.length | 0]; f.x = x * T + 8; f.y = y * T + 8; game.burst(f.x, f.y, spec.col); sfx("rune"); }
        f.pattern = ((f.pattern || 0) + 1) % 3; f.pt = 2.4;
      }
      f.pt = (f.pt || 0) - dt; f.ph += dt * 2.6;
      if (f.pt > 0 && f.t2 <= 0) {
        if (f.pattern === 0) { f.t2 = .1; for (let k = 0; k < 3; k++) spit(game, f.x, f.y, f.ph + k * 2.094, 60, spec.col); }       // a three-armed spiral
        else if (f.pattern === 1) { f.t2 = .45; ring(game, f, 4, 75, [1, .35, .9], f.ph); ring(game, f, 4, 55, spec.col, f.ph + .78); }  // turning crossfire
        else { f.t2 = .7; const a = aimAt(f, n); for (const o of [-.3, -.15, 0, .15, .3]) spit(game, f.x, f.y, a + o, 90, spec.col); }  // aimed fans
      }
      break;
    }
    case "king": {  // THE LAMPLESS KING: three phases, the last snuffing out your light
      const phase = f.hp > spec.hp * .66 ? 1 : f.hp > spec.hp * .33 ? 2 : 3;
      if (phase !== f.phase) {
        f.phase = phase;
        if (phase > 1) { game.toast(phase === 2 ? "THE KING RISES IN FURY" : "THE KING DRINKS THE LIGHT", "#ff5a5a", "boom"); game.shake = 1; }
      }
      game.darkness = phase === 3 ? .45 : 0;
      if (charge(game, f, n, dt, spec, () => ring(game, f, 16, 60, spec.col, Math.random()))) break;
      f.cd2 = (f.cd2 || 3) - dt; f.t2 = (f.t2 || 2) - dt; f.t3 = (f.t3 || 4) - dt; f.ph += dt * (phase === 3 ? 3.4 : 2);
      if (f.t2 <= 0) { f.t2 = phase === 3 ? 1.6 : 2.4; ring(game, f, phase === 1 ? 12 : 16, 52, spec.col, f.ph); sfx("spit"); }
      if (f.t3 <= 0) { f.t3 = phase === 1 ? 6 : 5; summon(game, f, phase === 2 ? "crawler" : "lurker", phase === 3 ? 3 : 2); }
      if (phase >= 2) { f.st = (f.st || 0) - dt; if (f.st <= 0) { f.st = phase === 3 ? .09 : .16; spit(game, f.x, f.y, f.ph, 58, [.95, .5, .5]); spit(game, f.x, f.y, -f.ph, 58, [.95, .5, .5]); } }
      if (phase === 2 && !isAttacking(f) && f.cd2 <= 0 && n.d > 50) { startCharge(f, n, .75); f.cd2 = 3.8; break; }
      melee(game, f, n, dt, {keep: 40, speed: phase === 3 ? 16 : 10, wind: .7, strike: .2, arc: 2.2, reach: 44, recover: .9, cd: 2.4, dmg: 2});
      break;
    }
  }
}

// no creature may stand inside a hero, and creatures don't pile into one heap
export function keepApart(game) {
  const lv = game.lv, float = f => f.type === "wisp" || f.type === "warden";
  for (const f of game.foes) {
    if (float(f)) continue;
    const r = FOE[f.type].r;
    for (const h of game.heroes) {
      if (h.down) continue;
      const hx = h.fx + 5, hy = h.fy - 4, dx = f.x - hx, dy = f.y - hy, d = Math.hypot(dx, dy) || .01, min = r + 5;
      if (d < min) move(lv, f, dx / d * (min - d), dy / d * (min - d));
    }
  }
  for (let i = 0; i < game.foes.length; i++) for (let j = i + 1; j < game.foes.length; j++) {
    const a = game.foes[i], b = game.foes[j];
    if (float(a) || float(b)) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, min = (FOE[a.type].r + FOE[b.type].r) * .75;
    if (d < min) { const k = (min - d) / 2; move(lv, a, -dx / d * k, -dy / d * k); move(lv, b, dx / d * k, dy / d * k); }
  }
}

// a bloater bursts: a blast close by and a ring of slow spores
export function burstBloater(game, f) {
  game.heroes.forEach((h, i) => { if (Math.hypot(h.fx + 5 - f.x, h.fy - 4 - f.y) < 24) game.hurt(h, i, 2, f); });
  ring(game, f, 8, 42, FOE.bloater.col, Math.random());
  for (let k = 0; k < 2; k++) game.burst(f.x, f.y, FOE.bloater.col);
  game.shake = Math.max(game.shake, .5);
  sfx("boom", {pan: game.panOf(f.x)});
}
