// One shading pass for every hero and creature sprite (see concept/STYLE_GUIDE.md): light falls from above, so
// top and left edges warm toward gold while undersides cool toward blue-violet; outlines take a dark shade of the
// colour they border; every pixel gets a slight tone shift so nothing is a flat fill. Optional extras: woven
// cloth, metal glints, boot grime, and moss flecks on creatures of the forest.
import {hsh, EMISSIVE} from "./art.js";

const WARM = [1, .9, .62], COOL = [.2, .24, .42], GRIME = [.16, .13, .09], MOSS = [.3, .4, .2];
const cache = new WeakMap();  // sprite rows -> key -> shaded pixels

export function shadeSprite(rows, pal, key, opt = {}) {
  if (!cache.has(rows)) cache.set(rows, new Map());
  const byKey = cache.get(rows);
  if (byKey.has(key)) return byKey.get(key);
  const h = rows.length, w = rows[0].length, at = (i, j) => j >= 0 && j < h && i >= 0 && i < w ? rows[j][i] : ".";
  const open = (i, j) => { const o = at(i, j); return o === "." || o === "k"; };
  const out = rows.map((row, j) => [...row].map((ch, i) => {
    if (ch === "." || !pal[ch]) return null;
    if (EMISSIVE.has(ch)) return {c: pal[ch], em: true};
    if (ch === "k") {  // a soft outline: the colours it touches, darkened and cooled
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = at(i + dx, j + dy);
        if (o !== "." && o !== "k" && pal[o] && !EMISSIVE.has(o)) { r += pal[o][0]; g += pal[o][1]; b += pal[o][2]; n++; }
      }
      return {c: n ? [r / n * .28, g / n * .28, b / n * .34] : pal.k};
    }
    let f = 1 + (hsh(i, j, 3) - .5) * .18;
    if (opt.fabric && opt.fabric.has(ch) && (i + j) % 2 === 0) f *= .92;          // woven cloth
    if (opt.metal && opt.metal.has(ch) && open(i - 1, j - 1)) f *= 1.3;            // metal catches the light at its edge
    let c = pal[ch].map(v => v * f);
    if (opt.moss && opt.moss.has(ch) && hsh(i, j, 9) > .86) c = c.map((v, k) => v * .45 + MOSS[k] * .55);  // moss and lichen
    if (open(i, j - 1) || open(i - 1, j)) c = c.map((v, k) => Math.min(1, v * 1.15 + (WARM[k] - v) * .16));  // lit from above
    if (open(i, j + 1) || open(i + 1, j)) c = c.map((v, k) => v * .74 + COOL[k] * .2);                     // shadowed below
    if (opt.grime && j >= h - 3) c = c.map((v, k) => v * .72 + GRIME[k] * .28);
    return {c};
  }));
  byKey.set(key, out);
  return out;
}
