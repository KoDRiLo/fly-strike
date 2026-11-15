// Ландшафти: земля складається з трьох «плиток», що прокручуються вниз.
// Кожна плитка — це ОДНА злита геометрія з кольорами у вершинах (плюс одна для
// світних деталей), тож навіть сотні дерев чи будинків коштують два draw call.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;
const shade = (hex, k) => {
  const r = Math.min(255, ((hex >> 16) & 255) * k), g = Math.min(255, ((hex >> 8) & 255) * k), b = Math.min(255, (hex & 255) * k);
  return (r << 16) | (g << 8) | b;
};

export const CW = 34;          // пів-ширини плитки
export const CH = 40;          // висота плитки
export const GROUND_Z = -40;
const W2 = CW * 2;
const SCROLL = 7;

// ───────────── Базові фігури (позиції без індексів, вісь висоти — Z, основа на z = 0) ─────────────
const prep = (g) => (g.index ? g.toNonIndexed() : g).attributes.position.array;
const up = (g) => g.rotateX(Math.PI / 2).translate(0, 0, 0.5);
const cache = {};
const G = {
  box: prep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)),
  quad: prep(new THREE.PlaneGeometry(1, 1)),
  ico: prep(new THREE.IcosahedronGeometry(1, 0)),
  pyr: prep(up(new THREE.ConeGeometry(Math.SQRT1_2 * 1.0, 1, 4)).rotateZ(Math.PI / 4)), // квадратна основа 1×1
  cone: (n) => (cache['c' + n] ||= prep(up(new THREE.ConeGeometry(1, 1, n)))),
  frustum: (n, top) => (cache['f' + n + top] ||= prep(up(new THREE.CylinderGeometry(top, 1, 1, n)))),
  disc: (n) => (cache['d' + n] ||= prep(new THREE.CircleGeometry(1, n))),
};

const C = new THREE.Color();
class Builder {
  constructor(row = 0, clip = false) {
    this.row = row;
    this.clip = clip;
    this.pos = [[], []];   // 0 — освітлені, 1 — світні
    this.col = [[], []];
    this.movers = [];
    this.used = [];
  }
  add(arr, hex, x, y, z, sx, sy, sz, rot = 0, glow = 0, jit = 0) {
    C.setHex(hex);
    if (jit) C.offsetHSL(0, 0, rand(-jit, jit));
    const p = this.pos[glow], c = this.col[glow], cs = Math.cos(rot), sn = Math.sin(rot);
    for (let i = 0; i < arr.length; i += 3) {
      const px = arr[i] * sx, py = arr[i + 1] * sy;
      let wy = y + px * sn + py * cs;
      if (this.clip && wy < -CH / 2) wy = -CH / 2;   // нічого не звисає на сусідній біом
      p.push(x + px * cs - py * sn, wy, z + arr[i + 2] * sz);
      c.push(C.r, C.g, C.b);
    }
  }
  quad(hex, x, y, z, w, d, rot, glow, jit) { this.add(G.quad, hex, x, y, z, w, d, 1, rot, glow, jit); }
  box(hex, x, y, z, w, d, h, rot, glow, jit) { this.add(G.box, hex, x, y, z, w, d, h, rot, glow, jit); }
  pyr(hex, x, y, z, w, d, h, rot, glow, jit) { this.add(G.pyr, hex, x, y, z, w, d, h, rot, glow, jit); }
  ico(hex, x, y, z, sx, sy, sz, rot, glow, jit) { this.add(G.ico, hex, x, y, z, sx, sy, sz, rot, glow, jit); }
  disc(n, hex, x, y, z, r, glow, jit) { this.add(G.disc(n), hex, x, y, z, r, r, 1, rand(0, TAU), glow, jit); }
  cone(n, hex, x, y, z, r, h, glow, jit) { this.add(G.cone(n), hex, x, y, z, r, r, h, rand(0, TAU), glow, jit); }
  frustum(n, top, hex, x, y, z, r, h, glow, jit) { this.add(G.frustum(n, top), hex, x, y, z, r, r, h, rand(0, TAU), glow, jit); }
  // вільне місце радіуса r (щоб великі об'єкти не налазили один на одного)
  spot(r, tries = 14) {
    for (let i = 0; i < tries; i++) {
      const x = rand(-CW + r + 1, CW - r - 1), y = rand(-CH / 2 + r + 0.5, CH / 2 - r - 0.5);
      if (this.free(x, y, r)) { this.used.push([x, y, r]); return [x, y]; }
    }
    return null;
  }
  free(x, y, r) { return this.used.every(([ux, uy, ur]) => (ux - x) ** 2 + (uy - y) ** 2 > (ur + r) ** 2); }
  mover(geo, x, y, z, rot, vx, vy) { this.movers.push({ geo, x, y, z, rot, vx, vy }); }
}

