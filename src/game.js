// Game rules and screens: solo or co-op descent through ten growing depths, and local head to head.
import {T, OUT_W, OUT_H, ART, glowCol, OIL_COL} from "./art.js";
import {makeLevel} from "./level.js";
import {buildLights, lanterns, lightAt, stampOccluders, exposure, lanternAt} from "./light.js";
import {attach, updateFx, text, textC, textW} from "./render.js";
import {sfx, toggleMute} from "./audio.js";
import {regionOf, REGION_NAMES} from "./textures.js";
import {makeFoes, updateCombat, combatLights, attack, heroCenter, FOE, damageFoe} from "./combat.js";
import {CLASSES, CLASS_ORDER, COLOURS, ACCENTS, HAIRS, SKINS, LOOK_ROWS, DEFAULT_LOOKS, stylesOf, heroFrames, heroPalette, shadeHero} from "./heroes.js";
import {PIXEL, H as FACE_H, SPR, BASECOL} from "./art.js";
import {GATES, ABILITIES, ABILITY_ORDER, RELICS, RELIC_KINDS} from "./gates.js";
import {openGate, sealTile, FINAL_FLOOR} from "./level.js";
import {UNLOCKS, loadMeta, progress, applyUnlocks} from "./meta.js";
import {drawCards, synergyLines} from "./tarot.js";
import {makeGear, BAG_SIZE, RARITY, GEAR_ICONS} from "./gear.js";
import {statOf, refreshStats} from "./stats.js";
import {touch} from "./touch.js";
import {BUILD} from "./version.js";
import {updateCardDraw, drawCardDraw, openInventory, updateInventory, drawInventory} from "./menus.js";
import {openCrossroads, updateWay, drawWay} from "./waystations.js";
import {PACK, newLore, nameOf, lookOf, stow, useItem, xpNeed, BUFF, TONIC_LOOKS, RUNE_LOOKS} from "./items.js";
const BUFF_COL = {blaze: "#ff7a30", glow: "#ffe48a", swift: "#70f0b0", ward: "#9ad8ff"};

// the roll bursts out fast and eases off; a press just before it is ready is remembered
// the lantern flare: a gulp of oil for a blinding burst of light, then a wait before the next
const FLARE_OIL = 15, FLARE_TIME = .7, FLARE_CD = 5;
const FIDGET_TIME = {look: 1.1, lift: 1.4, settle: .7};  // how long each idle fidget lasts
const ROLL_TIME = .34, ROLL_BURST = 3.6, ROLL_END = 1.1, ROLL_COOLDOWN = .5, ROLL_BUFFER = .18, ROLL_GRACE = .1;
const HURT_INVULN = 1, ACCEL = 16, FRICTION = 20;  // how fast walking speeds up and slows down (per second)
import * as input from "./input.js";

const OIL_MAX = 100, OIL_FLASK = 40, DARK_GRACE = 6, SPEED = 70, STEP_PX = 11;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]]));
// what a hero carries from floor to floor in a descent
const CARRY = ["hp", "maxHp", "items", "sel", "xp", "lvl", "power", "kills", "buffs", "buffLook", "pack", "lens", "down",
  "deck", "gear", "bag", "bonusHp", "cardsDue", "drawMin", "synergies", "synSeen"];
const MENU = ["SOLO DESCENT", "CO-OP DESCENT", "HEAD TO HEAD", "UNLOCKS"], REVIVE_TIME = 1.5;
const ROMAN = n => ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][n] || String(n);
const C = {text: "#c4e2f0", dim: "#5d7aa0", key: ART.runeColor, warn: "#ff5a5a", oil: "#ffa040", p1: ART.rimP1, p2: ART.rimP2};

export class Game {
  constructor() {
    this.best = load("mod-best", 1);
    this.menu = 0;
    this.meta = loadMeta();
    // each player slot's chosen class and look, kept between sessions
    const saved = load("mod-looks", null);
    this.looks = DEFAULT_LOOKS.map((d, i) => Object.assign({}, d, saved && saved[i] && CLASSES[saved[i].cls] ? saved[i] : {}));
    this.newUnlocks = [];
    this.toasts = [];
    this.showFps = false;
    this.fps = 0;
    this.toTitle();
  }

  // ------------------------------------------------------------ setup
  loadLevel(n, versus, seed, players = versus ? 2 : 1) {
    this.lv = makeLevel(n, versus, seed);
    attach(this.lv);
    const starts = this.lv.starts;
    const looks = this.looks || DEFAULT_LOOKS;
    this.heroes = Array.from({length: players}, (_, i) => starts[Math.min(i, starts.length - 1)]).map(([tx, ty], i) => ({
      look: looks[i], lookKey: JSON.stringify(looks[i]), cls: looks[i].cls, pal: heroPalette(looks[i]), blocking: false,
      fx: tx * T + 3 + (starts.length > i ? 0 : 4), fy: ty * T + 9, face: i ? -1 : 1, oil: OIL_MAX, keys: 0, invuln: 0, hurtFlash: 0, dark: 0,
      lightR: ART.lanternRadius, lightP: ART.lanternPower, start: [tx, ty], walk: 0, stepAcc: 0, moving: false,
      region: regionOf(tx, ty), hp: CLASSES[looks[i].cls].hp, maxHp: CLASSES[looks[i].cls].hp, roll: 0, rollCd: 0, rollX: 1, rollY: 0, rollBuf: 0, ghosts: [], ghostT: 0,
      aimX: i ? -1 : 1, aimY: 0, fireCd: 0, kills: 0,
      items: [], sel: 0, xp: 0, lvl: 1, power: 1, pack: PACK, lens: 1, armed: true, down: false, revive: 0,
      deck: [], gear: {necklace: null, ring1: null, ring2: null, cloak: null, boots: null}, bag: [], bonusHp: 0, cardsDue: 0, saves: 0, regenT: 0, buffs: {blaze: 0, glow: 0, swift: 0, ward: 0}, buffLook: {}}));
    this.foes = makeFoes(this.lv);
    this.shots = []; this.fires = []; this.swings = []; this.parts = []; this.emberT = 0;
    this.lv.gearItems = [];  // gear lying on the floor until someone picks it up
    // each player remembers the tiles they have walked near; remembered tiles stay faintly visible
    // (co-op partners share one map memory)
    const mem = new Uint8Array(this.lv.MW * this.lv.MH);
    this.lv.seen = this.heroes.map((_, i) => versus && i ? new Uint8Array(this.lv.MW * this.lv.MH) : mem);
    this.rats = this.lv.rats.map(([tx, ty]) => ({x: tx * T + 8, y: ty * T + 8, tx, ty, nx: tx, ny: ty, face: "L", flee: 0, chasing: false, hp: 2, flash: 0}));
    this.exitGlow = false;
    this.darkness = 0;  // the Lampless King's last phase eats into every lantern
    this.lightsDirty = true;
    this.distT = 0;
    this.dist = null;
    this.toasts = [];
    this.bursts = [];
    this.shake = 0;
    this.fade = 1;
  }
  toTitle() { this.mode = "title"; this.state = "title"; this.lore = newLore(); this.floors = {}; this.abilities = new Set(); this.loadLevel(1, false, 11);
    for (const seen of this.lv.seen) seen.fill(1); }  // the title backdrop shows the whole first sewer, glows and all
  // gear falls to the floor, glowing faintly in its rarity's colour, until someone picks it up
  dropGear(x, y, minRarity) {
    this.lv.gearItems.push({x, y, item: makeGear(this.level || 1, minRarity), taken: false});
    this.lightsDirty = true;
  }

