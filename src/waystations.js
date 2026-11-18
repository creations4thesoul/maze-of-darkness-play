// Between the depths, Slay the Spire style: taking the grate down to a depth you have not seen yet brings you to a
// crossroads on the run's map, where you choose one of three ways down. Each way leads past a waystation:
//   THE HEARTH    rest (mend half your hearts and fill the lantern) or temper a card to the next rarity
//   THE PEDDLER   spend silver on cards, gear, stew and oil, or pay to burn a card out of your deck
//   A SHRINE      a strange meeting with a choice (a troll's bargain, a wishing well, the moss witch...)
//   THE THORNS    no stop: the depth below is crueller (tougher creatures, double silver), and its chest
//                 deals you a rare-or-better card draw
// Silver comes from every kill and every chest, and is shared by the whole party.
import {OUT_W, OUT_H} from "./art.js";
import {sfx} from "./audio.js";
import * as input from "./input.js";
import {touch} from "./touch.js";
import {frame, tarotCard, serifC, serifWrap, cardPicture, gearIcon, synergyRibbon, partnerHint, painting} from "./menus.js";
import {gainXp, xpNeed} from "./items.js";
import {TIERS, deckCard, drawCards, completes, cardFx} from "./tarot.js";
import {makeGear, RARITY, BAG_SIZE, describeStat} from "./gear.js";
import {refreshStats} from "./stats.js";
import {BOSS_FLOORS, FINAL_FLOOR} from "./level.js";
import {FOE} from "./combat.js";

const INK = "#2a2016", GOLD = "#d9c48a", DIM = "#8a8064", FAINT = "#6f6650", SILVER = "#c8d2dc", WARN = "#d86a4a";
const ROMAN = n => ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] || String(n);
const keys = {
  up: ["KeyW", "ArrowUp", "Pad0Up", "Pad1Up"], down: ["KeyS", "ArrowDown", "Pad0Down", "Pad1Down"],
  left: ["KeyA", "ArrowLeft", "Pad0Left", "Pad1Left"], right: ["KeyD", "ArrowRight", "Pad0Right", "Pad1Right"],
  ok: ["Enter", "Space", "Pad0A", "Pad1A"], back: ["Escape", "Backspace", "Pad0B", "Pad1B"]};
const hit = k => input.keyHit(...keys[k]);
const clickIn = r => r && input.keyHit("MouseLeft") && input.mouse.x >= r[0] && input.mouse.x < r[0] + r[2] && input.mouse.y >= r[1] && input.mouse.y < r[1] + r[3];
const rgb = c => `rgb(${c.map(v => Math.min(255, v * 255) | 0)})`;

// the ways down; pic is the painting shown on the way's card (tools/tarot_paint.py paints them)
export const WAYS = {
  hearth: {name: "THE HEARTH", pic: "hearth", lines: ["A fire someone left burning.", "Rest, or temper a card."], col: "#e0a050"},
  peddler: {name: "THE PEDDLER", pic: "peddler", lines: ["An old tomte with a heavy pack.", "Spend your silver."], col: SILVER},
  shrine: {name: "A SHRINE", pic: "shrine", lines: ["Something waits in the moss.", "A strange choice."], col: "#9fd0a0"},
  thorns: {name: "THE THORNS", pic: "thorns", lines: ["The cruel way down.", "Tougher creatures, double silver,", "and a rare card in its chest."], col: WARN},
};

for (const w of Object.values(WAYS)) painting(w.pic);  // load the paintings now, so none is missing when first shown

// ------------------------------------------------------------------ the crossroads
export function openCrossroads(game, dest) {
  const kinds = ["hearth", "peddler", "shrine", "thorns"];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  let ways = kinds.slice(0, 3);
  if (BOSS_FLOORS[dest] && !ways.includes("hearth")) ways[2] = "hearth";  // a fire before every boss
  if (dest === FINAL_FLOOR) ways = ways.filter(w => w !== "thorns").concat(["peddler", "shrine"].filter(w => !ways.includes(w))).slice(0, 3);
  game.way = {stage: "map", dest, ways, sel: 1, hero: 0, t: 0};
  game.state = "way"; sfx("rune");
}
const done = game => { game.way = null; game.enterDest(); };

