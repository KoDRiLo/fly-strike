import { weightedPick } from './balance.js';

// ───────────────────────── Роглайк-перки ─────────────────────────
// Єдине джерело покращень: нові рівні (зірки) та боси.
const CATS = { atk: 'АТАКА', def: 'ЗАХИСТ', util: 'ПІДТРИМКА' };
const MAGNET = 7; // базовий радіус притягування зірок (як у freshPlayer)
const SHIELD_RECHARGE = 20; // секунд на відновлення одного заряду щита
const MID = 0.5; // вага перків середньої рідкості (звичайні — 1, рідкісні — 0,2–0,25)
const PERKS = [
  { id: 'gun', cat: 'atk', icon: '🔫', name: 'Гармата', desc: '+1 ствол: більше куль за постріл', max: 4, apply(P) { P.gun++; } },
  { id: 'dmg', cat: 'atk', icon: '💥', name: 'Бронебійні набої', desc: '+25% шкоди куль гармати', max: 99, apply(P) { P.dmg += 0.25; } },
  { id: 'rate', cat: 'atk', icon: '⚡', name: 'Скорострільність', desc: '+5% темпу вогню', max: 99, apply(P) { P.rate += 0.05; } },
  { id: 'mis', cat: 'atk', icon: '🎯', name: 'Ракети: залп', desc: '+1 самонавідна ракета в залпі', max: 99, apply(P) { P.missiles++; } },
  { id: 'misdmg', cat: 'atk', icon: '🧨', name: 'Ракети: боєголовка', desc: '+25% шкоди ракет', max: 99, ok: (P) => P.missiles > 0, apply(P) { P.misDmg += 0.25; } },
  { id: 'drone', cat: 'atk', icon: '🛸', name: 'Дрон', desc: '+1 дрон-супутник, що стріляє поруч', max: 4, apply(P) { P.drones++; } },
  { id: 'dronedmg', cat: 'atk', icon: '🔋', name: 'Дрони: потужність', desc: '+25% шкоди куль дронів', max: 99, ok: (P) => P.drones > 0, apply(P) { P.droneDmg += 0.25; } },
  { id: 'dronegun', cat: 'atk', icon: '🛰️', name: 'Дрони: друга гармата', desc: '+1 ствол кожному дрону', max: 3, w: 0.25, rare: true, ok: (P) => P.drones > 0, apply(P) { P.droneGuns++; } },
  { id: 'pierce', cat: 'atk', icon: '🗡️', name: 'Пробивні снаряди', desc: 'Кулі пробивають ще одного ворога', max: 3, apply(P) { P.pierce++; } },
  { id: 'bounce', cat: 'atk', icon: '↩️', name: 'Рикошет', desc: 'Кулі один раз відбиваються від країв екрана', max: 1, apply(P) { P.bounce++; } },
  { id: 'crit', cat: 'atk', icon: '☠️', name: 'Критичний удар', desc: '+1% шансу завдати потрійної шкоди', max: 99, apply(P) { P.crit += 0.01; } },
  // Додаткова зброя: базовий перк (середня рідкість) відкриває її, решта — покращення.
  { id: 'laser', cat: 'atk', icon: '🔆', name: 'Лазер', desc: 'Раз на 3 с промінь пробиває всіх ворогів перед літаком', max: 1, w: MID, mid: true, apply(P) { P.laser = 1; } },
  { id: 'laserdmg', cat: 'atk', icon: '🔆', name: 'Лазер: потужність', desc: '+25% шкоди лазера', max: 99, ok: (P) => P.laser > 0, apply(P) { P.laserDmg += 0.25; } },
  { id: 'lasertime', cat: 'atk', icon: '🔆', name: 'Лазер: тривалість', desc: '+5% часу дії променя', max: 10, ok: (P) => P.laser > 0, apply(P) { P.laserTime += 0.05; } },
  { id: 'lasercd', cat: 'atk', icon: '🔆', name: 'Лазер: перезарядка', desc: '−5% часу заряджання лазера', max: 10, ok: (P) => P.laser > 0, apply(P) { P.laserCd *= 0.95; } },
  { id: 'chain', cat: 'atk', icon: '🌩️', name: 'Ланцюгова блискавка', desc: 'Раз на 1,6 с розряд б\'є найближчого ворога й перестрибує на сусіднього', max: 1, w: MID, mid: true, apply(P) { P.chain = 1; } },
  { id: 'chaindmg', cat: 'atk', icon: '🌩️', name: 'Блискавка: напруга', desc: '+4 шкоди розряду', max: 99, ok: (P) => P.chain > 0, apply(P) { P.chainDmg++; } },
  { id: 'chainjump', cat: 'atk', icon: '🌩️', name: 'Блискавка: ланцюг', desc: '+1 ціль для розряду', max: 5, ok: (P) => P.chain > 0, apply(P) { P.chainJumps++; } },
  { id: 'chaincd', cat: 'atk', icon: '🌩️', name: 'Блискавка: заряд', desc: '−5% часу заряджання блискавки', max: 99, ok: (P) => P.chain > 0, apply(P) { P.chainCd *= 0.95; } },
  { id: 'orb', cat: 'atk', icon: '☄️', name: 'Вогняні сфери', desc: 'Сфера кружляє навколо літака й палить ворогів, яких торкається', max: 1, w: MID, mid: true, apply(P) { P.orbs = 1; } },
  { id: 'orbn', cat: 'atk', icon: '☄️', name: 'Сфери: кількість', desc: '+1 вогняна сфера', max: 99, ok: (P) => P.orbs > 0, apply(P) { P.orbs++; } },
  { id: 'orbr', cat: 'atk', icon: '☄️', name: 'Сфери: радіус', desc: '+10% радіуса орбіти сфер', max: 99, ok: (P) => P.orbs > 0, apply(P) { P.orbR += 0.1; } },
  { id: 'orbdmg', cat: 'atk', icon: '☄️', name: 'Сфери: жар', desc: '+1 шкоди сфер', max: 99, ok: (P) => P.orbs > 0, apply(P) { P.orbDmg++; } },
  { id: 'hp', cat: 'def', icon: '❤️', name: 'Броня', desc: '+25 до макс. і поточної міцності', max: 6, apply(P) { P.maxHp += 25; P.hp += 25; } },
  { id: 'repair', cat: 'def', icon: '🩹', name: 'Ремонт', desc: 'Миттєво відновлює 60% міцності', max: 99, w: 1.5, ok: (P) => P.hp < P.maxHp * 0.6, apply(P) { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.6); } },
  { id: 'shield', cat: 'def', icon: '🛡️', name: 'Енергощит', desc: '+1 заряд щита; заряд відновлюється за ' + SHIELD_RECHARGE + ' с', max: 3, apply(P) { P.shieldMax++; P.shield = P.shieldMax; } },
  { id: 'regen', cat: 'def', icon: '🔧', name: 'Ремонтні боти', desc: 'Відновлення +1 міцності за секунду', max: 3, apply(P) { P.regen++; } },
  { id: 'life', cat: 'def', icon: '✈️', name: 'Запасний літак', desc: '+1 життя: після загибелі літак повертається в бій', max: 2, w: 0.2, rare: true, apply(P) { P.lives++; } },
  { id: 'bomb', cat: 'util', icon: '💣', name: 'Бомбовий відсік', desc: '+1 до запасу бомб і повне поповнення', max: 4, apply(P) { P.maxBombs++; P.bombs = P.maxBombs; } },
  { id: 'spd', cat: 'util', icon: '🚀', name: 'Форсаж', desc: '+5% швидкості літака', max: 99, apply(P) { P.spd += 0.05; } },
  { id: 'magnet', cat: 'util', icon: '🧲', name: 'Магніт', desc: '+10% радіуса притягування зірок', max: 99, apply(P) { P.magnet += MAGNET * 0.1; } },
  { id: 'luck', cat: 'util', icon: '🍀', name: 'Удача', desc: 'Частіше випадають рідкісні зірки', max: 3, apply(P) { P.luck++; } },
  { id: 'xp', cat: 'util', icon: '📘', name: 'Навчання', desc: '+20% досвіду із зірок', max: 3, apply(P) { P.xpMul += 0.2; } },
];
// Три різні перки на вибір: лише доступні (не на максимумі, умова ok виконана), з урахуванням ваги.
function rollPerks(P, rng = Math.random) {
  const pool = PERKS.filter((p) => (P.perks[p.id] || 0) < p.max && (!p.ok || p.ok(P)));
  return weightedPick(pool, 3, rng);
}

export {
  CATS, PERKS, rollPerks, SHIELD_RECHARGE,
};
