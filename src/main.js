import * as THREE from 'three';
import { setHeroColors, makePlayer, makeDrone, makeEnemy, makeBoss, glowTexture, orbTexture, makeStar } from './models.js';
import { createWorld } from './world.js';
import { initAudio, setVolume, sfx, music, audioPause } from './audio.js';

// ───────────────────────── Сцена ─────────────────────────
const H = 22;            // пів-висоти ігрового поля (світові одиниці)
let W = 14;              // пів-ширини, залежить від пропорцій вікна
const FOV = 35;
const CAM_D = H / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (id) => document.getElementById(id);

const gameEl = $('game');
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
camera.position.set(0, 0, CAM_D);

scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6a8a, 1.6));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(-25, 30, 50);
scene.add(sun);

function resize() {
  const w = gameEl.clientWidth, h = gameEl.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  W = H * w / h;
}
window.addEventListener('resize', resize);
resize();

// ───────────────────────── Ландшафт ─────────────────────────
const world = createWorld(scene);

// Серпанок над землею: приглушує ландшафт, щоб літаки, кулі й зірки читались чіткіше.
const haze = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ color: 0xd4e4f2, transparent: true, opacity: 0.26, depthWrite: false }));
haze.position.z = -18.5;
haze.renderOrder = -1;
scene.add(haze);

function updateBackground(dt) {
  world.update(dt);
}

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

const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
const rings = [];
function ring(x, y, max, dur = 0.45, color = 0xffd9a0) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.position.set(x, y, 0.5);
  scene.add(m);
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
  sweep(rings, (r) => { scene.remove(r.m); r.m.material.dispose(); });
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
function sparks(x, y, r = 1, g = 0.9, b = 0.5) {
  for (let i = 0; i < 3; i++) {
    const a = rand(0, TAU), s = rand(3, 9);
    particle(x, y, 0.5, Math.cos(a) * s, Math.sin(a) * s, 0, rand(0.1, 0.25), r, g, b);
  }
}

// ───────────────────────── Пули об'єктів ─────────────────────────
class Pool {
  constructor(make) { this.make = make; this.free = []; }
  get() { const m = this.free.pop() || this.make(); m.visible = true; return m; }
  put(m) { m.visible = false; this.free.push(m); }
}
function spritePool(color, sx, sy) {
  const mat = new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false });
  const pool = new Pool(() => { const s = new THREE.Sprite(mat); s.scale.set(sx, sy, 1); scene.add(s); return s; });
  pool.mat = mat;
  return pool;
}
const pBulletPool = spritePool(0xffe37a, 0.8, 1.9);
const dBulletPool = spritePool(0xff9ac4, 0.6, 1.5);
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

// ───────────────────────── Стан гри ─────────────────────────
const STAGE_LEN = 45;
let hi = 0;
try { hi = +localStorage.getItem('skystorm_hi') || 0; } catch {}

const S = { mode: 'menu', score: 0, stage: 0, stageT: 0, waveT: 0, phase: 'waves', phaseT: 0, shake: 0, time: 0, playT: 0, kills: 0, eliteDone: false };
// Усі характеристики літака; змінюються лише перками.
const freshPlayer = () => ({
  x: 0, y: -H + 6, vx: 0, hp: 100, maxHp: 100, lives: 0, inv: 2, dead: false, respawnT: 0,
  gun: 1, missiles: 0, drones: 0, bombs: 0, maxBombs: 0, shock: 0, shockT: 0, shield: 0, shieldMax: 0, shieldT: 0,
  dmg: 1, misDmg: 1, droneDmg: 1, droneGuns: 1, rate: 1, spd: 1, pierce: 0, bounce: 0, crit: 0, magnet: 7, regen: 0, luck: 0, xpMul: 1,
  xp: 0, level: 0, perks: {}, fireT: 0, misT: 0, droneT: 0, misSide: 1,
});
const P = freshPlayer();
// Складність росте з часом забігу: множник міцності ворогів.
// Щохвилини вороги стають трохи сильнішими: +35% міцності та +8% шкоди за рівень загрози.
const threat = () => Math.floor(S.playT / 60);
const diff = () => 1 + 0.35 * threat();
const threatDmg = () => 1 + 0.08 * threat();
const xpNeed = () => 12 + 8 * P.level;
const enemies = [], pBullets = [], eBullets = [], missiles = [], pickups = [], queue = [];
let boss = null;

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

const later = (delay, fn) => queue.push({ t: S.playT + delay, fn });

