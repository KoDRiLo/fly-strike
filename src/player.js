import { SHIELD_RECHARGE } from './perks.js';
import * as THREE from 'three';
import { makeDrone, makePlayer } from './models.js';
import { sfx } from './audio.js';
import { clamp, H, rand, scene, TAU, W } from './core.js';
import { critBulletPool, dBulletPool, explode, glowTex, missilePool, particle, pBulletPool, ring } from './fx.js';
import { eBullets, enemies, missiles, P, pBullets, S } from './state.js';
import { screenFlash } from './hud.js';
import { damageEnemy, quietly } from './enemies.js';
import { boss, damageBoss } from './bosses.js';
import { gameOver } from './game.js';

// ───────────────────────── Гравець ─────────────────────────
const input = { keys: new Set(), tx: 0, ty: 0, useTarget: false, touch: null };
const playerModel = makePlayer();
const playerHolder = new THREE.Group();
playerHolder.add(playerModel);
scene.add(playerHolder);
const playerFlame = playerModel.getObjectByName('flame');
const shieldMesh = new THREE.Mesh(
  new THREE.SphereGeometry(2.6, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
);
playerHolder.add(shieldMesh);
const drones = [-1, 1, -2, 2].map((side) => {
  const m = makeDrone();
  m.visible = false;
  scene.add(m);
  return { m, side, x: 0, y: 0 };
});

const FIRE_GAP = 8 / 60, DRONE_GAP = 15 / 60; // базова пауза між пострілами гармати й дронів, с (7,5 і 4 залпи за секунду)
const SPEED = 27; // базова швидкість літака, світових одиниць за секунду

function hurtPlayer(dmg) {
  if (P.inv > 0 || P.dead) return false;
  if (P.shield > 0) {
    if (P.shield-- === P.shieldMax) P.shieldT = SHIELD_RECHARGE;
    P.inv = 0.4;
    ring(P.x, P.y, 5, 0.3, 0x4fd8ff);
    sfx.hit();
    return true;
  }
  P.hp -= dmg;
  P.inv = 0.7;
  S.shake = Math.max(S.shake, 0.8);
  screenFlash(0.25);
  sfx.hurt();
  if (P.hp <= 0) killPlayer();
  return true;
}
function killPlayer() {
  P.dead = true;
  P.respawnT = 1.6;
  P.lives--;
  P.shock = 0;
  explode(P.x, P.y, 2.5);
  playerHolder.visible = false;
}

// Удар струмом від електроміни: сині блискавки на літаку та періодична шкода.
const SHOCK = { time: 4, tick: 0.5, dmg: 4 };
const BOLTS = 7, BOLT_SEG = 4;
const boltPos = new Float32Array(BOLTS * BOLT_SEG * 6);
const boltGeo = new THREE.BufferGeometry();
boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
const boltMesh = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ color: 0xa8e4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
const boltGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x2f8cff, blending: THREE.AdditiveBlending, depthWrite: false }));
boltMesh.frustumCulled = false;
boltMesh.visible = boltGlow.visible = false;
playerHolder.add(boltMesh, boltGlow);
let boltT = 0;
function rebuildBolts() {
  let k = 0;
  for (let b = 0; b < BOLTS; b++) {
    // ламана від корпусу до випадкової точки навколо літака
    let x = rand(-0.4, 0.4), y = rand(-1.5, 1.5);
    const a = rand(0, TAU), len = rand(1.8, 3.2);
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
    for (let i = 1; i <= BOLT_SEG; i++) {
      const f = i / BOLT_SEG, j = i < BOLT_SEG ? 0.7 : 0;
      const nx = ex * f + rand(-j, j), ny = ey * f + rand(-j, j);
      boltPos.set([x, y, 0.6, nx, ny, 0.6], k); k += 6;
      x = nx; y = ny;
    }
  }
  boltGeo.attributes.position.needsUpdate = true;
}
function shockPlayer() {
  if (P.dead || P.inv > 0) return;
  if (P.shield > 0) { hurtPlayer(0); return; } // щит поглинає розряд
  P.shock = SHOCK.time;
  P.shockT = 0;
  screenFlash(0.2);
}
function updateShock(dt) {
  const on = P.shock > 0 && !P.dead;
  boltMesh.visible = boltGlow.visible = on;
  if (!on) return;
  P.shock -= dt;
  if ((boltT -= dt) <= 0) { boltT = 0.05; rebuildBolts(); boltGlow.scale.setScalar(rand(5, 7.5)); }
  if (Math.random() < 0.5) particle(P.x + rand(-2, 2), P.y + rand(-2, 2), 0.5, rand(-3, 3), rand(-3, 3), 0, 0.2, 0.4, 0.8, 1);
  if ((P.shockT -= dt) <= 0) {
    P.shockT = SHOCK.tick;
    P.hp -= SHOCK.dmg;
    S.shake = Math.max(S.shake, 0.35);
    sfx.zap();
    if (P.hp <= 0) killPlayer();
  }
}

