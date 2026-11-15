import * as THREE from 'three';
import { bossHp } from './balance.js';
import { makeBoss } from './models.js';
import { music, sfx } from './audio.js';
import { clamp, H, rand, scene, TAU, W } from './core.js';
import { explode, particle, ring } from './fx.js';
import { eBullets, enemies, later, P, S, threatDmg } from './state.js';
import { screenFlash, showMsg, ui } from './hud.js';
import { aim, bulletSpeed, eShoot, killEnemy, quietly, spawnEnemy } from './enemies.js';
import { dropStars } from './pickups.js';
import { hurtPlayer } from './player.js';

// ───────────────────────── Боси ─────────────────────────
let boss = null;
function clearBoss() {
  if (boss) { scene.remove(boss.holder); boss = null; }
  ui.bossbar.classList.remove('on');
}
// У кожного боса власний набір атак: жодна атака не повторюється в іншого боса.
const BOSSES = [
  { name: 'БОМБАРДУВАЛЬНИК «ГРІМ»', model: 0, hp: 520, hx: 7.5, hy: 3.2, mv: 0.55, atks: ['fan', 'carpet', 'burst'] },
  { name: 'ПЕРЕХОПЛЮВАЧ «ШЕРШЕНЬ»', model: 3, hp: 850, hx: 4.6, hy: 4, mv: 1.3, atks: ['shotgun', 'beam', 'sting'] },
  { name: 'ЛІТАЮЧЕ КРИЛО «ТІНЬ»', model: 1, hp: 1000, hx: 7, hy: 3, mv: 0.8, atks: ['spiral', 'chevron', 'summon'] },
  { name: 'АВІАНОСЕЦЬ «ВУЛИК»', model: 4, hp: 1300, hx: 7.2, hy: 5, mv: 0.35, atks: ['squad', 'wall', 'mines'] },
  { name: 'ФОРТЕЦЯ «ТИТАН»', model: 2, hp: 1500, hx: 6.5, hy: 4.8, mv: 0.45, atks: ['ring', 'flak', 'vortex'] },
  { name: 'ТРИГЛАВ «ГІДРА»', model: 5, hp: 1800, hx: 8, hy: 3.8, mv: 0.6, atks: ['heads', 'cross', 'sweep', 'rain'] },
  { name: 'ДИРИЖАБЛЬ «ЛЕВІАФАН»', model: 6, hp: 2100, hx: 4.8, hy: 6.6, mv: 0.3, atks: ['cluster', 'scissors', 'fog'] },
  { name: 'НЕВИДИМКА «ПРИВИД»', model: 7, hp: 2400, hx: 7.6, hy: 3.2, mv: 1.0, atks: ['homing', 'flank', 'boomerang'] },
  { name: 'КРЕЙСЕР «МОЛОТ»', model: 8, hp: 2800, hx: 5.4, hy: 6.2, mv: 0.5, atks: ['petals', 'columns', 'arc'] },
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
  // «Грім»: килимове бомбування — бомби сходять по черзі вздовж усього розмаху крил
  carpet(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.15 / b.rage;
    eShoot(b.x + Math.sin(b.c++ * 0.55) * b.hx * 0.9, b.y - 1, -Math.PI / 2, bulletSpeed() * 0.65, 1);
  },
  // «Шершень»: жало — три дуже швидкі прицільні постріли з носа, потім пауза
  sting(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.08;
    if (b.c++ % (b.rage > 1 ? 8 : 10) >= 3) return;
    eShoot(b.x, b.y - 2, aim(b.x, b.y - 2), bulletSpeed() * 1.9, 0);
  },
  // «Тінь»: клин — кулі летять у гравця строєм «галочкою», краї відстають
  chevron(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 1.0 / b.rage;
    const a = aim(b.x, b.y - 2), n = 4 + b.loop, sp = bulletSpeed();
    for (let i = -n; i <= n; i++) eShoot(b.x, b.y - 2, a + i * 0.1, sp * (1.15 - Math.abs(i) * 0.09), 1);
  },
  // «Титан»: зенітний вогонь — залпи з випадкових точок корпусу з різною швидкістю
  flak(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.5 / b.rage;
    const x = b.x + rand(-b.hx, b.hx) * 0.7, sp = bulletSpeed();
    for (let i = 0; i < 6 + b.loop; i++) eShoot(x, b.y - 1, -Math.PI / 2 + rand(-1.1, 1.1), sp * rand(0.5, 1), 0);
  },
  // «Титан»: вихор — дві пари рукавів, що обертаються назустріч одна одній
  vortex(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.13 / b.rage;
    b.sa += 0.19;
    for (let k = 0; k < 2; k++) {
      eShoot(b.x, b.y, b.sa + k * Math.PI, bulletSpeed() * 0.75, 1);
      eShoot(b.x, b.y, -b.sa + k * Math.PI, bulletSpeed() * 0.75, 0);
    }
  },
  // «Гідра»: три голови по черзі б'ють прицільним тризубом
  heads(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.3 / b.rage;
    const x = b.x + (b.c++ % 3 - 1) * b.hx * 0.7, a = aim(x, b.y - 2);
    for (let i = -1; i <= 1; i++) eShoot(x, b.y - 2, a + i * 0.14, bulletSpeed() * 1.1, 0);
  },
  // «Гідра»: струмінь, що гойдається з боку в бік, як маятник
  sweep(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.075 / b.rage;
    const a = Math.sin(b.c++ * 0.11) * 1.05;
    eShoot(b.x, b.y - 1, -Math.PI / 2 + a, bulletSpeed() * 1.2, 1);
    if (b.loop > 0) eShoot(b.x, b.y - 1, -Math.PI / 2 - a, bulletSpeed() * 1.2, 1);
  },
  // «Гідра»: дощ — кулі падають згори по всій ширині поля
  rain(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.11 / b.rage;
    eShoot(rand(-W + 1, W - 1), H + 1, -Math.PI / 2 + rand(-0.12, 0.12), bulletSpeed() * rand(0.55, 0.9), 1);
  },
  // «Левіафан»: касетна бомба — велика повільна куля, що за мить розлітається кільцем уламків
  cluster(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 1.3 / b.rage;
    const shell = eShoot(b.x + rand(-b.hx, b.hx) * 0.5, b.y - 2, aim(b.x, b.y - 2) + rand(-0.3, 0.3), bulletSpeed() * 0.55, 0);
    shell.m.scale.setScalar(2.6);
    const n = 10 + 2 * b.loop, off = rand(0, TAU);
    later(1.1, () => {
      if (shell.dead) return;
      shell.dead = true;
      ring(shell.x, shell.y, 4, 0.3, 0xff8a5c);
      for (let i = 0; i < n; i++) eShoot(shell.x, shell.y, off + i / n * TAU, bulletSpeed() * 0.7, 1);
    });
  },
  // «Левіафан»: ножиці — два струмені з бортів сходяться й розходяться
  scissors(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.1 / b.rage;
    const open = 0.15 + (0.5 + 0.5 * Math.sin(b.c++ * 0.09)) * 0.75;
    for (const s of [-1, 1]) eShoot(b.x + s * b.hx * 0.8, b.y - 1, -Math.PI / 2 - s * open, bulletSpeed() * 1.05, 0);
  },
  // «Левіафан»: туман — дуже повільні кулі, що надовго зависають у полі
  fog(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.22 / b.rage;
    eShoot(b.x + rand(-b.hx, b.hx) * 0.6, b.y - 1, -Math.PI / 2 + rand(-1.3, 1.3), bulletSpeed() * rand(0.28, 0.42), 1);
  },
  // «Привид»: самонавідні сфери — великі повільні кулі, що якийсь час довертають на гравця
  homing(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 1.4 / b.rage;
    for (const s of [-1, 1]) {
      const o = eShoot(b.x + s * b.hx * 0.6, b.y - 1, -Math.PI / 2 + s * 0.5, bulletSpeed() * 0.6, 1);
      o.home = 2.6 + 0.4 * b.loop;
      o.m.scale.setScalar(1.9);
    }
  },
  // «Привид»: лещата — кулі заходять з боків екрана трохи вище й нижче гравця
  flank(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.4 / b.rage;
    const side = b.c++ % 2 ? 1 : -1, off = rand(2, 5) * (Math.random() < 0.5 ? -1 : 1);
    eShoot(side * (W + 1), clamp(P.y + off, -H + 1, H - 6), side > 0 ? Math.PI : 0, bulletSpeed() * 0.75, 0);
  },
  // «Привид»: бумеранг — кулі летять до низу екрана, гальмують і повертаються назад
  boomerang(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.85 / b.rage;
    for (let i = -1; i <= 1; i++) {
      const x = b.x + i * b.hx * 0.5, o = eShoot(x, b.y - 1, -Math.PI / 2, 30, 1);
      o.vx = clamp((P.x - x) / 1.9, -7, 7) + i * 2;
      o.ay = 16;
    }
  },
  // «Молот»: квітка — кільце, у якому швидкість куль змінюється хвилею, тож воно розкривається пелюстками
  petals(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 1.5 / b.rage;
    const n = 30 + 2 * b.loop, off = rand(0, TAU);
    for (let i = 0; i < n; i++) {
      const th = i / n * TAU;
      eShoot(b.x, b.y, th + off, bulletSpeed() * (0.5 + 0.28 * Math.cos(5 * th)), 1);
    }
  },
  // «Молот»: колони — вертикальні смуги вогню, що раз на кілька залпів зсуваються
  columns(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.3 / b.rage;
    const shift = Math.floor(b.c++ / 6) % 2 * 2.2;
    for (let x = -W + 1.2 + shift; x < W; x += 4.4) eShoot(x, b.y - 1, -Math.PI / 2, bulletSpeed() * 0.8, 0);
  },
  // «Молот»: серп — два крила куль обабіч гравця; безпечно лишатися на місці
  arc(b, dt) {
    if ((b.a1 -= dt) > 0) return;
    b.a1 = 0.9 / b.rage;
    const a = aim(b.x, b.y - 1);
    for (let i = 3; i <= 9 + b.loop; i++) for (const s of [-1, 1]) eShoot(b.x, b.y - 1, a + s * i * 0.16, bulletSpeed() * 0.95, 0);
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
  const hp = bossHp(def.hp, loop, S.playT);
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
    quietly(() => { for (const e of enemies) killEnemy(e); });
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
    if (!P.dead && Math.abs(P.x - b.x) < b.hx * 0.8 && Math.abs(P.y - b.y) < b.hy) hurtPlayer(30 * threatDmg());
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

export {
  ATK, boss, BOSSES, clearBoss, damageBoss, spawnBoss, updateBoss,
};