// ───────────────────────── HUD ─────────────────────────
const ui = { score: $('score'), hi: $('hi'), stage: $('stage'), hp: $('hp'), lives: $('lives'), weap: $('weap'), xp: $('xp'), bombs: $('bombs'), msg: $('msg'), bossbar: $('bossbar'), bossname: $('bossname'), bosshp: $('bosshp'), flash: $('flash') };
let msgTimer = 0;
function showMsg(text, dur = 2, cls = '') {
  ui.msg.textContent = text;
  ui.msg.className = 'on ' + cls;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (ui.msg.className = cls), dur * 1000);
}
let hudCache = '';
function updateHud() {
  const key = [S.score, S.stage, Math.ceil(P.hp), P.maxHp, P.lives, P.shield, P.bombs, P.level, Math.floor(P.xp * 4), threat(), P.shock > 0].join();
  if (key !== hudCache) {
    hudCache = key;
    ui.score.textContent = S.score.toLocaleString('uk');
    ui.hi.textContent = 'рекорд ' + Math.max(hi, S.score).toLocaleString('uk');
    ui.stage.textContent = 'ЕТАП ' + (S.stage + 1);
    ui.hp.style.width = Math.max(0, P.hp / P.maxHp * 100) + '%';
    ui.lives.textContent = '✈'.repeat(Math.max(0, P.lives));
    ui.xp.style.width = Math.min(100, P.xp / xpNeed() * 100) + '%';
    ui.weap.textContent = `Рівень ${P.level + 1} · Загроза ${threat() + 1}` + (P.shieldMax ? ` · Щит ${P.shield}/${P.shieldMax}` : '');
    ui.bombs.textContent = P.bombs;
    $('bombBtn').style.display = P.maxBombs ? '' : 'none'; // бомби з'являються лише з перком
    ui.hp.classList.toggle('shock', P.shock > 0);
  }
  if (boss) ui.bosshp.style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
}
function screenFlash(strength = 0.8) {
  ui.flash.style.transition = 'none';
  ui.flash.style.opacity = strength;
  requestAnimationFrame(() => {
    ui.flash.style.transition = 'opacity .6s';
    ui.flash.style.opacity = 0;
  });
}

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

let shotDmg = 12; // шкода кулі поточного стрільця (елітні б'ють сильніше)
function eShoot(x, y, ang, speed, kind = 0) {
  const pool = eBulletPools[kind];
  const m = pool.get();
  m.scale.setScalar(shotDmg > 12 * threatDmg() ? 1.8 : 1.2);
  eBullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: shotDmg, m, pool });
}

const auraMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc21a, blending: THREE.AdditiveBlending, depthWrite: false });
function spawnElite() {
  const types = S.stage === 0 ? ['gunship', 'bomber'] : ['gunship', 'bomber', 'spinner', 'ace', 'fighter'];
  const type = types[Math.floor(Math.random() * types.length)];
  spawnEnemy(type, rand(-(W - 5), W - 5), H + 4, { elite: true, dir: Math.random() < 0.5 ? -1 : 1, ph: rand(0, TAU), homeY: rand(H - 11, H - 7) });
  showMsg('ЕЛІТНИЙ ВОРОГ!', 1.6, 'sm');
  sfx.elite();
}
function spawnEnemy(type, x, y, o = {}) {
  const d = DEF[type];
  const holder = new THREE.Group(), model = makeEnemy(type);
  holder.add(model);
  holder.rotation.z = Math.PI;
  holder.position.set(x, y, 0);
  scene.add(holder);
  const e = { type, x, y, hp: Math.ceil(d.hp * diff()), r: d.r, hx: d.hx, hy: d.hy, score: d.score, t: 0, fireT: rand(0.8, 2.2), flash: 0, holder, model, spin: [], ...o };
  model.traverse((c) => { if (c.name === 'spin') e.spin.push(c); });
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
    shotDmg = (e.elite ? ELITE.shot : 12) * threatDmg();
    e.t += dt;
    e.fireT -= dt * (e.elite ? ELITE.fire : 1);
    if (e.aura) e.aura.scale.setScalar(7 + Math.sin(e.t * 6));
    let bank = 0;
    const canFire = e.y < H - 1 && e.y > P.y + 5 && !P.dead;
    if (e.type === 'scout') {
      e.y -= 12 * dt;
      e.x = e.x0 + Math.sin(e.t * 2.5 + e.ph) * e.amp;
      bank = Math.cos(e.t * 2.5 + e.ph) * e.amp * 0.2;
      if (e.fireT <= 0 && canFire) { e.fireT = rand(2.2, 3.5); eShoot(e.x, e.y - 1, aim(e.x, e.y), sp); }
    } else if (e.type === 'fighter') {
      const vx = Math.sin(e.t * 1.6 + e.ph) * 9;
      e.y -= 8 * dt;
      e.x = clamp(e.x + vx * dt, -W + 1.5, W - 1.5);
      bank = vx * 0.07;
      if (e.fireT <= 0 && canFire) {
        e.fireT = rand(1.4, 2.2);
        const a = aim(e.x, e.y);
        eShoot(e.x - 0.6, e.y - 1, a, sp * 1.1); eShoot(e.x + 0.6, e.y - 1, a, sp * 1.1);
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
        for (let i = -1; i <= 1; i++) eShoot(e.x, e.y - 1.5, a + i * 0.22, sp);
      }
    } else if (e.type === 'strafer') {
      // проноситься впоперек екрана, скидаючи кулі вниз
      e.x += e.dir * 15 * dt;
      e.y -= 1.5 * dt;
      e.holder.rotation.z = -e.dir * Math.PI / 2;
      bank = e.dir * 0.5;
      if (e.fireT <= 0 && Math.abs(e.x) < W - 1) { e.fireT = 0.38; eShoot(e.x, e.y, -Math.PI / 2, sp * 0.9); }
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
        for (let i = 0; i < 8; i++) eShoot(e.x, e.y, off + i / 8 * TAU, sp * 0.7);
      }
    } else if (e.type === 'spinner') {
      e.y -= 4 * dt;
      e.holder.rotation.z += 3 * dt;
      if (e.fireT <= 0 && e.y < H - 1 && e.y > -H + 6) {
        e.fireT = 0.26;
        const a = e.t * 1.9;
        eShoot(e.x, e.y, a, sp * 0.65, 1); eShoot(e.x, e.y, a + Math.PI, sp * 0.65, 1);
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
            shotDmg = (e.elite ? ELITE.shot : 12) * threatDmg();
            eShoot(e.x, e.y - 1.5, aim(e.x, e.y - 1.5), bulletSpeed() * 1.35);
            shotDmg = 12 * threatDmg();
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
  shotDmg = 12 * threatDmg();
  sweep(enemies, (e) => scene.remove(e.holder));
}

// ───────────────────────── Боси ─────────────────────────
const BOSSES = [
  { name: 'БОМБАРДУВАЛЬНИК «ГРІМ»', model: 0, hp: 520, hx: 7.5, hy: 3.2, mv: 0.55, atks: ['fan', 'burst'] },
  { name: 'ПЕРЕХОПЛЮВАЧ «ШЕРШЕНЬ»', model: 3, hp: 850, hx: 4.6, hy: 4, mv: 1.3, atks: ['shotgun', 'beam', 'fan'] },
  { name: 'ЛІТАЮЧЕ КРИЛО «ТІНЬ»', model: 1, hp: 1000, hx: 7, hy: 3, mv: 0.8, atks: ['spiral', 'fan', 'summon', 'burst'] },
  { name: 'АВІАНОСЕЦЬ «ВУЛИК»', model: 4, hp: 1300, hx: 7.2, hy: 5, mv: 0.35, atks: ['squad', 'ring', 'mines', 'wall', 'summon'] },
  { name: 'ФОРТЕЦЯ «ТИТАН»', model: 2, hp: 1500, hx: 6.5, hy: 4.8, mv: 0.45, atks: ['ring', 'burst', 'spiral', 'summon', 'fan'] },
  { name: 'ТРИГЛАВ «ГІДРА»', model: 5, hp: 1800, hx: 8, hy: 3.8, mv: 0.6, atks: ['cross', 'shotgun', 'wall', 'spiral', 'mines', 'beam'] },
];
const ATK = {
  fan(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.8 / b.rage;
    const a = aim(b.x, b.y - 2), n = 5 + 2 * b.loop, sp = bulletSpeed();
    for (let i = 0; i < n; i++) eShoot(b.x, b.y - 2, a + (i - (n - 1) / 2) * 0.17, sp, 1);
  },
  burst(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.13;
    if (b.c++ % 11 >= 6) return;
    for (const s of [-1, 1]) {
      const gx = b.x + s * b.hx * 0.6;
      eShoot(gx, b.y - 1, aim(gx, b.y - 1), bulletSpeed() * 1.45, 0);
    }
  },
  spiral(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.1 / b.rage;
    b.sa += 0.21;
    for (let k = 0; k < 3; k++) eShoot(b.x, b.y, b.sa + k * TAU / 3, bulletSpeed() * 0.8, 1);
  },
  ring(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 1.2 / b.rage;
    const n = 20 + 2 * b.loop, off = Math.random();
    for (let i = 0; i < n; i++) eShoot(b.x, b.y, (i + off) / n * TAU, bulletSpeed() * 0.75, 1);
  },
  // стіна куль з проходом
  wall(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 1.6 / b.rage;
    const gap = rand(-(W - 3), W - 3);
    for (let x = -W + 0.8; x < W; x += 1.5) if (Math.abs(x - gap) > 2.7) eShoot(x, b.y - 1, -Math.PI / 2, bulletSpeed() * 0.7, 1);
  },
  // дріб у бік гравця
  shotgun(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.95 / b.rage;
    const a = aim(b.x, b.y - 2);
    for (let i = 0; i < 9 + 2 * b.loop; i++) eShoot(b.x, b.y - 2, a + rand(-0.38, 0.38), bulletSpeed() * rand(0.8, 1.4), 0);
  },
  // дві швидкі черги прямо вниз із крил — безпечно між ними
  beam(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.07;
    if (b.c++ % 20 >= 13) return;
    for (const s of [-1, 1]) eShoot(b.x + s * b.hx * 0.75, b.y - 1, -Math.PI / 2, bulletSpeed() * 2.1, 0);
  },
  // повільний хрест, що обертається
  cross(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.15 / b.rage;
    b.sa += 0.085;
    for (let k = 0; k < 4; k++) eShoot(b.x, b.y, b.sa + k * TAU / 4, bulletSpeed() * 0.7, 1);
  },
  mines(b) {
    if (b.sum) return;
    b.sum = true;
    for (let i = 0; i < 4; i++) later(i * 0.3, () => boss && spawnEnemy('mine', clamp(boss.x + rand(-7, 7), -W + 2, W - 2), boss.y - 2, { ph: rand(0, TAU) }));
  },
  squad(b) {
    if (b.sum) return;
    b.sum = true;
    for (let i = 0; i < 3; i++) later(i * 0.4, () => boss && spawnEnemy('fighter', clamp(boss.x + (i - 1) * 4, -W + 2, W - 2), boss.y - 2, { ph: rand(0, TAU) }));
  },
  summon(b) {
    if (b.sum) return;
    b.sum = true;
    for (let i = 0; i < 3; i++) later(i * 0.45, () => boss && spawnEnemy('kami', boss.x + rand(-4, 4), boss.y, { a: -Math.PI / 2 }));
  },
};

function spawnBoss() {
  const loop = Math.floor(S.stage / BOSSES.length), def = BOSSES[S.stage % BOSSES.length], kind = def.model;
  const scale = Math.min(1, (W - 0.5) / 9);
  const holder = new THREE.Group(), model = makeBoss(kind);
  holder.add(model);
  holder.rotation.z = Math.PI;
  holder.scale.setScalar(scale);
  scene.add(holder);
  const mats = new Set(), spin = [];
  model.traverse((c) => {
    if (c.name === 'spin') spin.push(c);
    if (c.material?.emissive) { c.material.userData.e0 = c.material.emissive.getHex(); mats.add(c.material); }
  });
  const hp = Math.round(def.hp * (1 + 0.6 * loop) * (1 + S.playT / 400));
  boss = { def, loop, x: 0, y: H + 10, homeY: H - 8, hp, maxHp: hp, hx: def.hx * scale, hy: def.hy * scale, t: 0, state: 'enter', atk: -1, atkT: 1, resting: true, a1: 0, c: 0, sa: 0, sum: false, rage: 1, flash: 0, dieT: 0, holder, model, mats, spin };
  ui.bossname.textContent = def.name;
  ui.bossbar.classList.add('on');
}

function damageBoss(d) {
  const b = boss;
  if (!b || b.state !== 'fight') return;
  b.hp -= d;
  b.flash = 0.06;
  if (b.hp <= 0) {
    b.state = 'dying';
    b.dieT = 2.6;
    for (const o of eBullets) o.dead = true;
    quiet = true;
    for (const e of enemies) killEnemy(e);
    quiet = false;
  }
}

function updateBoss(dt) {
  const b = boss;
  if (!b) return;
  b.t += dt;
  const px = b.x;
  if (b.state === 'enter') {
    b.y -= 7 * dt;
    if (b.y <= b.homeY) { b.y = b.homeY; b.state = 'fight'; b.t = 0; }
  } else if (b.state === 'fight') {
    b.x = Math.sin(b.t * b.def.mv) * Math.max(0, W - b.hx - 0.5);
    b.y = b.homeY + Math.sin(b.t * 1.1) * 1.5;
    b.rage = b.hp < b.maxHp * 0.4 ? 1.4 : 1;
    if ((b.atkT -= dt) <= 0) {
      if (b.resting) {
        b.resting = false;
        b.atk = (b.atk + 1) % b.def.atks.length;
        b.atkT = ['summon', 'mines', 'squad'].includes(b.def.atks[b.atk]) ? 1.5 : 4.5;
        b.a1 = 0.3; b.c = 0; b.sum = false;
      } else { b.resting = true; b.atkT = 1.1 / b.rage; }
    }
    if (!b.resting && !P.dead) ATK[b.def.atks[b.atk]](b, dt);
    if (!P.dead && Math.abs(P.x - b.x) < b.hx * 0.8 && Math.abs(P.y - b.y) < b.hy) hurtPlayer(30);
    if (b.rage > 1 && Math.random() < 0.3) particle(b.x + rand(-b.hx, b.hx) * 0.6, b.y + rand(-1, 1), 1, 0, 6, 0, 0.5, 1, 0.4, 0.1);
  } else {
    b.dieT -= dt;
    b.y -= 1.2 * dt;
    b.holder.rotation.y += 0.25 * dt;
    if (Math.random() < dt * 9) explode(b.x + rand(-b.hx, b.hx), b.y + rand(-b.hy, b.hy), rand(0.7, 1.5));
    if (b.dieT <= 0) {
      for (let i = 0; i < 6; i++) explode(b.x + rand(-b.hx, b.hx) * 0.7, b.y + rand(-b.hy, b.hy) * 0.7, 2.5);
      ring(b.x, b.y, 40, 0.9);
      screenFlash(0.7);
      S.score += 5000 * (S.stage + 1);
      dropStars(b.x, b.y, 12, 1.5);
      music.mode('stage');
      scene.remove(b.holder);
      boss = null;
      ui.bossbar.classList.remove('on');
      P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.5);
      P.bombs = Math.min(P.maxBombs, P.bombs + 1);
      S.phase = 'clear'; S.phaseT = 4.5;
      showMsg('ЕТАП ПРОЙДЕНО!', 3);
      sfx.clear();
      return;
    }
  }
  b.flash -= dt;
  for (const m of b.mats) m.emissive.setHex(b.flash > 0 ? 0x777777 : m.userData.e0);
  for (const s of b.spin) s.rotation.y += 30 * dt;
  b.model.rotation.y = clamp((b.x - px) / Math.max(dt, 1e-4) * 0.03, -0.4, 0.4);
  b.holder.position.set(b.x, b.y, 0);
}

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

