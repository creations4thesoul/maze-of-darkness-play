// Tarot-styled screens: the level-up card draw, and the equipment / loot bag / deck screen. Everything is drawn
// on the UI canvas in card frames (concept/STYLE_GUIDE.md): parchment, a gilt double border, a numeral plaque, a
// dark picture panel with a gilded emblem, and a name banner.
import {OUT_W, OUT_H} from "./art.js";
import {text, textC, textW, UI_FONT} from "./render.js";
import {sfx} from "./audio.js";
import * as input from "./input.js";
import {touch} from "./touch.js";
import {CARDS, ICONS, TIERS, cardById, cardFx, deckCard, effectLines} from "./tarot.js";
import {SLOTS, SLOT_NAMES, RARITY, BAG_SIZE, GEAR_ICONS, slotFor, describeStat} from "./gear.js";
import {statOf, refreshStats} from "./stats.js";
import {heroFrames, heroPalette, shadeHero} from "./heroes.js";

const INK = "#2a2016", PARCH = "#c9bb93", PARCH_DK = "#a8996f", GILT = "#c19a45", GILT_DK = "#7d5f27", NIGHT = "#1d211a";
const rgb = c => `rgb(${c.map(v => Math.min(255, v * 255) | 0)})`;
const keys = {
  up: ["KeyW", "ArrowUp", "Pad0Up", "Pad1Up"], down: ["KeyS", "ArrowDown", "Pad0Down", "Pad1Down"],
  left: ["KeyA", "ArrowLeft", "Pad0Left", "Pad1Left"], right: ["KeyD", "ArrowRight", "Pad0Right", "Pad1Right"],
  ok: ["Enter", "Space", "Pad0A", "Pad1A"], drop: ["KeyX", "Delete", "Pad0X", "Pad1X"], close: ["Tab", "Escape", "KeyI", "Pad0B", "Pad1B"],
  prevTab: ["KeyQ", "Pad0Roll"], nextTab: ["KeyE", "Pad0LT"]};
const hit = k => input.keyHit(...keys[k]);
const clickIn = r => input.keyHit("MouseLeft") && input.mouse.x >= r[0] && input.mouse.x < r[0] + r[2] && input.mouse.y >= r[1] && input.mouse.y < r[1] + r[3];

