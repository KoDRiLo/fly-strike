import { H } from './core.js';
import { enemies } from './state.js';
import { damageEnemy } from './enemies.js';
import { boss, damageBoss } from './bosses.js';

// ───────────────────────── Цілі для зброї гравця ─────────────────────────
// Єдине місце, де вирішується, у кого можна влучити: живі вороги на екрані та бос у бою.
const bossTarget = () => (boss && boss.state === 'fight' ? boss : null);

// Перша ціль, яку зачіпає коло радіуса r у точці (x, y); skip — цілі, які треба пропустити.
function hitTest(x, y, r, skip) {
  const b = bossTarget();
  if (b && !skip?.includes(b) && Math.abs(x - b.x) < b.hx + r && Math.abs(y - b.y) < b.hy + r) return b;
  for (const e of enemies) {
    if (e.dead || e.y > H + 1 || skip?.includes(e)) continue;
    // крилаті вороги — прямокутник на весь розмах крил; круглі (міни, спінер, камікадзе) — коло
    if (e.hx ? Math.abs(e.x - x) < e.hx + r && Math.abs(e.y - y) < e.hy + r : (e.x - x) ** 2 + (e.y - y) ** 2 < (e.r + r) ** 2) return e;
  }
  return null;
}

// Найближчий до точки ворог; бос — лише коли інших цілей немає.
function nearestTarget(x, y) {
  let best = null, bd = 1e9;
  for (const e of enemies) {
    if (e.dead || e.y > H) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best || bossTarget();
}

// Усі цілі на екрані одним списком (для лазера й блискавки).
function liveTargets() {
  const out = enemies.filter((e) => !e.dead && e.y <= H + 1);
  const b = bossTarget();
  if (b) out.push(b);
  return out;
}

const damage = (t, dmg) => (t === boss ? damageBoss(dmg) : damageEnemy(t, dmg));

export {
  damage, hitTest, liveTargets, nearestTarget,
};
