// Unlocks between runs, Binding of Isaac style: milestones reached in any run unlock perks that every later
// run (solo or co-op) starts with. Progress is kept in the browser's local storage.
const KEY = "mod-meta";
export const UNLOCKS = [
  {id: "mending", name: "FIELD MEDIC", need: "REACH DEPTH III", does: "START WITH A TONIC OF MENDING", test: m => m.deepest >= 3},
  {id: "hands", name: "STEADY HANDS", need: "40 KILLS ACROSS ALL RUNS", does: "YOUR BOLTS START STRONGER", test: m => m.kills >= 40},
  {id: "lens", name: "WIDE WICK", need: "OPEN 3 GATES ACROSS ALL RUNS", does: "YOUR LANTERN STARTS BRIGHTER", test: m => m.gates >= 3},
  {id: "scars", name: "OLD SCARS", need: "FALL 3 TIMES", does: "START WITH ONE MORE HEART", test: m => m.falls >= 3},
  {id: "pockets", name: "DEEP POCKETS", need: "REACH DEPTH VI", does: "START WITH 7 PACK SLOTS", test: m => m.deepest >= 6},
  {id: "keeper", name: "KEEPER OF FLAMES", need: "HOLD ALL 4 ABILITIES IN ONE RUN", does: "START WITH THE EMBER WICK", test: m => m.mostAbilities >= 4},
  {id: "darkbane", name: "DARKBANE", need: "DEFEAT THE LAMPLESS KING", does: "START WITH THE STORM CHARM AND A HEART VESSEL", test: m => m.wins >= 1},
];
const fresh = () => ({deepest: 1, kills: 0, gates: 0, falls: 0, mostAbilities: 0, wins: 0, unlocked: []});

export function loadMeta() {
  try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return fresh(); }
}
// change some stats, save, and return any unlocks this just earned
export function progress(m, change) {
  change(m);
  const earned = UNLOCKS.filter(u => !m.unlocked.includes(u.id) && u.test(m));
  for (const u of earned) m.unlocked.push(u.id);
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {}
  return earned;
}

// give a fresh run's heroes what they've unlocked
export function applyUnlocks(m, game) {
  const has = id => m.unlocked.includes(id);
  for (const h of game.heroes) {
    if (has("mending")) {
      const idx = game.lore.tonic.indexOf("mend");
      h.items.push({kind: "tonic", idx, n: 1}); game.lore.known.tonic.add(idx);
    }
    if (has("hands")) h.power = 1.15;
    if (has("lens")) h.lens = 1.1;
    if (has("scars")) { h.maxHp += 2; h.hp += 2; }
    if (has("pockets")) h.pack = 7;
  }
  if (has("keeper")) game.abilities.add("wick");
  if (has("darkbane")) { game.abilities.add("coil"); for (const h of game.heroes) { h.maxHp += 2; h.hp += 2; } }
}
