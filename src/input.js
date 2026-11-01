// held — удерживается, pressedNow — нажата до следующего шага логики.
const held = new Set();
let pressedNow = new Set();
const initializedTargets = new WeakSet();

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Enter', 'Escape',
]);

export function clearInput() {
  held.clear();
  pressedNow.clear();
}

function isInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, button, summary, a[href], dialog[open], [contenteditable]:not([contenteditable="false"])',
  ));
}

export function initInput(target = window) {
  if (initializedTargets.has(target)) return;
  initializedTargets.add(target);

  target.addEventListener('keydown', (e) => {
    if (!GAME_KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey ||
        e.isComposing || isInteractiveTarget(e.target)) return;
    e.preventDefault();
    // Автоповтор не должен переключать паузу или возвращать очищенную при blur клавишу.
    if (e.repeat) return;
    if (!held.has(e.code)) pressedNow.add(e.code);
    held.add(e.code);
  });
  target.addEventListener('keyup', (e) => {
    held.delete(e.code);
    if (GAME_KEYS.has(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey &&
        !isInteractiveTarget(e.target)) e.preventDefault();
  });
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInput();
  });
  // Не переносить удерживаемые игровые клавиши в форму или ссылку.
  document.addEventListener('focusin', (e) => {
    if (isInteractiveTarget(e.target)) clearInput();
  });
}

export const isDown = (...codes) => codes.some((c) => held.has(c));
export const wasPressed = (...codes) => codes.some((c) => pressedNow.has(c));
export const endFrame = () => { pressedNow = new Set(); };

/** Вектор движения из WASD/стрелок, независимо от раскладки клавиатуры. */
export function moveAxis() {
  const x = (isDown('KeyD', 'ArrowRight') ? 1 : 0) - (isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  const y = (isDown('KeyS', 'ArrowDown') ? 1 : 0) - (isDown('KeyW', 'ArrowUp') ? 1 : 0);
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}
