// Real-time combat: each class's attack (fireballs, arrows, sword swings), enemy bullet patterns, hits and kills.
// Fireballs and bullets glow, so they light the corridors they pass through; arrows fly dark.
import {T} from "./art.js";
import {sfx} from "./audio.js";
import {gainXp, XP} from "./items.js";
import {CLASSES} from "./heroes.js";
import {think, burstBloater, keepApart} from "./foes.js";
import {statOf} from "./stats.js";

// every creature: hit points, glow colour, body radius (for hits), and for chargers how they charge.
// Bosses carry a name for their health bar.
export const FOE = {
  spitter: {hp: 3, col: [.55, 1, .3], range: 125, every: 1.8, r: 8},
  wisp: {hp: 4, col: [.85, .45, 1], range: 115, every: 2.6, r: 7},
  crawler: {hp: 2, col: [.7, .5, .25], r: 7},
  bloater: {hp: 3, col: [.7, .85, .3], r: 7},
  brute: {hp: 8, col: [.55, .7, .45], r: 10, chargeSpeed: 150, chargeTime: 1, stun: 1.1},
  lurker: {hp: 3, col: [.6, .45, .9], r: 6},
  hulk: {hp: 45, col: [1, .55, .2], r: 16, chargeSpeed: 175, chargeTime: 1.4, stun: 1.4, boss: "THE RUST HULK"},
  brood: {hp: 60, col: [.8, .9, .4], r: 16, boss: "THE BROOD MOTHER"},
  warden: {hp: 80, col: [.4, .95, 1], r: 14, boss: "THE WISP WARDEN"},
  king: {hp: 150, col: [.95, .3, .3], r: 15, chargeSpeed: 165, chargeTime: 1.2, stun: 1.2, boss: "THE LAMPLESS KING"},
};
const radiusOf = t => t.type ? FOE[t.type].r : 7;

export function makeFoes(lv) {
  return lv.foes.map(f => ({type: f.type, x: f.tx * T + 8, y: f.ty * T + 8, hp: FOE[f.type].hp, vault: f.vault, asleep: f.vault !== undefined,
    cd: 1 + Math.random() * 1.5, flash: 0, ph: Math.random() * 6.28}));
}

export const heroCenter = h => [h.fx + 5, h.fy - 4];
// how far away creatures notice a hero: hunters are quiet, templars clank
export const noiseOf = h => (CLASSES[h.cls] || CLASSES.mage).noise * (1 - Math.min(.7, statOf(h, "stealth")));

function lineOfSight(lv, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2);
  for (let i = 1; i < n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    if (lv.solid[(y | 0) * lv.W + (x | 0)]) return false;
  }
  return true;
}
function nearestHero(game, x, y) {
  let best = null;
  game.heroes.forEach((h, i) => {
    if (h.down) return;  // enemies leave a fallen hero alone
    const [hx, hy] = heroCenter(h), d = Math.hypot(hx - x, hy - y);
    if (!best || d < best.d) best = {h, i, d, hx, hy};
  });
  return best;
}

