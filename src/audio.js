// Procedural sound: every noise in the sewer is synthesized with Web Audio, no sound files.
let ac = null, out = null, white = null;
let muted = (() => { try { return localStorage.getItem("mod-muted") === "1"; } catch (e) { return false; } })();
const VOLUME = .7;

// Browsers only allow sound after the player presses something, so this runs on the first input.
export function startAudio() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  out = ac.createGain();
  out.gain.value = muted ? 0 : VOLUME;
  const comp = ac.createDynamicsCompressor();
  out.connect(comp); comp.connect(ac.destination);
  white = noiseBuf(1, false);
  ambience();
}

function noiseBuf(sec, brown) {
  const n = ac.sampleRate * sec | 0, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}

// the sewer itself: a slow low rumble, a far-off trickle and a faint drone
function ambience() {
  const src = ac.createBufferSource(), lp = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
  src.buffer = noiseBuf(4, true); src.loop = true;
  lp.type = "lowpass"; lp.frequency.value = 220;
  g.gain.value = .35; lfo.frequency.value = .07; lg.gain.value = .15;
  lfo.connect(lg); lg.connect(g.gain); src.connect(lp); lp.connect(g); g.connect(out);
  src.start(); lfo.start();
  const w = ac.createBufferSource(), bp = ac.createBiquadFilter(), wg = ac.createGain();
  w.buffer = noiseBuf(3, false); w.loop = true;
  bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = .8; wg.gain.value = .012;
  w.connect(bp); bp.connect(wg); wg.connect(out); w.start();
  for (const [f, v] of [[55, .03], [82.4, .015]]) {
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.value = f; og.gain.value = v;
    o.connect(og); og.connect(out); o.start();
  }
}

function voice(node, vol, dur, pan, delay) {
  const t = ac.currentTime + delay, g = ac.createGain(), p = ac.createStereoPanner();
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, .0002), t + .005);
  g.gain.exponentialRampToValueAtTime(.0001, t + .005 + dur);
  p.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(g); g.connect(p); p.connect(out);
  return t;
}
function tone(type, f0, f1, dur, vol, pan = 0, delay = 0) {
  const o = ac.createOscillator(), t = voice(o, vol, dur, pan, delay);
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.start(t); o.stop(t + dur + .05);
}
function noise(dur, freq, q, vol, pan = 0, delay = 0, type = "bandpass") {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter();
  s.buffer = white; f.type = type; f.frequency.value = freq; f.Q.value = q;
  s.connect(f);
  const t = voice(f, vol, dur, pan, delay);
  s.start(t, Math.random() * .5); s.stop(t + dur + .05);
}

