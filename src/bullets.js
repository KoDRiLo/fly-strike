import { sfx } from './audio.js';
import { clamp, H, rand, W } from './core.js';
import { explode, missilePool, particle, sparks, sweep } from './fx.js';
import { eBullets, enemies, missiles, P, pBullets } from './state.js';
import { damageEnemy } from './enemies.js';
import { boss, damageBoss } from './bosses.js';
import { hurtPlayer, nearestTarget } from './player.js';

// ───────────────────────── Снаряди ─────────────────────────
function hitTest(x, y, r, skip) {
  const b = boss;
  if (b && b.state === 'fight' && !skip?.includes(b) && Math.abs(x - b.x) < b.hx + r && Math.abs(y - b.y) < b.hy + r) return b;
  for (const e of enemies) {
    if (e.dead || e.y > H + 1 || skip?.includes(e)) continue;
    // крилаті вороги — прямокутник на весь розмах крил; круглі (міни, спінер, камікадзе) — коло
    if (e.hx ? Math.abs(e.x - x) < e.hx + r && Math.abs(e.y - y) < e.hy + r : (e.x - x) ** 2 + (e.y - y) ** 2 < (e.r + r) ** 2) return e;
  }
  return null;
}
function applyHit(t, dmg) {
  if (t === boss) damageBoss(dmg); else damageEnemy(t, dmg);
  if (dmg < 3) sfx.hit();
}

function updateBullets(dt) {
  for (const b of pBullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.bounce > 0) {
      // рикошет від бокових і верхнього країв
      if (Math.abs(b.x) > W) { b.vx = -b.vx; b.x = clamp(b.x, -W, W); b.bounce--; b.hit = null; sparks(b.x, b.y, 0.5, 0.8, 1); }
      else if (b.y > H) { b.vy = -b.vy; b.y = H; b.bounce--; b.hit = null; sparks(b.x, b.y, 0.5, 0.8, 1); }
    }
    if (Math.abs(b.y) > H + 2 || Math.abs(b.x) > W + 2) { b.dead = true; continue; }
    const t = hitTest(b.x, b.y, 0.35, b.hit);
    if (t) {
      applyHit(t, b.dmg);
      sparks(b.x, b.y);
      if (b.pierce-- > 0) (b.hit ||= []).push(t); else { b.dead = true; continue; }
    }
    b.m.position.set(b.x, b.y, 0);
  }
  sweep(pBullets, (b) => b.pool.put(b.m));

  for (const m of missiles) {
    m.life -= dt;
    m.v = Math.min(36, m.v + 40 * dt);
    const t = nearestTarget(m.x, m.y);
    if (t) {
      let d = Math.atan2(t.y - m.y, t.x - m.x) - m.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      m.a += clamp(d, -6 * dt, 6 * dt);
    }
    m.x += Math.cos(m.a) * m.v * dt; m.y += Math.sin(m.a) * m.v * dt;
    m.m.position.set(m.x, m.y, 0);
    m.m.rotation.z = m.a - Math.PI / 2;
    particle(m.x, m.y, 0, rand(-1, 1), rand(-1, 1), 0, 0.3, 1, 0.6, 0.2);
    const hit = hitTest(m.x, m.y, 0.5);
    if (hit) { m.dead = true; applyHit(hit, 5 * P.misDmg); explode(m.x, m.y, 0.4); }
    else if (m.life <= 0 || Math.abs(m.x) > W + 4 || Math.abs(m.y) > H + 4) m.dead = true;
  }
  sweep(missiles, (m) => missilePool.put(m.m));

  for (const b of eBullets) {
    if (b.dead) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.abs(b.y) > H + 2 || Math.abs(b.x) > W + 2) { b.dead = true; continue; }
    b.m.position.set(b.x, b.y, 0.2);
    if (!P.dead && (b.x - P.x) ** 2 + (b.y - P.y) ** 2 < (P.shield > 0 ? 4 : 0.8)) {
      if (hurtPlayer(b.dmg)) b.dead = true;
    }
  }
  sweep(eBullets, (b) => b.pool.put(b.m));
}

export {
  updateBullets,
};