export function updateWay(game, dt) {
  const w = game.way;
  w.t += dt;
  if (game.heroes.length > 1 && (input.keyHit("Digit1") || input.keyHit("Digit2"))) { w.hero = input.keyHit("Digit1") ? 0 : 1; sfx("menu"); }
  if (w.stage === "map") {
    if (hit("left")) { w.sel = (w.sel + w.ways.length - 1) % w.ways.length; sfx("menu"); }
    if (hit("right")) { w.sel = (w.sel + 1) % w.ways.length; sfx("menu"); }
    let go = hit("ok");
    (w.rects || []).forEach((r, k) => { if (clickIn(r)) { w.sel = k; go = true; } });
    if (go && w.t > .4) choose(game, w.ways[w.sel]);
  } else if (w.stage === "hearth") updateHearth(game);
  else if (w.stage === "peddler") updatePeddler(game);
  else if (w.stage === "shrine") updateShrine(game);
  else if (w.stage === "pick") updatePick(game);
}
function choose(game, kind) {
  const w = game.way;
  game.route[w.dest] = kind;
  sfx("open");
  if (kind === "thorns") { game.floorMods[w.dest] = "thorns"; game.toast("YOU TAKE THE THORNY WAY", WARN); return done(game); }
  w.stage = kind; w.sel = 0; w.t = 0;
  if (kind === "peddler") stockPeddler(game);
  if (kind === "shrine") w.event = EVENTS[Math.random() * EVENTS.length | 0];
}

// the run's map: ten depths along a winding path, bosses marked, the ways you took shown at each, and where you are
function drawRunMap(game, ctx, dest, time) {
  const x0 = 250, x1 = OUT_W - 250, y = 100;
  const px = n => x0 + (x1 - x0) * (n - 1) / (FINAL_FLOOR - 1), py = n => y + Math.sin(n * 1.7) * 26;
  ctx.strokeStyle = "#4a4232"; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
  ctx.beginPath(); for (let n = 1; n <= FINAL_FLOOR; n++) (n === 1 ? ctx.moveTo : ctx.lineTo).call(ctx, px(n), py(n)); ctx.stroke(); ctx.setLineDash([]);
  for (let n = 1; n <= FINAL_FLOOR; n++) {
    const x = px(n), yy = py(n), past = n < dest, here = n === dest, boss = BOSS_FLOORS[n];
    const r = boss ? 26 : 20, pulse = here ? 1 + .12 * Math.sin(time * 5) : 1;
    ctx.fillStyle = "#14120d"; ctx.beginPath(); ctx.arc(x, yy, r * pulse + 5, 0, 7); ctx.fill();
    ctx.fillStyle = past ? "#8a7440" : here ? "#e8cf80" : "#2e2a20"; ctx.beginPath(); ctx.arc(x, yy, r * pulse, 0, 7); ctx.fill();
    serifC(ctx, ROMAN(n), x, yy - 11, 20, past || here ? INK : FAINT, {bold: true});
    if (boss) serifC(ctx, (FOE[boss].boss || "BOSS").replace("THE ", ""), x, yy + 32, 14, here ? WARN : "#7a4a3a", {bold: true, spacing: 1});
    const took = game.route[n];
    if (took && n <= dest) { ctx.fillStyle = WAYS[took].col; ctx.fillRect(x - 5, yy - r - 18, 10, 10); }
  }
}

