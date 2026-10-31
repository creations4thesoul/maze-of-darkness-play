// Art direction, shared constants and small helpers.
//
// BASE_ART is the look locked in from the Look Lab (concept/tweaks.json, saved 2026-10-28).
// The lab (tools/look_lab.html) stays as the art demo; change values there, save, and copy them here.
const BASE_ART = {
  beamStrength: 0.85, bevel: 1.45, block: 17, blockFill: 0.23, bloom: 0.24, bloomRadius: 2,
  bugColor: "#60ef94", bugs: 3, codeBase: 0.83, crystalColor: "#58cee9", crystals: 10,
  darkCurve: 2.15, darkRange: 0.52, decoDensity: 0.9, drips: 12,
  flicker: 0.03, floorTint: "#eef7f0", flowerColor: "#4353e3", flowers: 15, fungus: 1, fungusColor: "#5efbe1",
  glyphBoost: 1.35, glyphGamma: 0.95, haloRadius: 25, haloStrength: 0.08,
  heroBright: 1.25, holeChance: 0.04, hue: 8, lanternColor: "#b9cee6", lanternPower: 1.6, lanternRadius: 70,
  mist: 0.22, mistColor: "#daf8a9", palette: false, propGlow: 1.2, rainSpeed: 6, rimP1: "#50e7b4",
  rimP2: "#2d3dfc", rimWidth: 4, runeColor: "#f33ca9", saturation: 0.71, scanlines: 0.32, shaftColor: "#90ec90",
  shafts: 4, shimmer: 0.8, sludgeShimmer: 0.1, spores: 73, trailMax: 45, veinColor: "#a0fa64", vignette: 0.32,
  wallTint: "#e5deed",
  // later passes: lens effects softened for crisp pixels (lab: chroma 3, grain .15), glitch turned well down
  // (lab .26), and a steeper falloff and deeper black point for more light/dark contrast (lab 1.1 and .05)
  chroma: 1, grain: .06, glitch: .05, falloff: 1.3, darkThreshold: .07,
};

// The one art direction (concept/STYLE_GUIDE.md): John Bauer's folklore in pixels, a woodland swamp keep in
// muted natural tones. Moss and bark, lichen and peat, dull gold, dusk blue; the lantern's warm light is the one
// bright accent. Code glyphs in the remembered dark take a faint moss-gold tint.
export const THEME = {name: "BAUER", tex: 5, pixel: 6, fringe: [.1, .55], rain: .25, codeTint: [.62, .6, .38, .4], contrast: .32, wet: .66,
  art: {lanternColor: "#f0d9a8", lanternPower: 1.3, saturation: .8, hue: 0, bloom: .2, vignette: .55, mist: .28, mistColor: "#b9c2a2",
    shaftColor: "#e6d9ae", runeColor: "#d9a441", flowerColor: "#b49ac4", crystalColor: "#8fb5a4", bugColor: "#e2c96a",
    veinColor: "#7f9a5a", fungusColor: "#9cc9b4", wallTint: "#ffffff", floorTint: "#ffffff", sludgeShimmer: .06}};
// Every pixel on screen is the same size, Terraria style: code glyphs are 5x5 blocks of world pixels with
// no seams, and the screen effects that would split a pixel (scanlines, colour fringing, grain) are off.
const CRISP = {block: THEME.pixel * 5, scanlines: 0, chroma: 0, grain: 0};
export const ART = Object.freeze(Object.assign({}, BASE_ART, THEME.art, CRISP));

// Lit areas are crisp pixel art at a whole-number scale; the code look lives in the dark.
// CODE_FRINGE is where light falloff dissolves into glyphs (block brightness from..to).
// Glowing things (CODE_EMIS) stay almost pure pixel art so bullets and pickups always read clearly.
export const PIXEL = THEME.pixel, CODE_FRINGE = THEME.fringe, CODE_RAIN = THEME.rain, CODE_EMIS = .08, CODE_BEAM = .55;

