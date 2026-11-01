import { CFG } from '../config.js';

// Authored nights, not six copies of a longer countdown. Durations total 25 minutes.
export const NIGHTS = Object.freeze([
  { id: 'first', title: 'Первый дозор', duration: 210, weather: 'clear', sky: '#46425c',
    brief: 'Освой комнату. Строй сеть на пути от окна, собирай добычу и пережидай взгляды.',
    condition: 'Обычные комары · спокойная погода', spawn: 1.1, speed: 0.94, glance: 1.1, life: 1, wind: 0 },
  { id: 'draft', title: 'Открытая форточка', duration: 225, weather: 'wind', sky: '#485c65',
    brief: 'Сквозняк меняет траектории. Не надейся на одну ловушку: перекрывай несколько высот.',
    condition: 'Сквозняк · быстрые комары', spawn: 1.04, speed: 1, glance: 1, life: 1, wind: 24 },
  { id: 'restless', title: 'Чуткий сон', duration: 240, weather: 'rain', sky: '#434c62',
    brief: 'Человек смотрит чаще. Тяжёлые комары медленнее, но больнее кусают — собирай их первыми.',
    condition: 'Дождь · частые взгляды · тяжёлые комары', spawn: 1, speed: 1, glance: 0.83, life: 1, wind: 7 },
  { id: 'swarm', title: 'Сезон охоты', duration: 255, weather: 'wind', sky: '#65505e',
    brief: 'Наплывы идут парами. Богомол активнее: меняй геометрию сети, а не строй прямую стену.',
    condition: 'Парные наплывы · проворный богомол', spawn: 0.92, speed: 1.03, glance: 0.96, life: 1, wind: 18 },
  { id: 'dry', title: 'Хрупкий шёлк', duration: 270, weather: 'dry', sky: '#69515c',
    brief: 'Сухой воздух быстрее старит паутину. Возвращайся к старым узлам и обновляй защиту.',
    condition: 'Нити живут на 22% меньше · смешанные стаи', spawn: 0.94, speed: 1.02, glance: 0.92, life: 0.78, wind: 0 },
  { id: 'storm', title: 'До последней звезды', duration: 300, weather: 'storm', sky: '#3e455c',
    brief: 'Последний дозор: дождь, сквозняк и все виды комаров. Передышки короткие, но они есть.',
    condition: 'Ливень · сквозняк · все угрозы', spawn: 0.86, speed: 1.06, glance: 0.9, life: 0.9, wind: 27 },
]);

export const PHASES = Object.freeze([
  { from: 0, id: 'settle', title: 'Тихий час', interval: 1.35, pressure: 0.08, group: 1 },
  { from: 0.12, id: 'tide', title: 'Первый наплыв', interval: 0.85, pressure: 0.55, group: 1 },
  { from: 0.28, id: 'breath', title: 'Передышка', interval: 1.85, pressure: 0.12, group: 1 },
  { from: 0.4, id: 'rush', title: 'Вторая волна', interval: 0.76, pressure: 0.75, group: 2 },
  { from: 0.58, id: 'quiet', title: 'Затишье', interval: 2, pressure: 0.1, group: 1 },
  { from: 0.7, id: 'swarm', title: 'Рой у окна', interval: 0.7, pressure: 0.9, group: 2 },
  { from: 0.86, id: 'last', title: 'Перед рассветом', interval: 0.83, pressure: 0.65, group: 1 },
]);

// Late campaign nights have shorter rests and longer, denser hunting windows.
// Telegraphs and player/enemy speeds are not accelerated by the director.
export const HARD_PHASES = Object.freeze([
  { ...PHASES[0], interval: 1.2 },
  { ...PHASES[1], from: 0.08, interval: 0.8 },
  { ...PHASES[2], from: 0.26, interval: 1.7 },
  { ...PHASES[3], from: 0.33, interval: 0.65, pressure: 0.85 },
  { ...PHASES[4], from: 0.57, interval: 1.8 },
  { ...PHASES[5], from: 0.62, interval: 0.6, pressure: 1 },
  { ...PHASES[6], from: 0.87, interval: 0.72, pressure: 0.75 },
]);
export const isHardNight = night => night?.mode === 'endless' || night?.number >= 4;
export const phaseAt = (progress, night) => {
  const phases = isHardNight(night) ? HARD_PHASES : PHASES;
  return phases.findLast(p => progress >= p.from) || phases[0];
};