export function drawWay(game, ctx, time) {
  const w = game.way;
  ctx.fillStyle = "#0a0b08"; ctx.fillRect(0, 0, OUT_W, OUT_H);
  drawRunMap(game, ctx, w.dest, time);
  serifC(ctx, `SILVER ${game.silver}`, OUT_W - 150, 36, 30, SILVER, {bold: true, spacing: 2});
  if (game.heroes.length > 1 && w.stage !== "map") serifC(ctx, `FOR P${w.hero + 1}  (1 / 2 TO SWITCH)`, 150, 36, 24, "#a89c74", {bold: true});
  if (w.stage === "map") drawCrossroads(game, ctx, time);
  else if (w.stage === "hearth") drawHearth(game, ctx, time);
  else if (w.stage === "peddler") drawPeddler(game, ctx, time);
  else if (w.stage === "shrine") drawShrine(game, ctx, time);
  else if (w.stage === "pick") drawPick(game, ctx, time);
  const t = game.toasts[game.toasts.length - 1];  // the latest news, along the very foot
  if (t) serifC(ctx, t.s, OUT_W / 2, 1040, 24, t.col, {bold: true, spacing: 1});
}
// a way's card: its painting, its name and what lies along it
function wayCard(ctx, x, y, cw, ch, way, sel, time, foot) {
  if (sel) y -= 16;
  frame(ctx, x, y, cw, ch, sel);
  cardPicture(ctx, {id: way.pic, icon: "lantern"}, x + 30, y + 30, cw - 60, ch * .5, time);
  let ty = y + 46 + ch * .5;
  serifC(ctx, way.name, x + cw / 2, ty, 34, INK, {bold: true, spacing: 2}); ty += 52;
  for (const l of way.lines) for (const part of serifWrap(ctx, l, cw - 70, 22, false)) { serifC(ctx, part, x + cw / 2, ty, 22, "#4a4030"); ty += 28; }
  if (foot) serifC(ctx, foot, x + cw / 2, y + ch - 52, 18, WARN, {bold: true, spacing: 1});
}
function drawCrossroads(game, ctx, time) {
  const w = game.way, boss = BOSS_FLOORS[w.dest];
  serifC(ctx, `THE WAY TO DEPTH ${ROMAN(w.dest)}`, OUT_W / 2, 230, 52, GOLD, {bold: true, spacing: 3});
  serifC(ctx, boss ? `${FOE[boss].boss} WAITS BELOW` : "CHOOSE YOUR WAY DOWN", OUT_W / 2, 296, 26, boss ? WARN : DIM, {bold: true, spacing: 2});
  const cw = 440, ch = 560, gap = 60, x0 = OUT_W / 2 - (cw * w.ways.length + gap * (w.ways.length - 1)) / 2;
  w.rects = w.ways.map((k, i) => { const x = x0 + i * (cw + gap); wayCard(ctx, x, 360, cw, ch, WAYS[k], i === w.sel, time); return [x, 344, cw, ch + 16]; });
  serifC(ctx, touch.on ? "TAP A WAY TO TAKE IT" : "LEFT / RIGHT TO CHOOSE - ENTER OR CLICK TO TAKE IT", OUT_W / 2, 1000, DIM, 22, {bold: true});
}

// a row of buttons along the foot of a screen; returns the index clicked, or -1
function buttons(ctx, labels, sel, y, disabled = []) {
  const bw = Math.min(560, (OUT_W - 200) / labels.length - 30), x0 = OUT_W / 2 - (labels.length * (bw + 30) - 30) / 2;
  return labels.map((l, i) => {
    const x = x0 + i * (bw + 30), on = i === sel, off = disabled[i];
    ctx.fillStyle = "#000"; ctx.fillRect(x - 4, y - 4, bw + 8, 78);
    ctx.fillStyle = on ? "#4d4430" : "#262118"; ctx.fillRect(x, y, bw, 70);
    if (on) { ctx.strokeStyle = "#f0cf74"; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, bw - 4, 66); }
    const lines = serifWrap(ctx, l, bw - 30, 22, false);
    lines.slice(0, 2).forEach((s, k) => serifC(ctx, s, x + bw / 2, y + (lines.length > 1 ? 8 : 22) + k * 28, 22, off ? "#5a5244" : on ? "#f3e6b8" : GOLD, {bold: true}));
    return [x, y, bw, 70];
  });
}
function menuInput(w, n) {
  if (hit("left") || hit("up")) { w.sel = (w.sel + n - 1) % n; sfx("menu"); }
  if (hit("right") || hit("down")) { w.sel = (w.sel + 1) % n; sfx("menu"); }
  let go = hit("ok") && w.t > .3;
  (w.btns || []).forEach((r, k) => { if (clickIn(r)) { w.sel = k; go = true; } });
  return go ? w.sel : -1;
}
// a scene: a big painting with a title and a few lines under it
function scenePanel(ctx, pic, title, lines, time) {
  const pw = 760, ph = 420, x = OUT_W / 2 - pw / 2, y = 240;
  frame(ctx, x - 30, y - 30, pw + 60, ph + 60);
  cardPicture(ctx, {id: pic, icon: "lantern"}, x, y, pw, ph, time);
  serifC(ctx, title, OUT_W / 2, 700, 48, GOLD, {bold: true, spacing: 3});
  lines.forEach((l, i) => serifC(ctx, l, OUT_W / 2, 768 + i * 34, 26, "#b8ac88", {italic: true}));
}

