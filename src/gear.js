// Gear: necklaces, rings, cloaks and boots made of the old forest's materials, each with one to three bonuses
// (same stat keys as the tarot cards; see tarot.js). Gear drops from creatures, loot-room chests and bosses,
// lies on the floor until picked up into the loot bag, and is worn from the equipment screen.
export const SLOTS = ["necklace", "ring1", "ring2", "cloak", "boots"];
export const SLOT_NAMES = {necklace: "NECKLACE", ring1: "RING", ring2: "RING", cloak: "CLOAK", boots: "BOOTS"};
export const BAG_SIZE = 12;
export const RARITY = [
  {name: "COMMON", col: [.62, .64, .54], stats: 1, power: 1},
  {name: "RARE", col: [.5, .66, .82], stats: 2, power: 1.25},
  {name: "LEGENDARY", col: [.9, .74, .36], stats: 3, power: 1.6}];
const KINDS = {
  necklace: {names: ["AMULET", "TORC", "PENDANT"], stats: ["light", "drain", "xp", "regen", "deathFuel"]},
  ring: {names: ["RING", "BAND", "SIGNET"], stats: ["dmg", "drop", "thorns", "xp", "light"]},
  cloak: {names: ["CLOAK", "MANTLE", "SHAWL"], stats: ["maxHp", "stealth", "regen", "thorns", "drain"]},
  boots: {names: ["BOOTS", "TREADS", "WRAPS"], stats: ["speed", "rollCd", "stealth", "maxHp"]},
};
const MATERIALS = [
  {name: "BIRCH", col: [.78, .76, .66]}, {name: "BONE", col: [.84, .8, .68]}, {name: "IRON", col: [.46, .48, .52]},
  {name: "AMBER", col: [.86, .6, .26]}, {name: "SILVER", col: [.78, .8, .84]}, {name: "BOG-OAK", col: [.3, .22, .14]},
  {name: "ANTLER", col: [.7, .62, .48]}, {name: "MOSS-GOLD", col: [.7, .64, .32]}, {name: "WOLFSKIN", col: [.5, .42, .32]}];
// each stat: the animal it's named for, and how much one roll of it gives
const STATS = {
  dmg: {of: "OF EMBERS", amt: .1, say: v => `+${Math.round(v * 100)}% HARM`},
  speed: {of: "OF THE HARE", amt: .08, say: v => `+${Math.round(v * 100)}% SPEED`},
  light: {of: "OF THE OWL", amt: .12, say: v => `+${Math.round(v * 100)}% LIGHT`},
  drain: {of: "OF THE HEARTH", amt: .12, say: v => `LIGHT LASTS ${Math.round(v * 100)}% LONGER`},
  maxHp: {of: "OF THE BEAR", amt: 1, say: v => `+${v / 2} ${v > 2 ? "HEARTS" : "HEART"}`, whole: true},
  stealth: {of: "OF THE FOX", amt: .12, say: v => `HEARD ${Math.round(v * 100)}% LATER`},
  drop: {of: "OF THE MAGPIE", amt: .25, say: v => `+${Math.round(v * 100)}% LOOT`},
  rollCd: {of: "OF THE STAG", amt: .12, say: v => `ROLLS RECOVER ${Math.round(v * 100)}% FASTER`},
  thorns: {of: "OF THORNS", amt: .5, say: v => `THORNS ${v.toFixed(1)}`},
  xp: {of: "OF THE MOTH", amt: .12, say: v => `+${Math.round(v * 100)}% LEARNING`},
  regen: {of: "OF THE SPRING", amt: .5, say: v => `MENDS ${v.toFixed(1)} PER 45S`},
  deathFuel: {of: "OF THE CROW", amt: 2, say: v => `+${Math.round(v)} OIL PER KILL`},
};
export const describeStat = (k, v) => STATS[k] ? STATS[k].say(v) : `${k} ${v}`;

// a new piece of gear; deeper depths and luckier finds roll rarer and stronger pieces
export function makeGear(depth, minRarity = 0) {
  const R = Math.random, roll = R() + depth * .03;
  const rarity = Math.max(minRarity, roll > 1.05 ? 2 : roll > .7 ? 1 : 0);
  const kind = ["necklace", "ring", "ring", "cloak", "boots"][R() * 5 | 0], k = KINDS[kind], rar = RARITY[rarity];
  const pool = k.stats.slice(), stats = {};
  for (let i = 0; i < rar.stats && pool.length; i++) {
    const s = pool.splice(R() * pool.length | 0, 1)[0], spec = STATS[s];
    const v = spec.amt * rar.power * (1 + depth * .06) * (.8 + R() * .4);
    stats[s] = spec.whole ? Math.max(1, Math.round(v * 2)) : Math.round(v * 100) / 100;
  }
  const mat = MATERIALS[R() * MATERIALS.length | 0], main = Object.keys(stats)[0];
  return {kind, rarity, mat: mat.name, col: mat.col, name: `${mat.name} ${k.names[R() * k.names.length | 0]} ${STATS[main].of}`, stats};
}
// which equipment slot a piece goes into (rings take whichever ring slot is free, else the first)
export const slotFor = (h, item) => item.kind !== "ring" ? item.kind : !h.gear.ring1 ? "ring1" : !h.gear.ring2 ? "ring2" : "ring1";

// how a piece looks on the floor and in the menus (9x9; o is the material, X its dark edge, g the rarity gem)
export const GEAR_ICONS = {
  necklace: ["X.......X", ".X.....X.", "..X...X..", "...XXX...", "...XgX...", "..XoooX..", "..XoooX..", "...XXX...", "........."],
  ring: [".........", "...ggg...", "..XgggX..", ".Xo...oX.", "Xo.....oX", "Xo.....oX", ".Xo...oX.", "..XoooX..", "...XXX..."],
  cloak: ["..XXXXX..", ".XoogooX.", ".XoooooX.", "XoooooooX", "XoooooooX", "XooXoXooX", "XooXoXooX", "XoX...XoX", "XX.....XX"],
  boots: ["..XXX....", "..XoX....", "..XoX....", "..XoX....", "..XoX....", "..XooXX..", "..XooooX.", "..XXXXXXX", "........."],
};
