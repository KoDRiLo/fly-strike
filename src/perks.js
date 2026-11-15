import { weightedPick } from './balance.js';

// ───────────────────────── Роглайк-перки ─────────────────────────
// Єдине джерело покращень: нові рівні (зірки) та боси.
const CATS = { atk: 'АТАКА', def: 'ЗАХИСТ', util: 'ПІДТРИМКА' };
const PERKS = [
  { id: 'gun', cat: 'atk', icon: '🔫', name: 'Гармата', desc: '+1 ствол: більше куль за постріл', max: 4, apply(P) { P.gun++; } },
  { id: 'dmg', cat: 'atk', icon: '💥', name: 'Бронебійні набої', desc: '+25% шкоди куль гармати', max: 99, apply(P) { P.dmg += 0.25; } },
  { id: 'rate', cat: 'atk', icon: '⚡', name: 'Скорострільність', desc: '+15% темпу вогню', max: 5, apply(P) { P.rate += 0.15; } },
  { id: 'mis', cat: 'atk', icon: '🎯', name: 'Ракети: залп', desc: '+1 самонавідна ракета в залпі', max: 99, apply(P) { P.missiles++; } },
  { id: 'misdmg', cat: 'atk', icon: '🧨', name: 'Ракети: боєголовка', desc: '+25% шкоди ракет', max: 99, ok: (P) => P.missiles > 0, apply(P) { P.misDmg += 0.25; } },
  { id: 'drone', cat: 'atk', icon: '🛸', name: 'Дрон', desc: '+1 дрон-супутник, що стріляє поруч', max: 4, apply(P) { P.drones++; } },
  { id: 'dronedmg', cat: 'atk', icon: '🔋', name: 'Дрони: потужність', desc: '+25% шкоди куль дронів', max: 99, ok: (P) => P.drones > 0, apply(P) { P.droneDmg += 0.25; } },
  { id: 'dronegun', cat: 'atk', icon: '🛰️', name: 'Дрони: друга гармата', desc: '+1 ствол кожному дрону', max: 3, w: 0.25, rare: true, ok: (P) => P.drones > 0, apply(P) { P.droneGuns++; } },
  { id: 'pierce', cat: 'atk', icon: '🗡️', name: 'Пробивні снаряди', desc: 'Кулі пробивають ще одного ворога', max: 3, apply(P) { P.pierce++; } },
  { id: 'bounce', cat: 'atk', icon: '↩️', name: 'Рикошет', desc: 'Кулі ще раз відбиваються від країв екрана', max: 3, apply(P) { P.bounce++; } },
  { id: 'crit', cat: 'atk', icon: '☠️', name: 'Критичний удар', desc: '+10% шансу завдати потрійної шкоди', max: 4, apply(P) { P.crit += 0.1; } },
  { id: 'hp', cat: 'def', icon: '❤️', name: 'Броня', desc: '+25 до макс. міцності та повний ремонт', max: 6, apply(P) { P.maxHp += 25; P.hp = P.maxHp; } },
  { id: 'repair', cat: 'def', icon: '🩹', name: 'Ремонт', desc: 'Миттєво відновлює 60% міцності', max: 99, w: 1.5, ok: (P) => P.hp < P.maxHp * 0.6, apply(P) { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.6); } },
  { id: 'shield', cat: 'def', icon: '🛡️', name: 'Енергощит', desc: '+1 заряд щита; заряд відновлюється за 12 с', max: 3, apply(P) { P.shieldMax++; P.shield = P.shieldMax; } },
  { id: 'regen', cat: 'def', icon: '🔧', name: 'Ремонтні боти', desc: 'Відновлення +1 міцності за секунду', max: 3, apply(P) { P.regen++; } },
  { id: 'life', cat: 'def', icon: '✈️', name: 'Запасний літак', desc: '+1 життя: після загибелі літак повертається в бій', max: 99, w: 0.2, rare: true, apply(P) { P.lives++; } },
  { id: 'bomb', cat: 'util', icon: '💣', name: 'Бомбовий відсік', desc: '+1 до запасу бомб і повне поповнення', max: 4, apply(P) { P.maxBombs++; P.bombs = P.maxBombs; } },
  { id: 'spd', cat: 'util', icon: '🚀', name: 'Форсаж', desc: '+15% швидкості літака', max: 4, apply(P) { P.spd += 0.15; } },
  { id: 'magnet', cat: 'util', icon: '🧲', name: 'Магніт', desc: 'Зірки притягуються з більшої відстані', max: 3, apply(P) { P.magnet += 5; } },
  { id: 'luck', cat: 'util', icon: '🍀', name: 'Удача', desc: 'Частіше випадають рідкісні зірки', max: 3, apply(P) { P.luck++; } },
  { id: 'xp', cat: 'util', icon: '📘', name: 'Навчання', desc: '+20% досвіду із зірок', max: 3, apply(P) { P.xpMul += 0.2; } },
];
// Три різні перки на вибір: лише доступні (не на максимумі, умова ok виконана), з урахуванням ваги.
function rollPerks(P, rng = Math.random) {
  const pool = PERKS.filter((p) => (P.perks[p.id] || 0) < p.max && (!p.ok || p.ok(P)));
  return weightedPick(pool, 3, rng);
}

export {
  CATS, PERKS, rollPerks,
};
