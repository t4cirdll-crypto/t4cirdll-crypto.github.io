import { initInput, endFrame } from './input.js';
import { Game } from './game.js';
import { createRenderer, render } from './render.js';
import { createUI } from './ui.js';
import { SoundSystem } from './sound/system.js';
import { createSoundControls } from './sound/controls.js';
import { createSaveControls } from './progression/storage-controls.js';
import { createDewView } from './minigame/view.js';
import { createAdminControls } from './admin/controls.js';

const canvas = document.getElementById('game');
const game = new Game();
window.__game = game;
initInput();
canvas.focus({ preventScroll: true });
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
const audio = new SoundSystem();
window.__audio = audio;
const ui = createUI(game, canvas);
const adminControls = createAdminControls(game, canvas, ui.sync);
createSaveControls(game, ui.sync);
const soundControls = createSoundControls(audio, game);
ui.sync();
soundControls.sync();
// Resume must happen inside an actual user gesture, before the next RAF.
const unlockAudio = () => { void audio.unlock(); };
document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('keydown', event => {
  if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) unlockAudio();
});
window.addEventListener('pagehide', () => audio.setActive(false));

let view;
try {
  view = createRenderer(canvas);
} catch (error) {
  console.error('Не удалось инициализировать WebGL-сцену:', error);
  document.getElementById('render-error').hidden = false;
  document.getElementById('start-game').disabled = true;
}

// Fixed-step simulation is independent from viewport size, display density or FPS.
const STEP = 1 / 60;
let acc = 0, last = performance.now();
let windowActive = document.hasFocus() && !document.hidden;
let contextLost = false;
function resetClock() { acc = 0; last = performance.now(); }
function suspend() {
  audio.setActive(false);
  windowActive = false;
  resetClock();
  if (game.state === 'play') game.state = 'pause';
  game.spider.vx = 0;
  game.spider.vy = 0;
  game.spider.spinning = false;
  game.spider.frozen = false;
  game.spider.anchor = null;
  game.spider.lastThread = null;
  game.spider.recentThreads = [];
  game.spider.stitchTravel = 0;
  ui.sync();
}
function restoreFocus() {
  windowActive = document.hasFocus() && !document.hidden;
  resetClock();
  // Restoring focus never resumes the night automatically.
}
window.addEventListener('blur', suspend);
window.addEventListener('focus', restoreFocus);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend();
  else restoreFocus();
});
canvas.addEventListener('click', () => {
  if (game.state === 'menu' || game.state === 'win' || game.state === 'lose') {
    game.advance();
    ui.sync();
  }
});
const dewView = createDewView(document.getElementById('minigame-canvas'));
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  contextLost = true;
  suspend();
  const panel = document.getElementById('render-error');
  panel.querySelector('p').textContent = 'Графический контекст потерян. Ночь на паузе. Ожидаем восстановления браузером.';
  panel.hidden = false;
});
canvas.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  document.getElementById('render-error').hidden = true;
  restoreFocus();
});

function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  if (windowActive && !document.hidden && !contextLost) {
    acc += dt;
    while (acc >= STEP) {
      game.update(STEP);
      endFrame();
      acc -= STEP;
    }
  } else {
    acc = 0;
    endFrame();
  }
  audio.update(game, game.takeSoundEvents(), windowActive && !document.hidden && !contextLost);
  if (view && !contextLost) render(view, game);
  if (game.state === 'bonus') dewView.draw(game);
  ui.sync();
  soundControls.sync();
  adminControls.sync();
  requestAnimationFrame(frame);
}
if (view) requestAnimationFrame(frame);