// each class attacks its own way; returns the cooldown before the next attack, or 0 if it couldn't attack
export function attack(game, h) {
  const cls = CLASSES[h.cls] || CLASSES.mage, [hx, hy] = heroCenter(h), ax = h.aimX, ay = h.aimY;
  const power = h.power * (1 + statOf(h, "dmg"));  // tarot cards and gear add their harm
  if (h.cls === "templar") {  // a wide sword swing in front: heavy damage and a hard shove
    let hits = 0;
    for (const t of [...game.foes, ...game.rats]) {
      const dx = t.x - hx, dy = t.y - hy, d = Math.hypot(dx, dy);
      if (d < 19 + radiusOf(t) && (d < 6 + radiusOf(t) || (dx * ax + dy * ay) / d > .35 - .5 * statOf(h, "swingArc"))) { damageFoe(game, t, power * 2.5, h, [ax * 900, ay * 900]); hits++; }
    }
    // the blade itself sweeps across, forehand then backhand; a swing that connects jolts the screen a little
    h.swingDir = -(h.swingDir || 1);
    game.swings.push({x: hx, y: hy, ang: Math.atan2(ay, ax), t: 0, blade: true, dir: h.swingDir, hero: h, arc: .95 + .5 * statOf(h, "swingArc")});
    if (hits) game.shake = Math.max(game.shake || 0, .18);
    sfx("swing", {pan: game.panOf(hx)});
    return cls.fireEvery;
  }
  if (h.cls === "hunter") {  // arrows cost no oil, fly fast and far, and go through a creature or two
    const angs = statOf(h, "twinShot") ? [-.1, .1] : [0], a0 = Math.atan2(ay, ax);
    for (const o of angs) game.shots.push({x: hx + ax * 5, y: hy + ay * 5, vx: Math.cos(a0 + o) * 280, vy: Math.sin(a0 + o) * 280, life: 1, hero: true,
      owner: h, kind: "arrow", col: [.95, .85, .6], dmg: power * 1.2, pierce: 2 + statOf(h, "pierce"), hits: []});
    sfx("bow", {pan: game.panOf(hx)});
    return cls.fireEvery * (1 - Math.min(.6, statOf(h, "drawSpeed")));
  }
  // the mage hurls a fireball, paid for in mana
  const cost = 1.2 * (1 - Math.min(.8, statOf(h, "cheapCast")));
  if (h.oil <= cost) return 0;
  h.oil -= cost;
  const blaze = h.buffs.blaze > 0;
  game.shots.push({x: hx + ax * 5, y: hy + ay * 5, vx: ax * 150, vy: ay * 150, life: 1.1, hero: true, owner: h, kind: "fire",
    col: blaze ? [1, .35, .1] : [1, .58, .18], dmg: power * 1.5 * (blaze ? 2 : 1), splash: 1 + statOf(h, "splash"), burn: 2.5 * (1 + statOf(h, "burn"))});
  sfx("fireball", {pan: game.panOf(hx)});
  return cls.fireEvery;
}
// a fireball bursts where it lands, scorching everything close and setting it alight
function explode(game, s) {
  for (const t of [...game.foes, ...game.rats]) {
    const d = Math.hypot(t.x - s.x, t.y - s.y);
    if (d < (11 + radiusOf(t)) * (s.splash || 1)) { t.burn = s.burn || 2.5; t.burner = s.owner; if (d > 4) damageFoe(game, t, s.dmg * .5, s.owner, null, true); }
  }
  for (let k = 0; k < 3; k++) game.burst(s.x, s.y, [1, .5 + k * .15, .15]);
  game.shake = Math.max(game.shake, .25);
  sfx("boom", {pan: game.panOf(s.x)});
}

export function spit(game, x, y, ang, speed, col) {
  game.shots.push({x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 3, hero: false, col});
}

