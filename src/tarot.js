// Progression as a tarot deck: each time a hero levels up they draw three cards and keep one. The major arcana
// are open to every class; each class also has its own suit (the Templar's Swords, the Mage's Wands, the
// Hunter's Arrows). A run's cards build into that hero's deck. Effects are stat bonuses read by stats.js, scaled
// by the card's rarity tier (cardFx below).
//   dmg speed light drain xp stealth rollCd itemDur drop: fractions (+25% is .25)
//   maxHp: half-hearts   regen: half-hearts mended per 45 s   thorns: damage back to whatever hits you
//   deathFuel: oil or mana per kill   deathSave: lethal blows survived each depth   identify: know items on sight
//   class: swingArc block splash burn cheapCast fuelRegen pierce drawSpeed twinShot
export const CARDS = [
  {id: "fool", num: "0", name: "THE FOOL", icon: "step", flavor: "Step lightly, and the dark can never quite catch you.", fx: {rollCd: .35}},
  {id: "magician", num: "I", name: "THE MAGICIAN", icon: "wand", flavor: "What you brew and carve holds its power longer.", fx: {itemDur: .5}},
  {id: "priestess", num: "II", name: "THE HIGH PRIESTESS", icon: "eye", flavor: "She knows every brew by its smell alone.", fx: {identify: 1}},
  {id: "empress", num: "III", name: "THE EMPRESS", icon: "heart", flavor: "The green heart of the wood beats with yours.", fx: {maxHp: 2, regen: 1}},
  {id: "emperor", num: "IV", name: "THE EMPEROR", icon: "crown", flavor: "The troll king's weight behind every blow.", fx: {dmg: .25}},
  {id: "hierophant", num: "V", name: "THE HIEROPHANT", icon: "lantern", flavor: "The keeper's lamp never gutters.", fx: {drain: .3}},
  {id: "chariot", num: "VII", name: "THE CHARIOT", icon: "wheel", flavor: "Ride with the elk through the misty wood.", fx: {speed: .15}},
  {id: "strength", num: "VIII", name: "STRENGTH", icon: "bear", flavor: "The bear walks beside you.", fx: {dmg: .15, maxHp: 2}},
  {id: "hermit", num: "IX", name: "THE HERMIT", icon: "lantern", flavor: "One lamp, held high, sees far into the dark.", fx: {light: .25}},
  {id: "fortune", num: "X", name: "WHEEL OF FORTUNE", icon: "wheel", flavor: "The old wheel turns, and the wood gives up its treasure.", fx: {drop: 1}},
  {id: "justice", num: "XI", name: "JUSTICE", icon: "scales", flavor: "Whatever strikes you pays for it.", fx: {thorns: 1}},
  {id: "death", num: "XIII", name: "DEATH", icon: "skull", flavor: "Every death in the dark feeds your flame.", fx: {deathFuel: 4}},
  {id: "temperance", num: "XIV", name: "TEMPERANCE", icon: "cup", flavor: "A slow, patient healing, drop by drop.", fx: {regen: 1.5}},
  {id: "devil", num: "XV", name: "THE DEVIL", icon: "horns", flavor: "Great strength, at a cost to your heart.", fx: {dmg: .4, maxHp: -2}},
  {id: "star", num: "XVII", name: "THE STAR", icon: "star", flavor: "A bright star to learn by.", fx: {xp: .3}},
  {id: "moon", num: "XVIII", name: "THE MOON", icon: "moon", flavor: "Under the moon, your steps make no sound.", fx: {stealth: .3}},
  {id: "judgement", num: "XX", name: "JUDGEMENT", icon: "horn", flavor: "The horn calls you back from the brink.", fx: {deathSave: 1}},
  {id: "world", num: "XXI", name: "THE WORLD", icon: "star", flavor: "A little of everything the wood can give.", fx: {dmg: .1, speed: .1, light: .1}},
  // the Templar's suit
  {id: "aceswords", num: "I", name: "ACE OF SWORDS", suit: "templar", icon: "sword", flavor: "The blade from the stone cuts a wide arc.", fx: {swingArc: .4}},
  {id: "knightswords", num: "XII", name: "KNIGHT OF SWORDS", suit: "templar", icon: "shield", flavor: "A knight's shield, held for less.", fx: {block: .5}},
  {id: "queenswords", num: "XIII", name: "QUEEN OF SWORDS", suit: "templar", icon: "sword", flavor: "Her blade cuts deep.", fx: {dmg: .3}},
  {id: "kingswords", num: "XIV", name: "KING OF SWORDS", suit: "templar", icon: "crown", flavor: "The sword king's crown, and his strength.", fx: {maxHp: 4}},
  // the Mage's suit
  {id: "acewands", num: "I", name: "ACE OF WANDS", suit: "mage", icon: "flame", flavor: "A spark becomes a bonfire.", fx: {splash: .6}},
  {id: "knightwands", num: "XII", name: "KNIGHT OF WANDS", suit: "mage", icon: "flame", flavor: "His fire will not go out.", fx: {burn: 1}},
  {id: "queenwands", num: "XIII", name: "QUEEN OF WANDS", suit: "mage", icon: "wand", flavor: "The green fire answers her quickly.", fx: {fuelRegen: 1}},
  {id: "kingwands", num: "XIV", name: "KING OF WANDS", suit: "mage", icon: "crown", flavor: "The crowned staff burns for less.", fx: {cheapCast: .4}},
  // the Hunter's suit
  {id: "acearrows", num: "I", name: "ACE OF ARROWS", suit: "hunter", icon: "arrow", flavor: "An arrow that does not stop.", fx: {pierce: 2}},
  {id: "knightarrows", num: "XII", name: "KNIGHT OF ARROWS", suit: "hunter", icon: "bow", flavor: "Draw, loose, draw again.", fx: {drawSpeed: .25}},
  {id: "queenarrows", num: "XIII", name: "QUEEN OF ARROWS", suit: "hunter", icon: "moon", flavor: "The moon's huntress, silent and swift.", fx: {stealth: .3, speed: .1}},
  {id: "kingarrows", num: "XIV", name: "KING OF ARROWS", suit: "hunter", icon: "arrow", flavor: "Two arrows from one string.", fx: {twinShot: 1}},
];
export const cardById = id => CARDS.find(c => c.id === id);

