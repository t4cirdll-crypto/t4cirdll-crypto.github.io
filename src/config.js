// Все настройки баланса и геометрии комнаты — в одном месте.
export const W = 960;
export const H = 540;

export const CFG = {
  nightDuration: 210,      // первая ночь; остальные длительности — progression/nights.js
  floorY: 478,

  // Комната
  window: { x: 770, y: 80, w: 130, h: 170 },
  bed: { x: 40, y: 395, w: 380, h: 83 },
  headPos: { x: 130, y: 382 },
  biteSites: [{ x: 130, y: 382 }, { x: 147, y: 401 }, { x: 394, y: 410 }], // лицо, кисть, ступня
  wardrobe: { x: 500, y: 150, w: 130, h: 328 },
  // Зона тени: человек не видит паука, пока тот в ней
  shadowZones: [
    { x: 500, y: 150, w: 130, h: 328 },   // за шкафом
    { x: 20, y: 150, w: 170, h: 120 },     // тёмный угол под потолком
  ],
  bounds: { x1: 18, y1: 18, x2: W - 18, y2: 470 },

  // Паук
  spider: {
    radius: 9,
    accel: 1100,
    maxSpeed: 175,
    spinSpeed: 125,         // скорость при плетении
    drag: 8,
    silkMax: 220,
    silkCostPerPx: 0.14,
    silkRegenPerSec: 6,
    silkPerMosquito: 32,
    strandStep: 16,         // длина одной нити
    moveThreshold: 25,      // выше этой скорости человек замечает движение
  },

  // Паутина
  web: {
    strandLife: 28,         // секунд до распада нити
    breakChance: 0.35,      // шанс, что нить рвётся, когда комар вырвался
    maxStrands: 600,
    thicknessScale: 2.5,     // визуальная толщина волокон; оси ловушек не меняются
    stitchSpacing: 32,
    stitchReach: 105,
    stitchCostScale: 0.55,   // тонкие перемычки дешевле несущей нити
  },

  // Богомол перегрызает длинные прямые пролёты между поворотами/развилками.
  mantis: {
    grace: 2,
    straightLength: 110,
    jointTolerance: 1.5,
    turnAngle: Math.PI / 10,
    lineTolerance: 5,
    scanInterval: 0.2,
    speed: 145,
    speedGain: 30,
    reach: 8,
    windup: 1.1,
    chewTime: 0.65,
    biteRadius: 44,         // круговой укус задевает и соседние нити
    cooldown: 0.65,
  },

  // Паук-охотник реагирует на НОВЫЕ нити у человека, а не просто на движение.
  hunter: {
    nearHuman: 54,          // только плетение вплотную к человеку вызывает охотника
    warning: 1.25,          // заметное появление перед началом погони
    spawnDistance: 180,     // не появляется прямо на игроке
    radius: 8,              // корпус ловит, длинные лапы — нет
    speed: 98,             // медленнее даже плетущего игрока (125)
    speedGain: 14,
    acceleration: 230,
    escapeDistance: 280,
    escapeTime: 3,          // отрыв нужно удержать, а не получить на один кадр
    cooldown: 4,
    retreatSpeed: 170,
  },

  // Комары
  mosquito: {
    radius: 6,
    baseSpeed: 85,
    speedGain: 35,          // прибавка к скорости к рассвету
    stuckTime: 5.0,         // сколько бьётся в паутине
    biteInterval: 1.5,
    biteDamage: 6,
    maxBites: 3,             // насытившийся комар улетает, не кусает бесконечно
    maxAlive: 16,
    poolMax: 28,             // предел видимых насекомых (режим ×3); меши создаются заранее
    spawnStart: 4.5,        // интервал спавна в начале ночи
    spawnEnd: 1.7,          // и ближе к рассвету
  },

  // Человек
  human: {
    sleepMax: 100,
    sleepRegen: 1.2,        // восстановление сна, когда никто не кусает
    glanceMin: 7,
    glanceMax: 12,
    stirTime: 1.3,          // предупреждение перед взглядом
    lookTime: 2.3,
    suspicionRise: 62,      // в секунду, если паук двигается на виду
    suspicionStirRise: 20,
    suspicionFall: 14,
    swatTime: 0.7,
  },
};