  // a descent (solo or co-op): hearts, level, pack, relics, abilities and what you've identified all carry
  // between floors, and every floor you leave is remembered, so you can climb back up and find it as you left it
  startSolo(n, newRun) { this.startRun(n, newRun, 1); }
  startRun(n, newRun, players = this.players || 1) {
    if (newRun) {
      this.runSeed = Math.random() * 1e6 | 0; this.lore = newLore(); this.floors = {}; this.abilities = new Set();
      this.players = players; this.killsSeen = 0; this.newUnlocks = [];
      this.silver = 0; this.burns = 0; this.route = {}; this.floorMods = {};  // the purse, and the ways taken down
    }
    this.mode = this.players > 1 ? "coop" : "solo";
    this.enterFloor(n, "down", newRun ? null : this.heroes.map(h => pick(h, CARRY)));
    if (newRun) applyUnlocks(this.meta, this);
    sfx("start");
  }
  enterFloor(n, from, keep, state) {
    this.level = n; this.state = "play"; this.banner = this.floors[n] ? 1.6 : 3;
    this.loadLevel(n, false, this.runSeed + n * 7919, this.players || 1);
    const lv = this.lv, saved = state || this.floors[n];
    this.heroes.forEach((h, i) => {
      if (keep && keep[i]) Object.assign(h, keep[i]);
      if (h.down) { h.down = false; h.hp = Math.max(2, h.hp); }  // a fallen partner gets back up on the next floor
      h.saves = statOf(h, "deathSave");  // Judgement spares you once each depth
      if (from === "up") { h.fx = lv.exit[0] * T + 3 + i * 4; h.fy = lv.exit[1] * T + 9; }  // up the ladder, out through this floor's grate
      h.armed = false;  // stairs and grate only work once you've stepped off them
    });
    if (saved) this.applyFloor(saved);
    else if (this.floorMods && this.floorMods[n] === "thorns") {  // the thorny way: every creature is tougher
      for (const f of this.foes) if (!FOE[f.type].boss) { f.hp = Math.ceil(f.hp * 1.6); f.elite = true; }
      this.toast("THE THORNY WAY: CREATURES ARE CRUEL HERE, SILVER DOUBLED", "#d86a4a");
    }
    this.best = Math.max(this.best, n); save("mod-best", this.best);
    this.earn(m => { m.deepest = Math.max(m.deepest, n); });
  }
  // ------------------------------------------------------------ hero select
  openSelect(mode) {
    const players = mode === "solo" ? 1 : 2;
    this.sel = {mode, players, row: [0, 0], ready: [false, false]};
    this.state = "select"; sfx("menu");
  }
  // each player moves through the rows and changes values with their own keys; everyone readies up to start
  updateSelect() {
    const sel = this.sel, solo = sel.players === 1;
    const KEYS = [
      {up: ["KeyW", "Pad0Up"], down: ["KeyS", "Pad0Down"], left: ["KeyA", "Pad0Left"], right: ["KeyD", "Pad0Right"], ready: ["Space", "Pad0A"]},
      {up: ["ArrowUp", "Pad1Up"], down: ["ArrowDown", "Pad1Down"], left: ["ArrowLeft", "Pad1Left"], right: ["ArrowRight", "Pad1Right"],
        ready: ["Enter", "NumpadEnter", "Pad1A"]}];
    if (input.keyHit("Escape", "KeyQ", "Backspace")) { this.state = "title"; sfx("menu"); return; }
    for (let p = 0; p < sel.players; p++) {
      const k = solo ? Object.fromEntries(Object.keys(KEYS[0]).map(n => [n, [...KEYS[0][n], ...KEYS[1][n]]])) : KEYS[p];
      const hit = n => input.keyHit(...k[n]);
      if (hit("ready")) { sel.ready[p] = !sel.ready[p]; sfx(sel.ready[p] ? "key" : "menu"); }
      if (sel.ready[p]) continue;
      if (hit("up")) { sel.row[p] = (sel.row[p] + LOOK_ROWS.length - 1) % LOOK_ROWS.length; sfx("menu"); }
      if (hit("down")) { sel.row[p] = (sel.row[p] + 1) % LOOK_ROWS.length; sfx("menu"); }
      const step = hit("right") ? 1 : hit("left") ? -1 : 0;
      if (!step) continue;
      const look = this.looks[p], wrap = (v, n) => (v + step + n) % n;
      switch (LOOK_ROWS[sel.row[p]]) {
        case "CLASS": look.cls = CLASS_ORDER[wrap(CLASS_ORDER.indexOf(look.cls), CLASS_ORDER.length)]; look.style = 0; break;
        case "STYLE": look.style = wrap(look.style, stylesOf(look.cls).length); break;
        case "COLOUR": look.colour = wrap(look.colour, COLOURS.length); break;
        case "ACCENT": look.accent = wrap(look.accent || 0, ACCENTS.length); break;
        case "HAIR": look.hair = wrap(look.hair, HAIRS.length); break;
        case "SKIN": look.skin = wrap(look.skin, SKINS.length); break;
      }
      sfx("menu");
    }
    if (sel.ready.slice(0, sel.players).every(Boolean)) {
      save("mod-looks", this.looks);
      if (sel.mode === "versus") this.startVersus(); else this.startRun(1, true, sel.players);
    }
  }
  drawSelect(ctx, time) {
    const sel = this.sel, pw = sel.players > 1 ? OUT_W / 2 : OUT_W;
    textC(ctx, "CHOOSE YOUR HERO", OUT_W / 2, 40, C.text, 8);
    for (let p = 0; p < sel.players; p++) {
      const look = this.looks[p], cls = CLASSES[look.cls], x0 = p * pw, cx = x0 + pw / 2, rim = p ? C.p2 : C.p1;
      if (sel.players > 1) textC(ctx, `PLAYER ${p + 1}`, cx, 120, rim, 4);
      // the hero, big, walking on the spot
      const fr = heroFrames(look), step = Math.floor(time * 6) % 4, spr = fr.walk[step], S = 10;
      const px = shadeHero(spr, heroPalette(look), JSON.stringify(look));
      const sx = Math.round(sel.players > 1 ? x0 + 30 : cx - 520), sy = 180;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(sx - 30, sy - 20, spr[0].length * S + 60, spr.length * S + 50);
      ctx.strokeStyle = rim; ctx.lineWidth = 3; ctx.strokeRect(sx - 30, sy - 20, spr[0].length * S + 60, spr.length * S + 50);
      px.forEach((row, j) => row.forEach((p, i) => { if (p) { ctx.fillStyle = rgbOf(p.c); ctx.fillRect(sx + i * S, sy + j * S, S, S); } }));
      // class name, what it does, and how it measures up
      const tx = sx + spr[0].length * S + 50;
      text(ctx, cls.name, tx, 190, C.key, 7);
      cls.lines.forEach((l, i) => text(ctx, l, tx, 270 + i * 30, C.text, sel.players > 1 ? 2 : 3));
      Object.entries(cls.stats).forEach(([k, v], i) => {
        text(ctx, k, tx, 380 + i * 30, C.dim, 3);
        for (let b = 0; b < 5; b++) { ctx.fillStyle = b < v ? rim : "#1c2630"; ctx.fillRect(tx + 140 + b * 30, 380 + i * 30, 24, 18); }
      });
      // the rows a player can change
      const pick = {COLOUR: COLOURS[look.colour], ACCENT: ACCENTS[look.accent || 0], HAIR: HAIRS[look.hair], SKIN: SKINS[look.skin]};
      const val = r => r === "CLASS" ? cls.name : r === "STYLE" ? stylesOf(look.cls)[look.style] : pick[r].name;
      const swatch = r => pick[r] ? pick[r].col : null;
      LOOK_ROWS.forEach((r, i) => {
        const y = 540 + i * 56, on = sel.row[p] === i && !sel.ready[p];
        text(ctx, r, cx - 300, y, on ? C.key : C.dim, 4);
        textC(ctx, (on ? "< " : "  ") + val(r) + (on ? " >" : "  "), cx + 90, y, on ? C.text : C.dim, 4);
        const sw = swatch(r);
        if (sw) { ctx.fillStyle = "#000"; ctx.fillRect(cx + 252, y - 3, 34, 30); ctx.fillStyle = rgbOf(sw); ctx.fillRect(cx + 255, y, 28, 24); }
      });
      const keys = touch.on ? "ARROWS TO CHANGE - READY TO START" : sel.players === 1 ? "WASD OR ARROWS TO CHANGE - SPACE OR ENTER WHEN READY" : p ? "ARROWS TO CHANGE - ENTER WHEN READY" : "WASD TO CHANGE - SPACE WHEN READY";
      textC(ctx, sel.ready[p] ? "READY!" : keys, cx, 900, sel.ready[p] ? C.key : C.dim, sel.ready[p] ? 6 : 3);
    }
    if (!touch.on) textC(ctx, "ESC TO GO BACK", OUT_W / 2, 1010, C.dim, 3);
  }