// Rarity. Every card drawn rolls a tier (rarer as the hero levels up), and the tier scales what it does:
// percentage bonuses by the tier's power (capped where the game caps them), hearts and pierce by one more per
// tier, Judgement saves once more per tier, and the all-or-nothing cards (the High Priestess, the King of Arrows)
// gain a second bonus as they rise. Colours match gear (gear.js RARITY).
export const TIERS = [
  {name: "COMMON", col: [.62, .64, .54], power: 1},
  {name: "RARE", col: [.5, .66, .82], power: 1.5},
  {name: "LEGENDARY", col: [.9, .74, .36], power: 2}];
const CAPS = {rollCd: .7, block: .9, drain: .8, cheapCast: .8, drawSpeed: .6, stealth: .7};
const FLAGS = new Set(["identify", "twinShot"]);
const TIER_EXTRA = {priestess: {itemDur: .25}, kingarrows: {drawSpeed: .1}};  // added once per tier above common
export function cardFx(card, tier = 0) {
  const out = {}, k = TIERS[tier].power;
  for (const [key, v] of Object.entries(card.fx)) {
    if (FLAGS.has(key)) out[key] = v;
    else if (key === "maxHp") out[key] = v > 0 ? v + 2 * tier : v;  // one more heart per tier (a cost never grows)
    else if (key === "pierce") out[key] = v + tier;
    else if (key === "deathSave") out[key] = v + tier;
    else out[key] = Math.min(CAPS[key] ?? 99, Math.round(v * k * 100) / 100);
  }
  if (tier) for (const [key, v] of Object.entries(TIER_EXTRA[card.id] || {})) out[key] = Math.round(v * tier * 100) / 100;
  return out;
}
export function rollTier(h) {
  const r = Math.random(), lv = h.lvl || 1;
  return r < .04 + lv * .004 ? 2 : r < .24 + lv * .012 ? 1 : 0;
}
// a deck entry is {id, tier}; this is its card with the tier attached
export const deckCard = e => e && Object.assign({}, cardById(e.id), {tier: e.tier || 0});

// what a card does, in plain words with its tier's numbers, one line per effect
const pct = v => `${Math.round(Math.abs(v) * 100)}%`;
const SAY = {
  dmg: v => `+${pct(v)} damage`,
  speed: v => `+${pct(v)} move speed`,
  light: v => `+${pct(v)} lantern reach`,
  drain: v => `Lantern burns ${pct(v)} slower`,
  xp: v => `+${pct(v)} experience`,
  stealth: v => `Creatures hear you ${pct(v)} later`,
  rollCd: v => `Dodge roll recovers ${pct(v)} faster`,
  itemDur: v => `Tonics and slates last +${pct(v)}`,
  drop: v => `+${pct(v)} loot from creatures`,
  maxHp: v => `${v > 0 ? "+" : "\u2212"}${Math.abs(v) / 2} max ${Math.abs(v) > 2 ? "hearts" : "heart"}`,
  regen: v => `Heal half a heart every ${Math.round(45 / v)}s`,
  thorns: v => `Attackers take ${+v.toFixed(1)} damage back`,
  deathFuel: v => `+${Math.round(v)} oil or mana per kill`,
  deathSave: v => `Survive ${v} killing ${v > 1 ? "blows" : "blow"} per depth`,
  identify: () => "Know every tonic and slate on sight",
  swingArc: v => `Sword sweep +${pct(v)} wider`,
  block: v => `Blocking costs ${pct(v)} less oil`,
  splash: v => `Fireball blast +${pct(v)} wider`,
  burn: v => `Burning lasts +${pct(v)} longer`,
  cheapCast: v => `Fireballs cost ${pct(v)} less mana`,
  fuelRegen: v => `Mana returns +${pct(v)} faster`,
  pierce: v => `Arrows pierce ${v} more ${v > 1 ? "creatures" : "creature"}`,
  drawSpeed: v => `Bow draws ${pct(v)} faster`,
  twinShot: () => "Loose two arrows at once",
};
export const effectLines = (card, tier = 0) => Object.entries(cardFx(card, tier)).map(([k, v]) => SAY[k] ? SAY[k](v) : `${k} ${v}`);

