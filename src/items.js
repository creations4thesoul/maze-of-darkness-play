// Items, Pixel Dungeon style: tonics and rune slates turn up unidentified. Each run shuffles which colour
// or glyph does what, and using one (or reading a slate of knowing) reveals it for the rest of the run.
// Also XP and hero levels, since both feed the same run.
import {T, ART} from "./art.js";
import {sfx} from "./audio.js";
import {damageFoe, heroCenter} from "./combat.js";
import {statOf} from "./stats.js";

export const PACK = 6;  // inventory slots; one stack per slot
// what a tonic or slate looks like before you know it
export const TONIC_LOOKS = [
  {name: "AMBER", col: [1, .66, .18]}, {name: "MURK", col: [.42, .5, .3]}, {name: "CORAL", col: [1, .42, .44]},
  {name: "JADE", col: [.3, .95, .6]}, {name: "VIOLET", col: [.7, .4, 1]}, {name: "BONE", col: [.92, .88, .74]}];
export const RUNE_LOOKS = [
  {name: "KHA", col: [.4, .9, 1]}, {name: "VOR", col: [1, .5, .25]}, {name: "ZETH", col: [.6, 1, .35]},
  {name: "MUL", col: [1, .35, .75]}, {name: "ORR", col: [.95, .9, .4]}, {name: "THAS", col: [.55, .55, 1]}];
// what they really do
const TONICS = {
  mend: "TONIC OF MENDING", blaze: "TONIC OF BLAZING", glow: "TONIC OF FAR LIGHT", swift: "TONIC OF SWIFTNESS",
  fuel: "TONIC OF FUEL", rot: "TONIC OF ROT"};
const RUNES = {
  map: "SLATE OF MAPPING", blast: "SLATE OF BLASTING", ward: "SLATE OF WARDING", recall: "SLATE OF RECALL",
  know: "SLATE OF KNOWING", hone: "SLATE OF HONING"};
export const BUFF = {blaze: 25, glow: 40, swift: 25, ward: 6};
// XP for each kind of kill, and how much each hero level needs
export const XP = {rat: 1, spitter: 3, wisp: 4, crawler: 1, bloater: 2, brute: 5, lurker: 3, hulk: 30, brood: 40, warden: 50, king: 100};
export const xpNeed = lvl => 4 + lvl * 4;

const shuffle = (a, r = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// a fresh set of identities for a run (or a head-to-head match)
export function newLore() {
  return {tonic: shuffle(Object.keys(TONICS)), rune: shuffle(Object.keys(RUNES)), known: {tonic: new Set(), rune: new Set()}};
}
export const effectOf = (lore, it) => lore[it.kind][it.idx];
export const lookOf = it => (it.kind === "tonic" ? TONIC_LOOKS : RUNE_LOOKS)[it.idx];
export function nameOf(lore, it) {
  if (lore.known[it.kind].has(it.idx)) return (it.kind === "tonic" ? TONICS : RUNES)[effectOf(lore, it)];
  return lookOf(it).name + (it.kind === "tonic" ? " TONIC" : " SLATE");
}

// pick up into a stack, or a free slot; false when the pack is full
export function stow(h, it) {
  const s = h.items.find(s => s.kind === it.kind && s.idx === it.idx);
  if (s) { s.n++; return true; }
  if (h.items.length >= (h.pack || PACK)) return false;
  h.items.push({kind: it.kind, idx: it.idx, n: 1});
  return true;
}

function identify(game, it, col) {
  const lore = game.lore, known = lore.known[it.kind];
  if (known.has(it.idx)) return;
  known.add(it.idx);
  game.toast("IT WAS A " + nameOf(lore, it), col);
}

export function useItem(game, h, i, slot) {
  const s = h.items[slot];
  if (!s) return;
  const fx = effectOf(game.lore, s), col = `rgb(${lookOf(s).col.map(v => v * 255 | 0)})`, [hx, hy] = heroCenter(h);
  if (--s.n <= 0) h.items.splice(slot, 1);
  h.sel = Math.min(h.sel, Math.max(0, h.items.length - 1));
  sfx(s.kind === "tonic" ? "drink" : "rune", {pan: game.panOf(h.fx)});
  game.burst(hx, hy, lookOf(s).col);
  switch (fx) {
    case "mend": h.hp = Math.min(h.maxHp, h.hp + 4); break;
    case "fuel": h.oil = 100; break;
    case "rot": h.invuln = 0; game.hurt(h, i, 1); h.oil = Math.max(0, h.oil - 25); break;
    case "map": game.lv.seen[i].fill(1); break;
    case "blast": {
      for (const t of [...game.foes, ...game.rats]) if (Math.hypot(t.x - hx, t.y - hy) < 90) damageFoe(game, t, 3 * h.power, h);
      game.shake = Math.max(game.shake, .8);
      for (let k = 0; k < 8; k++) game.burst(hx + Math.cos(k * .785) * 30, hy + Math.sin(k * .785) * 30, [1, .6, .25]);
      break;
    }
    case "ward": h.invuln = BUFF.ward; h.buffs.ward = BUFF.ward; h.buffLook.ward = [s.kind, s.idx]; break;
    case "recall": h.fx = h.start[0] * T + 3; h.fy = h.start[1] * T + 9; game.burst(h.fx + 5, h.fy - 4, lookOf(s).col); break;
    case "know": for (const o of h.items) identify(game, o, col); break;
    case "hone": h.power += .5; break;
    default: if (BUFF[fx]) { h.buffs[fx] = BUFF[fx] * (1 + statOf(h, "itemDur")); h.buffLook[fx] = [s.kind, s.idx]; }
  }
  identify(game, s, col);
  if (fx === "hone") game.toast("YOUR LANTERN BOLTS BITE HARDER", col);
}

export function gainXp(game, h, n) {
  if (!h || !n) return;
  h.xp += n * (1 + statOf(h, "xp"));
  while (h.xp >= xpNeed(h.lvl)) {
    h.xp -= xpNeed(h.lvl); h.lvl++;
    h.maxHp = Math.min(20, h.maxHp + 1); h.hp = h.maxHp; h.power += .2;
    if (game.mode !== "versus") h.cardsDue = (h.cardsDue || 0) + 1;  // and the cards are drawn (menus.js)
    game.toast(`LEVEL ${h.lvl} - STRONGER, AND HEALED`, ART.runeColor, "levelup");
  }
}