const SILVER = {rat: 1, crawler: 1, spitter: 2, bloater: 2, wisp: 3, lurker: 3, brute: 5, hulk: 40, brood: 45, warden: 55, king: 0};
function kill(game, t, owner) {
  const {x, y} = t, kind = t.type || "rat";
  if (kind === "bloater" && !t.burst) { t.burst = true; burstBloater(game, t); }
  // the body breaks apart: chips of its own colour fly, fall and settle, and a puff of dust hangs a moment
  const body = kind === "rat" ? [[.32, .3, .4], [.5, .45, .6]] : [FOE[kind].col, FOE[kind].col.map(v => v * .55)];
  game.puff("debris", x, y, FOE[kind] && FOE[kind].boss ? 40 : 12, body, FOE[kind] && FOE[kind].boss ? 1.6 : 1);
  game.puff("dust", x, y, 5, [[.4, .37, .32], [.3, .28, .25]], 1.2);
  game.puff("spark", x, y, 6, kind === "rat" ? [1, .4, .35] : FOE[kind].col);
  sfx("kill", {pan: game.panOf(x)});
  if (owner) {
    owner.kills = (owner.kills || 0) + 1; gainXp(game, owner, XP[kind]); owner.oil = Math.min(100, owner.oil + statOf(owner, "deathFuel"));
    if (owner.hp < owner.maxHp && Math.random() < statOf(owner, "killHeal")) { owner.hp++; game.burst(owner.fx + 5, owner.fy - 6, [1, .35, .35]); }  // Blood Pact
  }
  // silver: more from bigger creatures, more with luck, double on the thorny way
  const thorny = game.floorMods && game.floorMods[game.level] === "thorns";
  game.addSilver(Math.round((SILVER[kind] || 1) * (1 + (owner ? statOf(owner, "silver") : 0)) * (thorny ? 2 : 1) * (.7 + Math.random() * .6)), x, y);
  const lv = game.lv, tx = x / T | 0, ty = y / T | 0, luck = 1 + (owner ? statOf(owner, "drop") : 0), r = Math.random() / luck;
  if (FOE[kind] && FOE[kind].boss) { game.dropGear(x - 8, y, 1); game.dropGear(x + 8, y, 1); }  // a boss always leaves fine gear
  else if (Math.random() < .035 * luck) game.dropGear(x, y, 0);
  if (lv.g[ty * lv.MW + tx]) return;
  // sometimes drops oil, and now and then a tonic or slate
  if (r < .3) lv.oils.push({tx, ty, taken: false});
  else if (r < (kind === "rat" ? .36 : .45)) lv.loot.push({tx, ty, kind: Math.random() < .55 ? "tonic" : "rune", idx: Math.random() * 6 | 0, taken: false});
  game.lightsDirty = true;
}
// a hit from a bolt or a blast; rats flee when hurt, foes get knocked back by bolts
export function damageFoe(game, t, dmg, owner, push = null, quiet = false) {
  if (t.hp <= 0) return;
  t.hp -= dmg; t.flash = .12; t.asleep = false;  // a sleeping guard wakes when hit
  if (!t.type) t.flee = 3;
  if (push && t.type && !FOE[t.type].boss) { t.x += push[0] * .015; t.y += push[1] * .015; }  // bosses don't budge
  if (!quiet) {
    sfx("hit", {pan: game.panOf(t.x)});
    game.puff("spark", t.x, t.y, 4, [[1, .95, .8], [1, .75, .4]]);
    game.puff("debris", t.x, t.y, 2, t.type ? [FOE[t.type].col.map(v => v * .7)] : [[.3, .28, .36]]);
  }
  if (t.hp <= 0) kill(game, t, owner);
}