  // keys count for the whole team in co-op
  keyCount(h) { return this.mode === "coop" ? this.heroes.reduce((a, o) => a + o.keys, 0) : h.keys; }
  // record progress toward unlocks, announcing anything newly earned
  earn(change) {
    if (this.mode === "versus" || this.mode === "title") return;
    for (const u of progress(this.meta, change)) { this.newUnlocks.push(u); this.toast(`UNLOCKED: ${u.name}`, C.key, "levelup"); }
  }
  // a hero's hearts or oil ran out: in solo the run ends; in co-op they fall until a partner revives them
  fall(h, i) {
    if (this.mode === "coop") {
      h.down = true; h.hp = 0; h.revive = 0; h.roll = 0;
      if (this.heroes.every(o => o.down)) this.endRun();
      else this.toast(`P${i + 1} IS DOWN - STAND BY THEM TO REVIVE`, i ? C.p2 : C.p1, "dead");
    } else this.endRun();
  }
  // the Lampless King is dead: the run is won
  victory() {
    this.state = "victory"; this.darkness = 0; sfx("clear"); sfx("levelup");
    this.floors[this.level] = this.floorState();
    this.earn(m => { m.wins = (m.wins || 0) + 1; m.deepest = Math.max(m.deepest, FINAL_FLOOR); });
  }
  endRun() {
    this.state = "dead"; sfx("dead");
    this.earn(m => { m.falls++; });
  }
  // leave this floor for another, remembering it
  travel(n) {
    this.floors[this.level] = this.floorState();
    this.dest = n; this.state = "cleared"; this.msgT = n > this.level && !this.floors[n] ? 2.5 : 1.4;
    sfx(n > this.level ? "clear" : "open");
  }
  floorState() {
    const lv = this.lv, copy = a => a.map(o => Object.assign({}, o));
    return {keys: lv.keys.map(k => k.taken), heroKeys: this.heroes.map(h => h.keys), oils: copy(lv.oils), loot: copy(lv.loot),
      foes: copy(this.foes), rats: copy(this.rats), seen: Array.from(lv.seen[0]).join(""), exitGlow: this.exitGlow,
      gates: lv.gates.map(gt => gt.open), relics: copy(lv.relics), shrine: lv.shrine ? lv.shrine.taken : false,
      vaults: lv.vaults.map(v => ({state: v.state, looted: v.looted})), rooms: lv.rooms.map(o => !!o.lit), gearItems: copy(lv.gearItems)};
  }
  applyFloor(s) {
    const lv = this.lv;
    s.keys.forEach((t, i) => { if (lv.keys[i]) lv.keys[i].taken = t; });
    this.heroes.forEach((h, i) => { h.keys = [].concat(s.heroKeys)[i] || 0; });
    lv.oils = s.oils; lv.loot = s.loot; this.foes = s.foes; this.rats = s.rats;
    lv.seen[0].set(Array.from(s.seen, c => +c));
    s.gates.forEach((o, i) => { if (o && lv.gates[i]) openGate(lv, lv.gates[i]); });
    lv.relics = s.relics; lv.gearItems = s.gearItems || [];
    (s.rooms || []).forEach((lit, i) => { if (lv.rooms[i]) lv.rooms[i].lit = lit; });
    (s.vaults || []).forEach((v, i) => {
      const vt = lv.vaults[i];
      if (!vt) return;
      Object.assign(vt, v);
      if (vt.state === "active") for (const sl of vt.seals) sealTile(lv, sl);  // still mid-fight: the doors stay shut
    });
    if (lv.shrine) lv.shrine.taken = s.shrine;
    this.exitGlow = s.exitGlow; this.lightsDirty = true;
  }
  startVersus() {
    this.mode = "versus"; this.state = "play"; this.banner = 3; this.lore = newLore();
    this.loadLevel(3, true, Math.random() * 1e6 | 0);
    sfx("start");
  }
  toast(s, col = C.text, sound) {
    const fresh = !this.toasts.some(t => t.s === s);
    this.toasts = this.toasts.filter(t => t.s !== s);
    this.toasts.push({s, col, t: 2});
    if (fresh && sound) sfx(sound);
  }
  burst(x, y, col) { this.bursts.push({x, y, col, t: 0}); }
  // particles with a little weight (concept/STYLE_GUIDE.md). x, y is the spot on the floor; z is height above it.
  //   debris: chips that fly up, fall, bounce once and settle   dust: soft puffs that drift up and fade
  //   spark: bright flecks that arc and die fast                 ember: glowing motes that rise and flicker out
  //   mote: specks of dust hanging in the lantern light
  puff(kind, x, y, n, col, power = 1) {
    const R = Math.random;
    for (let k = 0; k < n && this.parts.length < 500; k++) {
      const a = R() * 6.283, sp = (kind === "debris" ? 25 + R() * 45 : kind === "spark" ? 40 + R() * 60 : kind === "dust" ? 6 + R() * 14 : 3 + R() * 6) * power;
      const c = Array.isArray(col[0]) ? col[(R() * col.length) | 0] : col;
      this.parts.push({kind, x, y, z: kind === "mote" ? 4 + R() * 14 : 1 + R() * 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .6,
        vz: kind === "debris" ? 30 + R() * 50 : kind === "spark" ? 20 + R() * 40 : kind === "ember" ? 8 + R() * 10 : kind === "dust" ? 4 + R() * 8 : R() * 2,
        g: kind === "debris" ? 170 : kind === "spark" ? 110 : kind === "ember" ? -6 : kind === "dust" ? -3 : 0,
        life: kind === "debris" ? .9 + R() * .6 : kind === "spark" ? .25 + R() * .25 : kind === "ember" ? .9 + R() * .8 : kind === "dust" ? .45 + R() * .4 : 2.5 + R() * 2,
        max: 0, col: c, ph: R() * 6.28});
      this.parts[this.parts.length - 1].max = this.parts[this.parts.length - 1].life;
    }
  }
  updateParts(dt) {
    for (const p of this.parts) {
      p.life -= dt; p.vz -= p.g * dt;
      if (p.kind === "ember" || p.kind === "mote") p.vx += Math.sin(p.life * 5 + p.ph) * (p.kind === "mote" ? 4 : 14) * dt;  // drift on the air
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z <= 0) {  // hits the floor: debris bounces once then lies still
        p.z = 0;
        if (p.kind === "debris" && p.vz < -20) { p.vz *= -.3; p.vx *= .5; p.vy *= .5; } else { p.vz = 0; p.vx *= .7; p.vy *= .7; }
      }
      const drag = p.kind === "dust" || p.kind === "mote" ? 2.5 : .6;
      p.vx -= p.vx * drag * dt; p.vy -= p.vy * drag * dt;
    }
    this.parts = this.parts.filter(p => p.life > 0);
    // embers off every lit lantern (a mage's flame throws more), and motes hanging in the light around heroes
    this.emberT -= dt;
    if (this.emberT <= 0) {
      this.emberT = .12;
      for (const h of this.heroes) {
        if (h.down || h.oil <= 0) continue;
        const lx = h.face > 0 ? h.fx + 9 : h.fx + 1;
        if (Math.random() < (h.cls === "mage" ? .7 : .35)) this.puff("ember", lx, h.fy - 1, 1, [[1, .7, .3], [1, .85, .45], [1, .5, .18]]);
        if (Math.random() < .5) {
          const a = Math.random() * 6.28, r = Math.random() * h.lightR * .7;
          this.puff("mote", h.fx + 5 + Math.cos(a) * r, h.fy - 3 + Math.sin(a) * r, 1, [.78, .74, .6]);
        }
      }
      for (const o of this.lv.rooms) if (o.lit) for (const t of o.torches) if (Math.random() < .25)
        this.puff("ember", t.tx * T + 8, (t.ty + 1) * T + 2, 1, [[1, .7, .3], [1, .5, .2]]);
    }
  }
  // take damage in half-hearts; rolling and the moment after a hit are safe. Returns whether it landed.
  hurt(h, i, amount, from) {
    this.blocked = false;
    if (this.state !== "play" || h.down || h.invuln > 0 || h.roll > 0 || h.rollSafe > 0) return false;
    if (h.blocking && from) {  // a templar's raised lantern shield stops anything coming at it from the front, for a little oil
      const [hx, hy] = heroCenter(h), dx = from.x - hx, dy = from.y - hy, d = Math.hypot(dx, dy) || 1;
      if ((dx * h.aimX + dy * h.aimY) / d > .2) {
        h.oil = Math.max(0, h.oil - 3 * (1 - Math.min(.9, statOf(h, "block")))); this.blocked = true;
        this.burst(hx + h.aimX * 7, hy + h.aimY * 7, [1, .9, .6]);
        sfx("block", {pan: this.panOf(h.fx)});
        return false;
      }
    }
    if (h.hp - amount <= 0 && h.saves > 0) {  // Judgement: a killing blow leaves you standing, once each depth
      h.saves--; h.hp = 1; h.invuln = 2; this.shake = 1; this.toast("JUDGEMENT SPARES YOU", "#d9a441", "relic");
      return true;
    }
    h.hp = Math.max(0, h.hp - amount); h.invuln = HURT_INVULN; h.hurtFlash = 1;
    const thorns = statOf(h, "thorns");  // Justice and thorny gear wound whatever struck you
    if (thorns > 0 && from && from.hp > 0 && from.x !== undefined && !from.hero && from.vx === undefined) damageFoe(this, from, thorns, h, null, true);
    this.shake = 1; input.rumble(i); sfx("hurt", {pan: this.panOf(h.fx)});
    if (h.hp <= 0) {
      if (this.mode !== "versus") this.fall(h, i);
      else {  // in a race you crawl back to your start
        h.fx = h.start[0] * T + 3; h.fy = h.start[1] * T + 9; h.hp = h.maxHp; h.oil = Math.max(h.oil, 60);
        this.toast(`P${i + 1} IS DOWN`, i ? C.p2 : C.p1, "dead");
      }
    }
    return true;
  }
  // pan a sound left or right by where it is relative to player one
  panOf(x) { return Math.max(-1, Math.min(1, (x - this.heroes[0].fx) / 160)); }

  // ------------------------------------------------------------ update
  update(dt, time) {
    if (input.hit("fullscreen")) { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
    if (input.hit("fps")) this.showFps = !this.showFps;
    if (input.hit("mute")) this.toast(toggleMute() ? "SOUND OFF" : "SOUND ON", C.dim);
    const st = this.state;
    if (st === "title") {
      if (input.hit("up")) { this.menu = (this.menu + MENU.length - 1) % MENU.length; sfx("menu"); }
      if (input.hit("down")) { this.menu = (this.menu + 1) % MENU.length; sfx("menu"); }
      // a click or tap on a menu line picks it
      const tap = input.keyHit("MouseLeft") && Math.abs(input.mouse.x - OUT_W / 2) < 520
        ? MENU.findIndex((_, i) => Math.abs(input.mouse.y - (470 + i * 72 + 20)) < 36) : -1;
      if (tap >= 0) this.menu = tap;
      if (input.hit("confirm") || tap >= 0) [() => this.openSelect("solo"), () => this.openSelect("coop"), () => this.openSelect("versus"),
        () => { this.state = "unlocks"; sfx("menu"); }][this.menu]();
      this.updateRats(dt, false);
      updateCombat(this, dt, false, time);
    } else if (st === "play") {
      if (input.hit("pause")) { this.state = "paused"; sfx("menu"); }
      this.banner = Math.max(0, (this.banner || 0) - dt);
      this.updateHeroes(dt);
      if (this.state === "play") { this.updateVaults(); this.updateRooms(); }
      if (this.state === "play" && this.mode !== "versus") {  // a level-up waits to draw its cards
        const i = this.heroes.findIndex(h => h.cardsDue > 0 && !h.down);
        if (i >= 0) {
          const cards = drawCards(this.heroes[i], 3, this.heroes[i].drawMin || 0);
          if (cards.length) { this.draw = {hero: i, cards, sel: Math.min(1, cards.length - 1)}; this.state = "cards"; sfx("rune"); }
          else this.heroes[i].cardsDue = 0;
        }
      }
      if (this.state === "play" && input.keyHit("Tab", "KeyI", "Pad0Back")) openInventory(this, 0);
      if (this.state === "play" && input.keyHit("Pad1Back")) openInventory(this, 1);
      this.updateRats(dt, true);
      updateCombat(this, dt, true, time);
      this.ambientSounds(dt);
    } else if (st === "way") {
      updateWay(this, dt);
    } else if (st === "cards") {
      updateCardDraw(this);
    } else if (st === "inventory") {
      updateInventory(this);
    } else if (st === "select") {
      this.updateSelect();
      this.updateRats(dt, false);
    } else if (st === "unlocks") {
      if (input.hit("confirm") || input.hit("back") || input.hit("pause")) { this.state = "title"; sfx("menu"); }
      this.updateRats(dt, false);
    } else if (st === "paused") {
      if (input.hit("confirm") || input.hit("pause")) { this.state = "play"; sfx("menu"); }
      if (input.hit("back")) this.toTitle();
    } else if (st === "cleared") {
      this.msgT -= dt;
      // a new depth below: first the crossroads and the waystation on the way down (waystations.js)
      if (this.msgT <= 0) { if (this.dest > this.level && !this.floors[this.dest]) openCrossroads(this, this.dest); else this.enterDest(); }
    } else if (st === "dead" || st === "won" || st === "victory") {
      // permadeath: a fallen run starts again from the first sewer, with new identities to learn
      if (input.hit("confirm")) { if (this.mode === "versus") this.startVersus(); else this.startRun(1, true, this.players); }
      if (input.hit("back")) this.toTitle();
    }
    // fade in after a level loads; fade out at the end of a cleared level
    this.fade = st === "cleared" ? Math.max(this.fade, 1 - this.msgT / .8) : Math.max(0, this.fade - dt * 1.6);
    if (this.state === "play") this.heroes.forEach(h => this.announceSynergies(h));
    this.silverFlash = Math.max(0, (this.silverFlash || 0) - dt);
    if (this.synPop && !(this.banner > 0)) { this.synPop.t -= dt; if (this.synPop.t <= 0) this.synPop = null; }  // waits for the depth's title
    for (const t of this.toasts) t.t -= dt;
    if (this.found) this.found.t -= dt;
    if (this.state === "play" && this.mode !== "versus") {
      const kills = this.heroes.reduce((a, h) => a + h.kills, 0);
      if (kills > (this.killsSeen || 0)) { const k = kills - (this.killsSeen || 0); this.killsSeen = kills; this.earn(m => { m.kills += k; }); }
    }
    this.toasts = this.toasts.filter(t => t.t > 0);
    for (const b of this.bursts) b.t += dt;
    this.updateParts(dt);
    this.bursts = this.bursts.filter(b => b.t < .6);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    for (const h of this.heroes) {
      const f = Math.sqrt(h.oil / OIL_MAX);
      h.lightR = h.down ? 10 : (1 - this.darkness) * (h.oil > 0 ? ART.lanternRadius * (.32 + .68 * f) * (h.buffs.glow > 0 ? 1.45 : 1) * (h.lens || 1) * (1 + statOf(h, "light")) : 14);
      h.lightP = (h.oil > 0 ? ART.lanternPower * (.5 + .5 * f) : .45) * (1 + .2 * (h.lift || 0));  // a lifted lantern shines a little further
      const fl = (h.flare || 0) / FLARE_TIME;  // a flare throws the light far, then sinks back
      if (fl > 0) { h.lightR *= 1 + 1.2 * Math.sqrt(fl); h.lightP *= 1 + 1.4 * fl; }
    }
    if (this.lightsDirty) { buildLights(this.lv, this.exitGlow); this.lightsDirty = false; }
    stampOccluders(this.lv, this.occluders());
    lanterns(this.lv, this.heroes, time, combatLights(this));
    this.heroes.forEach((h, i) => { if (h.flareHit) { h.flareHit = false; this.flareStrike(h, i); } });
    updateFx(this.heroes[0], dt);
  }

  enterDest() { this.enterFloor(this.dest, this.dest < this.level ? "up" : "down", this.heroes.map(h => pick(h, CARRY))); }
  // a synergy just woke: a banner across the middle of the screen, Gungeon style
  announceSynergies(h) {
    const ids = (h.synergies || []).map(s => s.id), seen = h.synSeen || [];
    const fresh = (h.synergies || []).filter(s => !seen.includes(s.id));
    h.synSeen = ids;
    if (!fresh.length) return;
    this.synPop = {s: fresh[0], t: 3.2}; sfx("levelup"); sfx("relic");
    const [x, y] = heroCenter(h);
    for (let k = 0; k < 3; k++) this.burst(x, y, [1, .85, .4]);
    this.puff("spark", x, y, 24, [[1, .85, .4], [1, .95, .7]], 1.4);
  }
  // silver, Gungeon's shells: every kill and chest pays into the party's purse
  addSilver(n, x, y) {
    if (this.mode === "versus" || this.mode === "title" || !n) return;
    this.silver = (this.silver || 0) + n; this.silverFlash = .5;
    if (x !== undefined) this.puff("spark", x, y, Math.min(10, 2 + n), [[.85, .9, .95], [.7, .76, .82]], .7);
  }

  // a flare dazzles every creature its light falls on; one standing in another's shadow is spared. Shadow
  // creatures are scorched, bosses only flinch, and rats scatter.
  flareStrike(h, i) {
    const [hx, hy] = heroCenter(h), [lx, ly] = lanternAt(h), lv = this.lv;
    let n = 0;
    for (const f of this.foes) {
      const d = Math.hypot(f.x - lx, f.y - ly), r = FOE[f.type].r, nx = f.x - (f.x - lx) / (d || 1) * r, ny = f.y - (f.y - ly) / (d || 1) * r;
      if (f.hp <= 0 || d > h.lightR * .9 || exposure(lv, lx, ly, nx, ny) < .35) continue;
      const boss = FOE[f.type].boss;
      f.dazzle = boss ? .35 : f.type === "lurker" ? 1.4 : 1.1; f.flash = .2; f.asleep = false; n++;
      if (f.state === "wind" || f.state === "cwind") { f.state = "walk"; f.t = 0; }  // a flare breaks a wind-up
      if (f.type === "lurker") { f.shown = true; damageFoe(this, f, 2, h); }
    }
    for (const r of this.rats) if (Math.hypot(r.x - hx, r.y - hy) < h.lightR && lightAt(lv, r.x, r.y) > .3) r.flee = 3;
    if (n) this.toast(n > 1 ? `${n} CREATURES DAZZLED` : "DAZZLED", i ? C.p2 : C.key);
  }

  // everything solid enough to throw a shadow this frame: creatures (denser the bigger they are), rats, the
  // heroes themselves (a partner blocks your light), and unopened chests
  occluders() {
    const out = [];
    for (const f of this.foes) if (f.hp > 0 && (f.type !== "lurker" || f.shown)) {
      const r = FOE[f.type].r;
      out.push({x: f.x, y: f.y, r: r * .8, k: FOE[f.type].boss ? .26 : r >= 10 ? .22 : .18});
    }
    for (const r of this.rats) if (r.hp > 0) out.push({x: r.x, y: r.y, r: 4, k: .14});
    for (const h of this.heroes) if (!h.down) out.push({x: h.fx + 5, y: h.fy - 3, r: 5, k: .16});
    for (const vt of this.lv.vaults) if (!vt.looted) out.push({x: vt.chest.tx * T + 8, y: vt.chest.ty * T + 9, r: 7, k: .22});
    return out;
  }

  // where a player is aiming: the mouse (player one), a right stick, or else the nearest enemy in view
  aim(h, i, solo, d) {
    const [hx, hy] = heroCenter(h), stick = input.aimStick(i) || (solo ? input.aimStick(1) : null);
    const v = (this.views || []).find(w => w.hero === i || w.shared);
    let ax = 0, ay = 0;
    if (stick) { ax = stick.x; ay = stick.y; }
    else if (i === 0 && input.mouse.active && v) {
      ax = v.sx0 + (input.mouse.x - v.outX) / PIXEL - hx;
      ay = v.sy0 + input.mouse.y / PIXEL - FACE_H - hy;
    } else {
      let best = null;
      for (const t of [...this.foes, ...this.rats]) {
        const dd = Math.hypot(t.x - hx, t.y - hy);
        if (dd < 120 && (!best || dd < best[0])) best = [dd, t.x - hx, t.y - hy];
      }
      if (best) [, ax, ay] = best; else if (d.x || d.y) { ax = d.x; ay = d.y; }
    }
    const l = Math.hypot(ax, ay);
    if (l > .01) { h.aimX = ax / l; h.aimY = ay / l; }
  }

  ambientSounds(dt) {
    const r = Math.random;
    if (r() < ART.drips * dt * .12) sfx("drip", {vol: .25 + r() * .75, pan: r() * 2 - 1});
    if (this.heroes.some(h => h.oil > 0 && h.oil < 15) && r() < dt * .5) sfx("sputter");
  }

  free(fx, fy) {
    const {W, WH, solid} = this.lv;
    // the hero's footprint; a wall below overlaps the bottom quarter of the sprite when they walk up to it
    for (const [ox, oy] of [[2, -1], [8, -1], [2, 2], [8, 2]]) {
      const x = Math.floor(fx + ox), y = Math.floor(fy + oy);
      if (x < 0 || y < 0 || x >= W || y >= WH || solid[y * W + x]) return false;
    }
    return true;
  }

  // move one axis at a time; when a wall blocks the way, slip around a corner that is only a few pixels off
  slide(h, dx, dy) {
    for (const [ax, ay] of [[dx, 0], [0, dy]]) {
      if (!ax && !ay) continue;
      if (this.free(h.fx + ax, h.fy + ay)) { h.fx += ax; h.fy += ay; continue; }
      const step = Math.abs(ax || ay);
      for (let k = 1; k <= 6; k++) for (const s of [1, -1]) {
        const ox = ay ? s * k : 0, oy = ax ? s * k : 0;
        if (this.free(h.fx + ox, h.fy + oy) && this.free(h.fx + ox + ax, h.fy + oy + ay)) {
          h.fx += Math.sign(ox) * Math.min(step, k); h.fy += Math.sign(oy) * Math.min(step, k);
          k = 99; break;
        }
      }
    }
  }

  updateHeroes(dt) {
    // solo: both control sets drive the one hero; descent: solo or co-op rules
    const lv = this.lv, solo = this.mode === "solo", descent = this.mode !== "versus";
    const drain = descent ? 1.1 * (1 + .07 * (this.level - 1)) : 1;
    this.heroes.forEach((h, i) => {
      if (h.down) {  // fallen: a partner standing close for a moment brings them back
        const helper = this.heroes.find(o => o !== h && !o.down && Math.hypot(o.fx - h.fx, o.fy - h.fy) < 16);
        h.revive = helper ? h.revive + dt : Math.max(0, h.revive - dt);
        if (h.revive >= REVIVE_TIME) {
          h.down = false; h.revive = 0; h.hp = 2; h.oil = Math.max(h.oil, 40); h.invuln = 2;
          this.burst(h.fx + 5, h.fy - 4, [1, .9, .6]);
          this.toast(`P${i + 1} IS BACK UP`, i ? C.p2 : C.p1, "levelup");
        }
        return;
      }
      const d = input.dir(i, solo), x0 = h.fx, y0 = h.fy;
      this.aim(h, i, solo, d);
      // dodge roll: a fast dash you can't be hurt during, Gungeon-style
      h.rollCd = Math.max(0, h.rollCd - dt);
      const cls = CLASSES[h.cls], templar = h.cls === "templar";
      h.rollBuf = input.rollHit(i, solo, templar) ? ROLL_BUFFER : Math.max(0, h.rollBuf - dt);
      h.blocking = templar && h.roll <= 0 && h.oil > 0 && input.blockHeld(i, solo);
      h.rollSafe = Math.max(0, (h.rollSafe || 0) - dt);
      if (h.roll <= 0 && h.rollCd <= 0 && h.rollBuf > 0) {
        const l = Math.hypot(d.x, d.y);
        [h.rollX, h.rollY] = l ? [d.x / l, d.y / l] : [h.aimX, h.aimY];
        h.roll = ROLL_TIME; h.rollCd = ROLL_TIME + ROLL_COOLDOWN * (1 - Math.min(.7, statOf(h, "rollCd"))); h.rollBuf = 0;
        h.rollSafe = ROLL_TIME + ROLL_GRACE;
        this.puff("dust", h.fx + 5, h.fy, 7, [[.42, .38, .32], [.34, .31, .27]], 1.6);  // a puff of grime where you kick off
        sfx("roll", {pan: this.panOf(h.fx)});
      }
      // the lantern flare: whatever stands in its light when it goes off is dazzled (resolved once the light is cast)
      h.flareCd = Math.max(0, (h.flareCd || 0) - dt); h.flare = Math.max(0, (h.flare || 0) - dt);
      if (input.flareHit(i, solo) && h.flareCd <= 0 && h.oil > 0) {
        h.oil = Math.max(0, h.oil - FLARE_OIL); h.flare = FLARE_TIME; h.flareCd = h.flareMax = FLARE_CD * (1 - statOf(h, "flareCd")); h.flareHit = true;
        this.shake = Math.max(this.shake, .25); sfx("flare");
        this.puff("spark", h.fx + 5, h.fy - 6, 14, [[1, .97, .85], [1, .85, .5]], 2.2);
      }
      if (h.roll > 0) {
        const k = h.roll / ROLL_TIME, sp = SPEED * (ROLL_END + (ROLL_BURST - ROLL_END) * k * k);
        h.roll -= dt;
        this.slide(h, h.rollX * sp * dt, h.rollY * sp * dt);
        h.vx = h.rollX * SPEED; h.vy = h.rollY * SPEED;  // come out of the roll still moving, not dead stopped
        h.ghostT -= dt;
        if (h.ghostT <= 0) {
          h.ghostT = .035; h.ghosts.push({x: h.fx, y: h.fy, a: 1});
          if (h.cls === "mage") this.fires.push({x: h.fx + 5, y: h.fy - 1, t: 1.6, owner: h});  // the mage rolls through a trail of fire
        }
      } else {
        // ease toward the speed the stick asks for: a quick build-up and a short slide to a stop
        const n = (d.x && d.y ? Math.SQRT1_2 : 1) * (h.buffs.swift > 0 ? 1.4 : 1) * cls.speed * (h.blocking ? .45 : 1) * (1 + statOf(h, "speed"));
        const k = 1 - Math.exp(-dt * (d.x || d.y ? ACCEL : FRICTION));
        h.vx = (h.vx || 0) + (d.x * SPEED * n - (h.vx || 0)) * k; h.vy = (h.vy || 0) + (d.y * SPEED * n - (h.vy || 0)) * k;
        if (Math.abs(h.vx) < 1 && !d.x) h.vx = 0;
        if (Math.abs(h.vy) < 1 && !d.y) h.vy = 0;
        const x1 = h.fx, y1 = h.fy;
        this.slide(h, h.vx * dt, h.vy * dt);
        if (h.fx === x1 && h.vx && !d.x) h.vx = 0;  // stop sliding into a wall
        if (h.fy === y1 && h.vy && !d.y) h.vy = 0;
      }
      for (const g of h.ghosts) g.a -= dt * 6;
      h.ghosts = h.ghosts.filter(g => g.a > 0);
      for (const b in h.buffs) h.buffs[b] = Math.max(0, h.buffs[b] - dt);
      // the pack: pick a slot, use it
      const step = input.nextHit(i, solo), direct = input.slotHit(i);
      if (step && h.items.length) { h.sel = (h.sel + step + h.items.length) % h.items.length; sfx("menu"); }
      if (direct >= 0 && direct < h.items.length) { h.sel = direct; useItem(this, h, i, direct); }
      else if (input.useHit(i, solo) && h.items.length) useItem(this, h, i, h.sel);
      if (this.state !== "play") return;
      h.face = h.aimX < 0 ? -1 : 1;  // the lantern swings to the side you're aiming at
      h.fireCd = Math.max(0, h.fireCd - dt);
      if (h.roll <= 0 && !h.blocking && h.fireCd <= 0 && input.fireHeld(i, solo)) h.fireCd = attack(this, h);
      const moved = Math.hypot(h.fx - x0, h.fy - y0);
      h.moving = moved > 0;
      h.walk += moved;
      // idling: stand still a few seconds and the hero fidgets (glances back, lifts the lantern, settles their
      // stance); the lantern sways on its hook all the while, harder when walking
      h.swayT = (h.swayT || 0) + dt * (h.moving ? 6.5 : 2.1);
      if (h.moving || h.roll > 0 || h.blocking || h.fireCd > 0) { h.idleT = 0; h.fidget = null; }
      else {
        h.idleT = (h.idleT || 0) + dt;
        if (!h.fidget && h.idleT > (h.nextFidget || (h.nextFidget = 2.5 + Math.random() * 2))) {
          h.fidget = {kind: ["look", "lift", "settle"][Math.random() * 3 | 0], t: 0};
          h.idleT = 0; h.nextFidget = 3.5 + Math.random() * 4;
        }
      }
      if (h.fidget && (h.fidget.t += dt) > FIDGET_TIME[h.fidget.kind]) h.fidget = null;
      h.lift = h.fidget && h.fidget.kind === "lift" ? Math.sin(Math.PI * h.fidget.t / FIDGET_TIME.lift) : 0;
      h.stepAcc += moved;
      if (h.stepAcc > STEP_PX) {
        h.stepAcc = 0; sfx(templar ? "clank" : "step", {vol: (i ? .7 : 1) * Math.min(1.3, cls.noise), pan: this.panOf(h.fx)});
        this.puff("dust", h.fx + 5, h.fy, templar ? 4 : h.cls === "hunter" ? 1 : 2, [[.42, .38, .32], [.34, .31, .27]], templar ? 1.4 : 1);  // a puff of grime
      }
      // remember the tiles around the player
      const htx = Math.floor((h.fx + 5) / T), hty = Math.floor((h.fy - 3) / T), seen = lv.seen[i];
      const reg = regionOf(htx, hty);
      if (reg !== h.region) {  // crossing a border into another part of the sewer
        h.region = reg;
        this.toast((this.heroes.length > 1 ? `P${i + 1} ENTERS ` : "ENTERING ") + REGION_NAMES[reg], i ? C.p2 : C.text);
      }
      // the map remembers what the lantern has actually lit (sampled at each tile's middle and edges),
      // plus the tiles right around the hero
      const rr = Math.ceil(h.lightR / T) + 1, Ld = lv.Ld;
      for (let y = Math.max(0, hty - rr); y <= Math.min(lv.MH - 1, hty + rr); y++)
        for (let x = Math.max(0, htx - rr); x <= Math.min(lv.MW - 1, htx + rr); x++) {
          const k = y * lv.MW + x;
          if (seen[k]) continue;
          if (Math.abs(x - htx) <= 1 && Math.abs(y - hty) <= 1) { seen[k] = 1; continue; }
          for (const [ox, oy] of [[8, 8], [1, 8], [14, 8], [8, 1], [8, 14]]) {
            const j = ((y * T + oy) * lv.W + x * T + ox) * 3;
            if (Ld[j] + Ld[j + 1] + Ld[j + 2] > .3) { seen[k] = 1; break; }
          }
        }
      h.invuln = Math.max(0, h.invuln - dt);
      h.hurtFlash = Math.max(0, h.hurtFlash - dt * 2.5);
      // the lantern burns down; too long without oil and the dark wins
      h.oil = Math.min(OIL_MAX, Math.max(0, h.oil - drain * cls.drain * (1 - Math.min(.8, statOf(h, "drain"))) * dt
        + cls.regen * (1 + statOf(h, "fuelRegen")) * dt));  // a mage's mana creeps back
      const mend = statOf(h, "regen");  // the Empress, Temperance and some gear mend half a heart at a time
      if (mend > 0 && h.hp < h.maxHp) { h.regenT += dt * mend; if (h.regenT >= 45) { h.regenT = 0; h.hp++; } }
      if (h.oil <= 0) {
        h.dark += dt;
        if (h.dark > DARK_GRACE) {
          if (descent) { h.dark = 0; this.fall(h, i); return; }
          h.fx = h.start[0] * T + 3; h.fy = h.start[1] * T + 9; h.oil = 60; h.dark = 0;
          this.toast(`P${i + 1} LOST IN THE DARK`, i ? C.p2 : C.p1, "dead");
        }
      } else h.dark = 0;
      const hx = h.fx + 5, hy = h.fy - 3, near = (tx, ty, yo = 5) => Math.hypot(tx * T + 8 - hx, ty * T + yo - hy) < 9;
      for (const k of lv.keys) if (!k.taken && near(k.tx, k.ty)) {
        k.taken = true; h.keys++; this.lightsDirty = true;
        this.burst(k.tx * T + 8, k.ty * T + 5, glowCol("rune"));
        this.toast(`RUNE KEY ${Math.min(this.keyCount(h), lv.need)}/${lv.need}`, C.key, "key");
        if (this.keyCount(h) >= lv.need && !this.exitGlow) {
          this.exitGlow = true;
          this.toast(this.mode === "versus" ? `THE GRATE OPENS FOR P${i + 1}` : "THE GRATE IS OPEN", C.key, "open");
        }
      }
      for (const o of lv.oils) if (!o.taken && near(o.tx, o.ty, 7)) {
        o.taken = true; h.oil = Math.min(OIL_MAX, h.oil + OIL_FLASK); this.lightsDirty = true;
        this.burst(o.tx * T + 8, o.ty * T + 7, OIL_COL);
        this.toast(h.cls === "mage" ? "+MANA" : "+OIL", h.cls === "mage" ? CLASSES.mage.fuelCol : C.oil, "oil");
      }
      for (const it of lv.loot) if (!it.taken && near(it.tx, it.ty, 7)) {
        if (!stow(h, it)) { this.toast("YOUR PACK IS FULL", C.dim); continue; }
        if (statOf(h, "identify")) this.lore.known[it.kind].add(it.idx);
        it.taken = true; this.lightsDirty = true;
        this.burst(it.tx * T + 8, it.ty * T + 7, lookOf(it).col);
        this.toast(nameOf(this.lore, it), `rgb(${lookOf(it).col.map(v => v * 255 | 0)})`, "pickup");
      }
      // gates: touch one with the right ability and it gives way; without it, it tells you what it needs
      for (const gt of lv.gates) if (!gt.open && Math.hypot(gt.tx * T + 8 - hx, gt.ty * T + 8 - hy) < 17) {
        const gd = GATES[gt.style], ab = ABILITIES[gd.ability];
        if (this.abilities.has(gd.ability)) {
          openGate(lv, gt); this.lightsDirty = true; this.shake = Math.max(this.shake, .5); this.earn(m => { m.gates++; });
          for (let k = 0; k < 4; k++) this.burst(gt.tx * T + 4 + (k & 1) * 8, gt.ty * T + 4 + (k >> 1) * 8, gd.col);
          this.toast(`THE ${ab.name} OPENS THE ${gd.name}`, rgbOf(gd.col), "gate");
        } else this.toast(`A ${gd.name} - IT NEEDS THE ${ab.name}`, rgbOf(gd.col), "locked");
      }
      for (const gi of lv.gearItems) if (!gi.taken && Math.hypot(gi.x - hx, gi.y - hy) < 10) {
        if (h.bag.length >= BAG_SIZE) { this.toast("YOUR LOOT BAG IS FULL - TAB TO SORT IT", C.dim); continue; }
        gi.taken = true; h.bag.push(gi.item); this.lightsDirty = true;
        this.burst(gi.x, gi.y, RARITY[gi.item.rarity].col);
        this.toast(`${gi.item.name}`, rgbOf(RARITY[gi.item.rarity].col), "pickup");
      }
      for (const r of lv.relics) if (!r.taken && near(r.tx, r.ty, 7)) {
        r.taken = true; this.lightsDirty = true;
        const rd = RELICS[r.kind];
        if (r.kind === "heart") { h.maxHp = Math.min(20, h.maxHp + 2); h.hp = Math.min(h.maxHp, h.hp + 2); }
        else if (r.kind === "lens") h.lens = (h.lens || 1) + .12;
        else if (r.kind === "sigil") h.power += .3;
        else h.pack = Math.min(8, (h.pack || PACK) + 1);
        this.burst(r.tx * T + 8, r.ty * T + 6, rd.col); this.burst(r.tx * T + 8, r.ty * T + 6, [1, 1, 1]);
        this.toast(`${rd.name} - ${rd.does}`, rgbOf(rd.col), "relic");
      }
      const sh = lv.shrine;
      if (sh && !sh.taken && near(sh.tx, sh.ty, 6)) {
        sh.taken = true; this.abilities.add(sh.ability); this.lightsDirty = true; this.shake = Math.max(this.shake, .4);
        this.earn(m => { m.mostAbilities = Math.max(m.mostAbilities, this.abilities.size); });
        this.found = {ability: sh.ability, t: 4.5};
        for (let k = 0; k < 3; k++) this.burst(sh.tx * T + 8, sh.ty * T + 4, ABILITIES[sh.ability].col);
        sfx("relic"); sfx("levelup");
      }
      // stairs and grate only trigger once you've stepped away from where you arrived
      const atExit = near(lv.exit[0], lv.exit[1]), atStart = near(h.start[0], h.start[1]);
      if (!atExit && !atStart && Math.hypot(h.fx - h.start[0] * T - 3, h.fy - h.start[1] * T - 9) > 4) h.armed = true;
      if (descent && h.armed && atStart && this.level > 1) { this.travel(this.level - 1); return; }
      if (atExit && h.armed) {
        const bossUp = lv.vaults.some(v => v.boss && v.state !== "cleared");  // a boss floor's grate opens only once the boss is dead
        if (!bossUp && (this.keyCount(h) >= lv.need || (descent && this.exitGlow))) {
          if (descent) { this.travel(this.level + 1); return; }
          this.state = "won"; this.winner = i; sfx("clear");
        } else this.toast(bossUp ? `${FOE[lv.boss].boss} BARS THE WAY` : `THE GRATE NEEDS ${lv.need} RUNE KEYS`, C.warn, "locked");
      }
    });
  }

  // a chamber with no creatures left in it catches light: walking in lights its wall torches, and it stays lit
  // and mapped for the rest of the run
  updateRooms() {
    const lv = this.lv;
    for (const o of lv.rooms) {
      if (o.lit) continue;
      const inRect = (x, y) => x >= o.x * T && x < (o.x + o.w) * T && y >= o.y * T && y < (o.y + o.h) * T;
      if (!this.heroes.some(h => !h.down && inRect(h.fx + 5, h.fy - 3))) continue;
      if (this.foes.some(f => inRect(f.x, f.y)) || this.rats.some(r => inRect(r.x, r.y))) continue;
      o.lit = true; this.lightsDirty = true;
      for (const seen of new Set(lv.seen))
        for (let y = o.y - 1; y <= o.y + o.h; y++) for (let x = o.x - 1; x <= o.x + o.w; x++) seen[y * lv.MW + x] = 1;
      for (const t of o.torches) this.burst(t.tx * T + 8, (t.ty + 1) * T - 2, [1, .7, .3]);
      if (o.torches.length) sfx("torch");
    }
  }

  // loot rooms: step inside and the doors seal; kill every guard to break the seals and unlock the chest
  updateVaults() {
    const lv = this.lv, tileOf = h => [Math.floor((h.fx + 5) / T), Math.floor((h.fy - 3) / T)];
    lv.vaults.forEach((vt, vi) => {
      const guards = this.foes.filter(f => f.vault === vi);
      const inside = h => { const [x, y] = tileOf(h); return !h.down && x >= vt.x && x < vt.x + vt.w && y >= vt.y && y < vt.y + vt.h; };
      if (vt.state === "idle" && this.heroes.some(inside)) {
        if (!guards.length) vt.state = "cleared";
        else {
          vt.state = "active";
          for (const s of vt.seals) if (!this.heroes.some(h => { const [x, y] = tileOf(h); return x === s.tx && y === s.ty; })) sealTile(lv, s);
          for (const f of guards) f.asleep = false;
          this.shake = Math.max(this.shake, .6); this.lightsDirty = true;
          this.toast(vt.boss ? `${FOE[vt.boss].boss} AWAKENS` : "THE DOORS SLAM SHUT - CLEAR THE ROOM", C.warn, "gate");
        }
      }
      if (vt.state === "active" && !guards.length) {
        vt.state = "cleared";
        for (const s of vt.seals) if (!s.open) openGate(lv, s);
        this.lightsDirty = true;
        if (vt.boss === "king") { this.victory(); return; }
        if (vt.boss) { this.exitGlow = true; this.toast(`${FOE[vt.boss].boss} FALLS - THE GRATE IS OPEN`, C.key, "open"); }
        this.toast("ROOM CLEARED - THE CHEST IS OPEN", C.key, "clear");
      }
      const {tx, ty} = vt.chest;
      if (vt.state === "cleared" && !vt.looted && this.heroes.some(h => !h.down && Math.hypot(tx * T + 8 - h.fx - 5, ty * T + 6 - h.fy + 3) < 12)) {
        vt.looted = true; this.lightsDirty = true;
        // the hoard spills out around the chest
        const spots = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => [tx + dx, ty + dy])
          .filter(([x, y]) => !lv.g[y * lv.MW + x]);
        const drop = [];
        for (let k = 0; k < 2; k++) drop.push(p => lv.loot.push({tx: p[0], ty: p[1], kind: Math.random() < .55 ? "tonic" : "rune", idx: Math.random() * 6 | 0, taken: false}));
        drop.push(p => lv.oils.push({tx: p[0], ty: p[1], taken: false}));
        drop.push(Math.random() < .35 ? p => lv.relics.push({tx: p[0], ty: p[1], kind: RELIC_KINDS[Math.random() * RELIC_KINDS.length | 0], taken: false})
          : p => lv.loot.push({tx: p[0], ty: p[1], kind: Math.random() < .55 ? "tonic" : "rune", idx: Math.random() * 6 | 0, taken: false}));
        drop.forEach((f, k) => spots[k] && f(spots[k]));
        this.dropGear(tx * T + 8, ty * T + 14, vt.boss ? 2 : Math.random() < .4 ? 1 : 0);
        for (let k = 0; k < 3; k++) this.burst(tx * T + 8, ty * T + 4, [1, .8, .3]);
        this.toast("THE CHEST SPILLS ITS HOARD", C.key, "relic");
        this.addSilver(vt.boss ? 50 : 15 + this.level * 3, tx * T + 8, ty * T + 4);
        if (this.floorMods && this.floorMods[this.level] === "thorns" && !vt.thornPaid) {
          vt.thornPaid = true;
          for (const h of this.heroes) if (!h.down) { h.cardsDue++; h.drawMin = Math.max(h.drawMin || 0, 1); }
          this.toast("THE THORNS REWARD YOU: A RARE CARD", "#d86a4a");
        }
      }
    });
  }

  // rats hunt in the dark and run from light; a bite costs oil
  updateRats(dt, live) {
    const lv = this.lv, {MW, g} = lv;
    this.distT -= dt;
    if (this.distT <= 0 || !this.dist || this.dist.length !== g.length) {
      this.distT = .35;
      const d = this.dist = new Int16Array(g.length).fill(-1), q = [];
      for (const h of this.heroes) { const i = Math.floor((h.fy - 3) / T) * MW + Math.floor((h.fx + 5) / T); if (!g[i] && d[i] < 0) { d[i] = 0; q.push(i); } }
      for (let k = 0; k < q.length; k++) { const i = q[k]; for (const j of [i - 1, i + 1, i - MW, i + MW]) if (!g[j] && d[j] < 0) { d[j] = d[i] + 1; q.push(j); } }
    }
    // the standing hero nearest a point, or null
    const nearestTo = (x, y) => this.heroes.reduce((b, h, i) => {
      if (h.down) return b;
      const d = Math.hypot(h.fx + 5 - x, h.fy - 4 - y);
      return !b || d < b.d ? {h, i, d, hx: h.fx + 5, hy: h.fy - 4} : b;
    }, null);
    const step = (r, dx, dy) => { const x = r.x + dx, y = r.y + dy; if (!lv.solid[(y | 0) * lv.W + (x | 0)]) { r.x = x; r.y = y; } };
    for (const r of this.rats) {
      r.flee = Math.max(0, r.flee - dt);
      r.flash = Math.max(0, r.flash - dt);
      // a rat that has crept close rears up (squeaking), darts in to nip, then scurries back: only the nip hurts
      if (live && r.state) {
        const n = nearestTo(r.x, r.y);
        r.t -= dt;
        if (r.state === "wind") { if (r.t <= 0) { r.state = "strike"; r.t = .16; r.hit = false; } }
        else if (r.state === "strike") {
          step(r, Math.cos(r.ang) * 110 * dt, Math.sin(r.ang) * 110 * dt);
          if (!r.hit && n && n.d < 9) { r.hit = true; if (this.hurt(n.h, n.i, 1, r)) sfx("bite", {pan: this.panOf(r.x)}); }
          if (r.t <= 0) { r.state = "recover"; r.t = .6; r.cd = 1.2 + Math.random() * .6; }
        } else if (r.state === "recover") {
          if (n) step(r, -(n.hx - r.x) / (n.d || 1) * 32 * dt, -(n.hy - r.y) / (n.d || 1) * 32 * dt);
          if (r.t <= 0) r.state = null;
        }
        continue;
      }
      const tx = r.nx * T + 8, ty = r.ny * T + 8, dist = this.dist[r.ny * MW + r.nx];
      const scared = r.flee > 0 || lightAt(lv, r.x, r.y) > .5;
      const ear = Math.max(...this.heroes.map(h => CLASSES[h.cls].noise));  // rats hear a clanking templar from far off
      const chasing = live && !scared && dist >= 0 && dist <= 9 * ear;
      if (chasing && !r.chasing) sfx("squeak", {vol: Math.max(.2, 1 - dist / 10), pan: this.panOf(r.x)});
      r.chasing = chasing;
      if (Math.abs(r.x - tx) < .5 && Math.abs(r.y - ty) < .5) {
        r.x = tx; r.y = ty;
        const from = [r.tx, r.ty];
        r.tx = r.nx; r.ty = r.ny;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [r.tx + a, r.ty + b]).filter(([x, y]) => !g[y * MW + x]);
        const dd = p => this.dist[p[1] * MW + p[0]];
        let next;
        if (scared && dist >= 0) next = nb.reduce((b, p) => dd(p) > dd(b) ? p : b);
        else if (chasing) next = nb.reduce((b, p) => dd(p) < dd(b) ? p : b);
        else { const fwd = nb.filter(p => p[0] !== from[0] || p[1] !== from[1]); const pool = fwd.length ? fwd : nb; next = pool[Math.floor(Math.random() * pool.length)]; }
        [r.nx, r.ny] = next;
      }
      const sp = (scared ? 40 : chasing ? 44 : 26) * dt;
      const vx = r.nx * T + 8 - r.x, vy = r.ny * T + 8 - r.y, len = Math.hypot(vx, vy);
      if (len > 0) {
        const s = Math.min(sp, len); r.x += vx / len * s; r.y += vy / len * s;
        r.face = Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? "R" : "L") : (vy > 0 ? "D" : "U");  // nose first, whichever way it runs
      }
      if (!live) continue;
      r.cd = (r.cd || 0) - dt;
      const n = nearestTo(r.x, r.y);
      if (!n) continue;
      if (n.d < 10) step(r, (r.x - n.hx) / (n.d || 1) * (10 - n.d), (r.y - n.hy) / (n.d || 1) * (10 - n.d));  // never inside a hero
      if (chasing && n.d < 24 && r.cd <= 0) { r.state = "wind"; r.t = .32; r.ang = Math.atan2(n.hy - r.y, n.hx - r.x); sfx("squeak", {pan: this.panOf(r.x)}); }
    }
  }

  // ------------------------------------------------------------ screens and HUD
  // top left under the hearts: hero level, XP, and how hard the bolts hit
  drawLevel(ctx, h, x, y) {
    text(ctx, `LV ${h.lvl}`, x, y, C.key, 3);
    const bx = x + 64, bw = 150;
    ctx.fillStyle = "#000"; ctx.fillRect(bx - 2, y, bw + 4, 14);
    ctx.fillStyle = "#14202a"; ctx.fillRect(bx, y + 2, bw, 10);
    ctx.fillStyle = C.key; ctx.fillRect(bx, y + 2, bw * h.xp / xpNeed(h.lvl), 10);
    if (h.power > 1.01) text(ctx, `BOLTS X${h.power.toFixed(1)}`, bx + bw + 14, y, "#ffb070", 3);
    if (this.mode === "versus") return;
    if (!touch.on) text(ctx, `DECK ${h.deck.length} - BAG ${h.bag.length} - TAB`, x + 300, y + 26, "#7a7058", 2);  // on a phone the BAG button says it
    let ax = x;  // abilities found so far this run, dim until found
    for (const k of ABILITY_ORDER) {
      const ab = ABILITIES[k], has = this.abilities.has(k), s = ab.name.split(" ")[1];
      text(ctx, s, ax, y + 26, has ? rgbOf(ab.col) : "#2a3640", 2); ax += textW(s, 2) + 14;
    }
  }

  // bottom centre: the active effects (each with a draining bar), the selected item's name, then the hotbar
  drawHotbar(ctx, h, cx, time) {
    const S = 64, gap = 8, slots = h.pack || PACK, y = OUT_H - S - 22, x0 = Math.round(cx - (slots * (S + gap) - gap) / 2);
    const icon = (kind, idx, x, yy, s) => {
      const c = (kind === "tonic" ? TONIC_LOOKS : RUNE_LOOKS)[idx].col, spr = kind === "tonic" ? SPR.TONIC : SPR.RUNE;
      const cols = Object.assign({}, BASECOL, kind === "tonic" ? {f: c.map(v => v * .55), F: c, w: [.45, .3, .2]} : {Z: c, z: [.3, .3, .36]});
      drawSprite(ctx, spr, cols, x - spr[0].length * s / 2, yy - spr.length * s / 2, s);
    };
    for (let k = 0; k < slots; k++) {
      const sx = x0 + k * (S + gap), it = h.items[k], sel = it && k === h.sel;
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(sx - 3, y - 3, S + 6, S + 6);
      ctx.fillStyle = sel ? "#2a3a48" : "#10161c"; ctx.fillRect(sx, y, S, S);
      if (sel) { ctx.strokeStyle = C.key; ctx.lineWidth = 3; ctx.strokeRect(sx + 1.5, y + 1.5, S - 3, S - 3); }
      text(ctx, String(k + 1), sx + 5, y + 5, C.dim, 2);
      if (!it) continue;
      icon(it.kind, it.idx, sx + S / 2, y + S / 2 + 4, 7);
      if (it.n > 1) text(ctx, String(it.n), sx + S - 5 - textW(String(it.n), 3), y + S - 22, C.text, 3);
      if (!this.lore.known[it.kind].has(it.idx)) text(ctx, "?", sx + S - 14, y + 5, C.warn, 2);
    }
    if (h.items[h.sel]) textC(ctx, nameOf(this.lore, h.items[h.sel]), cx, y - 30, C.text, 3);
    const act = Object.entries(h.buffs).filter(([, t]) => t > 0);
    const A = 52, ax0 = Math.round(cx - (act.length * (A + gap) - gap) / 2), ay = y - 46 - A - 14;
    act.forEach(([b, t], k) => {
      const ax = ax0 + k * (A + gap), look = h.buffLook[b], fade = t < 4 && Math.floor(time * 6) % 2;
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(ax - 3, ay - 3, A + 6, A + 18);
      ctx.fillStyle = "#18222a"; ctx.fillRect(ax, ay, A, A);
      if (look) icon(look[0], look[1], ax + A / 2, ay + A / 2, 5);
      ctx.strokeStyle = BUFF_COL[b]; ctx.lineWidth = 2; ctx.strokeRect(ax + 1, ay + 1, A - 2, A - 2);
      ctx.fillStyle = "#222"; ctx.fillRect(ax, ay + A + 4, A, 8);
      ctx.fillStyle = fade ? C.dim : BUFF_COL[b]; ctx.fillRect(ax, ay + A + 4, A * Math.min(1, t / BUFF[b]), 8);
      textC(ctx, b.toUpperCase(), ax + A / 2, ay - 22, BUFF_COL[b], 2);
    });
  }

  // top right under the oil: the parts of this sewer you have seen, with what you spotted there
  drawMinimap(ctx, i, right, y, time) {
    const lv = this.lv, {MW, MH, g} = lv, seen = lv.seen[i];
    const s = Math.max(3, Math.min(8, Math.floor(Math.min(260 / MW, 180 / MH)))), w = MW * s, hh = MH * s, x = right - w;
    if (!this.mini || this.mini.width !== MW || this.mini.height !== MH) {
      this.mini = Object.assign(document.createElement("canvas"), {width: MW, height: MH});
    }
    const mc = this.mini.getContext("2d"), img = mc.createImageData(MW, MH), d = img.data;
    for (let k = 0; k < MW * MH; k++) {
      if (!seen[k]) continue;
      const c = g[k] ? [74, 96, 112] : lv.inRoom[k] ? [36, 54, 64] : [26, 38, 46];
      d[k * 4] = c[0]; d[k * 4 + 1] = c[1]; d[k * 4 + 2] = c[2]; d[k * 4 + 3] = 235;
    }
    mc.putImageData(img, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x - 6, y - 6, w + 12, hh + 12);
    ctx.strokeStyle = "#2c4250"; ctx.lineWidth = 2; ctx.strokeRect(x - 5, y - 5, w + 10, hh + 10);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.mini, x, y, w, hh);
    const dot = (tx, ty, col, r = s * .8) => { if (!seen[ty * MW + tx]) return; ctx.fillStyle = col; ctx.fillRect(x + tx * s + s / 2 - r / 2, y + ty * s + s / 2 - r / 2, r, r); };
    for (const o of lv.oils) if (!o.taken) dot(o.tx, o.ty, C.oil, s * .6);
    for (const it of lv.loot) if (!it.taken) dot(it.tx, it.ty, `rgb(${lookOf(it).col.map(v => v * 255 | 0)})`, s * .7);
    for (const k of lv.keys) if (!k.taken) dot(k.tx, k.ty, C.key, s);
    for (const gt of lv.gates) if (!gt.open) dot(gt.tx, gt.ty, rgbOf(GATES[gt.style].col), s);
    for (const r of lv.relics) if (!r.taken) dot(r.tx, r.ty, rgbOf(RELICS[r.kind].col), s * .9);
    if (lv.shrine && !lv.shrine.taken) dot(lv.shrine.tx, lv.shrine.ty, rgbOf(ABILITIES[lv.shrine.ability].col), s * 1.3);
    if (this.mode !== "versus" && this.level > 1) dot(lv.starts[0][0], lv.starts[0][1], "#d8c090", s * 1.1);
    dot(lv.exit[0], lv.exit[1], this.exitGlow ? C.key : C.warn, s * 1.3);
    this.heroes.forEach((h, j) => {
      const tx = Math.floor((h.fx + 5) / T), ty = Math.floor((h.fy - 3) / T), on = j !== i || Math.floor(time * 4) % 2;
      if (j === i || seen[ty * MW + tx]) { ctx.fillStyle = on ? (j ? C.p2 : C.p1) : "#fff"; ctx.fillRect(x + tx * s - 1, y + ty * s - 1, s + 2, s + 2); }
    });
  }

  drawUI(ctx, worldViews, time) {
    const lv = this.lv, split = worldViews.length > 1;
    const views = worldViews.length === 1 && worldViews[0].shared
      ? [{hero: 0, outX: 0, w: OUT_W / 2}, {hero: 1, outX: OUT_W / 2, w: OUT_W / 2}] : worldViews;
    if (this.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.fade)})`; ctx.fillRect(0, 0, OUT_W, OUT_H); }
    if (!["title", "unlocks", "select"].includes(this.state)) for (const v of views) {
      const h = this.heroes[v.hero], x = v.outX;
      const kc = this.keyCount(h);
      text(ctx, this.mode === "coop" ? `P${v.hero + 1} - DEPTH ${ROMAN(this.level)}` : split ? `P${v.hero + 1}` : `DEPTH ${ROMAN(this.level)}`,
        x + 16, 16, views.length > 1 ? (v.hero ? C.p2 : C.p1) : C.text, 4);
      text(ctx, `KEYS ${Math.min(kc, lv.need)}/${lv.need}`, x + 16, 44, kc >= lv.need ? C.key : C.dim, 3);
      if (this.mode !== "versus") {  // the party's silver, flashing as it comes in
        const sx = x + 16 + textW(`KEYS ${Math.min(kc, lv.need)}/${lv.need}`, 3) + 34;
        text(ctx, `SILVER ${this.silver || 0}`, sx, 44, this.silverFlash > 0 ? "#ffffff" : "#c8d2dc", 3);
      }
      if (h.down) {  // fallen: show how close the revive is
        textC(ctx, "YOU ARE DOWN", x + v.w / 2, OUT_H / 2 + 90, C.warn, 6);
        textC(ctx, "YOUR PARTNER CAN STAND BY YOU TO REVIVE YOU", x + v.w / 2, OUT_H / 2 + 160, C.dim, 3);
        ctx.fillStyle = "#000"; ctx.fillRect(x + v.w / 2 - 152, OUT_H / 2 + 196, 304, 20);
        ctx.fillStyle = C.key; ctx.fillRect(x + v.w / 2 - 150, OUT_H / 2 + 198, 300 * h.revive / REVIVE_TIME, 16);
      }
      for (let k = 0; k < h.maxHp / 2; k++) drawHeart(ctx, x + 16 + k * 36, 70, Math.max(0, Math.min(2, h.hp - k * 2)), h.invuln > 0 && Math.floor(time * 10) % 2);
      this.drawLevel(ctx, h, x + 16, 106);
      this.drawMinimap(ctx, v.hero, x + v.w - 16, 52, time);
      this.drawHotbar(ctx, h, x + v.w / 2, time);
      const bw = 200, bx = x + v.w - bw - 16, low = h.oil < 20 && Math.floor(time * 4) % 2;
      ctx.fillStyle = "#000"; ctx.fillRect(bx - 3, 13, bw + 6, 22);
      ctx.fillStyle = "#1a1410"; ctx.fillRect(bx, 16, bw, 16);
      const fuel = CLASSES[h.cls];
      ctx.fillStyle = low ? C.warn : fuel.fuelCol; ctx.fillRect(bx, 16, bw * h.oil / OIL_MAX, 16);
      text(ctx, fuel.fuel, bx - textW(fuel.fuel, 3) - 12, 16, low ? C.warn : C.text, 3);
      // the flare's charge, filling back up after each one
      const fw = 80, fx = bx - textW(fuel.fuel, 3) - 44 - fw, ready = !(h.flareCd > 0);
      ctx.fillStyle = "#000"; ctx.fillRect(fx - 3, 13, fw + 6, 22);
      ctx.fillStyle = "#1a1410"; ctx.fillRect(fx, 16, fw, 16);
      ctx.fillStyle = ready ? (Math.floor(time * 2) % 2 && h.oil > 0 ? "#fff6d6" : "#f0dfa0") : "#6f6650";
      ctx.fillRect(fx, 16, fw * (ready ? 1 : 1 - h.flareCd / (h.flareMax || FLARE_CD)), 16);
      const lab = touch.on ? "FLARE" : v.hero ? "P2 FLARE" : "Q FLARE";
      if (v.w > 1200) text(ctx, lab, fx - textW(lab, 3) - 12, 16, ready ? C.key : C.dim, 3);
      if (h.oil <= 0) textC(ctx, "YOUR LANTERN IS DRY", x + v.w / 2, OUT_H / 2 + 120, Math.floor(time * 3) % 2 ? C.warn : "#802020", 4);
      const top = OUT_H - 170 - (Object.values(h.buffs).some(t => t > 0) ? 100 : 0);  // toasts sit above the hotbar
      if (this.state !== "cards" && this.state !== "inventory") this.toasts.forEach((t, i) => textC(ctx, t.s, x + v.w / 2, top - i * 34, t.col, 4));
    }
    if (split) { ctx.fillStyle = "#123c3a"; ctx.fillRect(views[0].w, 0, views[1].outX - views[0].w, OUT_H); }
    const shade = a => { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, OUT_W, OUT_H); };
    const cx = OUT_W / 2;
    if (this.state === "title") {
      shade(.45);
      textC(ctx, "MAZE OF DARKNESS", cx + 6, 266, ART.rimP2, 14);
      textC(ctx, "MAZE OF DARKNESS", cx, 260, C.text, 14);
      textC(ctx, "A DESCENT BY LANTERN LIGHT", cx, 360, C.dim, 4);
      MENU.forEach((s, i) => {
        const sel = this.menu === i, y = 470 + i * 72;
        const label = i === 3 ? `${s} ${this.meta.unlocked.length}/${UNLOCKS.length}` : s;
        textC(ctx, (sel ? "> " : "  ") + label + (sel ? " <" : "  "), cx, y, sel ? C.key : C.dim, 6);
      });
      textC(ctx, `DEEPEST REACHED: DEPTH ${ROMAN(this.best)}` + (this.meta.wins ? ` - VICTORIES: ${this.meta.wins}` : ""), cx, 790, C.dim, 4);
      text(ctx, `BUILD ${BUILD}`, OUT_W - textW(`BUILD ${BUILD}`, 2) - 20, OUT_H - 34, C.dim, 2);
      if (touch.on) {
        textC(ctx, "LEFT THUMB MOVES - RIGHT THUMB ATTACKS, DRAG IT TO AIM - ROLL DODGES - FLARE DAZZLES", cx, 900, C.dim, 4);
        textC(ctx, "TAP A HOTBAR SLOT TO USE IT - BAG: GEAR AND TAROT DECK", cx, 950, C.dim, 4);
        textC(ctx, "TAP A LINE ABOVE TO START", cx, 1000, C.dim, 4);
      } else {
        textC(ctx, "WASD MOVE - MOUSE AIM - CLICK ATTACK - SPACE DODGE ROLL - TEMPLAR: RIGHT CLICK OR C BLOCKS - PAD: STICKS, RT ATTACK, LB ROLL, LT BLOCK", cx, 940, C.dim, 3);
        textC(ctx, "Q LANTERN FLARE - ITEMS: 1-6 USE A SLOT, E USE, R OR WHEEL NEXT - TAB: GEAR AND TAROT DECK - ENTER TO START - F FULLSCREEN - M SOUND", cx, 970, C.dim, 3);
        textC(ctx, "CO-OP AND HEAD TO HEAD: P2 ARROWS, RIGHT CTRL SHOOT, RIGHT SHIFT ROLL, BACKSLASH FLARE, / ITEM, . NEXT - OR A SECOND PAD (B FLARES)", cx, 1000, C.dim, 3);
      }
    } else if (this.state === "select") {
      shade(.8);
      this.drawSelect(ctx, time);
    } else if (this.state === "unlocks") {
      shade(.75);
      textC(ctx, "UNLOCKS", cx, 150, C.text, 10);
      textC(ctx, "REACH THESE IN ANY RUN AND EVERY RUN AFTER STARTS WITH THEM", cx, 250, C.dim, 3);
      UNLOCKS.forEach((u, i) => {
        const got = this.meta.unlocked.includes(u.id), y = 300 + i * 88;
        textC(ctx, got ? u.name : "? ? ?", cx, y, got ? C.key : "#3a4a58", 5);
        textC(ctx, got ? u.does : u.need, cx, y + 46, got ? C.text : C.dim, 3);
      });
      textC(ctx, "ENTER OR Q TO GO BACK", cx, 960, C.dim, 3);
    } else if (this.state === "play" && this.banner > 0) {
      ctx.globalAlpha = Math.min(1, this.banner);
      if (this.mode !== "versus") {
        textC(ctx, (this.mode === "coop" ? "CO-OP - " : "") + `DEPTH ${ROMAN(this.level)}`, cx, 380, C.text, 12);
        textC(ctx, REGION_NAMES[this.heroes[0].region], cx, 480, C.dim, 5);
        textC(ctx, lv.boss === "king" ? "THE LAMPLESS KING WAITS AT THE BOTTOM OF THE DARK"
          : lv.boss ? `${FOE[lv.boss].boss} GUARDS THE GRATE - DEFEAT IT TO GO ON`
          : `FIND ${lv.need} RUNE KEYS - REACH THE GRATE - KEEP YOUR LANTERN FED`, cx, 560, lv.boss ? C.warn : C.key, 4);
      } else {
        textC(ctx, "HEAD TO HEAD", cx, 380, C.text, 12);
        textC(ctx, `FIRST TO GRAB ${lv.need} RUNE KEYS AND REACH THE GRATE ESCAPES`, cx, 500, C.key, 4);
      }
      ctx.globalAlpha = 1;
    } else if (this.state === "paused") {
      shade(.6);
      textC(ctx, "PAUSED", cx, 420, C.text, 12);
      textC(ctx, "ENTER TO RESUME - Q TO QUIT TO TITLE - M SOUND", cx, 560, C.dim, 4);
    } else if (this.state === "cleared") {
      shade(.5);
      if (this.dest < this.level) {
        textC(ctx, `CLIMBING TO DEPTH ${ROMAN(this.dest)}`, cx, 420, C.text, 9);
        textC(ctx, "BACK UP THE LADDER...", cx, 560, C.dim, 4);
      } else if (this.floors[this.dest]) {
        textC(ctx, `DOWN TO DEPTH ${ROMAN(this.dest)}`, cx, 420, C.text, 9);
        textC(ctx, "THROUGH THE GRATE AGAIN...", cx, 560, C.dim, 4);
      } else {
        textC(ctx, `DEPTH ${ROMAN(this.level)} CLEARED`, cx, 420, C.key, 10);
        textC(ctx, "DESCENDING DEEPER...", cx, 560, C.dim, 4);
      }
    } else if (this.state === "dead") {
      shade(.7);
      const kills = this.heroes.reduce((a, h) => a + h.kills, 0), lvls = this.heroes.map(h => h.lvl).join(" AND ");
      textC(ctx, this.mode === "coop" ? "THE DARK TAKES YOU BOTH" : "THE DARK TAKES YOU", cx, 360, C.warn, 10);
      textC(ctx, `FELL IN DEPTH ${ROMAN(this.level)} AT LEVEL ${lvls} - ${kills} KILLS`, cx, 480, C.text, 4);
      this.newUnlocks.forEach((u, i) => textC(ctx, `UNLOCKED: ${u.name} - ${u.does}`, cx, 560 + i * 44, C.key, 4));
      textC(ctx, "ENTER FOR A NEW RUN - Q FOR TITLE", cx, 600 + this.newUnlocks.length * 44 + 30, C.dim, 4);
    } else if (this.state === "victory") {
      shade(.7);
      const kills = this.heroes.reduce((a, h) => a + h.kills, 0), lvls = this.heroes.map(h => h.lvl).join(" AND ");
      textC(ctx, "THE LAMPLESS KING FALLS", cx, 300, C.key, 10);
      textC(ctx, "LIGHT RETURNS TO THE DEEP", cx, 420, C.text, 6);
      textC(ctx, `ALL ${FINAL_FLOOR} DEPTHS CONQUERED AT LEVEL ${lvls} - ${kills} KILLS`, cx, 510, C.text, 4);
      this.newUnlocks.forEach((u, i) => textC(ctx, `UNLOCKED: ${u.name} - ${u.does}`, cx, 580 + i * 44, C.key, 4));
      textC(ctx, "ENTER FOR A NEW RUN - Q FOR TITLE", cx, 640 + this.newUnlocks.length * 44, C.dim, 4);
    } else if (this.state === "won") {
      shade(.6);
      textC(ctx, `P${this.winner + 1} ESCAPES!`, cx, 420, this.winner ? C.p2 : C.p1, 12);
      textC(ctx, "ENTER FOR A REMATCH - Q FOR TITLE", cx, 560, C.dim, 4);
    }
    if (this.state === "way") drawWay(this, ctx, time);
    if (this.synPop && this.state === "play" && !(this.banner > 0)) {  // a synergy woke: its name, and what it adds
      const p = this.synPop, a = Math.min(1, p.t / .4, (3.2 - p.t) / .2), y = OUT_H * .3;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = "rgba(20,14,6,.82)"; ctx.fillRect(cx - 520, y - 20, 1040, 150);
      ctx.strokeStyle = "#e8c860"; ctx.lineWidth = 3; ctx.strokeRect(cx - 514, y - 14, 1028, 138);
      textC(ctx, "SYNERGY!", cx, y, "#ffe08a", 5);
      textC(ctx, p.s.name, cx, y + 44, "#f3e6b8", 7);
      textC(ctx, synergyLines(p.s).join(" - ").toUpperCase(), cx, y + 100, "#c9b06a", 3);
      ctx.globalAlpha = 1;
    }
    if (this.state === "cards") drawCardDraw(this, ctx, time);
    if (this.state === "inventory") drawInventory(this, ctx, time);
    if (this.found && this.found.t > 0 && this.state === "play") {  // a new ability, announced in the middle of the screen
      const ab = ABILITIES[this.found.ability];
      ctx.globalAlpha = Math.min(1, this.found.t);
      shade(.35 * Math.min(1, this.found.t));
      textC(ctx, ab.name, cx, 360, rgbOf(ab.col), 11);
      textC(ctx, ab.does, cx, 470, C.text, 5);
      textC(ctx, "SOME GATES ON THE FLOORS ABOVE CAN NOW BE OPENED", cx, 540, C.dim, 4);
      ctx.globalAlpha = 1;
    }
    // a boss's name and health across the top while it fights
    const boss = this.state === "play" && this.foes.find(f => FOE[f.type].boss && !f.asleep && f.hp > 0);
    if (boss) {
      const spec = FOE[boss.type], bw = 760, bx = cx - bw / 2, by = OUT_H - 250;
      textC(ctx, spec.boss, cx, by - 40, C.warn, 5);
      ctx.fillStyle = "#000"; ctx.fillRect(bx - 4, by - 4, bw + 8, 30);
      ctx.fillStyle = "#3a1418"; ctx.fillRect(bx, by, bw, 22);
      ctx.fillStyle = "#e83a4a"; ctx.fillRect(bx, by, bw * Math.max(0, boss.hp) / spec.hp, 22);
    }
    if (this.showFps) text(ctx, `${this.fps} FPS`, 16, OUT_H - 40, C.dim, 3);
    // crosshair for mouse aiming, in place of the system cursor while playing
    const playing = this.state === "play";
    ctx.canvas.style.cursor = playing ? "none" : "default";
    if (playing && input.mouse.active) {
      const {x: mx, y: my} = input.mouse;
      ctx.fillStyle = "#000"; ctx.fillRect(mx - 13, my - 2, 26, 4); ctx.fillRect(mx - 2, my - 13, 4, 26);
      ctx.fillStyle = C.text;
      for (const [x0, y0, w, hh] of [[-12, -1, 8, 2], [4, -1, 8, 2], [-1, -12, 2, 8], [-1, 4, 2, 8]]) ctx.fillRect(mx + x0, my + y0, w, hh);
    }
  }
}

const rgbOf = c => `rgb(${c.map(v => Math.min(255, v * 255) | 0)})`;
// a sprite from art.js drawn straight onto the UI canvas
function drawSprite(ctx, spr, cols, x, y, s) {
  spr.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = cols[ch];
    if (ch === "." || !c) return;
    ctx.fillStyle = `rgb(${c.map(v => Math.min(255, v * 255) | 0)})`; ctx.fillRect(x + i * s, y + j * s, s, s);
  }));
}
const HEART = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
// a pixel heart: fill 2 = full, 1 = half, 0 = empty
function drawHeart(ctx, x, y, fill, blink) {
  const s = 4;
  for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) {
    if (HEART[j][i] !== "X") continue;
    const on = fill === 2 || (fill === 1 && i < 4);
    ctx.fillStyle = "#000"; ctx.fillRect(x + i * s + 2, y + j * s + 2, s, s);
    ctx.fillStyle = on ? (blink ? "#ffffff" : "#e83a4a") : "#3a1418"; ctx.fillRect(x + i * s, y + j * s, s, s);
  }
}
