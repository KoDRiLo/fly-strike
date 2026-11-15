import * as THREE from 'three';
import { makeEnemy } from './models.js';
import { sfx } from './audio.js';
import { clamp, H, rand, scene, TAU, W } from './core.js';
import { eBulletPools, explode, glowTex, particle, Pool, ring, sweep } from './fx.js';
import { diff, eBullets, enemies, later, P, S, threatDmg } from './state.js';
import { showMsg } from './hud.js';
import { dropStars } from './pickups.js';
import { hurtPlayer, shockPlayer } from './player.js';

// ───────────────────────── Вороги ─────────────────────────
const DEF = { // r — радіус (таран, круглі вороги); hx/hy — пів-розмах крил і пів-довжина для влучань
  scout: { hp: 2, r: 1.2, hx: 1.8, hy: 1.5, score: 100, stars: 1 },
  fighter: { hp: 5, r: 1.4, hx: 2.2, hy: 2.0, score: 200, stars: 2 },
  kami: { hp: 3, r: 1.1, score: 150, stars: 1 },
  gunship: { hp: 34, r: 2.8, hx: 4.3, hy: 3.3, score: 1000, stars: 6 },
  strafer: { hp: 4, r: 1.4, hx: 1.9, hy: 1.5, score: 250, stars: 1 },
  mine: { hp: 4, r: 1.3, score: 150, stars: 1 },
  emine: { hp: 5, r: 1.3, score: 200, stars: 2 },
  bomber: { hp: 12, r: 2.1, hx: 3.4, hy: 2.4, score: 400, stars: 3 },
  spinner: { hp: 10, r: 1.7, score: 350, stars: 3 },
  ace: { hp: 16, r: 1.6, hx: 2.5, hy: 2.2, score: 600, stars: 5 },
};
const bulletSpeed = () => Math.min(16, 9.5 + S.stage * 0.7);
const aim = (x, y) => Math.atan2(P.y - y, P.x - x);

const SHOT = 12; // базова шкода ворожої кулі
const shotDmg = (elite) => (elite ? ELITE.shot : SHOT) * threatDmg();
// dmg — шкода кулі; елітні б'ють сильніше, і їхні кулі більші
function eShoot(x, y, ang, speed, kind = 0, dmg = shotDmg(false)) {
  const pool = eBulletPools[kind];
  const m = pool.get();
  m.scale.setScalar(dmg > shotDmg(false) ? 1.8 : 1.2);
  eBullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, m, pool });
}

const auraMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc21a, blending: THREE.AdditiveBlending, depthWrite: false });
function spawnElite() {
  const types = S.stage === 0 ? ['gunship', 'bomber'] : ['gunship', 'bomber', 'spinner', 'ace', 'fighter'];
  const type = types[Math.floor(Math.random() * types.length)];
  spawnEnemy(type, rand(-(W - 5), W - 5), H + 4, { elite: true, dir: Math.random() < 0.5 ? -1 : 1, ph: rand(0, TAU), homeY: rand(H - 11, H - 7) });
  showMsg('ЕЛІТНИЙ ВОРОГ!', 1.6, 'sm');
  sfx.elite();
}
// Моделі ворогів беруться з пулу за типом і повертаються туди, коли ворог зникає.
const enemyPools = {};
function freeEnemy(e) {
  if (e.aura) { e.holder.remove(e.aura); e.aura = null; }
  enemyPools[e.type].put(e.holder);
}
function spawnEnemy(type, x, y, o = {}) {
  const d = DEF[type];
  const pool = enemyPools[type] ||= new Pool(() => {
    const holder = new THREE.Group(), model = makeEnemy(type), spin = [];
    holder.add(model);
    model.traverse((c) => { if (c.name === 'spin') spin.push(c); });
    holder.userData = { model, spin };
    scene.add(holder);
    return holder;
  });
  const holder = pool.get(), { model, spin } = holder.userData;
  holder.rotation.z = Math.PI;
  holder.scale.setScalar(1);
  holder.position.set(x, y, 0);
  model.rotation.y = 0;
  model.scale.setScalar(1);
  const e = { type, x, y, hp: Math.ceil(d.hp * diff()), r: d.r, hx: d.hx, hy: d.hy, score: d.score, t: 0, fireT: rand(0.8, 2.2), flash: 0, holder, model, spin, ...o };
  if (e.elite) {
    e.hp *= ELITE.hp; e.r *= 1.35; e.score *= 5;
    if (e.hx) { e.hx *= 1.4; e.hy *= 1.4; }
    holder.scale.setScalar(1.4);
    e.aura = new THREE.Sprite(auraMat);
    e.aura.position.z = -1;
    holder.add(e.aura);
  }
  enemies.push(e);
  return e;
}

