import {OUT_W, OUT_H} from "./art.js";
import {initGL} from "./gl.js";
import {Game} from "./game.js";
import {renderWorld, prof, text} from "./render.js";
import * as input from "./input.js";
import {startAudio} from "./audio.js";
import {bindTouch, updateTouch, drawTouch} from "./touch.js";

const glCv = document.getElementById("gl"), ui = document.getElementById("ui"), ctx = ui.getContext("2d");
initGL(glCv);
for (const ev of ["keydown", "pointerdown", "gamepadconnected"]) addEventListener(ev, startAudio);
input.bindMouse(ui);
bindTouch(ui);
const game = new Game();
window.game = game;  // handy for debugging from the console

// one step of the game: update, draw the world, draw the UI on top
function step(dt, time) {
  input.poll();
  updateTouch(game);
  game.update(dt, time);
  const views = game.views = renderWorld(game, time);
  ctx.clearRect(0, 0, OUT_W, OUT_H);
  game.drawUI(ctx, views, time);
  drawTouch(ctx, game);
  if (game.showFps) text(ctx, Object.entries(prof).map(([k, v]) => `${k} ${v.toFixed(0)}`).join("  "), 16, OUT_H - 70, "#5d7aa0", 3);
  input.endFrame();
}

let last = performance.now(), t0 = last, fpsT = 0, fpsN = 0;
function frame(now) {
  const real = Math.max(0, (now - last) / 1000), dt = Math.min(.05, real), time = Math.max(0, (now - t0) / 1000);
  last = now;
  step(dt, time);
  fpsN++; fpsT += real;  // real time, so the counter is honest even when frames run long
  if (fpsT >= 1) { game.fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
if (new URLSearchParams(location.search).has("demo")) import("./demo.js").then(m => m.runDemo(game, step));
else requestAnimationFrame(frame);