function toGeo(pos, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  return g;
}
const geoFrom = (fn) => { const b = new Builder(); fn(b); return toGeo(b.pos[0], b.col[0]); };

// ───────────── Рухомі дрібниці ─────────────
const carGeo = [0xd43a3a, 0xf2f2f2, 0xf2c230, 0x2f6fd0, 0x1d1f24, 0xb9c0c8, 0x3aa56a].map((c) => geoFrom((b) => {
  b.box(c, 0, 0, 0.12, 2.5, 1.25, 0.5);
  b.box(0x1b2733, -0.15, 0, 0.62, 1.3, 1.05, 0.42);
}));
const busGeo = geoFrom((b) => { b.box(0xf0a020, 0, 0, 0.12, 4.4, 1.4, 1.0); b.box(0x1b2733, 0, 0, 1.12, 4.0, 1.2, 0.08); });
const boatGeo = geoFrom((b) => {
  b.box(0xf4f4f0, 0, 0, 0.05, 3.2, 1.2, 0.5);
  b.pyr(0xf4f4f0, 2.0, 0, 0.05, 1.3, 1.2, 0.5, Math.PI / 4);
  b.box(0x2f6fd0, -0.4, 0, 0.55, 1.2, 0.8, 0.5);
  b.quad(0xbfe6ff, -2.6, 0, 0.03, 2.2, 0.8);
});
const tractorGeo = geoFrom((b) => {
  b.box(0x2f9e44, 0, 0, 0.3, 2.0, 1.1, 0.7);
  b.box(0x1b2733, -0.4, 0, 1.0, 0.9, 0.9, 0.6);
  b.box(0x8a6a45, -2.2, 0, 0.1, 2.0, 1.8, 0.25);
});

// ───────────── Спільні «цеглинки» ─────────────
function palm(b, x, y, s = 1) {
  const h = 2.6 * s;
  b.frustum(5, 0.7, 0x8a6a45, x, y, 0, 0.22 * s, h);
  const n = 6, a0 = rand(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + i / n * TAU, len = rand(1.6, 2.2) * s;
    b.box(0x3f9a3c, x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2, h - 0.05, len, 0.5 * s, 0.1, a, 0, 0.06);
  }
  b.ico(0x2f7d33, x, y, h + 0.1, 0.4 * s, 0.4 * s, 0.3 * s);
}
function conifer(b, x, y, s = 1, snow = false) {
  b.cone(7, 0x1f5a2e, x, y, 0, 1.35 * s, 2.3 * s, 0, 0.05);
  b.cone(7, snow ? 0xf4f9fc : 0x2f7a3d, x, y, 1.4 * s, 0.95 * s, 2.0 * s, 0, snow ? 0 : 0.05);
}
function leafy(b, x, y, s = 1, hex = 0x4a9a3f) {
  b.ico(hex, x, y, 1.3 * s, 1.5 * s, 1.5 * s, 1.1 * s, rand(0, TAU), 0, 0.07);
  b.ico(hex, x + rand(-0.6, 0.6) * s, y + rand(-0.6, 0.6) * s, 2.0 * s, 0.9 * s, 0.9 * s, 0.7 * s, rand(0, TAU), 0, 0.07);
}
function rock(b, x, y, s, hex) {
  b.ico(hex, x, y, 0.15 * s, s, s * rand(0.6, 0.9), s * rand(0.4, 0.7), rand(0, TAU), 0, 0.06);
}
function house(b, x, y, w, d, h, wall, roof, rot = 0) {
  b.box(wall, x, y, 0.05, w, d, h, rot);
  b.pyr(roof, x, y, h + 0.05, w * 1.15, d * 1.15, h * 0.7, rot);
}
// Неперервна звивиста лінія (річка / потік лави) через усі плитки одного біому.
const snakeX = (yg) => Math.sin(yg * 0.045) * 15 + Math.sin(yg * 0.11 + 1) * 5;