// ------------------------------------------------------------------ the hearth
const upgradable = h => h.deck.some(e => (e.tier || 0) < 2);
function updateHearth(game) {
  const w = game.way, h = game.heroes[w.hero];
  const k = menuInput(w, 2);
  if (k === 0) {  // rest: every hero mends half their hearts and fills their lantern
    for (const o of game.heroes) { o.hp = Math.min(o.maxHp, o.hp + Math.max(2, Math.round(o.maxHp / 4) * 2)); o.oil = 100; }
    sfx("drink"); game.toast("YOU REST BY THE FIRE", "#e0a050"); done(game);
  } else if (k === 1) {
    if (!upgradable(h)) { sfx("locked"); return; }
    openPick(game, "temper", "TEMPER A CARD", "IT RISES ONE RARITY", e => (e.tier || 0) < 2);
  }
}
function drawHearth(game, ctx, time) {
  const w = game.way, h = game.heroes[w.hero];
  scenePanel(ctx, "hearth", "THE HEARTH", ["Someone left this fire burning. It will burn a little longer for you."], time);
  const heal = game.heroes.map(o => Math.max(2, Math.round(o.maxHp / 4) * 2) / 2).join(" / ");
  w.btns = buttons(ctx, [`REST: MEND ${heal} HEARTS, FILL YOUR LANTERN`, upgradable(h) ? "TEMPER: RAISE A CARD ONE RARITY" : "TEMPER: NO CARD TO RAISE"], w.sel, 900, [false, !upgradable(h)]);
}