export function sfx(name, {vol = 1, pan = 0} = {}) {
  if (!ac || muted) return;
  const r = Math.random;
  switch (name) {
    case "drip": { const f = 900 + r() * 900; tone("sine", f * 1.6, f * .6, .09, .12 * vol, pan); tone("sine", f * 2.2, f, .05, .04 * vol, pan, .06); break; }
    case "step": noise(.06, 380 + r() * 120, 1.2, .2 * vol, pan, 0, "lowpass"); break;
    case "key": [659, 988, 1319].forEach((f, i) => tone("triangle", f, f, .5, .12, 0, i * .07)); break;
    case "oil": tone("sine", 300, 140, .12, .22); tone("sine", 260, 120, .12, .18, 0, .1); break;
    case "bite": tone("sawtooth", 1900, 2900, .12, .1, pan); noise(.15, 300, .8, .45, pan, 0, "lowpass"); break;
    case "squeak": tone("sine", 2600 + r() * 600, 3400 + r() * 600, .07, .06 * vol, pan); tone("sine", 3000, 2400, .06, .05 * vol, pan, .09); break;
    case "open": [110, 116.5, 164].forEach(f => tone("square", f, f * .98, 1.4, .05)); noise(.5, 1800, 6, .15); break;
    case "clear": [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, .8, .1, 0, i * .12)); break;
    case "dead": tone("sawtooth", 220, 40, 2.2, .1); noise(2, 120, .7, .3, 0, 0, "lowpass"); break;
    case "sputter": for (let i = 0; i < 4; i++) noise(.03, 2500, 2, .1, 0, i * .05 + r() * .03); break;
    case "locked": tone("square", 140, 120, .15, .06); break;
    case "shoot": tone("square", 900, 1500, .06, .04, pan); noise(.05, 3000, 2, .05, pan); break;
    case "hit": tone("square", 320, 120, .07, .07, pan); break;
    case "kill": noise(.25, 700, .8, .3, pan, 0, "lowpass"); tone("sawtooth", 400, 60, .3, .06, pan); break;
    case "spit": tone("sine", 520, 260, .12, .06 * vol, pan); noise(.08, 1200, 1, .05 * vol, pan); break;
    case "roll": noise(.2, 900, .7, .14, pan); break;
    case "hurt": tone("sawtooth", 600, 180, .22, .12, pan); noise(.15, 300, .8, .4, pan, 0, "lowpass"); break;
    case "gate": noise(.6, 500, .6, .35, 0, 0, "lowpass"); tone("sawtooth", 160, 60, .5, .1); tone("square", 90, 70, .4, .06, 0, .1); break;
    case "relic": [523, 784, 1047, 1568].forEach((f, i) => tone("sine", f, f, .7, .08, 0, i * .06)); noise(.6, 4000, 4, .06); break;
    case "fireball": noise(.25, 900, .9, .22, pan); tone("sawtooth", 180, 90, .25, .06, pan); break;
    case "boom": noise(.45, 400, .6, .4, pan, 0, "lowpass"); tone("sine", 120, 40, .4, .14, pan); break;
    case "bow": tone("triangle", 520, 180, .1, .08, pan); noise(.06, 5000, 3, .05, pan); break;
    case "swing": noise(.18, 1800, 1.4, .22, pan); tone("sawtooth", 300, 120, .12, .04, pan); break;
    case "block": tone("square", 1400, 1300, .12, .07, pan); tone("triangle", 2100, 2000, .25, .05, pan); noise(.08, 3000, 2, .1, pan); break;
    case "clank": noise(.09, 260, 1, .3 * vol, pan, 0, "lowpass"); tone("square", 180 + r() * 40, 150, .06, .03 * vol, pan); break;
    case "flare": noise(.35, 5200, 2, .16); tone("sine", 220, 880, .3, .1); tone("triangle", 1760, 1320, .5, .05, 0, .05); break;
    case "sizzle": noise(.18, 3800, 3, .07 * vol, pan); break;
    case "torch": noise(.5, 700, .7, .25, 0, 0, "lowpass"); tone("sine", 140, 220, .4, .05); break;
    case "pickup": tone("triangle", 520, 780, .12, .1); tone("triangle", 780, 1040, .1, .07, 0, .07); break;
    case "drink": for (let i = 0; i < 3; i++) tone("sine", 240 + i * 40, 160, .1, .14, pan, i * .09); break;
    case "rune": tone("sine", 330, 990, .5, .1, pan); noise(.5, 2400, 3, .1, pan); tone("triangle", 1320, 1320, .4, .05, pan, .15); break;
    case "levelup": [392, 523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f * 1.01, .5, .09, 0, i * .08)); break;
    case "menu": tone("square", 880, 880, .04, .035); break;
    case "start": tone("triangle", 220, 440, .4, .12); noise(.4, 600, 1, .15, 0, 0, "lowpass"); break;
  }
}

export function toggleMute() {
  muted = !muted;
  if (out) out.gain.value = muted ? 0 : VOLUME;
  try { localStorage.setItem("mod-muted", muted ? "1" : "0"); } catch (e) {}
  return muted;
}