// ───────────── Біоми ─────────────
const BIOMES = [
  {
    name: 'ОКЕАН', ground: 0x1c6fb0,
    build(b) {
      b.quad(0x1c6fb0, 0, 0, 0, W2, CH + 0.2);
      for (let i = 0; i < 8; i++) b.disc(9, 0x175f9c, rand(-CW, CW), rand(-18, 18), 0.03, rand(4, 9));
      for (let i = 0; i < 50; i++) b.quad(0x9fd0f2, rand(-CW, CW), rand(-19, 19), 0.07, rand(0.9, 2.2), 0.22);
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const r = rand(4, 8), s = b.spot(r * 1.4);
        if (!s) continue;
        const [x, y] = s;
        b.disc(10, 0x3aa0d8, x, y, 0.05, r * 1.45);
        b.frustum(8, 0.85, 0xe6d394, x, y, 0, r, 0.7);
        b.frustum(8, 0.7, 0x4fa34d, x, y, 0.7, r * 0.72, 1.6, 0, 0.04);
        if (chance(0.5)) b.cone(6, 0x37803a, x + rand(-1, 1), y + rand(-1, 1), 2.2, r * 0.35, rand(2.5, 5));
        const palms = 2 + Math.floor(r / 2);
        for (let k = 0; k < palms; k++) {
          const a = rand(0, TAU), d = r * rand(0.55, 0.85);
          palm(b, x + Math.cos(a) * d, y + Math.sin(a) * d, rand(0.8, 1.1));
        }
        if (chance(0.35)) house(b, x - r * 0.3, y + r * 0.2, 1.8, 1.6, 1.2, 0xc9a26a, 0xb8923f, rand(0, 3));
        for (let k = 0; k < 3; k++) { const a = rand(0, TAU); rock(b, x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15, rand(0.5, 1.1), 0x7d8790); }
      }
      for (let i = 0; i < 2; i++) {
        const dir = chance(0.5) ? 1 : -1;
        if (chance(0.7)) b.mover(boatGeo, rand(-CW, CW), rand(-17, 17), 0.1, dir > 0 ? 0 : Math.PI, dir * rand(1.5, 3), 0);
      }
    },
  },
  {
    name: 'ЛІС', ground: 0x356f37,
    build(b) {
      b.quad(0x356f37, 0, 0, 0, W2, CH + 0.2);
      for (let i = 0; i < 12; i++) b.disc(8, pick([0x2e6331, 0x3f7d3c, 0x4a8a42]), rand(-CW, CW), rand(-18, 18), 0.03, rand(4, 9));
      const y0 = b.row * CH;
      for (let y = -20; y <= 20; y += 1.3) b.disc(8, 0x8a7a4f, snakeX(y0 + y), y, 0.06, 3.7);
      for (let y = -20; y <= 20; y += 1.3) b.disc(8, 0x2f7fc4, snakeX(y0 + y), y, 0.1, 2.7);
      const nearRiver = (x, y, d) => Math.abs(x - snakeX(y0 + y)) < d;
      if (chance(0.5)) {
        const s = b.spot(6);
        if (s && !nearRiver(s[0], s[1], 9)) {
          b.disc(9, 0x79b356, s[0], s[1], 0.05, 6);
          house(b, s[0], s[1], 3, 2.4, 1.6, 0x8a5a3a, 0x5a3a2a, rand(0, 3));
          b.box(0x6b4a2f, s[0] + 3, s[1] - 1.5, 0.05, 1.4, 0.5, 0.5, rand(0, 3));
        } else if (s) b.used.pop();
      }
      for (let i = 0; i < 150; i++) {
        const x = rand(-CW, CW), y = rand(-19.5, 19.5);
        if (nearRiver(x, y, 4.6) || !b.free(x, y, 1)) continue;
        const t = Math.random(), s = rand(0.8, 1.35);
        if (t < 0.5) conifer(b, x, y, s);
        else if (t < 0.88) leafy(b, x, y, s, pick([0x4a9a3f, 0x3f8a36, 0x5fae4a, 0x6fb84f]));
        else leafy(b, x, y, s, pick([0xd9a23a, 0xc9632e, 0xb8433a]));
      }
      for (let i = 0; i < 8; i++) { const x = rand(-CW, CW), y = rand(-19, 19); if (nearRiver(x, y, 4.2) && !nearRiver(x, y, 2.4)) rock(b, x, y, rand(0.5, 1), 0x8d9296); }
    },
  },
  {
    name: 'ПУСТЕЛЯ', ground: 0xdcb872,
    build(b) {
      b.quad(0xdcb872, 0, 0, 0, W2, CH + 0.2);
      for (let i = 0; i < 18; i++) b.ico(0xe8cb8c, rand(-CW, CW), rand(-18, 18), 0, rand(6, 12), rand(1.8, 3.4), rand(0.8, 1.4), rand(0.1, 0.7), 0, 0.04);
      if (chance(0.4)) {
        const s = b.spot(9);
        if (s) {
          const k = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < k; i++) { const w = rand(5, 9) - i * 1.2; b.pyr(0xcfa85e, s[0] + (i - (k - 1) / 2) * 6.5, s[1] + rand(-2, 2), 0, w, w, w * 0.7, 0, 0, 0.03); }
        }
      }
      if (chance(0.6)) {
        const s = b.spot(7);
        if (s) {
          b.disc(9, 0x7fae52, s[0], s[1], 0.06, 5.8);
          b.disc(9, 0x2f8fc9, s[0], s[1], 0.1, 3);
          for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + rand(-0.3, 0.3), d = rand(3.6, 5.2); palm(b, s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d, rand(0.9, 1.25)); }
          if (chance(0.5)) house(b, s[0] + 6.5, s[1] + 1, 2.2, 2.2, 1.3, 0xe9dcc0, 0xc9b48a, rand(0, 3));
        }
      }
      for (let i = 0; i < 5; i++) { const s = b.spot(2); if (s) palm(b, s[0], s[1], rand(0.8, 1.1)); }
      for (let i = 0; i < 16; i++) {
        const s = b.spot(1.2);
        if (!s) continue;
        const [x, y] = s, h = rand(1.4, 2.2);
        b.frustum(6, 0.8, 0x4f8a45, x, y, 0, 0.32, h);
        b.box(0x4f8a45, x + 0.5, y, h * 0.45, 0.7, 0.25, 0.25);
        b.box(0x4f8a45, x - 0.45, y, h * 0.6, 0.6, 0.25, 0.25);
      }
      for (let i = 0; i < 14; i++) { const s = b.spot(1.2); if (s) rock(b, s[0], s[1], rand(0.5, 1.4), pick([0xa87f52, 0x8f6a44, 0xb98f5e])); }
    },
  },
  {
    name: 'МІСТО', ground: 0x6b7078,
    build(b) {
      const ROAD = 0x2f3338, LINE = 0xd8d2b0;
      b.quad(0x6b7078, 0, 0, 0, W2, CH + 0.2);
      const roadsX = [-21, 0, 21];
      for (const rx of roadsX) {
        b.quad(ROAD, rx, 0, 0.1, 4.8, CH + 0.2);
        for (let y = -18; y <= 18; y += 4) if (Math.abs(y) > 3) b.quad(LINE, rx, y, 0.16, 0.2, 1.7);
      }
      b.quad(ROAD, 0, 0, 0.1, W2, 4.8);
      for (let x = -32; x <= 32; x += 4) if (roadsX.every((rx) => Math.abs(x - rx) > 3)) b.quad(LINE, x, 0, 0.16, 1.7, 0.2);
      const PAL = [0x9aa3ad, 0xb8b2a6, 0x7d8794, 0xc9c3b5, 0x6f7f95, 0xa0705a, 0xd6d0c4, 0x5e6b7a, 0x8fa6b8];
      const ROOF = [0x4a4f57, 0x5c6168, 0x3d4249, 0x6e6a62];
      const xs = [[-34, -23.8], [-18.2, -2.8], [2.8, 18.2], [23.8, 34]], ys = [[-16.6, -2.8], [2.8, 16.6]];
      for (const [x0, x1] of xs) for (const [y0, y1] of ys) {
        const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        b.quad(0x8d939b, cx, cy, 0.07, w, h);
        const kind = Math.random();
        if (kind < 0.13) {                       // парк
          b.quad(0x5a9a48, cx, cy, 0.12, w - 1, h - 1);
          b.disc(9, 0x3f8fc9, cx + rand(-2, 2), cy + rand(-2, 2), 0.16, rand(1.2, 2.2));
          for (let i = 0; i < 9; i++) leafy(b, cx + rand(-0.42, 0.42) * w, cy + rand(-0.42, 0.42) * h, rand(0.7, 1), pick([0x4a9a3f, 0x3f8a36, 0x6fb84f]));
          continue;
        }
        if (kind < 0.24) {                       // парковка
          b.quad(0x3a3e44, cx, cy, 0.12, w - 1, h - 1);
          for (let px = x0 + 2; px < x1 - 1.5; px += 1.9) for (const py of [cy - h * 0.28, cy + h * 0.28]) {
            if (chance(0.7)) { b.box(pick([0xd43a3a, 0xf2f2f2, 0x2f6fd0, 0x1d1f24, 0xb9c0c8, 0xf2c230]), px, py, 0.14, 1.2, 2.4, 0.5); b.box(0x1b2733, px, py, 0.64, 1.0, 1.2, 0.4); }
          }
          continue;
        }
        const nx = Math.max(1, Math.round(w / 7.5)), ny = 2, lw = w / nx, lh = h / ny;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const bx = x0 + lw * (i + 0.5), by = y0 + lh * (j + 0.5);
          const bw = lw - rand(1.2, 2.4), bd = lh - rand(1.2, 2.4);
          const bh = chance(0.16) ? rand(11, 18) : rand(3, 9), col = pick(PAL);
          b.box(col, bx, by, 0.1, bw, bd, bh, 0, 0, 0.04);
          for (let z = 1.6; z < bh - 0.8; z += 2.6) b.box(0x263648, bx, by, z, bw + 0.12, bd + 0.12, 0.7);   // смуги вікон
          b.quad(pick(ROOF), bx, by, bh + 0.16, bw * 0.84, bd * 0.84);
          if (chance(0.65)) b.box(0xa3a9af, bx + rand(-0.25, 0.25) * bw, by + rand(-0.25, 0.25) * bd, bh + 0.16, rand(0.8, 1.6), rand(0.8, 1.6), rand(0.4, 0.9));
          if (bh > 10) { b.frustum(5, 0.6, 0x8a8f96, bx, by, bh + 0.16, 0.18, 2.6); b.ico(0xff3030, bx, by, bh + 2.9, 0.32, 0.32, 0.32, 0, 1); }
        }
      }
      // естакади на краях плитки (під ними машини «перестрибують» на інший край)
      for (const y of [-18.5, 18.5]) {
        b.box(0x7a7f87, 0, y, 1.25, W2, 3.2, 0.5);
        b.quad(0x3a3e44, 0, y, 1.8, W2, 2.4);
        for (let x = -33; x <= 33; x += 3) b.quad(LINE, x, y, 1.84, 1.4, 0.16);
      }
      for (const rx of roadsX) for (let k = 0; k < 3; k++) {
        b.mover(pick(carGeo), rx + 1.2, rand(-16, 16), 0.14, Math.PI / 2, 0, rand(2, 4.5));
        b.mover(pick(carGeo), rx - 1.2, rand(-16, 16), 0.14, -Math.PI / 2, 0, -rand(3, 6));
      }
      for (let k = 0; k < 5; k++) {
        b.mover(chance(0.2) ? busGeo : pick(carGeo), rand(-CW, CW), -1.2, 0.14, 0, rand(3, 6), 0);
        b.mover(chance(0.2) ? busGeo : pick(carGeo), rand(-CW, CW), 1.2, 0.14, Math.PI, -rand(3, 6), 0);
      }
    },
  },
  {
    name: 'ФЕРМИ', ground: 0x9c8658,
    build(b) {
      const DIRT = 0x9c8658;
      b.quad(DIRT, 0, 0, 0, W2, CH + 0.2);
      const FIELD = [0xd9c25a, 0x5f9e3f, 0x3f7d33, 0x8a6a45, 0xa9c95a, 0xc9a84a, 0x6fae4f];
      const cols = 5, rows = 3, cw = W2 / cols, ch = CH / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const cx = -CW + cw * (i + 0.5), cy = -CH / 2 + ch * (j + 0.5), w = cw - 1.4, h = ch - 1.4, kind = Math.random();
        if (kind < 0.13) {                       // садиба
          b.quad(0x6fa84a, cx, cy, 0.06, w, h);
          house(b, cx - 2.5, cy + 1.5, 3, 2.4, 1.5, 0xf0ebe0, 0xb5412f, chance(0.5) ? 0 : Math.PI / 2);
          b.box(0x9c3b2e, cx + 2.5, cy - 1.5, 0.05, 4.6, 3, 2.2);
          b.box(0x6e747a, cx + 2.5, cy - 1.5, 2.25, 4.9, 3.3, 0.25);
          b.frustum(8, 1, 0xcfd4d8, cx + 4.5, cy + 2.5, 0.05, 0.9, 3.4);
          b.cone(8, 0x9aa0a6, cx + 4.5, cy + 2.5, 3.45, 0.95, 0.8);
          for (let k = 0; k < 4; k++) leafy(b, cx + rand(-0.45, 0.45) * w, cy + rand(-0.45, -0.2) * h, rand(0.7, 1), 0x4a9a3f);
        } else if (kind < 0.24) {                // гай зі ставком
          b.quad(0x5f9e3f, cx, cy, 0.06, w, h);
          b.disc(9, 0x2f7fc4, cx + rand(-2, 2), cy + rand(-2, 2), 0.1, rand(1.8, 3));
          for (let k = 0; k < 9; k++) leafy(b, cx + rand(-0.45, 0.45) * w, cy + rand(-0.45, 0.45) * h, rand(0.7, 1.1), pick([0x4a9a3f, 0x3f8a36, 0x6fb84f]));
        } else {                                  // поле
          const col = pick(FIELD), vert = chance(0.5);
          b.quad(col, cx, cy, 0.06, w, h);
          if (chance(0.75)) {
            const dark = shade(col, 0.85);
            if (vert) for (let x = -w / 2 + 0.6; x < w / 2; x += 1.2) b.quad(dark, cx + x, cy, 0.1, 0.35, h - 0.4);
            else for (let y = -h / 2 + 0.6; y < h / 2; y += 1.2) b.quad(dark, cx, cy + y, 0.1, w - 0.4, 0.35);
          }
          if (col === 0xd9c25a || col === 0xc9a84a) for (let k = 0; k < 5; k++) b.frustum(8, 1, 0xe8d37e, cx + rand(-0.4, 0.4) * w, cy + rand(-0.4, 0.4) * h, 0.06, 0.55, 0.6);
        }
      }
      for (let i = 0; i < 6; i++) leafy(b, -CW + cw * Math.ceil(rand(0, cols - 1)), rand(-19, 19), rand(0.7, 1), 0x3f8a36);
      const yRoad = -CH / 2 + ch * pick([1, 2]);
      b.mover(tractorGeo, rand(-CW, CW), yRoad, 0.1, 0, rand(1, 2), 0);
      if (chance(0.6)) b.mover(pick(carGeo), rand(-CW, CW), -CH / 2 + ch * pick([1, 2]), 0.1, Math.PI, -rand(3, 5), 0);
    },
  },
  {
    name: 'АРКТИКА', ground: 0xe6eff5,
    build(b) {
      b.quad(0xe6eff5, 0, 0, 0, W2, CH + 0.2);
      for (let i = 0; i < 12; i++) b.ico(0xd3e2ee, rand(-CW, CW), rand(-18, 18), 0, rand(4, 9), rand(1.5, 3), 0.5, rand(0, 3));
      const lakes = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < lakes; i++) {
        const s = b.spot(9);
        if (!s) continue;
        const blobs = [];
        for (let k = 0; k < 7; k++) blobs.push([s[0] + rand(-5, 5), s[1] + rand(-5, 5), rand(2.5, 4.5)]);
        for (const [x, y, r] of blobs) b.disc(9, 0xa9cfe6, x, y, 0.04, r + 0.8);
        for (const [x, y, r] of blobs) b.disc(9, 0x1d4a72, x, y, 0.08, r);
        for (let k = 0; k < 6; k++) { const [x, y] = pick(blobs); b.disc(6, 0xf4f9fc, x + rand(-1.5, 1.5), y + rand(-1.5, 1.5), 0.14, rand(0.6, 1.5)); }
      }
      for (let i = 0; i < 2; i++) {
        const s = b.spot(8);
        if (!s || chance(0.3)) continue;
        const r = rand(5, 7.5), h = rand(6, 9.5);
        b.cone(6, 0x8794a1, s[0], s[1], 0, r, h, 0, 0.04);
        b.cone(6, 0xf7fbfd, s[0], s[1], h * 0.48, r * 0.55, h * 0.55);
      }
      if (chance(0.4)) {
        const s = b.spot(3);
        if (s) { b.ico(0xdfeaf2, s[0], s[1], 0, 1.5, 1.5, 1.1); b.box(0x2a3b4d, s[0] + 1.3, s[1], 0.05, 0.6, 0.6, 0.6); }
      }
      for (let i = 0; i < 30; i++) { const s = b.spot(1.2); if (s) conifer(b, s[0], s[1], rand(0.8, 1.2), true); }
      for (let i = 0; i < 7; i++) { const s = b.spot(1.5); if (s) b.cone(5, 0xbfe3f5, s[0], s[1], 0, rand(0.8, 1.6), rand(1.5, 3.5)); }
    },
  },
  {
    name: 'ВУЛКАН', ground: 0x2a2325,
    build(b) {
      b.quad(0x2a2325, 0, 0, 0, W2, CH + 0.2);
      for (let i = 0; i < 14; i++) b.disc(7, pick([0x3a3033, 0x1f191b, 0x332a2c]), rand(-CW, CW), rand(-18, 18), 0.03, rand(3, 7));
      const y0 = b.row * CH, lavaX = (y) => snakeX(y0 + y + 200);
      for (let y = -20; y <= 20; y += 1.2) b.disc(8, 0x151011, lavaX(y), y, 0.06, 3.3);
      for (let y = -20; y <= 20; y += 1.2) b.disc(8, 0xff5a14, lavaX(y), y, 0.1, 2.2, 1);
      for (let y = -20; y <= 20; y += 1.2) b.disc(8, 0xffc04a, lavaX(y) + rand(-0.4, 0.4), y, 0.14, rand(0.6, 1.2), 1);
      const nearLava = (x, y, d) => Math.abs(x - lavaX(y)) < d;
      if (chance(0.75)) {
        const s = b.spot(11);
        if (s && !nearLava(s[0], s[1], 13)) {
          const r = rand(8, 10.5), h = rand(6, 8.5);
          b.frustum(9, 0.42, 0x3d2f30, s[0], s[1], 0, r, h, 0, 0.03);
          b.disc(9, 0xff6a1a, s[0], s[1], h + 0.06, r * 0.36, 1);
          b.disc(9, 0xffd060, s[0], s[1], h + 0.1, r * 0.2, 1);
          for (let k = 0; k < 4; k++) { const a = rand(0, TAU); b.disc(6, 0xff5a14, s[0] + Math.cos(a) * r * 1.05, s[1] + Math.sin(a) * r * 1.05, 0.1, rand(0.7, 1.5), 1); }
        } else if (s) b.used.pop();
      }
      for (let i = 0; i < 3; i++) {
        const s = b.spot(4);
        if (!s || nearLava(s[0], s[1], 7)) continue;
        const r = rand(1.8, 3.6);
        b.disc(8, 0x151011, s[0], s[1], 0.06, r + 0.9);
        b.disc(8, 0xff5a14, s[0], s[1], 0.1, r, 1);
        b.disc(8, 0xffc04a, s[0], s[1], 0.14, r * 0.5, 1);
      }
      for (let i = 0; i < 28; i++) { const s = b.spot(1.2); if (s && !nearLava(s[0], s[1], 3.5)) rock(b, s[0], s[1], rand(0.6, 1.8), pick([0x151112, 0x40363a, 0x2a2224])); }
      for (let i = 0; i < 10; i++) {
        const s = b.spot(1);
        if (!s || nearLava(s[0], s[1], 3.5)) continue;
        b.frustum(4, 0.5, 0x171213, s[0], s[1], 0, 0.2, rand(1.6, 2.6));
        b.box(0x171213, s[0] + 0.4, s[1], 1.2, 0.9, 0.12, 0.12, rand(0, 3));
      }
      for (let i = 0; i < 30; i++) b.quad(0xff8a3a, rand(-CW, CW), rand(-19, 19), 0.2, 0.25, 0.25, 0, 1);
    },
  },
];

