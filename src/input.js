// Keyboard, mouse and gamepad. Gamepads show up as virtual codes like "Pad0Up" and "Pad1A".
import {OUT_W, OUT_H} from "./art.js";
const down = new Set(), pressed = new Set();

// mouse position in game-canvas pixels (the canvas is letterboxed, so undo that scaling)
export const mouse = {x: OUT_W / 2, y: OUT_H / 2, down: false, right: false, active: false};
export function bindMouse(el) {
  const pos = e => {
    const r = el.getBoundingClientRect(), s = Math.min(r.width / OUT_W, r.height / OUT_H);
    mouse.x = (e.clientX - r.left - (r.width - OUT_W * s) / 2) / s;
    mouse.y = (e.clientY - r.top - (r.height - OUT_H * s) / 2) / s;
    mouse.active = true;
  };
  // touches are handled by touch.js; only a real mouse or pen aims and clicks here
  el.addEventListener("pointermove", e => { if (e.pointerType !== "touch") pos(e); });
  el.addEventListener("pointerdown", e => {
    if (e.pointerType === "touch") return;
    pos(e);
    if (e.button === 0) { mouse.down = true; pressed.add("MouseLeft"); }
    if (e.button === 2) { pressed.add("MouseRight"); mouse.right = true; }
  });
  addEventListener("pointerup", e => { if (e.pointerType === "touch") return; if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.right = false; });
  el.addEventListener("contextmenu", e => e.preventDefault());
  el.addEventListener("wheel", e => { pressed.add(e.deltaY > 0 ? "WheelDown" : "WheelUp"); e.preventDefault(); }, {passive: false});
}
const stick = [{x: 0, y: 0}, {x: 0, y: 0}];
// the on-screen touch aim stick (touch.js), which stands in for player one's right stick
export const touchStick = {x: 0, y: 0};
// right stick direction for a pad, or null when it's resting
export const aimStick = i => i === 0 && Math.hypot(touchStick.x, touchStick.y) > .35 ? touchStick
  : Math.hypot(stick[i].x, stick[i].y) > .35 ? stick[i] : null;
// touch controls press and hold ordinary key codes, so every screen reads them like the keyboard
export function press(code) { pressed.add(code); down.add(code); }
export const release = code => down.delete(code);
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "Escape",
  "ShiftLeft", "ShiftRight", "ControlRight", "Quote", "Tab"]);

addEventListener("keydown", e => {
  if (!e.repeat) pressed.add(e.code);
  down.add(e.code);
  if (GAME_KEYS.has(e.code)) e.preventDefault();
});
addEventListener("keyup", e => down.delete(e.code));
addEventListener("blur", () => down.clear());

export function poll() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < 2; i++) {
    const p = pads[i], st = {};
    if (p) {
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0, b = n => !!(p.buttons[n] && p.buttons[n].pressed);
      st.Up = ay < -.4 || b(12); st.Down = ay > .4 || b(13); st.Left = ax < -.4 || b(14); st.Right = ax > .4 || b(15);
      st.A = b(0); st.B = b(1); st.Start = b(9);
      st.Fire = b(7) || b(5); st.Roll = b(4); st.LT = b(6); st.X = b(2); st.Y = b(3); st.Back = b(8);
      stick[i].x = p.axes[2] || 0; stick[i].y = p.axes[3] || 0;
    } else { stick[i].x = stick[i].y = 0; }
    for (const k of ["Up", "Down", "Left", "Right", "A", "B", "Start", "Fire", "Roll", "LT", "X", "Y", "Back"]) {
      const code = "Pad" + i + k;
      if (st[k]) { if (!down.has(code)) pressed.add(code); down.add(code); } else down.delete(code);
    }
  }
}
export function endFrame() { pressed.clear(); }

