// On-screen controls for phones and tablets. They appear after the first touch and work by pressing and holding
// the same key codes the keyboard uses, so every screen reads them unchanged. In play the left thumb moves (a
// stick that starts wherever it lands) and the right thumb attacks the nearest creature, or aims while dragged;
// tapping a hotbar slot uses it. On menus a tap is a click, and buttons cover the rest. Touch drives player one.
import {OUT_W, OUT_H} from "./art.js";
import {textC, textMin} from "./render.js";
import * as input from "./input.js";
import {PACK} from "./items.js";

export const touch = {on: false, game: null};
const pts = new Map();  // pointer id -> {x, y, ox, oy, role, code}
const held = new Set();  // key codes the sticks are holding down
const STICK_R = 110, DEAD = 28;
const PARCH = "#e6d9ae", GOLD = "#d9a441";

const circ = (label, x, y, r, code, arrow) => ({label, x, y, r, code, arrow});
const pill = (label, x, y, w, h, code) => ({label, x, y, w, h, code});
const DPAD = [circ("", 230, 730, 62, "ArrowUp", [0, -1]), circ("", 230, 970, 62, "ArrowDown", [0, 1]),
  circ("", 110, 850, 62, "ArrowLeft", [-1, 0]), circ("", 350, 850, 62, "ArrowRight", [1, 0])];

// the buttons each screen shows (hidden ones are hit areas over things the game already draws)
function buttons(game) {
  const st = game.state, h = game.heroes && game.heroes[0];
  if (st === "play") {
    const b = [pill("BAG", 850, 46, 160, 64, "Tab"), pill("PAUSE", 1070, 46, 160, 64, "Escape"), circ("ROLL", 1480, 975, 74, "Space")];
    b.push(circ("FLARE", 1300, 975, 64, "TouchFlare"));
    if (h && h.cls === "templar") b.push(circ("BLOCK", 1500, 795, 64, "KeyC"));
    if (h && game.mode === "solo") {  // the hotbar's slots: tap one to use it
      const S = 64, gap = 8, n = h.pack || PACK, x0 = Math.round(OUT_W / 2 - (n * (S + gap) - gap) / 2), y = OUT_H - S - 22;
      for (let k = 0; k < n; k++) b.push({x: x0 + k * (S + gap) + S / 2, y: y + S / 2, w: S + 8, h: S + 8, code: "Digit" + (k + 1), hidden: true});
    }
    return b;
  }
  if (st === "select") return [...DPAD, circ("READY", 1720, 880, 92, "Space"), pill("BACK", 1720, 1030, 180, 64, "Escape")];
  if (st === "inventory") return [pill("WEAR", 765, 935, 122, 66, "Enter"), pill("DROP", 895, 935, 122, 66, "KeyX"),
    pill("DECK", 1025, 935, 122, 66, "KeyE"), pill("CLOSE", 1155, 935, 122, 66, "Tab")];
  if (st === "paused") return [pill("RESUME", 800, 700, 280, 90, "Enter"), pill("QUIT", 1120, 700, 280, 90, "KeyQ")];
  if (st === "dead" || st === "won" || st === "victory") return [pill("NEW RUN", 800, 880, 280, 90, "Enter"), pill("TITLE", 1120, 880, 280, 90, "KeyQ")];
  if (st === "unlocks") return [pill("BACK", 960, 1030, 220, 70, "KeyQ")];
  return [];
}
const over = (b, x, y) => b.r ? Math.hypot(x - b.x, y - b.y) < b.r * 1.15 : Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2;

function goFullscreen() {  // phones: fill the screen and turn sideways where the browser allows it
  const d = document.documentElement;
  if (document.fullscreenElement || !d.requestFullscreen) return;
  d.requestFullscreen({navigationUI: "hide"}).then(() => screen.orientation?.lock?.("landscape").catch(() => {})).catch(() => {});
}

