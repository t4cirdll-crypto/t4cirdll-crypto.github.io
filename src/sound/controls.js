const labels = { master: 'Общая громкость', ambience: 'Атмосфера', effects: 'Эффекты' };

/** One shared panel moves between menu and pause; no new overlays during play. */
export function createSoundControls(audio, game) {
  const panel = document.createElement('section');
  panel.className = 'sound-panel'; panel.setAttribute('aria-label', 'Настройки звука');
  panel.innerHTML = `<div class="sound-heading"><span>ЗВУК КОМНАТЫ</span><button type="button" id="sound-toggle" aria-label="Выключить звук" aria-pressed="false">Включён</button></div>
    <details id="sound-options"><summary>Громкость и проверка</summary><div class="sound-sliders">${Object.entries(labels).map(([key, label]) => `<label for="sound-${key}"><span>${label}</span><output id="sound-${key}-value"></output><input id="sound-${key}" type="range" min="0" max="100" step="1" data-level="${key}" aria-label="${label}"></label>`).join('')}</div>
    <button type="button" class="sound-test" id="sound-test">Проверить звук</button></details>
    <p class="sound-status" id="sound-status" role="status">Звук включится после старта. M — выключить.</p>`;
  const toggle = panel.querySelector('#sound-toggle'), status = panel.querySelector('#sound-status');
  const sliders = [...panel.querySelectorAll('input')];
  toggle.addEventListener('click', () => { audio.setSettings({ muted: !audio.settings.muted }); audio.unlock(); sync(); });
  for (const input of sliders) input.addEventListener('input', () => {
    audio.setSettings({ [input.dataset.level]: Number(input.value) / 100 }); audio.unlock(); sync();
  });
  panel.querySelector('#sound-test').addEventListener('click', () => { void audio.preview(); });
  const interactive = e => e.target instanceof Element && e.target.closest('input, textarea, select, button, a[href], [contenteditable]');
  function shortcut(e) {
    if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || interactive(e)) return;
    e.preventDefault(); audio.setSettings({ muted: !audio.settings.muted }); audio.unlock(); sync();
  }
  window.addEventListener('keydown', shortcut);
  let state;
  function sync() {
    if (game.state !== state) {
      state = game.state;
      const shown = state === 'menu' || state === 'pause';
      panel.hidden = !shown;
      if (shown) {
        const slot = document.getElementById(state === 'menu' ? 'sound-menu' : 'sound-pause');
        slot.append(panel);
      }
    }
    const supported = audio.status !== 'unsupported' && audio.status !== 'failed';
    toggle.disabled = !supported;
    toggle.textContent = audio.settings.muted ? 'Выключен' : 'Включён';
    toggle.setAttribute('aria-label', audio.settings.muted ? 'Включить звук' : 'Выключить звук');
    toggle.setAttribute('aria-pressed', String(audio.settings.muted));
    for (const input of sliders) {
      const percent = Math.round(audio.settings[input.dataset.level] * 100);
      if (input.value !== String(percent)) input.value = String(percent);
      panel.querySelector(`#${input.id}-value`).value = `${percent}%`;
      input.disabled = !supported;
    }
    panel.querySelector('#sound-test').disabled = !supported;
    const messages = {
      unsupported: 'Web Audio недоступен. Игра работает без звука.',
      failed: 'Не удалось открыть аудиоустройство. Игра работает без звука.',
      locked: 'Звук включится после старта. M — выключить.',
      blocked: 'Браузер приостановил звук. Нажми «Проверить звук».',
      paused: 'На паузе тихо. M — включить / выключить.',
      ready: 'Стереозвук. M — включить / выключить.',
    };
    const text = !supported ? messages[audio.status] : audio.settings.muted ? 'Звук выключен. M — включить.'
      : audio.settings.master === 0 ? 'Общая громкость 0%. Подними её, чтобы услышать звук.'
      : audio.settings.effects === 0 && audio.settings.ambience === 0 ? 'Атмосфера и эффекты на нуле.'
      : audio.status === 'paused' && game.state === 'menu' ? 'Комната пока молчит. Начни ночь или проверь звук.' : messages[audio.status];
    if (status.textContent !== text) status.textContent = text;
  }
  return { sync, dispose() { panel.remove(); window.removeEventListener('keydown', shortcut); } };
}