export const BIOME_COUNT = BIOMES.length;

// Плавний перехід на межі біомів: хвиляста смуга кольору нової землі. На самій межі вона
// непрозора, донизу розчиняється над старим біомом, догори — відкриває деталі нового.
// Високі об'єкти (дерева, будинки, скелі) стирчать крізь неї, тож ландшафти ніби перетікають.
function fadeGeo(hex) {
  C.setHex(hex);
  const pos = [], col = [], N = 26, y0 = -CH / 2, ph = rand(0, TAU);
  const xs = [], dn = [], upL = [];
  for (let i = 0; i <= N; i++) {
    xs.push(-CW - 2 + i * (W2 + 4) / N);
    dn.push(11 + Math.sin(i * 0.8 + ph) * 4 + rand(-1.5, 1.5));
    upL.push(8 + Math.sin(i * 1.1 + ph * 2) * 3 + rand(-1.2, 1.2));
  }
  const v = (x, y, a) => { pos.push(x, y, 0.27); col.push(C.r, C.g, C.b, a); };
  const quad = (xa, ya0, ya1, aa0, aa1, xb, yb0, yb1) => {
    v(xa, ya0, aa0); v(xb, yb0, aa0); v(xb, yb1, aa1);
    v(xa, ya0, aa0); v(xb, yb1, aa1); v(xa, ya1, aa1);
  };
  for (let i = 0; i < N; i++) {
    quad(xs[i], y0 - dn[i], y0, 0, 1, xs[i + 1], y0 - dn[i + 1], y0);       // донизу, над старим біомом
    quad(xs[i], y0, y0 + upL[i], 1, 0, xs[i + 1], y0, y0 + upL[i + 1]);     // догори, над новим
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 4));
  return g;
}

