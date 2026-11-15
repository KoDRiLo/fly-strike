import * as THREE from 'three';
import { starRarity } from './balance.js';
import { makeStar } from './models.js';
import { sfx } from './audio.js';
import { clamp, H, rand, scene, TAU, W } from './core.js';
import { Pool, sweep } from './fx.js';
import { P, pickups, S, xpNeed } from './state.js';
import { pickQueue } from './perkui.js';

// ───────────────────────── Зірки досвіду та перк-сфери ─────────────────────────
// Рідкість: зелена → синя → фіолетова → золота.
const STARS = [
  { color: 0x7dff8f, xp: 1, size: 1.3 },
  { color: 0x5bb8ff, xp: 3, size: 1.45 },
  { color: 0xd08bff, xp: 8, size: 1.6 },
  { color: 0xffd24a, xp: 20, size: 1.8 },
];
// Об'ємна зірка, нахилена на 60° до камери, обертається навколо своєї осі.
for (const st of STARS) {
  const mat = new THREE.MeshStandardMaterial({ color: st.color, emissive: st.color, emissiveIntensity: 0.55, flatShading: true, roughness: 0.4 });
  st.size *= 1.3;
  const rim = new THREE.MeshBasicMaterial({ color: new THREE.Color(st.color).multiplyScalar(0.4), side: THREE.BackSide });
  st.pool = new Pool(() => { const m = makeStar(mat, rim); m.rotation.x = Math.PI / 3; scene.add(m); return m; });
}

const rollRarity = (boost) => starRarity(P.luck, boost, Math.random());
function dropStars(x, y, n, boost = 0) {
  for (let i = 0; i < n; i++) {
    const rar = rollRarity(boost), a = rand(0, TAU), v = rand(2, 5 + n);
    const st = STARS[rar];
    pickups.push({ rar, xp: st.xp, size: st.size, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: rand(0, 6), fall: 3.5, m: st.pool.get(), pool: st.pool });
  }
}
function gainXp(v) {
  P.xp += v * P.xpMul;
  while (P.xp >= xpNeed()) {
    P.xp -= xpNeed();
    P.level++;
    pickQueue.push({ title: 'НОВИЙ РІВЕНЬ ' + (P.level + 1) });
    sfx.level();
  }
}
function updatePickups(dt) {
  const damp = Math.max(0, 1 - 3 * dt);
  for (const p of pickups) {
    p.t += dt;
    const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (!P.dead && (p.pull || d < P.magnet)) {
      p.pull = true;
      const v = 20 + (p.pullT = (p.pullT || 0) + dt) * 30;
      p.x += dx / d * v * dt; p.y += dy / d * v * dt;
    } else {
      p.x = clamp(p.x + p.vx * dt, -W + 1, W - 1);
      p.y += (p.vy - p.fall) * dt;
      p.vx *= damp; p.vy *= damp;
    }
    p.m.position.set(p.x, p.y, 0.8);
    p.m.scale.setScalar(p.size);
    p.m.rotation.y = p.t * 3;   // обертання навколо власної осі, як монетка
    if (!P.dead && d < 1.9) {
      p.dead = true;
      gainXp(p.xp);
      S.score += p.xp * 10;
      sfx.star(p.rar);
    } else if (p.y < -H - 3) p.dead = true;
  }
  sweep(pickups, (p) => p.pool.put(p.m));
}

export {
  dropStars, gainXp, updatePickups,
};
