import { clearInput } from '../input.js';

/** Native modal traps focus; opening from play pauses rather than resets the night. */
export function createAdminControls(game, canvas, syncUI) {
  const dialog = document.getElementById('admin-menu');
  const launchers = [...document.querySelectorAll('[data-open-admin]')];
  const status = document.getElementById('admin-status');
  const summary = document.getElementById('admin-summary');
  const commands = dialog.querySelector('fieldset');
  const switches = [...dialog.querySelectorAll('[data-admin-toggle]')];
  let opener = null;
  let lastKey = '';

  function stopInput() {
    clearInput();
    const s = game.spider;
    s.vx = s.vy = 0; s.spinning = s.frozen = false;
    s.anchor = s.lastThread = null; s.recentThreads = []; s.stitchTravel = 0;
  }

  function close() {
    if (!dialog.open) return;
    game.admin.open = false;
    dialog.close();
    stopInput(); syncUI(); sync();
    if (['play', 'pause'].includes(game.state)) canvas.focus({ preventScroll: true });
    else if (opener && !opener.hidden && opener.getClientRects().length) opener.focus({ preventScroll: true });
    else canvas.focus({ preventScroll: true });
  }

  function open() {
    if (!game.admin.enabled || game.state === 'bonus' || dialog.open) return;
    opener = document.activeElement;
    if (game.state === 'play') game.state = 'pause';
    stopInput();
    game.admin.open = true;
    status.textContent = 'Изменения действуют только в этой сессии. Закрой меню и нажми P, чтобы продолжить ночь.';
    syncUI(); sync();
    dialog.showModal();
    document.getElementById('admin-close').focus({ preventScroll: true });
  }

  for (const button of launchers) button.addEventListener('click', open);
  document.getElementById('admin-close').addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => { game.admin.open = false; clearInput(); });
  window.addEventListener('keydown', event => {
    if (event.code !== 'F2' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || !game.admin.enabled) return;
    const editing = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]');
    if (editing && !dialog.open) return;
    event.preventDefault();
    if (dialog.open) close(); else open();
  });
  for (const input of switches) input.addEventListener('change', () => {
    const accepted = game.admin.run(input.dataset.adminToggle, input.checked);
    status.textContent = accepted ? `${input.getAttribute('aria-label')}: ${input.checked ? 'включено' : 'выключено'}.` : 'Доступ закрыт.';
    sync(); syncUI();
  });
  const messages = {
    refill: 'Сон и шёлк восстановлены, подозрение сброшено.',
    clear: 'Насекомые убраны. Охотник и богомол вернулись в исходное состояние.',
    wave: 'Часы переведены к выбранной волне. Враги появятся после продолжения.',
    dawn: 'Рассвет в тестовой сессии. Дальше доступны улучшение и мини-игра.',
    restart: 'Эта ночь начата заново и стоит на паузе.',
  };
  for (const button of dialog.querySelectorAll('[data-admin-action]')) button.addEventListener('click', () => {
    const action = button.dataset.adminAction;
    const value = button.dataset.wave === undefined ? undefined : Number(button.dataset.wave);
    status.textContent = game.admin.run(action, value) ? messages[action] : 'Команда доступна только во время ночи или на паузе.';
    syncUI(); sync();
  });

  function sync() {
    const allowed = game.admin.enabled;
    const key = `${allowed}:${game.state}`;
    if (key !== lastKey) {
      lastKey = key;
      for (const button of launchers) button.hidden = !allowed || game.state === 'bonus';
      if (!allowed && dialog.open) close();
    }
    for (const input of switches) input.checked = allowed && game.admin[input.dataset.adminToggle];
    commands.disabled = !allowed || !['play', 'pause'].includes(game.state);
    const text = `killdev · ${game.night.title} · ${game.clock} · волна ${game.wave} · врагов ${game.mosquitoes.length}`;
    if (summary.textContent !== text) summary.textContent = text;
  }
  sync();
  return { sync };
}
