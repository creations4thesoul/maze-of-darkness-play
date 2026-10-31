// Carrion-style progression: each part of the sewer has its own kind of gate, and the ability that opens it
// turns up a floor deeper, so you climb back up to open what you passed. Gates seal off dead-end branches,
// never the way to the keys or the grate, and each one hides a relic that makes the rest of the run stronger.
import {hsh} from "./art.js";

// one gate per region style (rotstone, rustworks, ossuary, brood, neon)
export const GATES = [
  {name: "ROOT TANGLE", ability: "wick", col: [.62, .78, .38]},
  {name: "IRON-BOUND DOOR", ability: "pry", col: [.8, .55, .32]},
  {name: "BONE WALL", ability: "maul", col: [.86, .82, .68]},
  {name: "FUNGAL WALL", ability: "wick", col: [.8, .45, .32]},
  {name: "WISP-LIGHT VEIL", ability: "coil", col: [.55, .85, .78]},
  // not a region gate: the iron bars that seal a loot room until its guards are dead
  {name: "SEALED DOOR", ability: null, col: [1, .25, .2]}];
export const ABILITIES = {
  wick: {name: "EMBER WICK", does: "BURNS ROOT TANGLES AND FUNGAL WALLS", col: [.92, .6, .3]},
  pry: {name: "PRY BAR", does: "WRENCHES OPEN IRON-BOUND DOORS", col: [.8, .62, .4]},
  maul: {name: "BONE MAUL", does: "SHATTERS BONE WALLS", col: [.95, .92, .8]},
  coil: {name: "STORM CHARM", does: "SCATTERS WISP-LIGHT VEILS", col: [.6, .85, .8]}};
export const ABILITY_ORDER = ["wick", "pry", "maul", "coil"];
// which floor each ability's shrine stands on
export const ABILITY_FLOOR = {2: "wick", 3: "pry", 4: "maul", 6: "coil"};
// what waits behind a gate
export const RELICS = {
  heart: {name: "HEART VESSEL", does: "ONE MORE HEART", col: [1, .3, .4]},
  lens: {name: "LANTERN LENS", does: "YOUR LIGHT REACHES FURTHER", col: [1, .9, .5]},
  sigil: {name: "BOLT SIGIL", does: "YOUR BOLTS BITE HARDER", col: [1, .55, .25]},
  satchel: {name: "SATCHEL", does: "ONE MORE PACK SLOT", col: [.6, .85, .5]}};
export const RELIC_KINDS = Object.keys(RELICS);

// what a gate tile looks like: [r, g, b, glows]; u, v are pixels across the tile (or its front face)
export function gateTex(style, u, v, tx, ty) {
  const h = hsh(tx * 16 + u, ty * 16 + v, 7);
  switch (style) {
    case 0: {  // roots: knotted brown cords over black earth, with a few sickly glowing buds
      const a = Math.abs(Math.sin(u * .75 + v * .32 + tx * 3)), b = Math.abs(Math.sin(v * .8 - u * .28 + ty * 2));
      if (h > .97) return [.55, 1, .3, 1];
      if (a < .22 || b < .2) return [.34 + h * .08, .24, .12, 0];
      return [.07, .05, .04, 0];
    }
    case 1: {  // a grate of rusted bars
      if (v % 8 === 3 || v % 8 === 4) return [.5 + h * .15, .26, .1, 0];
      if (u % 4 < 2) return [.45 + h * .2, .22 + h * .08, .09, h > .96 ? 1 : 0];
      return [.03, .02, .02, 0];
    }
    case 2: {  // stacked bone bricks with dark mortar
      const row = v >> 2, x = (u + (row & 1) * 3) % 6;
      if (v % 4 === 3 || x === 5) return [.12, .1, .08, 0];
      return [.78 + h * .1, .74 + h * .08, .62 + h * .06, 0];
    }
    case 3: {  // a wall of fungus: overlapping caps over pale gills, a few glowing faintly
      const cap = ((v + (u >> 2)) % 5) < 2;
      if (!cap && h > .93) return [.7, .9, .78, 1];
      return cap ? [.52 + h * .08, .25, .16, 0] : [.78, .72, .58 - h * .1, 0];
    }
    case 5: {  // a loot room's seal: heavy iron bars with a glowing red rune at the centre
      if (Math.abs(u - 7.5) < 2 && Math.abs((v % 16) - 7.5) < 2) return [.86, .5, .28, 1];  // a dull ember-gold rune
      if (v % 8 === 3) return [.3, .27, .3, 0];
      if (u % 5 === 1 || u % 5 === 2) return h > .9 ? [.5, .48, .52, 0] : [.24, .22, .25, 0];
      return [.03, .02, .02, 0];
    }
    default: {  // a veil of wisp-light: pale glowing strands hanging between twisted roots
      if (u === 0 || u === 15) return [.24, .17, .1, 0];
      if ((u + (v >> 2)) % 3 === 0) return [.62 + h * .2, .9, .82, 1];
      return [.06, .08, .07, 0];
    }
  }
}