// ------------------------------------------------------------------ drawing pieces
export function wrap(s, n) {
  const out = [];
  let line = "";
  for (const w of s.split(" ")) { if ((line + " " + w).trim().length > n) { out.push(line.trim()); line = w; } else line += " " + w; }
  if (line.trim()) out.push(line.trim());
  return out;
}
function pixels(ctx, rows, x, y, s, ink, gilt, extra = {}) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = ch === "X" ? ink : ch === "o" ? gilt : extra[ch];
    if (c) { ctx.fillStyle = c; ctx.fillRect(x + i * s, y + j * s, s, s); }
  }));
}
// a card frame: parchment field, gilt double border, gilt corner studs; sel lifts and brightens it. A tarot card's
// rarity tier colours the border: plain gilt for common, cold silver-blue for rare, and bright gold with a glow
// for legendary.
const TIER_RIM = ["#c19a45", "#8fb4d8", "#f2cc66"], TIER_RIM_DK = ["#7d5f27", "#4f6f8f", "#a37a2a"];
export function frame(ctx, x, y, w, h, sel = false, tier = -1) {
  const rim = tier >= 0 ? TIER_RIM[tier] : GILT, rimDk = tier >= 0 ? TIER_RIM_DK[tier] : GILT_DK;
  if (tier === 2) {  // a legendary card glows
    ctx.save(); ctx.shadowColor = "rgba(242,204,102,.75)"; ctx.shadowBlur = 34;
    ctx.fillStyle = INK; ctx.fillRect(x - 4, y - 4, w + 8, h + 8); ctx.restore();
  }
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(x + 8, y + 10, w, h);
  ctx.fillStyle = INK; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = PARCH; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PARCH_DK; ctx.fillRect(x, y, w, 6); ctx.fillRect(x, y + h - 6, w, 6); ctx.fillRect(x, y, 6, h); ctx.fillRect(x + w - 6, y, 6, h);
  if (sel) { ctx.strokeStyle = "#f3e6b8"; ctx.lineWidth = 3; ctx.strokeRect(x - 9, y - 9, w + 18, h + 18); }  // picked: a pale outline
  ctx.strokeStyle = rim; ctx.lineWidth = tier > 0 ? 6 : 4; ctx.strokeRect(x + 14, y + 14, w - 28, h - 28);
  ctx.strokeStyle = rimDk; ctx.lineWidth = 2; ctx.strokeRect(x + 22, y + 22, w - 44, h - 44);
  for (const [cx, cy] of [[x + 14, y + 14], [x + w - 14, y + 14], [x + 14, y + h - 14], [x + w - 14, y + h - 14]]) {
    ctx.fillStyle = INK; ctx.fillRect(cx - 9, cy - 9, 18, 18); ctx.fillStyle = rim; ctx.fillRect(cx - 6, cy - 6, 12, 12);
  }
}
// the cards' paintings (tools/tarot_paint.py), loaded once; until one arrives the card shows its pixel emblem
const PAINT = {};
function painting(id) {
  if (!PAINT[id]) { PAINT[id] = new Image(); PAINT[id].src = `art/tarot/${id}.jpg`; }
  return PAINT[id].complete && PAINT[id].naturalWidth ? PAINT[id] : null;
}
for (const c of CARDS) painting(c.id);  // start loading every painting now, so none is missing when first shown
// a card's picture: its painting, cropped to fill the panel, or the emblem on a starry night until it loads
function cardPicture(ctx, card, px, py, pw, ph, time) {
  ctx.fillStyle = INK; ctx.fillRect(px - 4, py - 4, pw + 8, ph + 8);
  const img = painting(card.id);
  if (img) {
    const k = Math.max(pw / img.width, ph / img.height), sw = pw / k, sh = ph / k;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, px, py, pw, ph);
    return;
  }
  ctx.fillStyle = NIGHT; ctx.fillRect(px, py, pw, ph);
  const icon = ICONS[card.icon] || ICONS.star, is = Math.max(2, Math.floor(Math.min(pw, ph) / 13));
  pixels(ctx, icon, px + pw / 2 - icon[0].length * is / 2, py + ph / 2 - icon.length * is / 2, is, "#d9c48a", card.suit ? "#c96f4a" : "#e8d27a");
}
// card lettering is set in a book serif, like the captions of an old fairy-tale book, so it reads at any size
const SERIF = UI_FONT;  // the same face as every other word in the game
function serifC(ctx, s, cx, y, size, col, {bold = false, italic = false, spacing = 0} = {}) {
  ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${Math.round(size)}px ${SERIF}`;
  ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = col;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(s, cx, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.textAlign = "start";
}
function serifWrap(ctx, s, width, size, italic) {
  ctx.font = `${italic ? "italic " : ""}${Math.round(size)}px ${SERIF}`;
  const out = [];
  let line = "";
  for (const w of s.split(" ")) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
const TIER_INK = ["#6a6248", "#3f5f80", "#8a6418"];  // each tier's colour, dark enough to read on parchment
// a whole tarot card: numeral plaque, the painting, name banner, a line of flavour, then exactly what it does
// with this card's rarity, and the rarity (and suit) along the foot
export function tarotCard(ctx, x, y, w, h, card, sel = false, time = 0) {
  if (sel) y -= 16;
  const tier = card.tier || 0;
  frame(ctx, x, y, w, h, sel, tier);
  const cx = x + w / 2, u = w / 360;  // u: one unit of a full-size card
  ctx.fillStyle = INK; ctx.fillRect(cx - 40 * u, y + 26 * u, 80 * u, 36 * u); ctx.fillStyle = PARCH; ctx.fillRect(cx - 36 * u, y + 30 * u, 72 * u, 28 * u);
  serifC(ctx, card.num, cx, y + 31 * u, 24 * u, INK, {bold: true, spacing: 2 * u});
  // on a phone the words get the room: a shorter picture, and every line set larger
  const tb = touch.on ? 1.3 : 1;
  const px = x + 34 * u, py = y + 72 * u, pw = w - 68 * u, ph = Math.round(Math.min(pw, h * (touch.on ? .36 : .44)));
  cardPicture(ctx, card, px, py, pw, ph, time);
  const by = py + ph + 12 * u, bh = 40 * u;
  ctx.fillStyle = INK; ctx.fillRect(x + 22 * u, by, w - 44 * u, bh); ctx.fillStyle = PARCH_DK; ctx.fillRect(x + 26 * u, by + 4 * u, w - 52 * u, bh - 8 * u);
  let ns = 22 * u * tb;
  ctx.font = `bold ${Math.round(ns)}px ${SERIF}`;
  while (ctx.measureText(card.name).width + card.name.length * 1.5 * u > w - 70 * u && ns > 12) { ns -= 1; ctx.font = `bold ${Math.round(ns)}px ${SERIF}`; }
  serifC(ctx, card.name, cx, by + (bh - ns) / 2 + 1, ns, INK, {bold: true, spacing: 1.5 * u});
  // the flavour, small and italic
  const fs = 17 * u * tb, flav = serifWrap(ctx, card.flavor || "", w - 64 * u, fs, true);
  let ty = by + bh + 8 * u;
  flav.forEach(l => { serifC(ctx, l, cx, ty, fs, "#5a4f38", {italic: true}); ty += fs * 1.22; });
  // a little rule, then the plain effects
  ty += 6 * u;
  ctx.fillStyle = GILT_DK; ctx.fillRect(cx - 50 * u, ty, 100 * u, 2 * u); ctx.fillRect(cx - 4 * u, ty - 3 * u, 8 * u, 8 * u);
  ty += 12 * u;
  const es = 20 * u * tb;
  for (const l of effectLines(card, tier)) for (const part of serifWrap(ctx, l, w - 60 * u, es, false)) {
    serifC(ctx, part, cx, ty, es, INK, {bold: true}); ty += es * 1.25;
  }
  const suit = {templar: "SWORDS", mage: "WANDS", hunter: "ARROWS"}[card.suit];
  serifC(ctx, TIERS[tier].name + (suit ? `  ·  SUIT OF ${suit}` : ""), cx, Math.max(y + h - 46 * u, ty + 2 * u), 14 * u * tb, TIER_INK[tier], {bold: true, spacing: 2 * u});
}
function gearIcon(ctx, item, x, y, s) {
  pixels(ctx, GEAR_ICONS[item.kind], x, y, s, "#1a140e", rgb(item.col), {g: rgb(RARITY[item.rarity].col)});
}
function heroPortrait(ctx, h, x, y, s, time) {
  const fr = heroFrames(h.look), spr = fr.idle[Math.floor(time * 2.2) % 2], px = shadeHero(spr, h.pal, h.lookKey);
  px.forEach((row, j) => row.forEach((p, i) => { if (p) { ctx.fillStyle = rgb(p.c); ctx.fillRect(x + i * s, y + j * s, s, s); } }));
}

// ------------------------------------------------------------------ the level-up card draw
export function updateCardDraw(game) {
  const d = game.draw;
  if (hit("left")) { d.sel = (d.sel + 2) % 3; sfx("menu"); }
  if (hit("right")) { d.sel = (d.sel + 1) % 3; sfx("menu"); }
  for (let k = 0; k < 3; k++) if (input.keyHit("Digit" + (k + 1)) || (d.rects && clickIn(d.rects[k]))) { d.sel = k; return take(game); }
  if (hit("ok")) take(game);
}
function take(game) {
  const d = game.draw, h = game.heroes[d.hero], card = d.cards[d.sel];
  h.deck.push({id: card.id, tier: card.tier || 0}); h.cardsDue--; refreshStats(h);
  const fx = cardFx(card, card.tier);
  if (fx.deathSave) h.saves = (h.saves || 0) + fx.deathSave;
  sfx("relic"); game.toast(`${card.tier ? TIERS[card.tier].name + " " : ""}${card.name} JOINS YOUR DECK`, card.tier ? rgb(TIERS[card.tier].col) : "#d9a441");
  game.draw = null; game.state = "play";
}
export function drawCardDraw(game, ctx, time) {
  const d = game.draw, h = game.heroes[d.hero];
  ctx.fillStyle = "rgba(8,9,6,.9)"; ctx.fillRect(0, 0, OUT_W, OUT_H);
  textC(ctx, "THE CARDS ARE DRAWN", OUT_W / 2, 70, "#d9c48a", 8);
  textC(ctx, (game.heroes.length > 1 ? `P${d.hero + 1} - ` : "") + `LEVEL ${h.lvl}: KEEP ONE CARD FOR YOUR DECK`, OUT_W / 2, 150, "#a89c74", 4);
  const w = touch.on ? 440 : 360, hh = touch.on ? 680 : 580, gap = touch.on ? 36 : 60, x0 = OUT_W / 2 - (w * 3 + gap * 2) / 2;
  d.rects = d.cards.map((c, k) => { const x = x0 + k * (w + gap); tarotCard(ctx, x, 230, w, hh, c, k === d.sel, time); return [x, 214, w, hh + 16]; });
  textC(ctx, touch.on ? "TAP A CARD TO KEEP IT" : "LEFT / RIGHT TO CHOOSE - ENTER OR CLICK TO KEEP - 1 2 3", OUT_W / 2, 950, "#8a8064", touch.on ? 4 : 3);
  textC(ctx, `YOUR DECK: ${h.deck.length} CARDS`, OUT_W / 2, 995, "#6f6650", 3);
}

// ------------------------------------------------------------------ the equipment, loot bag and deck screen
export function openInventory(game, who = 0) {
  game.inv = {hero: who, tab: 0, zone: "bag", i: 0, slot: 0, card: 0};
  game.state = "inventory"; sfx("menu");
}
export function updateInventory(game) {
  const v = game.inv, h = game.heroes[v.hero];
  if (hit("close")) { game.state = "play"; game.inv = null; sfx("menu"); return; }
  if (hit("prevTab") || hit("nextTab")) { v.tab ^= 1; sfx("menu"); }
  if (game.heroes.length > 1 && (input.keyHit("Digit1") || input.keyHit("Digit2"))) { v.hero = input.keyHit("Digit1") ? 0 : 1; sfx("menu"); }
  if (v.tab === 1) {  // the deck: move between cards
    const n = Math.max(1, h.deck.length);
    if (hit("left")) v.card = (v.card + n - 1) % n;
    if (hit("right")) v.card = (v.card + 1) % n;
    if (hit("up")) v.card = Math.max(0, v.card - 6);
    if (hit("down")) v.card = Math.min(n - 1, v.card + 6);
    if (v.cardRects) v.cardRects.forEach((r, k) => { if (clickIn(r)) v.card = k; });
    return;
  }
  // the worn slots are one column; the bag is a 4 by 3 grid; left and right cross between them
  if (v.zone === "slots") {
    if (hit("up")) v.slot = (v.slot + SLOTS.length - 1) % SLOTS.length;
    if (hit("down")) v.slot = (v.slot + 1) % SLOTS.length;
    if (hit("right")) { v.zone = "bag"; v.i = 0; }
  } else {
    if (hit("left")) { if (v.i % 4 === 0) v.zone = "slots"; else v.i--; }
    if (hit("right")) v.i = Math.min(BAG_SIZE - 1, v.i + 1);
    if (hit("up")) v.i = Math.max(0, v.i - 4);
    if (hit("down")) v.i = Math.min(BAG_SIZE - 1, v.i + 4);
  }
  if (v.slotRects) v.slotRects.forEach((r, k) => { if (clickIn(r)) { v.zone = "slots"; v.slot = k; } });
  if (v.bagRects) v.bagRects.forEach((r, k) => { if (clickIn(r)) { v.zone = "bag"; v.i = k; } });
  if (hit("ok") || input.keyHit("MouseRight")) {
    if (v.zone === "bag" && h.bag[v.i]) {  // put it on, swapping out whatever was worn there
      const item = h.bag[v.i], slot = slotFor(h, item), old = h.gear[slot];
      h.gear[slot] = item; h.bag.splice(v.i, 1); if (old) h.bag.push(old);
      refreshStats(h); sfx("pickup");
    } else if (v.zone === "slots") {
      const slot = SLOTS[v.slot];
      if (h.gear[slot] && h.bag.length < BAG_SIZE) { h.bag.push(h.gear[slot]); h.gear[slot] = null; refreshStats(h); sfx("menu"); }
    }
  }
  if (hit("drop")) {
    if (v.zone === "bag" && h.bag[v.i]) { h.bag.splice(v.i, 1); sfx("locked"); }
    else if (v.zone === "slots" && h.gear[SLOTS[v.slot]]) { h.gear[SLOTS[v.slot]] = null; refreshStats(h); sfx("locked"); }
  }
}
export function drawInventory(game, ctx, time) {
  const v = game.inv, h = game.heroes[v.hero];
  ctx.fillStyle = "rgba(8,9,6,.92)"; ctx.fillRect(0, 0, OUT_W, OUT_H);
  ["EQUIPMENT", "DECK"].forEach((t, k) => textC(ctx, (v.tab === k ? "> " : "  ") + t + (v.tab === k ? " <" : "  "), OUT_W / 2 + (k ? 220 : -220), 34, v.tab === k ? "#d9c48a" : "#6f6650", 5));
  if (game.heroes.length > 1) textC(ctx, `P${v.hero + 1}  (1 / 2 TO SWITCH)`, OUT_W / 2, 90, "#a89c74", 3);
  if (v.tab === 1) return drawDeck(game, ctx, h, time);

  // the bearer: the hero with their worn pieces around them, and what it all adds up to
  frame(ctx, 70, 120, 600, 860);
  textC(ctx, "THE BEARER", 370, 150, "#2a2016", 5, null);
  heroPortrait(ctx, h, 370 - 24 * 9 / 2, 322, 9, time);
  const slotPos = [[316, 440 - 250], [120, 330], [520, 330], [120, 470], [316, 640]];  // necklace, rings, cloak, boots
  v.slotRects = SLOTS.map((slot, k) => {
    const [sx, sy] = slotPos[k], on = v.zone === "slots" && v.slot === k, item = h.gear[slot];
    ctx.fillStyle = "#2a2016"; ctx.fillRect(sx - 4, sy - 4, 108, 108);
    ctx.fillStyle = on ? "#4d4430" : "#3a3324"; ctx.fillRect(sx, sy, 100, 100);
    if (on) { ctx.strokeStyle = "#f0cf74"; ctx.lineWidth = 4; ctx.strokeRect(sx + 2, sy + 2, 96, 96); }
    if (item) { gearIcon(ctx, item, sx + 14, sy + 14, 8); ctx.fillStyle = rgb(RARITY[item.rarity].col); ctx.fillRect(sx, sy + 94, 100, 6); }
    serifC(ctx, SLOT_NAMES[slot], sx + 50, sy + 104, touch.on ? 20 : 16, INK, {bold: true, spacing: 1});  // sized to fit under its box
    return [sx, sy, 100, 100];
  });
  const lines = [[`HEARTS ${h.maxHp / 2}`, 1], [`HARM +${Math.round(statOf(h, "dmg") * 100)}%`, 1], [`SPEED +${Math.round(statOf(h, "speed") * 100)}%`, 1],
    [`LIGHT +${Math.round(statOf(h, "light") * 100)}%`, 1], [`LIGHT LASTS +${Math.round(statOf(h, "drain") * 100)}%`, 1], [`LOOT +${Math.round(statOf(h, "drop") * 100)}%`, 1]];
  lines.forEach(([l], k) => text(ctx, l, 110 + (k % 2) * 270, 800 + (k >> 1) * 40, "#2a2016", 3, null));

  // the loot bag
  frame(ctx, 700, 120, 520, 520);
  textC(ctx, `LOOT BAG ${h.bag.length}/${BAG_SIZE}`, 960, 150, "#2a2016", 4, null);
  v.bagRects = [];
  for (let k = 0; k < BAG_SIZE; k++) {
    const bx = 740 + (k % 4) * 112, by = 200 + (k >> 2) * 136, on = v.zone === "bag" && v.i === k, item = h.bag[k];
    ctx.fillStyle = "#2a2016"; ctx.fillRect(bx - 3, by - 3, 102, 102);
    ctx.fillStyle = on ? "#4d4430" : "#3a3324"; ctx.fillRect(bx, by, 96, 96);
    if (on) { ctx.strokeStyle = "#f0cf74"; ctx.lineWidth = 4; ctx.strokeRect(bx + 2, by + 2, 92, 92); }
    if (item) { gearIcon(ctx, item, bx + 12, by + 12, 8); ctx.fillStyle = rgb(RARITY[item.rarity].col); ctx.fillRect(bx, by + 90, 96, 6); }
    v.bagRects.push([bx, by, 96, 96]);
  }
  // the chosen piece, on its own card
  const item = v.zone === "bag" ? h.bag[v.i] : h.gear[SLOTS[v.slot]];
  frame(ctx, 1250, 120, 600, 860);
  if (item) {
    const rar = RARITY[item.rarity];
    ctx.fillStyle = "#1d211a"; ctx.fillRect(1310, 180, 480, 300);
    gearIcon(ctx, item, 1550 - 9 * 14, 210, 28);
    wrap(item.name, 22).forEach((l, i) => textC(ctx, l, 1550, 510 + i * 36, "#2a2016", 4, null));
    textC(ctx, `${rar.name} ${item.kind.toUpperCase()}`, 1550, 600, rgb(rar.col.map(c => c * .6)), 3, null);
    Object.entries(item.stats).forEach(([k, val], i) => textC(ctx, describeStat(k, val), 1550, 660 + i * 40, "#2a2016", 3, null));
    const worn = v.zone === "slots";
    if (!touch.on) textC(ctx, worn ? "ENTER: TAKE OFF   X: DISCARD" : "ENTER: WEAR   X: DISCARD", 1550, 900, "#7d5f27", 3, null);
  } else textC(ctx, v.zone === "slots" ? "NOTHING WORN HERE" : "AN EMPTY POCKET", 1550, 500, "#7d5f27", 4, null);
  (touch.on ? ["TAP A SLOT OR A BAG ITEM TO PICK IT", "WEAR PUTS IT ON OR TAKES IT OFF", "DROP THROWS IT AWAY"]
    : ["ARROWS OR WASD TO MOVE - CLICK TO PICK", "ENTER OR RIGHT CLICK: WEAR OR TAKE OFF", "X: DISCARD - Q/E: DECK - TAB: CLOSE"])
    .forEach((l, i) => textC(ctx, l, 960, 690 + i * 34, "#8a8064", 3));
  if (!touch.on) textC(ctx, "GEAR DROPS FROM CREATURES, CHESTS AND BOSSES", 960, 820, "#6f6650", 2);
}
function drawDeck(game, ctx, h, time) {
  if (!h.deck.length) { textC(ctx, "NO CARDS YET - LEVEL UP TO DRAW YOUR FIRST", OUT_W / 2, 500, "#a89c74", 5); return; }
  // six to a row; the cards shrink as the deck grows so every row fits above the hint line
  const v = game.inv, rows = Math.ceil(h.deck.length / 6), k0 = Math.min(1, 850 / (rows * 280 - 40));
  const w = 150 * k0, hh = 240 * k0;
  v.cardRects = h.deck.map((e, k) => {
    const x = 70 + (k % 6) * (w + 26 * k0), y = 130 + Math.floor(k / 6) * (hh + 40 * k0);
    const card = deckCard(e), on = k === v.card, dy = on ? -10 * k0 : 0;
    frame(ctx, x, y + dy, w, hh, on, card.tier);
    cardPicture(ctx, card, x + 26 * k0, y + 38 * k0 + dy, w - 52 * k0, 116 * k0, time);
    serifC(ctx, card.num, x + w / 2, y + 166 * k0 + dy, 26 * k0, INK, {bold: true, spacing: 2 * k0});
    return [x, y, w, hh];
  });
  tarotCard(ctx, 1240, 130, 600, 860, deckCard(h.deck[v.card]), false, time);
  text(ctx, `${h.deck.length} CARDS IN ${game.heroes.length > 1 ? `P${v.hero + 1}'S` : "YOUR"} DECK` + (touch.on ? "" : " - ARROWS TO LOOK - Q/E: EQUIPMENT - TAB TO CLOSE"), 70, 1010, "#8a8064", 2);
}
