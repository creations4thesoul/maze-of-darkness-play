// What a hero's tarot deck and worn gear add up to. statOf(h, key) sums one bonus across both; refreshStats
// keeps max hearts in step as cards and gear change.
import {cardById, cardFx} from "./tarot.js";
import {SLOTS} from "./gear.js";

export function statOf(h, key) {
  let v = 0;
  for (const e of h.deck || []) { const c = cardById(e.id); if (c) v += cardFx(c, e.tier)[key] || 0; }
  if (h.gear) for (const s of SLOTS) { const g = h.gear[s]; if (g && g.stats[key]) v += g.stats[key]; }
  return v;
}
// heart bonuses from cards and gear, applied as a difference so level-ups and relics stay untouched
export function refreshStats(h) {
  const bonus = statOf(h, "maxHp"), d = bonus - (h.bonusHp || 0);
  if (!d) return;
  h.bonusHp = bonus; h.maxHp = Math.max(2, h.maxHp + d);
  h.hp = Math.max(1, Math.min(h.maxHp, h.hp + Math.max(0, d)));
}