// ------------------------------------------------------------------ choosing a card from the deck (temper, burn, transform)
function openPick(game, act, title, sub, filter, back = game.way.stage) {
  const w = game.way;
  w.pick = {act, title, sub, filter, back, card: 0}; w.stage = "pick"; w.t = 0; sfx("menu");
}
function updatePick(game) {
  const w = game.way, p = w.pick, h = game.heroes[w.hero], n = Math.max(1, h.deck.length);
  if (hit("back")) { w.stage = p.back; w.t = 0; sfx("menu"); return; }
  if (hit("left")) p.card = (p.card + n - 1) % n;
  if (hit("right")) p.card = (p.card + 1) % n;
  if (hit("up")) p.card = Math.max(0, p.card - 6);
  if (hit("down")) p.card = Math.min(n - 1, p.card + 6);
  let go = hit("ok") && w.t > .3;
  (p.rects || []).forEach((r, k) => { if (clickIn(r)) { if (p.card === k || touch.on) go = true; p.card = k; } });
  if (clickIn(p.backRect)) { w.stage = p.back; w.t = 0; sfx("menu"); return; }
  const e = h.deck[p.card];
  if (!go || !e) return;
  if (!p.filter(e)) { sfx("locked"); return; }
  const card = deckCard(e);
  if (p.act === "temper") {
    e.tier = (e.tier || 0) + 1;
    const fx = cardFx(card, e.tier), was = cardFx(card, e.tier - 1);
    if (fx.deathSave > (was.deathSave || 0)) h.saves = (h.saves || 0) + fx.deathSave - (was.deathSave || 0);
    sfx("relic"); game.toast(`${card.name} BECOMES ${TIERS[e.tier].name}`, rgb(TIERS[e.tier].col));
  } else if (p.act === "burn") {
    h.deck.splice(p.card, 1); game.silver -= w.shop.burnCost; game.burns++; w.shop.burned = true;
    sfx("fireball"); game.toast(`${card.name} BURNS AWAY`, WARN);
  } else if (p.act === "transform") {
    h.deck.splice(p.card, 1);
    const [nc] = drawCards(h, 1, Math.min(2, (e.tier || 0) + 1));
    if (nc) h.deck.push({id: nc.id, tier: nc.tier});
    sfx("rune"); game.toast(nc ? `${card.name} BECOMES ${TIERS[nc.tier].name} ${nc.name}` : `${card.name} CRUMBLES`, GOLD);
  } else if (p.act === "upgrade2") {
    e.tier = (e.tier || 0) + 1; sfx("relic"); game.toast(`${card.name} BECOMES ${TIERS[e.tier].name}`, rgb(TIERS[e.tier].col));
    if (--p.left > 0 && h.deck.some(p.filter)) { refreshStats(h); w.t = 0; return; }
  }
  refreshStats(h);
  if (p.act === "burn") { w.stage = "peddler"; w.t = 0; return; }
  done(game);
}
function drawPick(game, ctx, time) {
  const w = game.way, p = w.pick, h = game.heroes[w.hero];
  serifC(ctx, p.title, OUT_W / 2, 230, 46, GOLD, {bold: true, spacing: 3});
  serifC(ctx, p.sub, OUT_W / 2, 290, 24, DIM, {bold: true, spacing: 1});
  const rows = Math.ceil(h.deck.length / 6), k0 = Math.min(1, 620 / (rows * 280 - 40)), cw = 150 * k0, ch = 240 * k0;
  p.rects = h.deck.map((e, k) => {
    const x = 70 + (k % 6) * (cw + 26 * k0), y = 350 + Math.floor(k / 6) * (ch + 40 * k0), card = deckCard(e), on = k === p.card, dy = on ? -10 * k0 : 0;
    frame(ctx, x, y + dy, cw, ch, on, card.tier);
    cardPicture(ctx, card, x + 26 * k0, y + 38 * k0 + dy, cw - 52 * k0, 116 * k0, time);
    serifC(ctx, card.num, x + cw / 2, y + 166 * k0 + dy, 26 * k0, INK, {bold: true, spacing: 2 * k0});
    if (!p.filter(e)) { ctx.fillStyle = "rgba(8,9,6,.6)"; ctx.fillRect(x - 4, y + dy - 4, cw + 8, ch + 8); }
    return [x, y, cw, ch];
  });
  const e = h.deck[p.card];
  if (e) {
    const card = deckCard(e), next = p.act === "temper" || p.act === "upgrade2" ? Math.min(2, card.tier + 1) : card.tier;
    tarotCard(ctx, 1240, 330, 520, 680, Object.assign({}, card, {tier: next}), false, time);
    if (next !== card.tier) serifC(ctx, `${TIERS[card.tier].name}  >  ${TIERS[next].name}`, 1500, 1020, 22, rgb(TIERS[next].col), {bold: true, spacing: 2});
  }
  ctx.fillStyle = "#262118"; ctx.fillRect(70, 960, 220, 60); serifC(ctx, "< BACK", 180, 975, 24, GOLD, {bold: true});
  p.backRect = [70, 960, 220, 60];
  serifC(ctx, touch.on ? "TAP A CARD, THEN TAP IT AGAIN" : "ARROWS TO LOOK - ENTER OR CLICK TO CHOOSE - ESC BACK", 660, 980, 20, DIM, {bold: true});
}