export const T = 16, H = 8, OUT_W = 1920, OUT_H = 1080;
export const MAT = {FLOOR: 0, TOP: 1, FRONT: 2, SPRITE: 3, EMIS: 4, P1: 5, P2: 6, BEAM: 7};
// glyph density band per material (fraction of the sorted glyph list)
export const BAND = [[0, .55], [.45, 1], [.3, .85], [.55, 1], [.6, 1], [0, 1], [0, 1], [0, .25]];
export const PAL = [[0,0,0],[6,8,16],[12,16,30],[20,28,48],[30,44,70],[44,64,96],[64,92,128],[96,128,164],[140,176,204],
  [196,226,240],[250,255,255],[10,40,40],[16,70,66],[24,110,96],[50,170,140],[120,240,200],[50,20,70],[90,36,120],
  [150,60,180],[220,120,240],[220,40,60]];
export const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v => v / 16);
export const FONT = {A:"010101111101101",B:"110101110101110",C:"011100100100011",D:"110101101101110",E:"111100110100111",
  F:"111100110100100",G:"011100101101011",H:"101101111101101",I:"111010010010111",J:"001001001101010",K:"101101110101101",
  L:"100100100100111",M:"101111111101101",N:"110101101101101",O:"010101101101010",P:"110101110100100",Q:"010101101110011",
  R:"110101110101101",S:"011100010001110",T:"111010010010010",U:"101101101101111",V:"101101101101010",W:"101101111111101",
  X:"101101010101101",Y:"101101010010010",Z:"111001010100111","0":"111101101101111","1":"010110010010111","2":"110001010100111",
  "3":"110001010001110","4":"101101111001001","5":"111100110001110","6":"011100111101111","7":"111001010010010",
  "8":"111101111101111","9":"111101111001110","-":"000000111000000",":":"000010000010000",".":"000000000000010",
  "/":"001001010100100","!":"010010010000010","?":"110001010000010",">":"100010001010100","<":"001010100010001"," ":"000000000000000","%":"101001010100101","+":"000010111010000","'":"010010000000000","(":"010100100100010",")":"010001001001010",",":"000000000010100"};