// three cards the hero hasn't drawn yet: the major arcana and their own suit, each with a rolled tier
export function drawCards(h, n = 3) {
  const have = new Set((h.deck || []).map(e => e.id));
  const pool = CARDS.filter(c => (!c.suit || c.suit === h.cls) && !have.has(c.id));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  // a suit card turns up in most draws, so each class's own path stays in reach
  const suit = pool.findIndex(c => c.suit);
  if (suit > n - 1 && Math.random() < .7) [pool[0], pool[suit]] = [pool[suit], pool[0]];
  return pool.slice(0, n).map(c => Object.assign({}, c, {tier: rollTier(h)}));
}

// small pixel emblems for the cards' pictures (9x9; X = ink, o = gilt)
export const ICONS = {
  step: ["....oo...", "...oXXo..", "...oXXo..", "....XX...", "...XXXX..", "..X.XX.X.", "....XX...", "...X..X..", "..X....X."],
  wand: [".......oo", "......oXo", ".....oXo.", "....XX...", "...XX....", "..XX.....", ".XX......", "XX.......", "X........"],
  eye: [".........", "..XXXXX..", ".X.....X.", "X..ooo..X", "X..oXo..X", "X..ooo..X", ".X.....X.", "..XXXXX..", "........."],
  heart: [".XX...XX.", "XooX.XooX", "XoooXoooX", "XoooooooX", ".XoooooX.", "..XoooX..", "...XoX...", "....X....", "........."],
  crown: [".........", "o...o...o", "Xo.oXo.oX", "XXoXXXoXX", "XXXXXXXXX", "XoXoXoXoX", "XXXXXXXXX", ".........", "........."],
  lantern: ["...XXX...", "....X....", "..XXXXX..", "..XoooX..", "..XoXoX..", "..XoooX..", "..XXXXX..", "...XXX...", "........."],
  wheel: ["...XXX...", ".XX.X.XX.", ".X..X..X.", "X...o...X", "XXXoooXXX", "X...o...X", ".X..X..X.", ".XX.X.XX.", "...XXX..."],
  bear: [".X.....X.", "XXX...XXX", ".XXXXXXX.", ".XoXXXoX.", ".XXXXXXX.", "..XXoXX..", "...XXX...", "..XX.XX..", "........."],
  scales: ["....X....", "XXXXXXXXX", "X...X...X", "X...X...X", "oo..X..oo", "oo..X..oo", "....X....", "..XXXXX..", "........."],
  skull: ["..XXXXX..", ".XXXXXXX.", "XXoXXXoXX", "XXoXXXoXX", "XXXXXXXXX", ".XXX.XXX.", "..X.X.X..", "..XXXXX..", "........."],
  cup: ["XXXXXXXXX", "XoooooooX", ".XoooooX.", "..XoooX..", "...XXX...", "....X....", "....X....", "..XXXXX..", "........."],
  horns: ["X.......X", "X.......X", ".X.....X.", ".XXXXXXX.", "XXoXXXoXX", "XXXXXXXXX", ".XXXXXXX.", "..X.X.X..", "........."],
  star: ["....o....", "....X....", "...XoX...", "XXXXoXXXX", ".XXoooXX.", "..XXoXX..", "..X.X.X..", ".X.....X.", "........."],
  moon: ["...XXX...", ".XXoo....", ".Xoo.....", "XXo......", "XXo......", "XXo......", ".Xoo.....", ".XXoo....", "...XXX..."],
  horn: ["X........", "XX.......", ".XX......", "..XXX....", "...XXXX..", "....XXXXo", ".....XXoo", "......Xoo", "........."],
  sword: ["........o", ".......oX", "......XX.", ".....XX..", "....XX...", ".X.XX....", "..XX.....", ".XoX.....", "X..X....."],
  shield: ["XXXXXXXXX", "XoooXoooX", "XoooXoooX", "XXXXXXXXX", "XoooXoooX", ".XooXooX.", "..XoXoX..", "...XXX...", "....X...."],
  flame: ["....o....", "...oXo...", "...XXo...", "..XXoXo..", "..XooXX..", ".XooooXX.", ".XoooooX.", "..XoooX..", "...XXX..."],
  arrow: ["......XXX", ".......XX", "......X.X", ".....X...", "....X....", "...X.....", "oX.......", ".oX......", "o.o......"],
  bow: ["...XX....", "..X..X...", ".X....X..", "X......o.", "X......o.", "X......o.", ".X....X..", "..X..X...", "...XX...."],
};