export function updateCombat(game, dt, live, time) {
  const lv = game.lv;
  for (const f of game.foes) {
    f.flash = Math.max(0, f.flash - dt);
    const n = nearestHero(game, f.x, f.y), spec = FOE[f.type];
    if (!n || f.asleep) continue;  // loot-room guards sleep until the room seals
    if (f.dazzle > 0) { f.dazzle -= dt; continue; }  // blinded by a lantern flare
    const ear = noiseOf(n.h);
    if (f.type !== "spitter" && f.type !== "wisp") { think(game, f, n, dt, live, ear); continue; }
    if (f.type === "wisp" && live && n.d < 170 * ear && n.d > 1) {  // drifts through walls to hover a little way off, circling
      const ux = (n.hx - f.x) / n.d, uy = (n.hy - f.y) / n.d, toward = n.d > 46 ? 16 : n.d < 32 ? -20 : 0;
      f.x += (ux * toward - uy * 12) * dt; f.y += (uy * toward + ux * 12) * dt;
    }
    const sees = f.type === "wisp" || lineOfSight(lv, f.x, f.y - 2, n.hx, n.hy);
    if (!live || n.d > spec.range * Math.min(1.25, ear) || !sees) { f.cd = Math.max(f.cd, .6); continue; }
    f.cd -= dt;
    if (f.cd > 0) continue;
    f.cd = spec.every;
    if (f.type === "spitter") {  // three-way spread aimed at you
      const a = Math.atan2(n.hy - f.y, n.hx - f.x);
      for (const o of [-.32, 0, .32]) spit(game, f.x, f.y - 2, a + o, 70, spec.col);
    } else {  // a turning ring of eight
      f.ph += .4;
      for (let k = 0; k < 8; k++) spit(game, f.x, f.y, f.ph + k * Math.PI / 4, 52, spec.col);
    }
    sfx("spit", {vol: Math.max(.3, 1 - n.d / 150), pan: game.panOf(f.x)});
  }
  for (const s of game.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    const xi = s.x | 0, yi = s.y | 0;
    if (xi < 0 || yi < 0 || xi >= lv.W || yi >= lv.WH || lv.solid[yi * lv.W + xi]) { s.dead = true; if (s.kind === "fire") explode(game, s); continue; }
    if (s.hero) {
      for (const t of [...game.rats, ...game.foes]) if (t.hp > 0 && Math.hypot(t.x - s.x, t.y - s.y) < radiusOf(t) && !(s.hits && s.hits.includes(t))) {
        damageFoe(game, t, s.dmg, s.owner, [s.vx, s.vy]);
        if (s.kind === "arrow" && s.pierce-- > 0) { s.hits.push(t); continue; }  // an arrow carries on through
        s.dead = true;
        if (s.kind === "fire") explode(game, s);
        break;
      }
    } else if (live) {
      game.heroes.forEach((h, i) => {
        const [hx, hy] = heroCenter(h);
        if (!s.dead && Math.hypot(hx - s.x, hy - s.y) < 4.5 && (game.hurt(h, i, 1, s) || game.blocked)) s.dead = true;
      });
    }
  }
  if (live) keepApart(game);
  game.shots = game.shots.filter(s => !s.dead && s.life > 0);
  // burning creatures keep taking damage; the mage's fire trail sets alight whatever walks through it
  for (const fire of game.fires) {
    fire.t -= dt;
    for (const t of [...game.foes, ...game.rats]) if (Math.hypot(t.x - fire.x, t.y - fire.y) < 9) { t.burn = Math.max(t.burn || 0, 1.5); t.burner = fire.owner; }
  }
  game.fires = game.fires.filter(f => f.t > 0);
  for (const t of [...game.foes, ...game.rats]) if (t.burn > 0) {
    t.burn -= dt; t.burnT = (t.burnT || 0) + dt;
    if (t.burnT >= .5) { t.burnT = 0; damageFoe(game, t, .4, t.burner, null, true); }
  }
  for (const w of game.swings) w.t += dt;
  game.swings = game.swings.filter(w => w.t < .26);
  game.foes = game.foes.filter(f => f.hp > 0);
  game.rats = game.rats.filter(r => r.hp > 0);
}

// fireballs, wisps and waking bosses light the maze around them
export function combatLights(game) {
  // only fireballs and wisps light the maze: every light is ray-cast each frame, so a spitter's spray or a wisp's
  // ring of eight casting its own light made the game stutter; enemy bullets still glow, they just don't light
  const out = [];
  for (const s of game.shots) if (s.kind === "fire") out.push({x: s.x, y: s.y, r: 34, col: s.col});
  for (const f of game.foes) if (f.type === "wisp") out.push({x: f.x, y: f.y, r: 20, col: FOE.wisp.col.map(v => v * .5)});
  for (const f of game.foes) if (FOE[f.type].boss && !f.asleep) out.push({x: f.x, y: f.y, r: 48, col: FOE[f.type].col.map(v => v * .7)});  // a boss is always seen
  return out;
}
