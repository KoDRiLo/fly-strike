import * as THREE from 'three';
import { glowTexture, orbTexture } from './models.js';
import { sfx } from './audio.js';
import { rand, scene, TAU } from './core.js';
import { S } from './state.js';

// ───────────────────────── Частинки та кільця ─────────────────────────
const glowTex = glowTexture();
const PN = 1800;
const pPos = new Float32Array(PN * 3).fill(9999);
const pCol = new Float32Array(PN * 3);
const pVel = new Float32Array(PN * 3);
const pBase = new Float32Array(PN * 3);
const pLife = new Float32Array(PN), pMax = new Float32Array(PN);
let pNext = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pPoints = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 1.3, map: glowTex, vertexColors: true, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
pPoints.frustumCulled = false;
scene.add(pPoints);

function particle(x, y, z, vx, vy, vz, life, r, g, b) {
  const i = pNext; pNext = (pNext + 1) % PN;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pBase[i * 3] = r; pBase[i * 3 + 1] = g; pBase[i * 3 + 2] = b;
  pLife[i] = pMax[i] = life;
}
function updateParticles(dt) {
  const drag = Math.max(0, 1 - 2.2 * dt);
  for (let i = 0; i < PN; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    const j = i * 3;
    if (pLife[i] <= 0) { pCol[j] = pCol[j + 1] = pCol[j + 2] = 0; pPos[j + 2] = 9999; continue; }
    pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
    pVel[j] *= drag; pVel[j + 1] *= drag; pVel[j + 2] *= drag;
    const k = pLife[i] / pMax[i];
    pCol[j] = pBase[j] * k; pCol[j + 1] = pBase[j + 1] * k; pCol[j + 2] = pBase[j + 2] * k;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

// Пул: об'єкти не створюються заново, а ховаються й використовуються повторно.
class Pool {
  constructor(make) { this.make = make; this.free = []; }
  get() { const m = this.free.pop() || this.make(); m.visible = true; return m; }
  put(m) { m.visible = false; this.free.push(m); }
}

const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
const rings = [];
// у кожного кільця свій матеріал (колір і прозорість індивідуальні), але він живе разом із мешем у пулі
const ringPool = new Pool(() => {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(m);
  return m;
});
function ring(x, y, max, dur = 0.45, color = 0xffd9a0) {
  const m = ringPool.get();
  m.material.color.setHex(color);
  m.material.opacity = 1;
  m.scale.setScalar(0.3);
  m.position.set(x, y, 0.5);
  rings.push({ m, t: 0, dur, max });
}
function updateRings(dt) {
  for (const r of rings) {
    r.t += dt;
    const k = r.t / r.dur;
    r.m.scale.setScalar(0.3 + r.max * k);
    r.m.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) { r.dead = true; }
  }
  sweep(rings, (r) => ringPool.put(r.m));
}

function explode(x, y, size = 1) {
  const n = Math.floor(10 + size * 14);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(2, 7 + size * 6), c = Math.random();
    particle(x + rand(-.5, .5) * size, y + rand(-.5, .5) * size, rand(0, 1),
      Math.cos(a) * s, Math.sin(a) * s, rand(-2, 6), rand(0.3, 0.6 + size * 0.3),
      1, 0.35 + c * 0.6, c * c * 0.6);
  }
  ring(x, y, 2 + size * 3.5);
  S.shake = Math.max(S.shake, Math.min(1.6, size * 0.4));
  sfx.boom(size);
}
// Влучання критичної кулі: блакитне кільце й сніп іскор.
function critHit(x, y) {
  ring(x, y, 2.6, 0.25, CRIT_COLOR);
  for (let i = 0; i < 10; i++) {
    const a = rand(0, TAU), s = rand(6, 16);
    particle(x, y, 0.5, Math.cos(a) * s, Math.sin(a) * s, 0, rand(0.15, 0.35), 0.5, 1, 1);
  }
  sfx.crit();
}
function sparks(x, y, r = 1, g = 0.9, b = 0.5) {
  for (let i = 0; i < 3; i++) {
    const a = rand(0, TAU), s = rand(3, 9);
    particle(x, y, 0.5, Math.cos(a) * s, Math.sin(a) * s, 0, rand(0.1, 0.25), r, g, b);
  }
}

// ───────────────────────── Пули об'єктів ─────────────────────────
function spritePool(color, sx, sy) {
  const mat = new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false });
  const pool = new Pool(() => { const s = new THREE.Sprite(mat); s.scale.set(sx, sy, 1); scene.add(s); return s; });
  pool.mat = mat;
  return pool;
}
const pBulletPool = spritePool(0xffe37a, 0.8, 1.9);
const dBulletPool = spritePool(0xff9ac4, 0.6, 1.5);
// Критичний постріл: більша блакитно-біла куля — її видно ще в польоті.
const CRIT_COLOR = 0x7dfcff;
const critBulletPool = spritePool(CRIT_COLOR, 1.3, 2.9);
// Кулі ворогів: однотонний кружок із тонким темнішим обідком того ж кольору.
const eBulletPools = ['#d11f00', '#c2009a'].map((color) => {
  const mat = new THREE.SpriteMaterial({ map: orbTexture(color), depthWrite: false });
  return new Pool(() => { const sp = new THREE.Sprite(mat); scene.add(sp); return sp; });
});
const missileGeo = new THREE.ConeGeometry(0.22, 1.1, 6);
const missileMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const missilePool = new Pool(() => { const m = new THREE.Mesh(missileGeo, missileMat); scene.add(m); return m; });

function sweep(arr, onDead) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (o.dead) onDead(o); else arr[j++] = o;
  }
  arr.length = j;
}

export {
  critBulletPool, critHit, dBulletPool, eBulletPools, explode, glowTex, missilePool, particle, pBulletPool, Pool, ring, sparks, sweep,
  updateParticles, updateRings,
};