const WAVES = {
  line() {
    const x = rand(-(W - 5), W - 5), ph = rand(0, TAU);
    for (let i = 0; i < 5; i++) later(i * 0.4, () => spawnEnemy('scout', x, H + 2, { x0: x, ph, amp: 3 }));
  },
  vee() {
    const x = rand(-(W - 6), W - 6);
    for (let i = -2; i <= 2; i++) spawnEnemy('scout', x + i * 2.3, H + 2 + Math.abs(i) * 1.8, { x0: x + i * 2.3, ph: 0, amp: 0 });
  },
  fighters() {
    const n = 2 + Math.min(3, S.stage);
    for (let i = 0; i < n; i++) later(i * 0.5, () => spawnEnemy('fighter', rand(-(W - 3), W - 3), H + 2, { ph: rand(0, TAU) }));
  },
  kamis() {
    const n = 3 + Math.min(3, S.stage);
    for (let i = 0; i < n; i++) later(i * 0.55, () => spawnEnemy('kami', rand(-(W - 2), W - 2), H + 2, { a: -Math.PI / 2 }));
  },
  gunship() {
    spawnEnemy('gunship', rand(-(W - 5), W - 5), H + 4, { dir: Math.random() < 0.5 ? -1 : 1 });
  },
};
Object.assign(WAVES, {
  strafers() {
    const dir = Math.random() < 0.5 ? -1 : 1, n = 3 + Math.min(2, S.stage);
    for (let i = 0; i < n; i++) later(i * 0.45, () => spawnEnemy('strafer', -dir * (W + 3), H - 4 - i * 1.6, { dir }));
  },
  emines() {
    const n = 2 + Math.min(3, S.stage);
    for (let i = 0; i < n; i++) later(i * 0.7, () => spawnEnemy('emine', rand(-(W - 2), W - 2), H + 2));
  },
  mines() {
    const n = 4 + Math.min(3, S.stage);
    for (let i = 0; i < n; i++) later(i * 0.5, () => spawnEnemy('mine', rand(-(W - 2), W - 2), H + 2, { ph: rand(0, TAU) }));
  },
  bombers() {
    const n = 2 + (S.stage >= 3 ? 1 : 0), x = rand(-(W - 4), W - 4 - (n - 1) * 5);
    for (let i = 0; i < n; i++) spawnEnemy('bomber', x + i * 5, H + 3 + i * 2);
  },
  spinners() {
    for (const s of [-1, 1]) spawnEnemy('spinner', s * rand(3, W - 3), H + 2);
  },
  ace() {
    spawnEnemy('ace', rand(-(W - 4), W - 4), H + 2, { homeY: rand(H - 11, H - 6) });
  },
});
function spawnWave() {
  const t = S.stageT, late = S.stage > 0;
  if (t > 18 && !S.eliteDone) { S.eliteDone = true; spawnElite(); return; }
  if (t > 8 && Math.random() < 0.05 + 0.02 * S.stage && !enemies.some((e) => e.elite)) spawnElite();
  const gunships = enemies.filter((e) => e.type === 'gunship').length;
  const opts = [['line', 3], ['vee', 3]];
  if (t > 6 || late) opts.push(['fighters', 3]);
  if (t > 14 || late) opts.push(['kamis', 2]);
  if ((t > 26 || late) && gunships < 1 + Math.floor(S.stage / 2)) opts.push(['gunship', 1.3]);
  if (t > 10 || late) opts.push(['strafers', 2]);
  if (t > 18 || late) opts.push(['mines', 1.5]);
  if (t > 12 || late) opts.push(['emines', 1.5]);
  if (late) opts.push(['bombers', 2], ['spinners', 1.5]);
  if (S.stage >= 2 && enemies.filter((e) => e.type === 'ace').length < (S.stage >= 4 ? 2 : 1)) opts.push(['ace', 1.3]);
  let r = Math.random() * opts.reduce((s, o) => s + o[1], 0);
  for (const [name, w] of opts) { if ((r -= w) <= 0) { WAVES[name](); return; } }
}