export const SPR = {
  RAT: ["...kkk.......","..kRRRkk.....",".kRrRRRRkk...","kReRRRRRRRkkt","kRRRRRRRRRk.t",".kkrkkkrkk..t","..k...k......"],
  // seen from above while running down or up the screen (nose first)
  RAT_DOWN: ["...t...","...t...","..kRk..",".kRRRk.","kRRrRRk","kRRRRRk","kRrRrRk",".kRRRk.",".keRek.","..kRk..","...k..."],
  RAT_UP: ["...k...","..kRk..",".kRRRk.",".kRRRk.","kRrRrRk","kRRRRRk","kRRrRRk",".kRRRk.","..kRk..","...t...","...t..."],
  FUNGUS: [".g...g.","gGg.gGg",".gGgGg.","..sGs..","...s..."],
  FLOWER: [".p.p.","pPpPp",".pYp.","..j..",".jj.."],
  CRYSTAL: ["...x..","..xX..","x.xXx.","xXxXxX","xXXxXx",".kkkk."],
  KEY: [".qq.","q..q",".qq.",".Q..",".QQ.",".Q.."],
  // creatures, after old Nordic folklore: a bog toad that spits, and a will-o'-the-wisp carrying its own cold light
  SPITTER: ["....................",".....k.......k......","....kMkk...kkmkk....","...kMmmMkkkMMMMMk...","..kMmEmMMMMMMEMMk...",".kkMMMmMMMmMmMMMMk..","kMMMMMMMMmMMmmMMMMk.","kMMMMMMMMMMMMmmMMMMk","kMmMdddddddddddmMMMk","kMMmMMMMMMMMMMmMMMmk","kmmMMMmMMMmmmMmmMMk.","kMmMMMMMMMmMMMMMmMk.","kMMMMmmMMMMMMMMMmMk."],
  WISP: ["....kUk....","...kUUUk...","..kUUUUUk..",".kUUZZZUUk.",".kUUZZZUUk.",".kUZkZkZUk.","kUUUZZZUUUk","kuUUZZZUUuk","ukUUUUUUUku","ukUUUUUUUku","k.kUUUUUk.k","...kkukk...","...kuuk....","....kuk...."],
  OIL: [".ww.","oOOo","oOOo",".oo."],
  // unidentified loot: a stoppered vial whose colour varies, and a stone slate with a glowing glyph
  TONIC: ["..w..",".kwk.","kfFfk","kFFFk",".kkk."],
  RUNE: [".zzzz.","zZzzZz","zzZZzz","zZzzZz",".zzzz."],
  // a relic hidden behind a gate, an ability shrine, and the ladder back up to the floor above
  RELIC: ["..a..",".aAa.","aAAAa",".aAa.","..a.."],
  ALTAR: ["..AA..",".AaaA.","..AA..","..zz..",".zzzz.","zzzzzz"],
  // newer creatures and the bosses (each wears its own palette from FOE_PAL)
  CRAWLER: ["..kJJkkJJkkJJk....","...kk..kkkkkk.....","....kkkKKKKkk.....","...kKYKKJKKYKkkkk.","..kKKKKKJKKKKKJJJk","..kKKKKKJKKKKKJJEk","..kKKKKKJKKKKKJJJk","..kKKKKKJKKKKKJJJk","...kKKKKJKKKKKkkk.","..kJJkKJJKKJJk....","...kk.kkkkkkk....."],
  BLOATER: ["....kkkkkkkk....","..kkRRRRRlllkk..",".kRRllRRRRlRRRk.","kRRRllRRRRRRRRRk","kRRRRRRRRRRRllRR","kRllRRllRRRRllRR","kRllRRllRRRRRRRR","kRRRRRRRRRRRRRRk","kvvvvllllllvvvvk",".kkkllllllllkkk.","..kllllllllllk..","..klllElllEllk..","..kllllllllllk..","...kllldddllk...","...kllllllllk..."],
  LURKER: ["....kkkkkk....","...kWWWWWWk...","..kWWWWWWWWk..","..kWWWllWWWk..","..kWWllllWWWk.","..kWWlllllWWk.",".kWWWlYlYwWk..",".kWwWllllWWk..",".kwWkWllWWWk..",".kWWWWwWWWWk..",".kWWWwWWWWwk..",".kWWwWWWWwWk..",".kWlWWWWwWlkk.","kWwlWWWwWWlkWk",".klWWWwWWWWlk.","kklWWwWWWWwlkk","WkWkwkWkWkWkkW","k.k.k.k.k.k..k","..............",".............."],
  BRUTE: [".........................","......kkkkkkkkk..........",".....kHHHHHHHHHkk........","....kHHHHHHHHHHHHk.......","...kHHHHHHHHHHHHHk.......","...kHHHHHHHHHHHHHk.......","...kHHHHHHHHHHHHHk.......","..kHkSHHHHHHHHHSkHk......","..kHkHSSSESSENNHkHk......","..kHkSSmSSSmSkNNSSHk.....",".kHkkSSmmSSSSSkNNNHk.....","kmSSSSSSSSmSSSSkkNNkk....","kSSSSSSSSSSSSSSSSNNmSk...","kSSSSSSSSSSSSSmmSNNSSk...","kSSSSSSSSSSSSSSSmkNSSk...","kSSSSSSmSSSSSSSSSSnSmk...","kSSSSSSSSSSSmmSSSSkSmk...","kSSSSSSSSmSSSSSSSSSmmk...","kSSSSSSSSSSSSSSSSmSSSk...","kSSSSCCCCCCCCCCCCCCSSSk..","kmSmSCCCCCCCCCCCCCCSSkSk.","kSSSSCCCCCCCCCCCCCCSSkkSk","SSSSSkCSSSCSSmSSSkkSSSkkS","SSSSSkkkSSSSSSSSk.kSSSkHH","SSSSSk.kSSkkkkSSk.kSmSkHH","kkkkk..kSSk..kSSk..kkk.kH"],
  HULK: ["....................................",".............kkkkkkkkk..............","..........kkkHHHHHHHHHkkk...........",".........kHHHHHHHHHHHHHHHk..........","........kHHHHHHHHHHHHHHHHHk.........",".......kHHHHHHHHHHHHHHHHHHk.........",".......kHHHHHHHHHHHHHHHHHHk.........",".......kHHHHHHHHHHHHHHHHHHk.........",".......kHkHHHHHHHHHHHHHHHHk.........",".......kHkSSSHHHHHHHHHSSSkHk........","......kHkkmSmSESSNNENSSSSkHk........","......kHkkSSSSSmSkNNNNSSSkkHk.......","......kHkkSSSSSSSSkNNNNNmSSHk.......","......kHkSSSSSSSSSSkkNNNNSSSHk......","......kHSSSSSSmSSSSSSkNNNNSSHSk.....",".kkkkkHSSSSSSSSSSSSmSSkNNNNSmSSkkkk.","kSSSSSHSSSSSSSSSSSSSSSSNNNNmSSSSSSSk","kSmSSSHrrRrrrrrRrrrrrRrrrrrRrrSSSSSk","kSSSSSmRRRRRRRRRRRRRRRRRRRRRRRmSSSmk","kSSSSSSRRRTRRRRRRRRRRRRRRRTRRRSSSSSk","kSSSSSSRRRRRRRRRRRRRRRRRRRRRRRmSSSSk","kmSSSSSRRRRRRRRRRRRRRRRRRRRRRRSSSSSk","kSSSSSSrrRrrrrrRrrrrrRrrrrrRrrSSSSSk","kmmSSSSRRRRRRRRRRRRRRRRRRRRRRRSSSSSk","kSSSSSSRRRTRRRRRRRRRRRRRRRTRRRSSSSSk","kSSSSSSRRRRRRRRRRRRRRRRRRRRRRRSSSSSk","kSSSSSSrrRrrrrrRrrrrrRrrrrrRrrSSSSSk","kSSSSmSRRRRRRRRRRRRRRRRRRRRRRRSSSSSk","kSSSSSSSSSSSSSSSSSSSmSSmSSSSSSSSSSSk","kSSSSSkSSSSSSSSSSSSSSSSSSSSSSSkSSSSk","RRRRRRRkSSSSSSSSSSSSSSSSSSSmSkRRRRRR","RRRRRRRkkSmSSSSSSSSSmSSSSSSSkkRRRRRR","RRRRRRRk.kkSSSSSmSSSSSSSSSkk.kRRRRRR","RRRRRRRk..kSSSSSSSSSSSmSSSkk.kRRRRRR","kkkkkkk..krrrrrrrkkkrrrrrrrrk.kkkkkk",".........krrrrrrrk.krrrrrrrrk......."],
  BROOD: [".....................................","...........kkkkk.....................","........kkkHHHHHkkk..................",".......kHHHHHHHHHHHk.................","......kHHHHHHHHHHHHHk................",".....kHHHHHHHHHHHHHHk................",".....kHHHHHHHHHHHHHDDkkkk............",".....kHHSHHHHHHHHSSDDDDDDkk..........",".....kHHSSSSESESNNSDDDDDDDDk.........","....kHkHSSSSSSSSkNNDDDDDDDDDk........","....kHkHSSSSSSSSSkNNDDDDDDDDk........","....kHkHSSSSSSSSSSkNNDDDDDDDDk.......","...kHkkHkSSSSSSSSDDkNNDDDDDDDk.......","...kHkkHCDDSSSSDDDDDkNNDDDDDDCk......","...kHkHCCDDDDDDDDDDDDNNDDDDDDcCk.....","...kHkHCcDDDDDDDDDDDDNNDDDDDDCCck....","...kHCHCCCDDDDDDDDDDDkNNDDDDCCCCCk...","..kHCCHCCCCDDDDDDDDDDDnNDDDCCCcCCCk..","..kHCCHCCcCCDDDDDDDDDDkkDDcCCCCCCCk..","..kCccHCccCCCCCDDDDDDDDcCCCCcCCCCCCk.","..kCCCHCCcCCCCcCCCCCCCcCCCCCCcCCCcCk.","..kCCCHCCCCCCCCCCCCCcCCCKKCCccCCCCCk.","..kCCCcCCKcCCCCCCCCCCccKKYKCCCcCCcCk.","..kCCCCCKKYKCCCcCCCCCCcCKCCCCCCCCCck.","...kCCCCCKKCCCcCCCCcCCCcCCCcCCCcCCk..","...kCCCCCCCCCCCCCCCCCCCCCCCCCcCCcCk..","....kCCCcCCCCCCKKYCCCCcCCCCCKKYCCk...",".....kCCCCCCCCCKKKCCCCCCCCCCKKKCk....","......kCCCCCcCCCCCCcKKKCCCccCcCk.....",".......kkCcCCCCCCCCKKKYCCCCCCkk......","...k...k.kkkCCcCcCCCCCCCCCkkk..k.....","..kCk.kCkkCkkkCkCCCcCCkkCk.kckkCk...."],
  WARDEN: [".............kUk............","............kkUkk...........","...........kUkUkUk..........","............kUUUk...........",".kk.........kUUUk...........","kQQk......kkUUUUkk..........","QQQk.....kUUUUUUUUkk........","QQQk....kUUUUUZUUUUUk.......","QQQk...kUUUZZZZZZUUUUk......","kQQk..kUUUZZZZZZZZUUUk......",".kuk..kUUUZZZZZZZZZUUUk.....",".kuk.kUUUZZZZZZZZZZZUUk.....","..kukkUUUZZZZZZZZZZZUUUk....","..kukkUUUZZZkZZZkZZZUUUk....","...kuUUUUZZZZZZZZZZZUUUk....","...kuUUUUZZZZZZZZZZZUUUk....","....kuUUUZZZZkkkZZZZUUUuk...","....kUUUUZZZZZZZZZZZUUUuk...","....kUUUUUZZZZZZZZZUUUUUuk..","....kUUUUUUZZZZZZZUUUUUkuk..","....kUUUUUUUZZZZZUUUUUUkuk..",".....kUUUUUUUUUUUUUUUUUkkuk.",".....kUUUUUUUUUUUUUUUUUkkuk.",".....kUUUUUUUUUUUUUUUUUk.k..","......kUUUUUUUUUUUUUUUk.....","......kUUUUUUUUUUUUUUUk.....",".......kUUUUUUUUUUUUUk......",".......kUUUUUUUUUUUUk.......","........kUUUUUUUUUUk........",".........kkUUuuuUUk.........","...........kkukukk..........","............kukuk...........","............kuuuk...........","............kukuk..........."],
  KING: [".............k.kTTk..k............","..........k.kTk.kk..kTkk..........",".........kTkkkTkkkkkTkkTk.........","........kTTTTTTTTTTTTk.k..........",".........kkkkkkkkkkkk.............","............kkSSSSSSSk............","..........kkSSSSSSSSSSkk..........",".........kHSSSSSSSSSSSSHk.........",".........kHSSSSSSSSSSSSHk.........",".........kHSSSSSSSSSSSSSHk........","........kHSSSSESSSSNENSSHk........","........kHSSSSSSSSSkNNNSHk........","........kHCSSSSSSSSSNNNSHk........","........kHCSSSHHHSSSkNNNkHk.......",".......kHCDCSHHHHHSSSkNNNHk.......",".......kHCCCSHHHHHSSSSNNNHk.......",".......kHCCCHHHHHHHSSCkNNHk.......","......kDHCCDHHHHHHHDCCCkNNHk......","......kCHCCCHHHHHHHHCCCkNNHk......","......kHCCCHHHHHHHHHCCCkNNNk......",".....kCHDCCHHHHHHHHHDCCCkNNNk.....",".....kCHCCCHHHHHHHHHCCCCkkNNNk....",".....kCCCCCHHHHHHHHHCCCCkknNNkk...","....kDCCCDCHHHHHHHHHCDCCCkMMMMMk..","....kCCCCCCHHHHHHHHHCCCCCkkkMMk...","....kCCCCCCHHHHHHHHHCCCCCkkkMMkk..","....kCDCCCDHHHHHHHHHCCDCCMMMMMMMk.","...kCCCCCCCHHHHHHHHHCCCCCMMMMMMMk.","...kCCCCCCCHHHHHHHHHCCCCCMdddddMk.","...kCCCDCCCDHHHHHHHDCCCDCMdddddMk.","..kCCCCCCCCCHHHHHHHCCCCCCMdddddMk.","..kCCCCCCCCCCHHHHHCCCCCCCMdddddMk.","..kCDCCCDCCCDHHHHHCCDCCCDMMMMMMMk.",".kCCCCCCCCCCCCHHHCCCCCCCCCCCkkkk..","..kCkkkkkkkkkkkkkkkkkkkkkkkk......",".kCk..............................",".kCk..............................",".kCkkk............................","kCCCCCk..........................."],
  // a loot room's chest, shut and opened
  CHEST: ["..kkkkkk..", ".kwwwwwwk.", "kwwwwwwwwk", "kOOOOOOOOk", "kwwwYYwwwk", "kwwwwwwwwk", ".kkkkkkkk."],
  CHEST_OPEN: ["kkkkkkkkkk", "kwwwwwwwwk", ".kkkkkkkk.", "kYYYYYYYYk", "kwwwwwwwwk", "kwwwwwwwwk", ".kkkkkkkk."],
  // a wall torch: a bare iron sconce, and two flickering frames once lit
  TORCH: ["..k..", ".kwk.", ".kwk.", "..w..", "..w..", "kkwkk", ".kkk."],
  TORCH_LIT: ["..O..", ".OYO.", ".kOk.", ".kwk.", "..w..", "kkwkk", ".kkk."],
  TORCH_LIT2: [".O...", "..OY.", ".kOk.", ".kwk.", "..w..", "kkwkk", ".kkk."],
  LADDER: ["w....w","wwwwww","w....w","w....w","wwwwww","w....w","w....w","wwwwww"],
};
export const EMISSIVE = new Set("eLgGpPYxXqQoOEUFZA");
export const BASECOL = {k:[.02,.02,.05],H:[.30,.42,.62],s:[.08,.1,.16],e:[.6,1,1],C:[.22,.28,.45],B:[.15,.15,.25],L:[.9,1,1],
  l:[.4,.5,.6],R:[.32,.30,.40],t:[.5,.45,.6],g:[.3,.9,.8],G:[.8,.5,1],Y:[1,.95,.5],j:[.12,.32,.18],w:[.45,.3,.2],
  o:[1,.55,.15],O:[1,.85,.45],m:[.22,.38,.14],M:[.38,.6,.22],E:[1,.35,.2],u:[.42,.28,.58],U:[.78,.58,1],
  f:[.5,.5,.5],F:[1,1,1],z:[.2,.2,.24],Z:[1,1,1],a:[.5,.5,.5],A:[1,1,1],
  // shading for the detailed creatures: slime highlight and mouth, wisp mouth, rat underside
  n:[.62,.9,.42],d:[.08,.12,.05],v:[.25,.12,.35],r:[.2,.18,.26]};