// Крит визначається в момент пострілу: така куля б'є втричі сильніше й виглядає інакше.
function pShoot(x, y, vx, vy, dmg = P.dmg, pool = pBulletPool) {
  const crit = Math.random() < P.crit;
  if (crit) pool = critBulletPool;
  pBullets.push({ x, y, vx, vy, dmg: dmg * (crit ? 3 : 1), crit, pierce: P.pierce, bounce: P.bounce, hit: null, m: pool.get(), pool });
}
const GUN = [
  [[0, 0]],
  [[-0.5, 0], [0.5, 0]],
  [[0, 0], [-0.7, -0.12], [0.7, 0.12]],
  [[-0.4, 0], [0.4, 0], [-1.0, -0.16], [1.0, 0.16]],
  [[0, 0], [-0.6, -0.08], [0.6, 0.08], [-1.2, -0.22], [1.2, 0.22]],
];
function nearestTarget(x, y) {
  let best = null, bd = 1e9;
  for (const e of enemies) {
    if (e.dead || e.y > H) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  if (!best && boss && boss.state === 'fight') best = boss;
  return best;
}

function useBomb() {
  if (S.mode !== 'play' || P.dead || P.bombs <= 0) return;
  P.bombs--;
  P.inv = Math.max(P.inv, 1.5);
  for (const o of eBullets) o.dead = true;
  quietly(() => {
    for (const e of enemies) if (e.y < H + 1) damageEnemy(e, 40);
    damageBoss(60);
  });
  ring(P.x, P.y, 60, 0.8, 0xffffff);
  ring(P.x, P.y, 35, 0.6, 0xffb060);
  screenFlash(0.85);
  S.shake = 1.6;
  sfx.bomb();
}

function updatePlayer(dt) {
  if (P.dead) {
    if ((P.respawnT -= dt) <= 0) {
      if (P.lives < 0) return gameOver();
      P.dead = false; P.hp = P.maxHp; P.inv = 3; P.shock = 0;
      P.shield = P.shieldMax;
      P.x = 0; P.y = -H + 6;
      input.useTarget = false;
      playerHolder.visible = true;
      for (const o of eBullets) o.dead = true;
    }
    return;
  }
  const ox = P.x;
  const k = input.keys;
  const kx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
  const ky = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
  if (kx || ky) {
    input.useTarget = false;
    const n = Math.hypot(kx, ky);
    P.x += kx / n * SPEED * P.spd * dt; P.y += ky / n * SPEED * P.spd * dt;
  } else if (input.useTarget) {
    // до цілі пальця літак летить з тією ж швидкістю, що й з клавіатури — перк «Форсаж» діє всюди
    const dx = input.tx - P.x, dy = input.ty - P.y, d = Math.hypot(dx, dy), step = SPEED * P.spd * dt;
    if (d <= step) { P.x = input.tx; P.y = input.ty; } else { P.x += dx / d * step; P.y += dy / d * step; }
  }
  P.x = clamp(P.x, -W + 1.5, W - 1.5);
  P.y = clamp(P.y, -H + 2, H - 3);
  const vx = (P.x - ox) / Math.max(dt, 1e-4);
  P.vx += (vx - P.vx) * Math.min(1, 10 * dt);
  P.inv -= dt;
  if (P.regen) P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);
  if (P.shield < P.shieldMax && (P.shieldT -= dt) <= 0) { P.shield++; P.shieldT = SHIELD_RECHARGE; ring(P.x, P.y, 4, 0.3, 0x4fd8ff); }

  // Залишок таймера переноситься на наступний постріл, тож кожен рівень скорострільності дає рівно свої відсотки.
  // Темп залежить лише від перка «Скорострільність», а не від кількості стволів.
  if ((P.fireT -= dt) <= 0) {
    P.fireT = Math.max(0, P.fireT + FIRE_GAP / P.rate);
    for (const [dx, a] of GUN[P.gun - 1]) pShoot(P.x + dx, P.y + 1.8, Math.sin(a) * 48, Math.cos(a) * 48);
    sfx.shoot();
  }
  if (P.missiles > 0 && (P.misT -= dt) <= 0) {
    P.misT = 0.8;
    // рів. 1 — одна ракета по черзі, 2-3 — пара, далі +1 ракета за рівень
    const n = P.missiles; // кількість ракет у залпі = рівень перка
    for (let i = 0; i < n; i++) {
      const s = n === 1 ? (P.misSide = -P.misSide) : (i / (n - 1)) * 2 - 1;
      missiles.push({ x: P.x + s * 1.6, y: P.y, a: Math.PI / 2 - s * 0.6, v: 12, life: 3, m: missilePool.get() });
    }
    sfx.missile();
  }
  const fireDrones = P.drones > 0 && (P.droneT -= dt) <= 0;
  if (fireDrones) P.droneT = Math.max(0, P.droneT + DRONE_GAP / P.rate);
  drones.forEach((d, i) => {
    d.m.visible = i < P.drones;
    if (!d.m.visible) return;
    const f = Math.min(1, 9 * dt);
    const n = Math.abs(d.side);
    d.x += (P.x + Math.sign(d.side) * (0.8 + 2.3 * n) - d.x) * f; d.y += (P.y - 0.4 - 0.8 * n - d.y) * f;
    d.m.position.set(d.x, d.y, 0);
    if (fireDrones) {
      for (let g = 0; g < P.droneGuns; g++) {
        const o = g - (P.droneGuns - 1) / 2;   // стволи дрона віялом
        pShoot(d.x + o * 0.45, d.y + 1, o * 3.5, 44, P.droneDmg, dBulletPool);
      }
    }
  });

  playerHolder.position.set(P.x, P.y, 0);
  playerModel.rotation.y = clamp(P.vx * 0.035, -0.8, 0.8);
  playerModel.visible = P.inv <= 0 || Math.floor(S.time * 18) % 2 === 0;
  playerFlame.scale.y = rand(0.7, 1.3);
  updateShock(dt);
  if (P.dead) return;
  shieldMesh.visible = P.shield > 0;
  shieldMesh.material.opacity = 0.12 + P.shield * 0.07 + Math.sin(S.time * 8) * 0.03;
  if (Math.random() < 0.6) particle(P.x + rand(-.15, .15), P.y - 2.6, 0, 0, -8, 0, 0.25, 0.3, 0.7, 1);
}

export {
  drones, hurtPlayer, input, nearestTarget, playerFlame, playerHolder, playerModel, shieldMesh, shockPlayer,
  updatePlayer, useBomb,
};
