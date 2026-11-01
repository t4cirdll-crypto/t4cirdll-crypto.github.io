import { baseRules, applyDifficulty } from './nights.js';

export const UPGRADES = Object.freeze([
  { id: 'spool', name: 'Большая катушка', icon: '◎', description: '+70 к запасу шёлка за уровень.', apply(r) { r.spider.silkMax += 70; } },
  { id: 'glands', name: 'Живой шёлк', icon: '✦', description: '+2,5 шёлка в секунду за уровень.', apply(r) { r.spider.silkRegenPerSec += 2.5; } },
  { id: 'sticky', name: 'Липкие узлы', icon: '⌘', description: 'Комары держатся в ловушке на 1,5 секунды дольше.', apply(r) { r.mosquito.stuckTime += 1.5; } },
  { id: 'braid', name: 'Двойное плетение', icon: '⋈', description: '+9 секунд жизни каждой новой нити.', apply(r) { r.web.strandLife += 9; } },
  { id: 'stride', name: 'Лёгкие лапы', icon: '↗', description: '+12 к скорости бега и плетения. Быстрее разгон.', apply(r) { r.spider.maxSpeed += 12; r.spider.spinSpeed += 12; r.spider.accel += 80; } },
  { id: 'quiet', name: 'Тихий шаг', icon: '◌', description: 'Подозрение от движения растёт на 18% медленнее.', apply(r) { r.human.suspicionRise *= 0.82; r.human.suspicionStirRise *= 0.82; } },
  { id: 'lull', name: 'Хранитель сна', icon: '☾', description: '+0,45 восстановления сна в секунду; укусы слабее на 10%.', apply(r) { r.human.sleepRegen += 0.45; r.mosquito.biteDamage *= 0.9; } },
  { id: 'salvage', name: 'Без отходов', icon: '∞', description: '+12 шёлка за каждого съеденного комара.', apply(r) { r.spider.silkPerMosquito += 12; } },
]);

export const rankOf = (upgrades, id) => upgrades.filter(value => value === id).length;
const rotations = [
  ['spool', 'sticky', 'stride'], ['glands', 'braid', 'quiet'], ['lull', 'sticky', 'spool'],
  ['stride', 'quiet', 'glands'], ['braid', 'lull', 'salvage'], ['sticky', 'stride', 'lull'],
];

export function upgradeOffers(upgrades) {
  const order = [...rotations[upgrades.length % rotations.length], ...UPGRADES.map(u => u.id)];
  return [...new Set(order)].filter(id => rankOf(upgrades, id) < 2).slice(0, 3).map(id => UPGRADES.find(u => u.id === id));
}

/** Resolved per-round values: never mutate global CFG or another campaign. */
export function rulesFor(night, upgrades, difficulty = 1) {
  const rules = baseRules(night);
  for (const id of upgrades) UPGRADES.find(u => u.id === id)?.apply(rules);
  return applyDifficulty(rules, difficulty);
}