// ------------------------------------------------------------------ the peddler
const CARD_PRICE = [45, 75, 120], GEAR_PRICE = [35, 60, 100];
function stockPeddler(game) {
  const w = game.way, h = game.heroes[w.hero];
  const cards = drawCards(h, 3).map(c => ({kind: "card", card: c, price: CARD_PRICE[c.tier] + (Math.random() * 10 | 0)}));
  const gear = [0, 1].map(() => { const g = makeGear(w.dest, Math.random() < .3 ? 1 : 0); return {kind: "gear", gear: g, price: GEAR_PRICE[g.rarity] + (Math.random() * 10 | 0)}; });
  w.shop = {items: [...cards, ...gear,
    {kind: "stew", name: "HEARTY STEW", say: "MEND 2 HEARTS", price: 30},
    {kind: "oil", name: "LAMP OIL", say: "FILL YOUR LANTERN", price: 15},
    {kind: "burn", name: "BURN A CARD", say: "TAKE ONE OUT OF YOUR DECK", price: 0},
    {kind: "leave", name: "LEAVE", say: "GO ON DOWN", price: 0}], burnCost: 40 + 25 * game.burns};
}
function updatePeddler(game) {
  const w = game.way, s = w.shop, h = game.heroes[w.hero], n = s.items.length;
  if (hit("back")) return done(game);
  if (hit("left")) { w.sel = (w.sel + n - 1) % n; sfx("menu"); }
  if (hit("right")) { w.sel = (w.sel + 1) % n; sfx("menu"); }
  if (hit("up")) { w.sel = w.sel >= 3 ? Math.min(2, w.sel - 3) : w.sel; sfx("menu"); }
  if (hit("down")) { w.sel = w.sel < 3 ? w.sel + 3 : w.sel; sfx("menu"); }
  let go = hit("ok") && w.t > .3;
  (w.btns || []).forEach((r, k) => { if (clickIn(r)) { if (w.sel === k || touch.on) go = true; w.sel = k; } });
  if (!go) return;
  const it = s.items[w.sel], cost = it.kind === "burn" ? s.burnCost : it.price;
  if (it.kind === "leave") return done(game);
  if (it.sold || game.silver < cost) { sfx("locked"); game.toast(it.sold ? "ALREADY SOLD" : "NOT ENOUGH SILVER", WARN); return; }
  if (it.kind === "burn") {
    if (s.burned || !h.deck.length) { sfx("locked"); return; }
    return openPick(game, "burn", "BURN A CARD", `${s.burnCost} SILVER - IT LEAVES YOUR DECK FOR GOOD`, () => true, "peddler");
  }
  if (it.kind === "card" && it.card.suit && it.card.suit !== h.cls) { sfx("locked"); game.toast("THAT CARD IS NOT FOR YOUR CLASS", WARN); return; }
  if (it.kind === "gear" && h.bag.length >= BAG_SIZE) { sfx("locked"); game.toast("YOUR LOOT BAG IS FULL", WARN); return; }
  game.silver -= cost; it.sold = true; sfx("coin");
  if (it.kind === "card") { h.deck.push({id: it.card.id, tier: it.card.tier}); const fx = cardFx(it.card, it.card.tier); if (fx.deathSave) h.saves = (h.saves || 0) + fx.deathSave; refreshStats(h); game.toast(`${it.card.name} JOINS YOUR DECK`, GOLD); }
  else if (it.kind === "gear") { h.bag.push(it.gear); game.toast(`${it.gear.name} - IN YOUR BAG`, rgb(RARITY[it.gear.rarity].col)); }
  else if (it.kind === "stew") { h.hp = Math.min(h.maxHp, h.hp + 4); it.sold = false; }
  else if (it.kind === "oil") { h.oil = 100; it.sold = false; }
}
function drawPeddler(game, ctx, time) {
  const w = game.way, s = w.shop, h = game.heroes[w.hero];
  serifC(ctx, "THE PEDDLER", OUT_W / 2, 186, 46, GOLD, {bold: true, spacing: 3});
  serifC(ctx, "\"Fine things from the deep wood. Silver only.\"", OUT_W / 2, 240, 24, "#b8ac88", {italic: true});
  // the peddler himself, in a small painting at the left
  frame(ctx, 50, 330, 300, 380); cardPicture(ctx, {id: "peddler", icon: "lantern"}, 72, 352, 256, 336, time);
  w.btns = [];
  const price = (x, y, it, cost) => serifC(ctx, it.sold ? "SOLD" : `${cost} SILVER`, x, y, 24, it.sold ? FAINT : game.silver >= cost ? SILVER : WARN, {bold: true, spacing: 1});
  // three cards across the top
  s.items.slice(0, 3).forEach((it, k) => {
    const x = 400 + k * 330, y = 330, on = w.sel === k;
    tarotCard(ctx, x, y, 290, 460, it.card, on, time);
    if (it.sold) { ctx.fillStyle = "rgba(8,9,6,.75)"; ctx.fillRect(x - 6, y - 22, 302, 486); }
    const syn = completes(h.deck, it.card);
    if (syn.length && !it.sold) synergyRibbon(ctx, x + 145, y - (on ? 46 : 30), syn[0].name, time);
    price(x + 145, y + 474, it, it.price);
    if (!it.sold && !syn.length) partnerHint(ctx, h, it.card, x + 145, y + 510, 15);
    w.btns.push([x, y - 16, 290, 476]);
  });
  // gear and the services down the right
  s.items.slice(3).forEach((it, k) => {
    const i = k + 3, x = 1400 + (k % 2) * 250, y = 330 + (k >> 1) * 230, on = w.sel === i, cost = it.kind === "burn" ? s.burnCost : it.price;
    ctx.fillStyle = "#000"; ctx.fillRect(x - 4, y - 4, 238, 218);
    ctx.fillStyle = on ? "#4d4430" : "#262118"; ctx.fillRect(x, y, 230, 210);
    if (on) { ctx.strokeStyle = "#f0cf74"; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, 226, 206); }
    if (it.kind === "gear") {
      gearIcon(ctx, it.gear, x + 115 - 36, y + 14, 8);
      ctx.fillStyle = rgb(RARITY[it.gear.rarity].col); ctx.fillRect(x, y + 204, 230, 6);
      serifWrap(ctx, it.gear.name, 210, 16, false).slice(0, 2).forEach((l, j) => serifC(ctx, l, x + 115, y + 90 + j * 20, 16, GOLD, {bold: true}));
      Object.entries(it.gear.stats).slice(0, 2).forEach(([kk, v], j) => serifC(ctx, describeStat(kk, v), x + 115, y + 134 + j * 20, 15, "#b8ac88", {bold: true}));
      price(x + 115, y + 176, it, cost);
    } else {
      serifC(ctx, it.name, x + 115, y + 40, 24, it.kind === "leave" ? GOLD : "#e8dcb4", {bold: true, spacing: 1});
      serifWrap(ctx, it.say, 200, 18, false).forEach((l, j) => serifC(ctx, l, x + 115, y + 86 + j * 24, 18, "#b8ac88", {bold: true}));
      if (it.kind === "burn") serifC(ctx, s.burned ? "ONCE PER VISIT" : `${cost} SILVER`, x + 115, y + 160, 24, s.burned ? FAINT : game.silver >= cost ? SILVER : WARN, {bold: true});
      else if (it.kind !== "leave") price(x + 115, y + 160, it, cost);
    }
    if (it.sold && it.kind === "gear") { ctx.fillStyle = "rgba(8,9,6,.7)"; ctx.fillRect(x, y, 230, 210); serifC(ctx, "SOLD", x + 115, y + 90, 30, FAINT, {bold: true}); }
    w.btns.push([x, y, 230, 210]);
  });
  serifC(ctx, `HEARTS ${h.hp / 2} / ${h.maxHp / 2}   -   ${h.cls === "mage" ? "MANA" : "OIL"} ${Math.round(h.oil)}   -   DECK ${h.deck.length}   -   BAG ${h.bag.length}/${BAG_SIZE}`, OUT_W / 2, 1000, DIM, 22, {bold: true});
  if (!touch.on) serifC(ctx, "ARROWS TO BROWSE - ENTER OR CLICK TO BUY - ESC TO LEAVE", 875, 900, 20, FAINT, {bold: true});
}
// ------------------------------------------------------------------ shrines: a meeting and a choice
export const EVENTS = [
  {id: "troll", pic: "devil", title: "THE TROLL'S BARGAIN", lines: ["\"A piece of your heart,\" the troll rumbles, \"for a card of real power.\""],
    choices: game => [
      {label: "GIVE A HEART: DRAW 3 LEGENDARY CARDS, KEEP ONE", ok: h => h.maxHp > 2, act: (game, h) => { h.maxHp -= 2; h.hp = Math.min(h.hp, h.maxHp); h.cardsDue++; h.drawMin = 2; }},
      {label: "WALK AWAY", act: () => {}}]},
  {id: "well", pic: "star", title: "THE WISHING WELL", lines: ["Silver glints far down in the black water."],
    choices: game => [
      {label: "THROW IN 30 SILVER: A CHANCE AT FINE GEAR", ok: () => game.silver >= 30, act: (game, h) => {
        game.silver -= 30;
        if (Math.random() < .65 && h.bag.length < BAG_SIZE) { const g = makeGear(game.way.dest, 1); h.bag.push(g); game.toast(`THE WELL GIVES: ${g.name}`, rgb(RARITY[g.rarity].col), "relic"); }
        else game.toast("THE WATER IS STILL. NOTHING.", DIM, "locked"); }},
      {label: "KEEP YOUR SILVER", act: () => {}}]},
  {id: "elk", pic: "chariot", title: "THE ELK'S BLESSING", lines: ["The great elk lowers its antlers to you."],
    choices: game => [
      {label: "RAISE TWO CARDS ONE RARITY", ok: h => h.deck.some(e => (e.tier || 0) < 2), pick: ["upgrade2", "THE ELK'S BLESSING", "CHOOSE A CARD TO RAISE (TWO IN ALL)", e => (e.tier || 0) < 2]},
      {label: "MEND EVERY HEART", act: (game) => { for (const o of game.heroes) o.hp = o.maxHp; sfx("drink"); }}]},
  {id: "witch", pic: "magician", title: "THE MOSS WITCH", lines: ["\"Give me one of your cards, dearie, and I'll make it something finer.\""],
    choices: game => [
      {label: "TRANSFORM A CARD INTO A RANDOM ONE, ONE RARITY HIGHER", ok: h => h.deck.length > 0, pick: ["transform", "THE MOSS WITCH", "CHOOSE A CARD TO GIVE HER", () => true]},
      {label: "SHE GIVES YOU 40 SILVER TO GO AWAY", act: game => { game.silver += 40; sfx("coin"); }}]},
  {id: "owl", pic: "priestess", title: "THE OWL'S RIDDLE", lines: ["The owl asks a riddle. You know the answer."],
    choices: game => [
      {label: "LEARN WHAT EVERY TONIC AND SLATE DOES", act: game => { for (const k of ["tonic", "rune"]) for (let i = 0; i < 6; i++) game.lore.known[k].add(i); game.toast("YOU KNOW EVERY BREW AND SLATE", GOLD, "rune"); }},
      {label: "LEARN FROM IT: GAIN A LEVEL'S WORTH OF XP", act: (game, h) => gainXp(game, h, xpNeed(h.lvl))}]},
  {id: "chest", pic: "fortune", title: "THE MIMIC'S CHEST", lines: ["A chest sits alone on a mossy stone. Its lid breathes, very slightly."],
    choices: game => [
      {label: "OPEN IT: 60 SILVER, BUT IT BITES (LOSE A HEART)", ok: h => h.hp > 2, act: (game, h) => { h.hp -= 2; game.silver += 60; sfx("coin"); sfx("hurt"); }},
      {label: "LEAVE IT BE", act: () => {}}]},
];
function updateShrine(game) {
  const w = game.way, h = game.heroes[w.hero], ch = w.event.choices(game);
  const k = menuInput(w, ch.length);
  if (k < 0) return;
  const c = ch[k];
  if (c.ok && !c.ok(h)) { sfx("locked"); return; }
  if (c.pick) { openPick(game, c.pick[0], c.pick[1], c.pick[2], c.pick[3]); w.pick.left = 2; return; }
  c.act(game, h); done(game);
}
function drawShrine(game, ctx, time) {
  const w = game.way, h = game.heroes[w.hero], ch = w.event.choices(game);
  scenePanel(ctx, w.event.pic, w.event.title, w.event.lines, time);
  w.btns = buttons(ctx, ch.map(c => c.label), w.sel, 900, ch.map(c => c.ok && !c.ok(h)));
}