export function nightFor(route) {
  if (route.mode !== 'endless') return { ...NIGHTS[route.index], number: route.index + 1, mode: 'campaign' };
  const tier = route.index + 1;
  const template = NIGHTS[1 + (route.index % (NIGHTS.length - 1))];
  return { ...template, id: `endless-${tier}`, title: `За гранью · ${tier}`, duration: 300,
    number: tier, mode: 'endless', brief: 'Новый цикл, знакомая комната. Сложность растёт, но предупреждения остаются честными.',
    condition: `${template.condition} · натиск +${Math.round(Math.min(0.65, tier * 0.04) * 100)}%`,
    spawn: template.spawn / (1 + Math.min(0.65, tier * 0.04)),
    speed: Math.min(1.25, template.speed + tier * 0.012) };
}

// Order in which enemy kinds join the night. Every new wave adds one more kind.
export const ROSTER = Object.freeze(['common', 'swift', 'gnat', 'heavy', 'moth', 'wasp']);
export const ENEMY_NAMES = Object.freeze({ common: 'комары', swift: 'серебристые комары', gnat: 'стайки мошек',
  heavy: 'медные комары', moth: 'моль, рвущая нити', wasp: 'осы, пробивающие сеть' });

/** Number of high-pressure waves already started at this point of the night. */
export function waveAt(progress, night) {
  const phases = isHardNight(night) ? HARD_PHASES : PHASES;
  return phases.filter(p => p.pressure > 0.5 && progress >= p.from).length;
}

/** Kinds available now: later nights start with more, each wave adds one. */
export function rosterAt(progress, night) {
  const start = night.mode === 'endless' ? 3 : Math.min(3, night.number - 1);
  return ROSTER.slice(0, Math.min(ROSTER.length, 1 + start + waveAt(progress, night)));
}

/** Deterministic mix: a freshly unlocked kind appears first, then a weighted cycle. */
export function mosquitoKind(night, serial, progress = 1, introduced = null) {
  const roster = rosterAt(progress, night);
  if (introduced) {
    const fresh = roster.find(k => !introduced.has(k));
    if (fresh) { introduced.add(fresh); return fresh; }
  }
  const cycle = ['common', ...roster];
  return cycle[serial % cycle.length];
}

/** Nickname difficulty. ×3 triples spawn density and strengthens bites; telegraphs stay honest. */
export function applyDifficulty(rules, difficulty = 1) {
  if (!(difficulty > 1)) return rules;
  const m = rules.mosquito;
  m.spawnStart /= difficulty; m.spawnEnd /= difficulty;
  m.maxAlive = Math.min(CFG.mosquito.poolMax, Math.round(m.maxAlive * 1.7));
  m.baseSpeed *= 1.18; m.speedGain *= 1.18; m.biteDamage *= 1.5;
  rules.mantis.cooldown /= difficulty; rules.mantis.grace = 0.5;
  rules.human.glanceMin *= 0.75; rules.human.glanceMax *= 0.75;
  rules.human.suspicionRise *= 1.4;
  rules.spider.silkRegenPerSec *= 0.8;
  rules.difficulty = difficulty;
  return rules;
}

export function baseRules(night) {
  return {
    difficulty: 1,
    spider: { ...CFG.spider }, web: { ...CFG.web, strandLife: CFG.web.strandLife * night.life },
    human: { ...CFG.human, glanceMin: CFG.human.glanceMin * night.glance, glanceMax: CFG.human.glanceMax * night.glance },
    mosquito: { ...CFG.mosquito, baseSpeed: CFG.mosquito.baseSpeed * night.speed,
      speedGain: CFG.mosquito.speedGain * night.speed, spawnStart: CFG.mosquito.spawnStart * night.spawn,
      spawnEnd: CFG.mosquito.spawnEnd * night.spawn, wind: night.wind },
    mantis: { ...CFG.mantis, speed: CFG.mantis.speed * (isHardNight(night) ? 1.08 : 1) },
    hunter: { ...CFG.hunter },
  };
}

export const durationLabel = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
