import { NIGHTS, durationLabel, nightFor } from './progression/nights.js';
import { UPGRADES, rankOf } from './progression/upgrades.js';

const $ = id => document.getElementById(id);

/** DOM screens consume the model; only four meters remain during play. */
export function createUI(game, canvas) {
  const intro = $('intro'), result = $('result'), controls = $('game-controls');
  const journal = $('campaign-menu'), hud = $('hud'), status = $('screen-status');
  const meters = { night: $('meter-night'), sleep: $('meter-sleep'), silk: $('meter-silk'), suspicion: $('meter-suspicion') };
  let lastKey;
  function focusScene() { canvas.focus({ preventScroll: true }); }
  const fullscreenButton = $('fullscreen-game');
  fullscreenButton.hidden = !document.documentElement.requestFullscreen;
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      focusScene();
    } catch {
      $('fullscreen-status').textContent = 'Браузер не разрешил полноэкранный режим. Игра уже занимает всю область окна.';
      fullscreenButton.textContent = 'Браузер не разрешил полный экран';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.innerHTML = document.fullscreenElement ? 'Выйти из полного экрана <span aria-hidden="true">↙</span>' : 'Во весь экран <span aria-hidden="true">↗</span>';
  });
  $('start-game').addEventListener('click', () => { game.start(); focusScene(); sync(); });
  $('result-action').addEventListener('click', () => {
    if (game.state === 'pause') game.state = 'play';
    else game.advance();
    if (game.state === 'bonus') $('minigame-canvas').focus({ preventScroll: true }); else focusScene();
    sync();
  });
  $('skip-bonus').addEventListener('click', () => {
    if (game.skipBonus()) { sync(); $('result-action').focus(); }
  });
  const nickInput = $('nick-input');
  nickInput.value = game.profile.nick;
  $('nick-form').addEventListener('submit', event => {
    event.preventDefault();
    game.setNick(nickInput.value);
    nickInput.value = game.profile.nick;
    lastKey = null; sync();
    $('nick-status').textContent = game.admin.enabled ? 'killdev: админ-меню открывается кнопкой или F2. Кампания в безопасной песочнице.'
      : game.difficulty > 1 ? `${game.profile.display}: сложность ×3. Втрое больше врагов, укусы сильнее.`
      : `Ник сохранён: ${game.profile.display}.`;
  });
  $('return-menu').addEventListener('click', () => {
    if (game.toMenu()) { sync(); $('start-game').focus(); }
  });
  $('endless-game').addEventListener('click', () => {
    if (game.selectNight('endless', game.campaign.data.endlessCleared)) sync();
  });

  function meter(el, value, label) {
    const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
    el.style.setProperty('--value', `${percent}%`);
    el.setAttribute('aria-valuenow', String(percent));
    el.querySelector('output').textContent = label || `${percent}%`;
  }

  function buildText() {
    return UPGRADES.filter(u => rankOf(game.campaign.data.upgrades, u.id))
      .map(u => `${u.name} ${rankOf(game.campaign.data.upgrades, u.id) === 2 ? 'II' : 'I'}`).join(' · ');
  }
  function saveText() {
    if (game.admin.enabled) return 'Админ-песочница: тестовый прогресс и рекорды не сохраняются. Настоящая кампания не изменяется.';
    return game.campaign.persistent
      ? 'Автосохранение между ночами · этот браузер и адрес. Текущая ночь при выходе начнётся заново.'
      : 'Хранилище недоступно: прогресс живёт до закрытия страницы. Скачай сохранение через журнал ночей.';
  }

  function renderJournal() {
    const data = game.campaign.data, route = game.campaign.route;
    $('campaign-count').textContent = `${data.cleared} / ${NIGHTS.length}`;
    $('night-list').replaceChildren(...NIGHTS.map((night, i) => {
      const button = document.createElement('button');
      const locked = i > data.cleared, cleared = i < data.cleared;
      button.type = 'button'; button.className = 'night-choice';
      button.disabled = locked;
      button.setAttribute('aria-pressed', String(route.mode === 'campaign' && route.index === i));
      button.setAttribute('aria-label', `Ночь ${i + 1}. ${night.title}${locked ? '. Закрыта' : ''}`);
      const number = document.createElement('span'); number.className = 'night-number'; number.textContent = cleared ? '✓' : String(i + 1).padStart(2, '0');
      const title = document.createElement('span'); title.textContent = night.title;
      const meta = document.createElement('small');
      meta.textContent = locked ? 'ЗАКРЫТА' : cleared ? `${data.records[i]?.eaten || 0} ПОЙМАНО` : durationLabel(night.duration);
      button.append(number, title, meta);
      button.addEventListener('click', () => {
        if (game.selectNight('campaign', i)) { sync(); $('night-list').children[i]?.focus(); }
      });
      return button;
    }));
    $('endless-game').hidden = !game.campaign.complete;
    $('endless-game').setAttribute('aria-pressed', String(route.mode === 'endless'));
    $('endless-game').innerHTML = `За гранью рассвета <span>∞ · ${data.endlessCleared + 1}</span>`;
    const n = game.night;
    $('night-meta').textContent = `${n.mode === 'endless' ? 'БЕСКОНЕЧНЫЙ ДОЗОР' : `НОЧЬ ${n.number} / 6`} · ${durationLabel(n.duration)}`;
    $('night-title').textContent = n.title;
    $('night-brief').textContent = n.brief;
    $('night-condition').textContent = n.condition;
    $('build-summary').textContent = buildText() ? `ТВОИ СПОСОБНОСТИ · ${buildText()}` : 'Каждый новый рассвет даёт одно из трёх улучшений. Выбор остаётся с тобой.';
    $('save-note').textContent = saveText();
    const champion = game.difficulty > 1;
    document.body.classList.toggle('is-x3', champion);
    if (document.activeElement !== nickInput) nickInput.value = game.profile.nick;
    if (!$('nick-status').textContent || champion || game.admin.enabled) $('nick-status').textContent = game.admin.enabled
      ? 'killdev: админ-меню · F2. Тестовый прогресс не сохраняется.'
      : champion ? 'Режим Sharrowkin: сложность ×3.' : 'Ник попадёт в зал славы после рассвета.';
    const legends = game.profile.top(5);
    $('legends-list').replaceChildren(...(legends.length ? legends : [null]).map(l => {
      const li = document.createElement('li');
      if (!l) { li.className = 'empty'; li.textContent = 'Пока пусто. Встреть первый рассвет.'; return li; }
      const name = document.createElement('span'); name.textContent = l.nick || 'Безымянный сторож';
      if (l.x3) { const b = document.createElement('b'); b.textContent = '×3'; name.append(' ', b); }
      const meta = document.createElement('small');
      meta.textContent = `${l.deepest > 6 ? `∞ ${l.deepest - 6}` : `ночь ${l.deepest}`} · ${l.eaten} поймано`;
      li.append(name, meta); return li;
    }));
    $('start-game').innerHTML = data.cleared ? 'Начать выбранную ночь <span>Enter ↵</span>' : 'Начать ночь <span>Enter ↵</span>';
  }

  function renderResult() {
    const pause = game.state === 'pause', win = game.state === 'win';
    const completed = win && game.roundRoute.mode === 'campaign' && game.roundRoute.index === 5;
    const n = game.night, next = nightFor(game.campaign.route);
    $('result-eyebrow').textContent = pause ? `НОЧЬ ${n.number} · ${n.title.toUpperCase()}`
      : completed ? 'ШЕСТЬ НОЧЕЙ. ШЕСТЬ РАССВЕТОВ.' : win ? 'МАЛЕНЬКАЯ БОЛЬШАЯ ПОБЕДА' : 'ДОЗОР НЕ ЗАКОНЧЕН';
    $('result-title').textContent = pause ? 'Тише. Пауза.' : completed ? 'Ты стал хранителем.' : win ? 'Доброе утро.' : 'Ещё одну ночь?';
    const retryTip = {
      hunter: 'Плети выше янтарного контура у кровати. В погоне отпусти Space и отбеги: ты быстрее.',
      swat: 'Шорох и движение головы предупреждают о взгляде. Зажми Shift до закрытия глаз.',
      sleep: 'Сделай ловушки на пути от окна к лицу, кисти и ступне. Подбирай застрявшую добычу — она даёт шёлк.',
    }[game.loseCause] || 'Меняй маршрут и плети с поворотами — так сеть дольше держится.';
    $('result-copy').textContent = pause
      ? `${game.clock} · ${game.phase.title}. ${n.condition}. Комната подождёт.`
      : win ? `06:00. Человек выспался. Поймано насекомых: ${game.eaten}. Сон: ${Math.round(game.human.sleep)}%. ${completed ? 'Кампания пройдена. Открыт бесконечный дозор — знакомые условия с растущим натиском.' : `Рекорд: ${game.best}.`}`
      : `${game.loseReason} Ты продержался до ${game.clock}. ${retryTip} Открытые ночи и улучшения не пропадут.`;
    const bonusReady = win && !game.needsUpgrade && game.bonusPending;
    const bonus = $('bonus-summary'), br = game.bonusResult;
    bonus.hidden = !(win && br);
    if (win && br) bonus.textContent = `УТРЕННЯЯ РОСА · +${br.reward} шёлка сверх запаса на следующую ночь\nПоймано: ${br.caught} · лучшая серия: ${br.bestCombo}${br.hits ? ` · листьев: ${br.hits}` : ''}`;
    $('skip-bonus').hidden = !bonusReady;
    const outlook = $('night-outlook');
    outlook.hidden = !win;
    if (win) outlook.textContent = `СЛЕДУЮЩИЙ ДОЗОР · ${next.title} · ${durationLabel(next.duration)}\n${next.condition}\n${next.brief}`;
    $('upgrade-panel').hidden = !win || !game.needsUpgrade;
    $('upgrade-options').replaceChildren(...(win ? game.campaign.offers : []).map(u => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'upgrade-choice'; button.dataset.upgrade = u.id;
      const icon = document.createElement('span'); icon.className = 'upgrade-icon'; icon.textContent = u.icon;
      const title = document.createElement('strong'); title.textContent = `${u.name} ${rankOf(game.campaign.data.upgrades, u.id) ? 'II' : 'I'}`;
      const copy = document.createElement('small'); copy.textContent = u.description;
      button.append(icon, title, copy);
      button.addEventListener('click', () => {
        if (game.chooseUpgrade(u.id)) { sync(); if (!game.needsUpgrade) $('result-action').focus(); }
      });
      return button;
    }));
    const action = $('result-action');
    action.hidden = win && game.needsUpgrade;
    action.innerHTML = pause ? 'Продолжить <span>P</span>' : !win ? 'Попробовать снова <span>Enter</span>'
      : bonusReady ? 'Мини-игра: утренняя роса <span>Enter</span>'
      : next.mode === 'endless' ? 'В бесконечный дозор <span>Enter</span>' : `Начать ночь ${next.number} <span>Enter</span>`;
    $('return-menu').hidden = win && game.needsUpgrade;
    $('leave-note').hidden = !pause;
    $('result-save').textContent = `${win && !game.needsUpgrade && buildText() ? `Способности: ${buildText()}. ` : ''}${saveText()}`;
    status.textContent = `${$('result-title').textContent} ${$('result-copy').textContent}${game.needsUpgrade ? ' Выбери улучшение.' : ''}`;
  }

  function sync() {
    document.body.dataset.state = game.state;
    meter(meters.night, game.progress, game.clock);
    meter(meters.sleep, game.human.sleep / game.rules.human.sleepMax);
    meter(meters.silk, game.spider.silk / game.rules.spider.silkMax);
    meter(meters.suspicion, game.human.suspicion / 100);
    meters.sleep.classList.toggle('is-critical', game.human.sleep < 30);
    meters.silk.classList.toggle('is-critical', game.spider.silk < game.rules.spider.silkMax * 0.2);
    meters.suspicion.classList.toggle('is-critical', game.human.suspicion > 65);
    if (game.state === 'bonus' && game.bonus) {
      $('minigame-score').textContent = String(game.bonus.score);
      $('minigame-combo').textContent = game.bonus.combo >= 5 ? `серия ×${game.bonus.combo}` : '';
    }
    const key = `${game.state}:${game.campaign.revision}:${game.campaign.persistent}:${game.roundRoute.mode}:${game.roundRoute.index}:${game.profile.revision}:${game.bonusPending}`;
    if (key === lastKey) return;
    lastKey = key;
    const menu = game.state === 'menu', bonusRound = game.state === 'bonus';
    intro.hidden = !menu; journal.hidden = !menu; controls.hidden = !menu;
    hud.hidden = menu || bonusRound; result.hidden = menu || bonusRound || game.state === 'play';
    $('minigame').hidden = !bonusRound;
    $('night-label').innerHTML = `${game.night.mode === 'endless' ? '∞' : 'НОЧЬ'} ${game.night.number}${game.difficulty > 1 ? ' <b class="x3">×3</b>' : ''}<small>ДО 06:00</small>`;
    canvas.setAttribute('aria-describedby', menu ? 'game-controls' : 'screen-status');
    if (!menu) document.querySelector('.game-shell').scrollTop = 0;
    if (menu) { renderJournal(); status.textContent = 'Выбери ночь в журнале. Управление показано перед стартом.'; }
    else if (game.state === 'play') status.textContent = `Начался дозор: ${game.night.title}. Береги сон человека.`;
    else if (bonusRound) status.textContent = 'Мини-игра «Утренняя роса»: лови капли и мух, избегай сухих листьев. 25 секунд.';
    else renderResult();
  }
  return { sync };
}