function rollRarity(boost) {
  const k = 1 + P.luck * 0.6 + boost, r = Math.random();
  if (r < 0.012 * k) return 3;
  if (r < 0.07 * k) return 2;
  if (r < 0.27 * Math.min(k, 2.5)) return 1;
  return 0;
}
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

// ───────────────────────── Гравець ─────────────────────────
const input = { keys: new Set(), tx: 0, ty: 0, useTarget: false, touch: null };

function hurtPlayer(dmg) {
  if (P.inv > 0 || P.dead) return false;
  if (P.shield > 0) {
    if (P.shield-- === P.shieldMax) P.shieldT = 12;
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

function pShoot(x, y, vx, vy, dmg = P.dmg, pool = pBulletPool) {
  pBullets.push({ x, y, vx, vy, dmg: dmg * (Math.random() < P.crit ? 3 : 1), pierce: P.pierce, bounce: P.bounce, hit: null, m: pool.get(), pool });
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
  quiet = true;
  for (const e of enemies) if (e.y < H + 1) damageEnemy(e, 40);
  damageBoss(60);
  quiet = false;
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
    P.x += kx / n * 27 * P.spd * dt; P.y += ky / n * 27 * P.spd * dt;
  } else if (input.useTarget) {
    const f = Math.min(1, 16 * P.spd * dt);
    P.x += (input.tx - P.x) * f; P.y += (input.ty - P.y) * f;
  }
  P.x = clamp(P.x, -W + 1.5, W - 1.5);
  P.y = clamp(P.y, -H + 2, H - 3);
  const vx = (P.x - ox) / Math.max(dt, 1e-4);
  P.vx += (vx - P.vx) * Math.min(1, 10 * dt);
  P.inv -= dt;
  if (P.regen) P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);
  if (P.shield < P.shieldMax && (P.shieldT -= dt) <= 0) { P.shield++; P.shieldT = 12; ring(P.x, P.y, 4, 0.3, 0x4fd8ff); }

  if ((P.fireT -= dt) <= 0) {
    P.fireT = (P.gun >= 4 ? 0.1 : 0.12) / P.rate;
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
  if (fireDrones) P.droneT = 0.24 / P.rate;
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

// ───────────────────────── Етапи ─────────────────────────
function updateStage(dt) {
  if (S.phase === 'waves') {
    S.stageT += dt;
    if ((S.waveT -= dt) <= 0 && S.stageT < STAGE_LEN) {
      spawnWave();
      S.waveT = Math.max(1.5, 3.2 - 0.25 * S.stage);
    }
    if (S.stageT > STAGE_LEN + 3) {
      S.phase = 'warn'; S.phaseT = 3.2;
      showMsg('УВАГА! БОС', 3, 'warn');
      music.mode('boss');
      sfx.warn();
    }
  } else if (S.phase === 'warn') {
    if ((S.phaseT -= dt) <= 0) { S.phase = 'boss'; spawnBoss(); }
  } else if (S.phase === 'clear') {
    if ((S.phaseT -= dt) <= 0 && !P.dead) {
      S.phase = 'reward';
      pickQueue.push({ title: 'НАГОРОДА ЗА БОСА', then: () => startStage(S.stage + 1) });
    }
  }
}
function startStage(n) {
  S.stage = n; S.stageT = 0; S.waveT = 2.5; S.phase = 'waves'; S.eliteDone = false;
  world.setBiome(n, n === 0);
  showMsg('ЕТАП ' + (n + 1) + ' · ' + world.name(n), 2.5);
}

// ───────────────────────── Роглайк-перки ─────────────────────────
// Єдине джерело покращень: нові рівні (зірки) та боси.
const CATS = { atk: 'АТАКА', def: 'ЗАХИСТ', util: 'ПІДТРИМКА' };
const PERKS = [
  { id: 'gun', cat: 'atk', icon: '🔫', name: 'Гармата', desc: '+1 ствол: більше куль за постріл', max: 4, apply() { P.gun++; } },
  { id: 'dmg', cat: 'atk', icon: '💥', name: 'Бронебійні набої', desc: '+25% шкоди куль гармати', max: 99, apply() { P.dmg += 0.25; } },
  { id: 'rate', cat: 'atk', icon: '⚡', name: 'Скорострільність', desc: '+15% темпу вогню', max: 5, apply() { P.rate += 0.15; } },
  { id: 'mis', cat: 'atk', icon: '🎯', name: 'Ракети: залп', desc: '+1 самонавідна ракета в залпі', max: 99, apply() { P.missiles++; } },
  { id: 'misdmg', cat: 'atk', icon: '🧨', name: 'Ракети: боєголовка', desc: '+25% шкоди ракет', max: 99, ok: () => P.missiles > 0, apply() { P.misDmg += 0.25; } },
  { id: 'drone', cat: 'atk', icon: '🛸', name: 'Дрон', desc: '+1 дрон-супутник, що стріляє поруч', max: 4, apply() { P.drones++; } },
  { id: 'dronedmg', cat: 'atk', icon: '🔋', name: 'Дрони: потужність', desc: '+25% шкоди куль дронів', max: 99, ok: () => P.drones > 0, apply() { P.droneDmg += 0.25; } },
  { id: 'dronegun', cat: 'atk', icon: '🛰️', name: 'Дрони: друга гармата', desc: '+1 ствол кожному дрону', max: 3, w: 0.25, rare: true, ok: () => P.drones > 0, apply() { P.droneGuns++; } },
  { id: 'pierce', cat: 'atk', icon: '🗡️', name: 'Пробивні снаряди', desc: 'Кулі пробивають ще одного ворога', max: 3, apply() { P.pierce++; } },
  { id: 'bounce', cat: 'atk', icon: '↩️', name: 'Рикошет', desc: 'Кулі ще раз відбиваються від країв екрана', max: 3, apply() { P.bounce++; } },
  { id: 'crit', cat: 'atk', icon: '☠️', name: 'Критичний удар', desc: '+10% шансу завдати потрійної шкоди', max: 4, apply() { P.crit += 0.1; } },
  { id: 'hp', cat: 'def', icon: '❤️', name: 'Броня', desc: '+25 до макс. міцності та повний ремонт', max: 6, apply() { P.maxHp += 25; P.hp = P.maxHp; } },
  { id: 'repair', cat: 'def', icon: '🩹', name: 'Ремонт', desc: 'Миттєво відновлює 60% міцності', max: 99, w: 1.5, ok: () => P.hp < P.maxHp * 0.6, apply() { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.6); } },
  { id: 'shield', cat: 'def', icon: '🛡️', name: 'Енергощит', desc: '+1 заряд щита; заряд відновлюється за 12 с', max: 3, apply() { P.shieldMax++; P.shield = P.shieldMax; } },
  { id: 'regen', cat: 'def', icon: '🔧', name: 'Ремонтні боти', desc: 'Відновлення +1 міцності за секунду', max: 3, apply() { P.regen++; } },
  { id: 'life', cat: 'def', icon: '✈️', name: 'Запасний літак', desc: '+1 життя: після загибелі літак повертається в бій', max: 99, w: 0.2, rare: true, apply() { P.lives++; } },
  { id: 'bomb', cat: 'util', icon: '💣', name: 'Бомбовий відсік', desc: '+1 до запасу бомб і повне поповнення', max: 4, apply() { P.maxBombs++; P.bombs = P.maxBombs; } },
  { id: 'spd', cat: 'util', icon: '🚀', name: 'Форсаж', desc: '+15% швидкості літака', max: 4, apply() { P.spd += 0.15; } },
  { id: 'magnet', cat: 'util', icon: '🧲', name: 'Магніт', desc: 'Зірки притягуються з більшої відстані', max: 3, apply() { P.magnet += 5; } },
  { id: 'luck', cat: 'util', icon: '🍀', name: 'Удача', desc: 'Частіше випадають рідкісні зірки', max: 3, apply() { P.luck++; } },
  { id: 'xp', cat: 'util', icon: '📘', name: 'Навчання', desc: '+20% досвіду із зірок', max: 3, apply() { P.xpMul += 0.2; } },
];
const pickQueue = [];
let pickChoices = [], pickThen = null, pickAt = 0;
function openPick() {
  const req = pickQueue.shift();
  const pool = PERKS.filter((p) => (P.perks[p.id] || 0) < p.max && (!p.ok || p.ok()));
  pickChoices = [];
  while (pickChoices.length < 3 && pool.length) {
    let r = Math.random() * pool.reduce((a, p) => a + (p.w || 1), 0), i = 0;
    while ((r -= pool[i].w || 1) > 0) i++;
    pickChoices.push(pool.splice(i, 1)[0]);
  }
  if (!pickChoices.length) { req.then?.(); return; }
  pickThen = req.then;
  $('pickTitle').textContent = req.title;
  $('cards').innerHTML = pickChoices.map((p, i) => {
    const lvl = P.perks[p.id] || 0;
    const pips = p.max > 20 ? '' : '●'.repeat(lvl) + '◉' + '○'.repeat(p.max - lvl - 1);
    return `<button class="card ${p.cat}${p.rare ? ' rare' : ''}" data-i="${i}"><em>${p.rare ? 'РІДКІСНИЙ' : CATS[p.cat]}</em><span class="ico">${p.icon}</span><b>${p.name}</b>` +
      `<span class="desc">${p.desc}</span><span class="pips">${pips}</span><kbd>${i + 1}</kbd></button>`;
  }).join('');
  S.mode = 'pick';
  pickAt = performance.now();
  input.keys.clear();
  $('pick').classList.remove('hidden');
}
function choosePerk(i) {
  const p = pickChoices[i];
  if (S.mode !== 'pick' || !p || performance.now() < pickAt + 350) return; // захист від випадкового кліку
  P.perks[p.id] = (P.perks[p.id] || 0) + 1;
  p.apply();
  sfx.power();
  $('pick').classList.add('hidden');
  S.mode = 'play';
  P.inv = Math.max(P.inv, 1);
  last = performance.now();
  const then = pickThen;
  pickThen = null;
  then?.();
  if (pickQueue.length) openPick();
}

// Довідка: список усіх перків, згенерований з PERKS.
$('infoList').innerHTML = Object.keys(CATS).map((cat) =>
  `<h3 class="${cat}">${CATS[cat]}</h3>` + PERKS.filter((p) => p.cat === cat).map((p) =>
    `<div class="row ${cat}${p.rare ? ' rare' : ''}"><span class="ico">${p.icon}</span><div><b>${p.name}</b>${p.rare ? '<em>рідкісний</em>' : ''}<br>${p.desc}</div>` +
    `<small>${p.max > 20 ? 'без ліміту' : 'до ' + p.max}</small></div>`).join('')).join('');
const toggleInfo = (show) => $('info').classList.toggle('hidden', !show);
$('infoBtn').addEventListener('click', () => toggleInfo(true));
$('infoBtn2').addEventListener('click', () => toggleInfo(true));
$('infoBack').addEventListener('click', () => toggleInfo(false));

// ───────────────────────── Налаштування звуку ─────────────────────────
const cfg = { mus: 70, sfx: 80, musOn: true, sfxOn: true, color: 0 };
// Кольори, що не трапляються в ландшафтах (без синього, зеленого, пісочного, сірого).
const COLORS = [
  [0xff7a00, 'помаранчевий'], [0xff1f7a, 'малиновий'], [0xe6252a, 'червоний'], [0x9b3dff, 'фіолетовий'],
  [0xff3df0, 'фуксія'], [0x00e0d0, 'бірюзовий'], [0xffe000, 'жовтий'], [0xa6ff00, 'лаймовий'],
];
$('heroCol').innerHTML = COLORS.map(([c, name], i) => `<button class="sw" data-i="${i}" title="${name}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('');
$('heroCol').addEventListener('click', (e) => { if (e.target.dataset.i) { cfg.color = +e.target.dataset.i; applyCfg(); } });

// Прев'ю в налаштуваннях: окремий маленький рендерер з тим самим літаком і дронами.
const preview = (() => {
  const r = new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setSize(300, 190, false);
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 300 / 190, 0.1, 100);
  cam.position.set(0, -7, 15);
  cam.lookAt(0, 0.2, 0);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x4a6a8a, 1.6));
  const l = new THREE.DirectionalLight(0xfff2dd, 2.2);
  l.position.set(-5, 6, 10);
  sc.add(l);
  const plane = makePlayer(), flame = plane.getObjectByName('flame');
  sc.add(plane);
  const ds = [-1, 1].map((side) => { const d = makeDrone(); d.position.set(side * 3.3, -1.2, 0); sc.add(d); return d; });
  return (t) => {
    plane.rotation.y = Math.sin(t * 1.3) * 0.45;
    plane.position.y = Math.sin(t * 0.9) * 0.25;
    flame.scale.y = rand(0.7, 1.3);
    ds.forEach((d, i) => { d.position.y = -1.2 + Math.sin(t * 1.1 + 1 + i) * 0.25; d.rotation.y = Math.sin(t * 1.3 - 0.4) * 0.3; });
    r.render(sc, cam);
  };
})();
function applyCfg() {
  setVolume('music', cfg.musOn ? cfg.mus / 100 : 0);
  setVolume('sfx', cfg.sfxOn ? cfg.sfx / 100 : 0);
  if (!COLORS[cfg.color]) cfg.color = 0;
  const [hex, name] = COLORS[cfg.color];
  setHeroColors(hex, hex);
  dBulletPool.mat.color.setHex(hex).lerp(new THREE.Color(0xffffff), 0.45);
  for (const b of $('heroCol').children) b.classList.toggle('on', +b.dataset.i === cfg.color);
  $('colName').textContent = name;
  $('musOn').checked = cfg.musOn; $('sfxOn').checked = cfg.sfxOn;
  $('musVol').value = cfg.mus; $('sfxVol').value = cfg.sfx;
  $('musVol').disabled = !cfg.musOn; $('sfxVol').disabled = !cfg.sfxOn;
  $('musVal').textContent = cfg.musOn ? cfg.mus + '%' : 'вимк.';
  $('sfxVal').textContent = cfg.sfxOn ? cfg.sfx + '%' : 'вимк.';
  try { localStorage.setItem('skystorm_cfg', JSON.stringify(cfg)); } catch {}
}
$('musOn').addEventListener('change', (e) => { cfg.musOn = e.target.checked; applyCfg(); });
$('sfxOn').addEventListener('change', (e) => { cfg.sfxOn = e.target.checked; applyCfg(); if (cfg.sfxOn) sfx.power(); });
$('musVol').addEventListener('input', (e) => { cfg.mus = +e.target.value; applyCfg(); });
$('sfxVol').addEventListener('input', (e) => { cfg.sfx = +e.target.value; applyCfg(); });
$('sfxVol').addEventListener('change', () => sfx.power()); // проба гучності
const toggleSettings = (show) => {
  $('settings').classList.toggle('hidden', !show);
  if (show) { initAudio(); music.preview(S.mode === 'menu' || S.mode === 'over'); } else if (S.mode === 'menu' || S.mode === 'over') music.stop();
  if (!show && S.mode === 'pause') audioPause(true);
};
$('setBtn').addEventListener('click', () => toggleSettings(true));
$('setBtn2').addEventListener('click', () => toggleSettings(true));
$('setBack').addEventListener('click', () => toggleSettings(false));
applyCfg();

function clearAll() {
  for (const e of enemies) scene.remove(e.holder);
  for (const b of pBullets) b.pool.put(b.m);
  for (const b of eBullets) b.pool.put(b.m);
  for (const m of missiles) missilePool.put(m.m);
  for (const p of pickups) p.pool.put(p.m);
  enemies.length = pBullets.length = eBullets.length = missiles.length = pickups.length = queue.length = pickQueue.length = 0;
  if (boss) { scene.remove(boss.holder); boss = null; }
  ui.bossbar.classList.remove('on');
}

function startGame() {
  initAudio();
  clearAll();
  Object.assign(S, { mode: 'play', score: 0, shake: 0, kills: 0, playT: 0 });
  Object.assign(P, freshPlayer());
  shotDmg = 12;
  for (const d of drones) d.m.visible = false;
  music.start('stage');
  input.useTarget = false;
  playerHolder.visible = true;
  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('pick').classList.add('hidden');
  toggleInfo(false);
  $('settings').classList.add('hidden');
  $('hud').classList.remove('hidden');
  startStage(0);
}
function gameOver() {
  S.mode = 'over';
  music.stop();
  const record = S.score > hi;
  if (record) { hi = S.score; try { localStorage.setItem('skystorm_hi', hi); } catch {} }
  $('final').innerHTML = `Рахунок: <b>${S.score.toLocaleString('uk')}</b><br>Етап: ${S.stage + 1} · Рівень: ${P.level + 1}` + (record ? '<br>🏆 Новий рекорд!' : `<br>Рекорд: ${hi.toLocaleString('uk')}`);
  $('over').classList.remove('hidden');
}
function togglePause() {
  if (S.mode === 'play') { S.mode = 'pause'; $('pause').classList.remove('hidden'); audioPause(true); }
  else if (S.mode === 'pause') { S.mode = 'play'; $('pause').classList.add('hidden'); audioPause(false); }
}

// ───────────────────────── Керування ─────────────────────────
window.addEventListener('pointerdown', initAudio);
window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  input.keys.add(e.code);
  if (e.code === 'Space' || e.code === 'KeyB') {
    if (S.mode === 'play') useBomb();
  }
  if (e.code === 'Enter' && (S.mode === 'menu' || S.mode === 'over')) startGame();
  if (e.code === 'Escape' && !$('info').classList.contains('hidden')) { toggleInfo(false); return; }
  if (e.code === 'Escape' && !$('settings').classList.contains('hidden')) { toggleSettings(false); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (S.mode === 'pick' && /^(Digit|Numpad)[123]$/.test(e.code)) choosePerk(+e.code.slice(-1) - 1);
  if (e.code === 'KeyM') {
    const on = !(cfg.musOn || cfg.sfxOn);
    cfg.musOn = cfg.sfxOn = on;
    applyCfg();
    showMsg(on ? 'ЗВУК УВІМК.' : 'ЗВУК ВИМК.', 0.8, 'sm');
  }
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
window.addEventListener('blur', () => { input.keys.clear(); if (S.mode === 'play') togglePause(); });

function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width * 2 - 1) * W, -((e.clientY - r.top) / r.height * 2 - 1) * H];
}
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') { if (e.button === 2) useBomb(); return; }
  input.touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
  if (!input.useTarget) { input.tx = P.x; input.ty = P.y; }
  input.useTarget = true;
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    [input.tx, input.ty] = toWorld(e);
    input.useTarget = true;
  } else if (input.touch && input.touch.id === e.pointerId) {
    // Відносне перетягування: палець не закриває літак.
    const k = 2 * W / canvas.clientWidth * 1.25;
    input.tx = clamp(input.tx + (e.clientX - input.touch.x) * k, -W, W);
    input.ty = clamp(input.ty - (e.clientY - input.touch.y) * k, -H, H);
    input.touch.x = e.clientX; input.touch.y = e.clientY;
  }
});
const endTouch = (e) => { if (input.touch && input.touch.id === e.pointerId) input.touch = null; };
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
$('bombBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); useBomb(); });
$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', togglePause);
$('cards').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) choosePerk(+c.dataset.i); });

// ───────────────────────── Головний цикл ─────────────────────────
playerHolder.position.set(P.x, P.y, 0);
shieldMesh.visible = false;
ui.hi.textContent = 'рекорд ' + hi;

let last = performance.now();
const fpsEl = $('fps');
let fpsN = 0, fpsT = last;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsN++;
  if (!$('settings').classList.contains('hidden')) preview(now / 1000);
  if (now - fpsT >= 500) { fpsEl.textContent = Math.round(fpsN * 1000 / (now - fpsT)) + ' FPS'; fpsN = 0; fpsT = now; }
  if (S.mode === 'pause') return;

  S.time += dt;
  updateBackground(dt);
  if (S.mode === 'play') {
    const th = threat();
    S.playT += dt;
    if (threat() > th) { shotDmg = 12 * threatDmg(); showMsg('ЗАГРОЗА ЗРОСЛА · ' + (threat() + 1), 1.8, 'sm'); sfx.elite(); }
    for (let i = 0, n = queue.length; i < n; i++) {
      const q = queue[i];
      if (q.t <= S.playT) { q.dead = true; q.fn(); }
    }
    sweep(queue, () => {});
    updateStage(dt);
    updatePlayer(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateHud();
    if (pickQueue.length && !P.dead && S.mode === 'play') openPick();
  } else if (S.mode === 'menu') {
    playerHolder.position.set(Math.sin(S.time * 0.8) * 4, -6 + Math.sin(S.time * 1.3), 0);
    playerModel.rotation.y = Math.cos(S.time * 0.8) * 0.4;
    playerFlame.scale.y = rand(0.7, 1.3);
  }
  updateParticles(dt);
  updateRings(dt);

  S.shake = Math.max(0, S.shake - dt * 3);
  camera.position.x = rand(-1, 1) * S.shake;
  camera.position.y = rand(-1, 1) * S.shake;
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Для налагодження з консолі
window.__game = { S, P, enemies, pickups, pickQueue, hurtPlayer, shockPlayer, spawnEnemy, spawnElite, WAVES, dropStars, gainXp, choosePerk, get boss() { return boss; }, spawnBoss, startStage, world };