export function createWorld(scene) {
  const litMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const fadeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  let biome = 0, row = 0;
  const chunks = [];

  function rebuild(ch, newRow = true) {
    if (newRow) ch.row = row++;
    ch.biome = biome;
    // Межа з іншим біомом знизу: обрізаємо свої об'єкти по краю плитки й піднімаємо плитку
    // трохи вище за сусідню, щоб її земля накрила річку/лаву/плями, що заходять знизу.
    const below = chunks.find((c) => c !== ch && c.row === ch.row - 1);
    const edge = !!below && below.biome !== biome;
    ch.level = below ? below.level + (edge ? 1 : 0) : 0;
    ch.group.position.z = GROUND_Z + ch.level * 0.3;
    ch.fade.visible = edge;
    if (edge) { ch.fade.geometry.dispose(); ch.fade.geometry = fadeGeo(BIOMES[biome].ground); }
    const b = new Builder(ch.row, edge);
    BIOMES[biome].build(b);
    ch.lit.geometry.dispose();
    ch.glow.geometry.dispose();
    ch.lit.geometry = toGeo(b.pos[0], b.col[0]);
    ch.glow.geometry = toGeo(b.pos[1], b.col[1]);
    ch.glow.visible = b.pos[1].length > 0;
    for (const m of ch.movers) ch.group.remove(m.mesh);
    ch.movers = b.movers.map((m) => {
      const mesh = new THREE.Mesh(m.geo, litMat);
      mesh.position.set(m.x, m.y, m.z);
      mesh.rotation.z = m.rot;
      ch.group.add(mesh);
      return { mesh, vx: m.vx, vy: m.vy };
    });
  }

  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();
    const lit = new THREE.Mesh(new THREE.BufferGeometry(), litMat);
    const glow = new THREE.Mesh(new THREE.BufferGeometry(), glowMat);
    const fade = new THREE.Mesh(new THREE.BufferGeometry(), fadeMat);
    fade.renderOrder = -2;   // до серпанку, щоб смуга теж була під ним
    fade.visible = false;
    lit.frustumCulled = glow.frustumCulled = fade.frustumCulled = false;
    group.add(lit, glow, fade);
    group.position.set(0, (i - 1) * CH, GROUND_Z);
    scene.add(group);
    const ch = { group, lit, glow, fade, movers: [], row: 0, biome: 0, level: 0 };
    chunks.push(ch);
    rebuild(ch);
  }

  return {
    name: (i) => BIOMES[i % BIOMES.length].name,
    // для тестів: світова Y-координата видимої межі біомів (або null)
    debugEdge() { const c = chunks.find((ch) => ch.fade.visible); return c ? c.group.position.y - CH / 2 : null; },
    // Новий біом «в'їжджає» згори: плитки перебудовуються, коли опиняються поза екраном.
    setBiome(i, force = false) {
      biome = i % BIOMES.length;
      const todo = chunks.filter((ch) => ch.biome !== biome && (force || ch.group.position.y - CH / 2 > 37));
      if (force) for (const ch of chunks) ch.biome = biome;   // усі плитки одного біому — меж немає
      todo.sort((p, q) => p.row - q.row).forEach((ch) => rebuild(ch, false));
    },
    update(dt) {
      for (const ch of chunks) {
        ch.group.position.y -= SCROLL * dt;
        if (ch.group.position.y < -CH * 1.45) {
          ch.group.position.y += CH * 3;
          rebuild(ch);
        }
        for (const m of ch.movers) {
          const p = m.mesh.position;
          p.x += m.vx * dt; p.y += m.vy * dt;
          if (p.x > CW + 3) p.x -= W2 + 6; else if (p.x < -CW - 3) p.x += W2 + 6;
          if (p.y > 19) p.y -= 38; else if (p.y < -19) p.y += 38;
        }
      }
    },
  };
}