const any = (set, codes) => codes.some(c => set.has(c));
const MOVE = [
  {up: ["KeyW", "Pad0Up"], down: ["KeyS", "Pad0Down"], left: ["KeyA", "Pad0Left"], right: ["KeyD", "Pad0Right"]},
  {up: ["ArrowUp", "Pad1Up"], down: ["ArrowDown", "Pad1Down"], left: ["ArrowLeft", "Pad1Left"], right: ["ArrowRight", "Pad1Right"]},
];
// In solo play the arrow keys and second pad also drive player one.
export function dir(player, solo) {
  const sets = solo ? [MOVE[0], MOVE[1]] : [MOVE[player]];
  const on = k => sets.some(s => any(down, s[k])) ? 1 : 0;
  return {x: on("right") - on("left"), y: on("down") - on("up")};
}
const ACTIONS = {
  confirm: ["Enter", "Space", "Pad0A", "Pad1A", "Pad0Start", "Pad1Start"],
  back: ["KeyQ", "Backspace", "Pad0B", "Pad1B"],
  pause: ["Escape", "KeyP", "Pad0Start", "Pad1Start"],
  up: ["KeyW", "ArrowUp", "Pad0Up", "Pad1Up"],
  down: ["KeyS", "ArrowDown", "Pad0Down", "Pad1Down"],
  fullscreen: ["KeyF"],
  fps: ["Backquote"],
  mute: ["KeyM"],
};
export const hit = name => any(pressed, ACTIONS[name]);

// combat: player one rolls with space, right click, shift or LB/LT and fires with the mouse, right stick
// or RT; player two (arrows) rolls with right shift or the pad and fires with right ctrl, enter or the pad
const ROLL = [["Space", "MouseRight", "ShiftLeft", "Pad0Roll", "Pad0LT"], ["ShiftRight", "Pad1Roll", "Pad1LT"]];
// a Templar blocks with right click, C or LT (P2: ' or LT), so those don't roll for them
const BLOCK = [["KeyC", "Pad0LT"], ["Quote", "Pad1LT"]], BLOCK_KEYS = new Set(["MouseRight", "Pad0LT", "Pad1LT"]);
const FIRE = [["Pad0Fire", "TouchFire"], ["ControlRight", "Enter", "NumpadEnter", "Pad1Fire"]];
export function rollHit(player, solo, blocker) {
  const keys = k => blocker ? k.filter(c => !BLOCK_KEYS.has(c)) : k;
  return any(pressed, keys(ROLL[player])) || (solo && any(pressed, keys(ROLL[1])));
}
export const blockHeld = (player, solo) => (player === 0 && mouse.right) || any(down, BLOCK[player]) || (solo && any(down, BLOCK[1]));
// raw key presses, for screens that read each player's keys directly
export const keyHit = (...codes) => any(pressed, codes);
export const fireHeld = (player, solo) => (player === 0 && mouse.down) || any(down, FIRE[player]) || !!aimStick(player)
  || (solo && (any(down, FIRE[1]) || !!aimStick(1)));

export function rumble(player, strength = .6, ms = 200) {
  const p = navigator.getGamepads ? navigator.getGamepads()[player] : null;
  p?.vibrationActuator?.playEffect?.("dual-rumble", {duration: ms, strongMagnitude: strength, weakMagnitude: strength * .6}).catch?.(() => {});
}

// items: P1 uses slots 1-6 directly, E uses the selected one, R or the wheel picks the next; pads use Y and X.
// P2 on the keyboard uses / and picks with the full stop.
// the lantern flare: P1 Q or pad B, P2 backslash or pad B
const FLARE = [["KeyQ", "Pad0B", "TouchFlare"], ["Backslash", "Pad1B"]];
export const flareHit = (player, solo) => any(pressed, FLARE[player]) || (solo && any(pressed, FLARE[1]));
const USE = [["KeyE", "Pad0Y"], ["Slash", "Pad1Y"]], NEXT = [["KeyR", "WheelDown", "Pad0X"], ["Period", "Pad1X"]];
export const useHit = (player, solo) => any(pressed, USE[player]) || (solo && any(pressed, USE[1]));
export const nextHit = (player, solo) => any(pressed, NEXT[player]) || (solo && any(pressed, NEXT[1])) ? 1
  : player === 0 && pressed.has("WheelUp") ? -1 : 0;
export const slotHit = player => player ? -1 : [1, 2, 3, 4, 5, 6].findIndex(n => pressed.has("Digit" + n));