export function bindTouch(el) {
  const at = e => {
    const r = el.getBoundingClientRect(), s = Math.min(r.width / OUT_W, r.height / OUT_H);
    return [(e.clientX - r.left - (r.width - OUT_W * s) / 2) / s, (e.clientY - r.top - (r.height - OUT_H * s) / 2) / s];
  };
  el.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch" || !touch.game) return;
    e.preventDefault();
    if (!touch.on) { touch.on = true; textMin.sc = 4; goFullscreen(); }
    input.mouse.active = false;  // no crosshair: aim comes from the thumb, or the nearest creature
    const [x, y] = at(e), game = touch.game, b = buttons(game).find(b => over(b, x, y)), p = {x, y, ox: x, oy: y};
    if (b) { p.role = "button"; p.code = b.code; input.press(b.code); }
    else if (game.state === "play") p.role = x < OUT_W / 2 ? "move" : "aim";
    else { p.role = "button"; p.code = "MouseLeft"; input.mouse.x = x; input.mouse.y = y; input.press("MouseLeft"); }
    pts.set(e.pointerId, p);
  });
  el.addEventListener("pointermove", e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    [p.x, p.y] = at(e);
    const dx = p.x - p.ox, dy = p.y - p.oy, d = Math.hypot(dx, dy);
    if (p.role === "move" && d > STICK_R) { p.ox += dx / d * (d - STICK_R); p.oy += dy / d * (d - STICK_R); }  // the stick follows the thumb
  });
  const up = e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (p.code) input.release(p.code);
    pts.delete(e.pointerId);
  };
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
  for (const ev of ["touchstart", "touchmove", "gesturestart"]) el.addEventListener(ev, e => e.preventDefault(), {passive: false});
}

const hold = (code, on) => { if (on && !held.has(code)) { held.add(code); input.press(code); } else if (!on && held.has(code)) { held.delete(code); input.release(code); } };
// each frame, before the game reads its input: turn the thumbs into held keys and the aim stick
export function updateTouch(game) {
  touch.game = game;
  if (!touch.on) return;
  let mx = 0, my = 0, aim = null, fire = false;
  if (game.state === "play") for (const p of pts.values()) {
    const dx = p.x - p.ox, dy = p.y - p.oy, d = Math.hypot(dx, dy);
    if (p.role === "move" && d > DEAD) { mx = dx / d; my = dy / d; }
    if (p.role === "aim") { if (d > DEAD) aim = {x: dx / d, y: dy / d}; else fire = true; }
  }
  hold("KeyW", my < -.38); hold("KeyS", my > .38); hold("KeyA", mx < -.38); hold("KeyD", mx > .38);
  hold("TouchFire", fire);
  input.touchStick.x = aim ? aim.x : 0; input.touchStick.y = aim ? aim.y : 0;
}

function ring(ctx, x, y, r, fill, stroke) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = stroke; ctx.stroke();
}
export function drawTouch(ctx, game) {
  if (!touch.on) return;
  const down = new Set([...pts.values()].map(p => p.code));
  for (const b of buttons(game)) {
    if (b.hidden) continue;
    const on = down.has(b.code), fill = on ? "rgba(217,164,65,.45)" : "rgba(16,14,10,.5)", stroke = on ? GOLD : "rgba(230,217,174,.55)";
    if (b.r) ring(ctx, b.x, b.y, b.r, fill, stroke);
    else { ctx.fillStyle = fill; ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); ctx.lineWidth = 4; ctx.strokeStyle = stroke; ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); }
    if (b.arrow) {  // a d-pad triangle
      const [ax, ay] = b.arrow, s = 26;
      ctx.beginPath(); ctx.moveTo(b.x + ax * s, b.y + ay * s);
      ctx.lineTo(b.x - ax * s * .6 - ay * s * .8, b.y - ay * s * .6 - ax * s * .8); ctx.lineTo(b.x - ax * s * .6 + ay * s * .8, b.y - ay * s * .6 + ax * s * .8);
      ctx.fillStyle = PARCH; ctx.fill();
    } else textC(ctx, b.label, b.x, b.y - 8, PARCH, b.r && b.r < 70 ? 3 : 4);
  }
  if (game.state !== "play") return;
  // the sticks: where each thumb landed, and how far it has pushed
  let moving = false, aiming = false;
  for (const p of pts.values()) {
    if (p.role !== "move" && p.role !== "aim") continue;
    if (p.role === "move") moving = true; else aiming = true;
    const dx = p.x - p.ox, dy = p.y - p.oy, d = Math.hypot(dx, dy), k = d > STICK_R ? STICK_R / d : 1;
    ring(ctx, p.ox, p.oy, STICK_R, "rgba(16,14,10,.35)", "rgba(230,217,174,.4)");
    ring(ctx, p.ox + dx * k, p.oy + dy * k, 46, "rgba(230,217,174,.35)", "rgba(230,217,174,.7)");
  }
  // resting hints show where each thumb goes
  if (!moving) { ring(ctx, 240, 850, STICK_R, "rgba(16,14,10,.25)", "rgba(230,217,174,.25)"); textC(ctx, "MOVE", 240, 838, "rgba(230,217,174,.6)", 3); }
  if (!aiming) {
    ring(ctx, 1720, 830, 96, "rgba(16,14,10,.25)", "rgba(230,217,174,.25)");
    textC(ctx, "ATTACK", 1720, 812, "rgba(230,217,174,.6)", 3); textC(ctx, "DRAG TO AIM", 1720, 846, "rgba(230,217,174,.45)", 2);
  }
}
