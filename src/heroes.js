// Hero classes and looks. The class sets the body shape and how you fight; the rest is yours to pick:
// headwear style, colour, hair and skin. Choices are saved per player slot.
import {scl} from "./art.js";
import {shadeSprite} from "./shade.js";
import {HERO_SPRITES} from "./hero_sprites.js";

export const CLASSES = {
  mage: {name: "MAGE", fuel: "MANA", fuelCol: "#5aa8ff", hp: 6, speed: 1, noise: 1, drain: .7, regen: .55, fireEvery: .42,
    stats: {HEARTS: 2, SPEED: 3, STEALTH: 2, POWER: 3},
    lines: ["MANA FEEDS YOUR STAFF LIGHT AND YOUR FIREBALLS", "FIREBALLS BURST AND SET CREATURES ALIGHT",
      "YOUR DODGE ROLL LEAVES A TRAIL OF FIRE"]},
  hunter: {name: "HUNTER", fuel: "OIL", fuelCol: "#ffa040", hp: 6, speed: 1.06, noise: .55, drain: .65, regen: 0, fireEvery: .36,
    stats: {HEARTS: 2, SPEED: 4, STEALTH: 5, POWER: 2},
    lines: ["A BOW: ARROWS COST NO OIL, FLY FAR AND PIERCE", "YOUR LANTERN BURNS ITS OIL SLOWLY",
      "SOFT STEPS: CREATURES HEAR YOU LATE"]},
  templar: {name: "TEMPLAR", fuel: "OIL", fuelCol: "#ffa040", hp: 10, speed: .88, noise: 1.6, drain: 1, regen: 0, fireEvery: .5,
    stats: {HEARTS: 5, SPEED: 2, STEALTH: 1, POWER: 5},
    lines: ["A HEAVY SWORD THAT HITS HARD UP CLOSE - NO RANGED ATTACK", "HOLD BLOCK TO RAISE THE LANTERN SHIELD - EACH BLOCK COSTS OIL",
      "FIVE HEARTS, BUT EVERY CREATURE HEARS YOU COMING"]},
};
export const CLASS_ORDER = ["mage", "hunter", "templar"];

export const COLOURS = [
  {name: "TEAL", col: [.18, .58, .58]}, {name: "CRIMSON", col: [.72, .16, .2]}, {name: "FOREST", col: [.22, .5, .25]},
  {name: "NAVY", col: [.2, .3, .64]}, {name: "VIOLET", col: [.48, .26, .68]}, {name: "OCHRE", col: [.78, .56, .2]},
  {name: "ASH", col: [.5, .5, .53]}, {name: "BONE", col: [.86, .82, .7]},
  // earthier tones after the old Nordic folklore paintings
  {name: "MOSS", col: [.38, .44, .24]}, {name: "DUSK", col: [.34, .37, .5]}, {name: "RUST", col: [.56, .31, .19]}, {name: "BIRCH", col: [.78, .76, .66]}];
export const HAIRS = [
  {name: "BLACK", col: [.13, .1, .1]}, {name: "BROWN", col: [.45, .27, .15]}, {name: "AUBURN", col: [.66, .26, .12]},
  {name: "BLONDE", col: [.92, .76, .4]}, {name: "SILVER", col: [.82, .84, .88]}, {name: "FROST", col: [.42, .62, .96]},
  {name: "MOSS", col: [.36, .62, .3]}, {name: "ROSE", col: [.88, .42, .62]}];
export const SKINS = [
  {name: "PALE", col: [.98, .85, .72]}, {name: "FAIR", col: [.93, .73, .56]}, {name: "TAN", col: [.8, .57, .4]},
  {name: "BROWN", col: [.6, .4, .26]}, {name: "DEEP", col: [.4, .26, .17]}, {name: "SWAMP", col: [.55, .72, .45]},
  {name: "ASHEN", col: [.66, .66, .72]}];
// trim, belts, sashes and the hunter's bandana
export const ACCENTS = [
  {name: "GOLD", col: [.95, .75, .25]}, {name: "SILVER", col: [.78, .8, .86]}, {name: "COPPER", col: [.8, .45, .22]},
  {name: "LEATHER", col: [.52, .34, .18]}, {name: "BONE", col: [.86, .82, .68]}, {name: "JADE", col: [.3, .7, .48]},
  {name: "BLOOD", col: [.6, .1, .12]}, {name: "SOOT", col: [.2, .2, .22]}];
// the parts of a look a player can change, in menu order
export const LOOK_ROWS = ["CLASS", "STYLE", "COLOUR", "ACCENT", "HAIR", "SKIN"];
export const DEFAULT_LOOKS = [{cls: "mage", style: 0, colour: 0, accent: 0, hair: 1, skin: 1},
  {cls: "templar", style: 0, colour: 1, accent: 1, hair: 3, skin: 3}];

export const stylesOf = cls => HERO_SPRITES[cls].styles;

// a look's frames (drawn by tools/hero_sprites.py): two idle frames that breathe, the cape stirring, and a
// four-step walk with the cape streaming back; WALK_BOB lifts the passing steps a pixel so the walk bounces
export const WALK_BOB = [0, -1, 0, -1];
export const heroFrames = look => HERO_SPRITES[look.cls].frames[look.style % HERO_SPRITES[look.cls].frames.length];
// the sprite is drawn this far left of the hero's x so the body sits over their footprint (it's 24 wide, cape room included)
export const HERO_OX = 7;

// a fallen hero lying in the muck, in their own colours
export const FALLEN = ["..kkkk........", ".kHHHHkkkkkkk.", "kHSiSHkcCCCDk.", "kHSSSHkCCCCDkL", ".khhhhkkDDDDkl", "..kkkk..kkkkk."];

const light = (c, f) => c.map(v => v + (1 - v) * f);
// the colours a look's sprite letters stand for
export function heroPalette(look) {
  const c = COLOURS[look.colour].col, hr = HAIRS[look.hair].col, sk = SKINS[look.skin].col, tr = ACCENTS[look.accent || 0].col;
  return {k: [.06, .04, .04], C: c, c: light(c, .38), D: scl(c, .5), H: hr, h: scl(hr, .6), S: sk, s: scl(sk, .74), i: [.08, .05, .06],
    T: tr, t: scl(tr, .62), M: [.74, .76, .8], m: [.42, .44, .5], W: [.52, .35, .19], w: [.33, .22, .12], B: [.28, .19, .12],
    b: [.17, .11, .08], n: [.9, .9, .82], L: [1, .95, .72], l: [.8, .62, .3], O: [1, .76, .26], o: [1, .46, .12]};
}

// Turn a frame into finished pixels with the shared shading (concept/STYLE_GUIDE.md), plus woven cloth, glinting
// metal and boot grime for heroes.
const FABRIC = new Set("CcDTt"), METAL = new Set("Mm");
export const shadeHero = (rows, pal, key) => shadeSprite(rows, pal, key, {fabric: FABRIC, metal: METAL, grime: true});