let quiet = false; // true — масове знищення (бомба, смерть боса): без уламків мін
function quietly(fn) { quiet = true; try { fn(); } finally { quiet = false; } }
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  S.score += e.score;
  explode(e.x, e.y, e.r > 2 ? 2.2 : e.r > 1.5 ? 1.5 : 1);
  if (e.type === 'mine' && !quiet) {
    // міна розлітається уламками
    for (let i = 0; i < 8; i++) eShoot(e.x, e.y, i / 8 * TAU + 0.39, bulletSpeed() * 0.8);
  }
  S.kills++;
  dropStars(e.x, e.y, Math.ceil(DEF[e.type].stars * (e.elite ? 1.5 : 1)), e.elite ? 1 : 0);
}
function damageEnemy(e, d) {
  e.hp -= d;
  e.flash = 0.07;
  if (e.hp <= 0) killEnemy(e);
}

const ELITE = { hp: 4, speed: 1.3, fire: 1.3, shot: 20, ram: 40 };
function updateEnemies(dt0) {
  const sp = bulletSpeed();
  for (const e of enemies) {
    if (e.dead) continue;
    const dt = dt0 * (e.elite ? ELITE.speed : 1); // елітні рухаються швидше
    const dmg = shotDmg(e.elite);
    e.t += dt;
    e.fireT -= dt * (e.elite ? ELITE.fire : 1);
    if (e.aura) e.aura.scale.setScalar(7 + Math.sin(e.t * 6));
    let bank = 0;
    const canFire = e.y < H - 1 && e.y > P.y + 5 && !P.dead;
    if (e.type === 'scout') {
      e.y -= 12 * dt;
      e.x = e.x0 + Math.sin(e.t * 2.5 + e.ph) * e.amp;
      bank = Math.cos(e.t * 2.5 + e.ph) * e.amp * 0.2;
      if (e.fireT <= 0 && canFire) { e.fireT = rand(2.2, 3.5); eShoot(e.x, e.y - 1, aim(e.x, e.y), sp, 0, dmg); }
    } else if (e.type === 'fighter') {
      const vx = Math.sin(e.t * 1.6 + e.ph) * 9;
      e.y -= 8 * dt;
      e.x = clamp(e.x + vx * dt, -W + 1.5, W - 1.5);
      bank = vx * 0.07;
      if (e.fireT <= 0 && canFire) {
        e.fireT = rand(1.4, 2.2);
        const a = aim(e.x, e.y);
        eShoot(e.x - 0.6, e.y - 1, a, sp * 1.1, 0, dmg); eShoot(e.x + 0.6, e.y - 1, a, sp * 1.1, 0, dmg);
      }
    } else if (e.type === 'kami') {
      if (e.y > P.y - 2 && !P.dead) {
        let d = aim(e.x, e.y) - e.a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        e.a += clamp(d, -2.4 * dt, 2.4 * dt);
      }
      const v = Math.min(26, 9 + e.t * 6);
      e.x += Math.cos(e.a) * v * dt;
      e.y += Math.sin(e.a) * v * dt;
      e.holder.rotation.z = e.a - Math.PI / 2;
      if (Math.random() < 0.5) particle(e.x - Math.cos(e.a) * 1.3, e.y - Math.sin(e.a) * 1.3, 0, 0, 0, 0, 0.25, 1, 0.4, 0.1);
    } else if (e.type === 'gunship') {
      if (e.t > (e.elite ? 28 : 15)) e.y -= 6 * dt;
      else if (e.y > H - 7) e.y -= 5 * dt;
      else {
        e.x += e.dir * 4 * dt;
        if (Math.abs(e.x) > W - 4) e.dir = -Math.sign(e.x);
        bank = e.dir * 0.15;
      }
      if (e.fireT <= 0 && canFire) {
        e.fireT = Math.max(0.9, 1.7 - S.stage * 0.1);
        const a = aim(e.x, e.y - 1);
        for (let i = -1; i <= 1; i++) eShoot(e.x, e.y - 1.5, a + i * 0.22, sp, 0, dmg);
      }
    } else if (e.type === 'strafer') {
      // проноситься впоперек екрана, скидаючи кулі вниз
      e.x += e.dir * 15 * dt;
      e.y -= 1.5 * dt;
      e.holder.rotation.z = -e.dir * Math.PI / 2;
      bank = e.dir * 0.5;
      if (e.fireT <= 0 && Math.abs(e.x) < W - 1) { e.fireT = 0.38; eShoot(e.x, e.y, -Math.PI / 2, sp * 0.9, 0, dmg); }
      else if (Math.abs(e.x) >= W - 1) e.fireT = Math.min(e.fireT, 0.2);
    } else if (e.type === 'mine') {
      e.y -= 3.5 * dt;
      e.x += Math.sin(e.t * 1.2 + e.ph) * 1.5 * dt;
      e.holder.rotation.z += 1.5 * dt;
      if (!P.dead && Math.hypot(e.x - P.x, e.y - P.y) < 4.5) killEnemy(e);
    } else if (e.type === 'emine') {
      // електроміна: повільно підпливає до гравця; дотик = удар струмом
      e.y -= 4 * dt;
      if (!P.dead) e.x += clamp(P.x - e.x, -1, 1) * 2.5 * dt;
      e.holder.rotation.z -= 2.5 * dt;
      if (Math.random() < 0.35) {
        const a = rand(0, TAU);
        particle(e.x + Math.cos(a) * 1.4, e.y + Math.sin(a) * 1.4, 0.5, Math.cos(a) * 3, Math.sin(a) * 3, 0, 0.2, 0.4, 0.8, 1);
      }
      if (!P.dead && Math.hypot(e.x - P.x, e.y - P.y) < e.r + 1.5) {
        e.dead = true; // розряджається об літак — без нагороди
        ring(e.x, e.y, 7, 0.35, 0x66ccff);
        for (let i = 0; i < 14; i++) { const a = rand(0, TAU), v = rand(4, 14); particle(e.x, e.y, 0.5, Math.cos(a) * v, Math.sin(a) * v, 0, rand(0.2, 0.5), 0.4, 0.8, 1); }
        shockPlayer();
      }
    } else if (e.type === 'bomber') {
      e.y -= 5 * dt;
      if (e.fireT <= 0 && e.y < H - 1 && e.y > -H + 6) {
        e.fireT = Math.max(1.5, 2.4 - S.stage * 0.1);
        const off = rand(0, TAU);
        for (let i = 0; i < 8; i++) eShoot(e.x, e.y, off + i / 8 * TAU, sp * 0.7, 0, dmg);
      }
    } else if (e.type === 'spinner') {
      e.y -= 4 * dt;
      e.holder.rotation.z += 3 * dt;
      if (e.fireT <= 0 && e.y < H - 1 && e.y > -H + 6) {
        e.fireT = 0.26;
        const a = e.t * 1.9;
        eShoot(e.x, e.y, a, sp * 0.65, 1, dmg); eShoot(e.x, e.y, a + Math.PI, sp * 0.65, 1, dmg);
      }
    } else if (e.type === 'ace') {
      // ас: зависає згори, тримається над гравцем і б'є чергами
      if (e.t > (e.elite ? 22 : 11)) e.y -= 16 * dt;
      else if (e.y > e.homeY) e.y -= 10 * dt;
      else {
        const vx = clamp((P.x - e.x) * 2, -8, 8);
        e.x += vx * dt;
        bank = vx * 0.08;
        if (e.fireT <= 0 && !P.dead) {
          e.fireT = Math.max(1.0, 1.7 - S.stage * 0.08);
          for (let i = 0; i < 3; i++) later(i * 0.12, () => {
            if (e.dead) return;
            eShoot(e.x, e.y - 1.5, aim(e.x, e.y - 1.5), bulletSpeed() * 1.35, 0, dmg);
          });
        }
      }
    }
    e.flash -= dt;
    e.model.rotation.y = bank;
    e.model.scale.setScalar(e.flash > 0 ? 1.18 : 1);
    for (const s of e.spin) s.rotation.y += 30 * dt;
    e.holder.position.set(e.x, e.y, 0);
    if (e.y < -H - 5 || Math.abs(e.x) > W + 10) { e.dead = true; continue; }
    if (!e.dead && !P.dead && Math.hypot(e.x - P.x, e.y - P.y) < e.r + 0.9) {
      if (hurtPlayer((e.elite ? ELITE.ram : 25) * threatDmg())) damageEnemy(e, 12);
    }
  }
  sweep(enemies, freeEnemy);
}

export {
  aim, bulletSpeed, damageEnemy, eShoot, freeEnemy, killEnemy, quietly, spawnElite, spawnEnemy, spawnWave,
  updateEnemies, WAVES,
};
