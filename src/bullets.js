import { sfx } from './audio.js';
import { clamp, H, rand, turnToward, W } from './core.js';
import { critHit, explode, missilePool, particle, sparks, sweep } from './fx.js';
import { eBullets, missiles, P, pBullets } from './state.js';
import { hurtPlayer } from './player.js';
import { damage, hitTest, nearestTarget } from './targets.js';

// ───────────────────────── Снаряди ─────────────────────────
function applyHit(t, dmg) {
  damage(t, dmg);
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
      if (b.crit) critHit(b.x, b.y); else sparks(b.x, b.y);
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
      m.a = turnToward(m.a, Math.atan2(t.y - m.y, t.x - m.x), 6 * dt);
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
    if (b.ay) b.vy += b.ay * dt;                       // «бумеранг»: гальмує й повертається
    if (b.home > 0 && !P.dead) {                       // самонаведення: плавно довертає на гравця
      b.home -= dt;
      const v = Math.hypot(b.vx, b.vy);
      const a = turnToward(Math.atan2(b.vy, b.vx), Math.atan2(P.y - b.y, P.x - b.x), 1.5 * dt);
      b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v;
    }
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
