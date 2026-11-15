import * as THREE from 'three';
import { sfx } from './audio.js';
import { H, rand, scene, TAU } from './core.js';
import { glowTex, particle, sparks } from './fx.js';
import { enemies, P, S } from './state.js';
import { damageEnemy } from './enemies.js';
import { boss, damageBoss } from './bosses.js';
import { hitTest } from './bullets.js';

// ───────────────────────── Додаткова зброя (відкривається перками) ─────────────────────────
const additive = (color) => ({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const hit = (t, dmg) => (t === boss ? damageBoss(dmg) : damageEnemy(t, dmg));
// усі цілі на екрані: живі вороги та бос у бою
function targets() {
  const out = enemies.filter((e) => !e.dead && e.y <= H + 1);
  if (boss && boss.state === 'fight') out.push(boss);
  return out;
}

// Лазер: раз на кілька секунд промінь пробиває всіх ворогів у стовпі перед літаком.
// Перки змінюють множники гравця: laserDmg (шкода), laserTime (тривалість), laserCd (перезарядка).
const LASER = { every: 3, time: 0.4, tick: 0.1, dmg: 2, half: 0.7 };
const beamGeo = new THREE.PlaneGeometry(1, 1);
const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial(additive(0x7dff5a)));
const beamCore = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial(additive(0xffffff)));
beam.visible = beamCore.visible = false;
scene.add(beam, beamCore);
function updateLaser(dt, on) {
  const firing = on && P.laser > 0 && P.laserOn > 0;
  beam.visible = beamCore.visible = firing;
  if (!on || !P.laser) return;
  if (!firing) {
    if ((P.laserT -= dt) <= 0) { P.laserT = LASER.every * P.laserCd; P.laserOn = LASER.time * P.laserTime; P.laserTick = 0; sfx.laser(); }
    return;
  }
  P.laserOn -= dt;
  if ((P.laserTick -= dt) <= 0) {
    P.laserTick = LASER.tick;
    for (const t of targets()) {
      if (t.y < P.y || Math.abs(t.x - P.x) > (t.hx || t.r) + LASER.half) continue;
      sparks(P.x, t.y - (t.hy || t.r), 0.5, 1, 0.4);
      hit(t, LASER.dmg * P.laserDmg);
    }
  }
  const y0 = P.y + 1.6, len = H + 2 - y0, w = 1.5 + Math.sin(S.time * 60) * 0.25;
  beam.position.set(P.x, y0 + len / 2, 0.3);
  beam.scale.set(w, len, 1);
  beamCore.position.set(P.x, y0 + len / 2, 0.35);
  beamCore.scale.set(w * 0.35, len, 1);
}

// Ланцюгова блискавка: б'є найближчого ворога й перестрибує на сусідніх.
// Перки: chainDmg (шкода = 4 × рівень), chainJumps (додаткові цілі), chainCd (перезарядка).
const CHAIN = { every: 1.6, dmg: 4, first: 60, reach: 10, show: 0.12, max: 7, seg: 4 };
const chainPos = new Float32Array(CHAIN.max * CHAIN.seg * 6);
const chainGeo = new THREE.BufferGeometry();
chainGeo.setAttribute('position', new THREE.BufferAttribute(chainPos, 3));
const chainMesh = new THREE.LineSegments(chainGeo, new THREE.LineBasicMaterial(additive(0xd9b8ff)));
chainMesh.frustumCulled = false;
chainMesh.visible = false;
scene.add(chainMesh);
let chainShow = 0;
function fireChain() {
  const pool = targets();
  let fx = P.x, fy = P.y, k = 0, links = 0;
  for (let i = 0; i < Math.min(CHAIN.max, 1 + P.chainJumps); i++) {
    let best = -1, bd = (i ? CHAIN.reach : CHAIN.first) ** 2;
    for (let j = 0; j < pool.length; j++) {
      const d = (pool[j].x - fx) ** 2 + (pool[j].y - fy) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    if (best < 0) break;
    const t = pool.splice(best, 1)[0], tx = t.x, ty = t.y;
    // ламана від попередньої точки до цілі
    let x = fx, y = fy;
    for (let s = 1; s <= CHAIN.seg; s++) {
      const f = s / CHAIN.seg, j = s < CHAIN.seg ? 0.9 : 0;
      const nx = fx + (tx - fx) * f + rand(-j, j), ny = fy + (ty - fy) * f + rand(-j, j);
      chainPos.set([x, y, 0.6, nx, ny, 0.6], k); k += 6;
      x = nx; y = ny;
    }
    for (let s = 0; s < 5; s++) particle(tx, ty, 0.5, rand(-8, 8), rand(-8, 8), 0, rand(0.1, 0.3), 0.8, 0.6, 1);
    hit(t, CHAIN.dmg * P.chainDmg);
    fx = tx; fy = ty; links++;
  }
  if (!links) return false;
  chainPos.fill(0, k);
  chainGeo.attributes.position.needsUpdate = true;
  chainShow = CHAIN.show;
  sfx.chain();
  return true;
}
function updateChain(dt, on) {
  chainMesh.visible = on && (chainShow -= dt) > 0;
  if (!on || !P.chain) return;
  if ((P.chainT -= dt) <= 0) P.chainT = fireChain() ? CHAIN.every * P.chainCd : 0.2;   // немає цілей — скоро спробуємо знову
}

// Вогняні сфери: кружляють навколо літака й палять ворогів, яких торкаються.
// Перки: orbs (кількість, без ліміту), orbR (множник радіуса), orbDmg (шкода за дотик).
const ORB = { r: 3.4, speed: 2.6, gap: 0.3 };
const orbMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff7a2f, blending: THREE.AdditiveBlending, depthWrite: false });
const orbs = [];
function updateOrbs(dt, on) {
  while (orbs.length < P.orbs) {   // сфер може бути скільки завгодно — спрайти створюються за потреби
    const s = new THREE.Sprite(orbMat);
    s.scale.setScalar(1.9);
    scene.add(s);
    orbs.push(s);
  }
  const r = ORB.r * P.orbR;
  orbs.forEach((s, i) => {
    s.visible = on && i < P.orbs;
    if (!s.visible) return;
    const a = S.time * ORB.speed + i * TAU / P.orbs;
    const x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
    s.position.set(x, y, 0.4);
    if (Math.random() < 0.5) particle(x, y, 0.3, rand(-1, 1), rand(-1, 1), 0, 0.25, 1, 0.45, 0.1);
    const t = hitTest(x, y, 0.7);
    if (t && !(t.orbT > S.time)) {   // одна ціль отримує шкоду від сфер не частіше, ніж раз на ORB.gap
      t.orbT = S.time + ORB.gap;
      sparks(x, y, 1, 0.5, 0.2);
      hit(t, P.orbDmg);
    }
  });
}

function updateWeapons(dt) {
  const on = !P.dead;
  updateLaser(dt, on);
  updateChain(dt, on);
  updateOrbs(dt, on);
}

export {
  updateWeapons,
};