// every creature's colours, by sprite letter: forest greys, greens and browns (concept/STYLE_GUIDE.md)
export const FOE_PAL = {k:[.06,.05,.04],E:[1,.47,.2],Y:[.94,.86,.55],T:[.8,.67,.35],S:[.46,.48,.36],m:[.33,.41,.24],H:[.24,.31,.17],N:[.66,.44,.34],n:[.75,.5,.38],C:[.36,.28,.2],c:[.44,.38,.26],D:[.27,.24,.26],
  R:[.5,.3,.18],r:[.31,.18,.12],W:[.13,.12,.16],w:[.2,.18,.24],l:[.77,.73,.63],v:[.59,.51,.39],U:[.67,.86,.9],u:[.35,.51,.59],Z:[.92,.98,.98],Q:[.51,.94,1],M:[.38,.43,.24],d:[.16,.1,.08],K:[.24,.27,.22],J:[.12,.13,.11]};
export const OIL_COL = [1, .62, .2];

export function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hsh(a, b, s = 0) { const v = Math.sin(a * 12.9898 + b * 78.233 + s * 37.719) * 43758.5453; return Math.abs(v - Math.trunc(v)); }
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export function hex(h) { return [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255); }
export function norm(c) { const m = Math.max(c[0], c[1], c[2], 1e-6); return c.map(v => v / m); }
export const mixW = (c, f) => c.map(v => v + (1 - v) * f);
export const scl = (c, f) => c.map(v => v * f);
export function sample(rng, arr, k) {
  const a = arr.slice(), out = []; k = Math.min(Math.max(k, 0), a.length);
  for (let i = 0; i < k; i++) { const j = i + Math.floor(rng() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; out.push(a[i]); }
  return out;
}

const GLOW = {rune: hex(ART.runeColor), crystal: hex(ART.crystalColor), vein: hex(ART.veinColor), flower: hex(ART.flowerColor),
  bug: hex(ART.bugColor), shaft: hex(ART.shaftColor), fungus: hex(ART.fungusColor), mist: hex(ART.mistColor), oil: OIL_COL};
export const glowCol = name => GLOW[name];
export const colOf = c => Array.isArray(c) ? c : GLOW[c];  // a named glow colour or a raw [r, g, b]

const NZ = 64, NT = (() => { const r = mulberry32(77); return Float32Array.from({length: NZ * NZ}, () => r()); })();
export function noise(x, y) {  // smooth tiling value noise
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = xi & 63, b = yi & 63, a1 = (a + 1) & 63, b1 = (b + 1) & 63;
  const top = NT[b * NZ + a] + (NT[b * NZ + a1] - NT[b * NZ + a]) * sx, bot = NT[b1 * NZ + a] + (NT[b1 * NZ + a1] - NT[b1 * NZ + a]) * sx;
  return top + (bot - top) * sy;
}

// glyphs: digits (and mirrored) plus katakana-ish stroke glyphs, sorted by density
export const GLY = (() => {
  const r = mulberry32(5), list = [];
  for (const ch of "0123456789") {
    const g = new Uint8Array(25), m = new Uint8Array(25);
    for (let b = 0; b < 15; b++) if (FONT[ch][b] === "1") { g[(b / 3 | 0) * 5 + 1 + b % 3] = 1; m[(b / 3 | 0) * 5 + 3 - b % 3] = 1; }
    list.push(g, m);
  }
  while (list.length < 80) {
    const g = new Uint8Array(25), n = 2 + Math.floor(r() * 3);
    for (let s = 0; s < n; s++) {
      const k = Math.floor(r() * 5), a = Math.floor(r() * 3), ln = 2 + Math.floor(r() * (4 - a));
      if (k === 0) { const y = Math.floor(r() * 5); for (let i = 0; i < ln; i++) g[y * 5 + a + i] = 1; }
      else if (k === 1) { const x = Math.floor(r() * 5); for (let i = 0; i < ln; i++) g[(a + i) * 5 + x] = 1; }
      else if (k === 2) for (let i = 0; i < ln; i++) g[(a + i) * 5 + Math.min(i + Math.floor(r() * 2), 4)] = 1;
      else if (k === 3) for (let i = 0; i < ln; i++) g[(a + i) * 5 + 4 - i] = 1;
      else g[Math.floor(r() * 25)] = 1;
    }
    const c = g.reduce((s, v) => s + v, 0);
    if (c >= 3 && c <= 17) list.push(g);
  }
  list.sort((a, b) => a.reduce((s, v) => s + v, 0) - b.reduce((s, v) => s + v, 0));
  const out = new Uint8Array(list.length * 25); list.forEach((g, i) => out.set(g, i * 25)); return out;
})();
export const NG = GLY.length / 25;
