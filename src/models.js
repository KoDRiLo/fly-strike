// Низькополігональні моделі з примітивів. Ніс моделі дивиться в +Y, верх — +Z.
import * as THREE from 'three';

const M = (color, o = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, metalness: 0.25, roughness: 0.65, ...o });
const GLOW = (color) => new THREE.MeshBasicMaterial({ color });

function at(mesh, x = 0, y = 0, z = 0) { mesh.position.set(x, y, z); return mesh; }

function cyl(rFront, rBack, len, mat, seg = 8) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rFront, rBack, len, seg), mat);
}
function cone(r, len, mat, seg = 8) {
  return new THREE.Mesh(new THREE.ConeGeometry(r, len, seg), mat);
}
function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}
// Симетрична пластина: pts — контур правої половини [x, y] згори донизу.
function plate(pts, depth, mat) {
  const mirrored = pts.slice().reverse().filter(([x]) => x !== 0).map(([x, y]) => [-x, y]);
  const s = new THREE.Shape();
  [...pts, ...mirrored].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return new THREE.Mesh(g, mat);
}
function canopy(mat, sx, sy, sz) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat);
  m.scale.set(sx, sy, sz);
  return m;
}
function flame(r, len, color = 0x7fd4ff) {
  const f = cone(r, len, GLOW(color), 6);
  f.rotation.z = Math.PI;
  f.name = 'flame';
  return f;
}
function prop(size, mat) {
  const p = box(size, 0.1, 0.16, mat);
  p.name = 'spin';
  return p;
}

const glass = M(0x0d2b4a, { metalness: 0.8, roughness: 0.2, emissive: 0x0a2a55 });
const dark = M(0x2b3138);

// Чорний контур («вивернута оболонка»): збільшена копія кожної деталі, у якої видно
// лише внутрішні грані. Дає чіткий силует на будь-якому тлі — від снігу до лави.
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0a0c12, side: THREE.BackSide });
function addOutline(g, t) {
  const size = new THREE.Vector3(), c = new THREE.Vector3();
  for (const m of [...g.children]) {
    if (!m.isMesh || m.material.isMeshBasicMaterial) continue;
    m.geometry.computeBoundingBox();
    m.geometry.boundingBox.getSize(size);
    m.geometry.boundingBox.getCenter(c);
    const k = new THREE.Vector3(
      (size.x + 2 * t / m.scale.x) / size.x, (size.y + 2 * t / m.scale.y) / size.y, (size.z + 2 * t / m.scale.z) / size.z);
    const o = new THREE.Mesh(m.geometry, OUTLINE);
    o.rotation.copy(m.rotation);
    o.scale.copy(m.scale).multiply(k);
    // розширюємо від центру деталі, а не від її початку координат
    o.position.set(c.x * (1 - k.x) * m.scale.x, c.y * (1 - k.y) * m.scale.y, c.z * (1 - k.z) * m.scale.z).applyEuler(m.rotation).add(m.position);
    g.add(o);
  }
}
// Гравець і дрони: білий корпус, яскраві крила, контрастні акценти.
const heroMat = (color) => M(color, { emissive: color, emissiveIntensity: 0.28, roughness: 0.5 });
const heroHull = heroMat(0xffffff);
const planeWing = heroMat(0xff7a00), planeTrim = heroMat(0xffe14a);
const droneWing = heroMat(0xff7a00), droneTrim = heroMat(0xffe14a);
// Колір крил обирається в налаштуваннях; акцент підбирається контрастним до нього.
export function setHeroColors(plane, drone) {
  for (const [wing, trim, hex] of [[planeWing, planeTrim, plane], [droneWing, droneTrim, drone]]) {
    wing.color.setHex(hex); wing.emissive.setHex(hex);
    const warm = [0xff7a00, 0xffe000, 0xa6ff00].includes(hex);   // на жовто-помаранчевих жовтий акцент не видно
    trim.color.setHex(warm ? 0x2b6fff : 0xffe14a); trim.emissive.copy(trim.color);
  }
}

export function makePlayer() {
  const g = new THREE.Group();
  const hull = heroHull, accent = planeWing, trim = planeTrim;
  g.add(cyl(0.34, 0.46, 3.0, hull));
  g.add(at(cone(0.34, 1.4, hull), 0, 2.2));
  g.add(at(plate([[0, 1.0], [2.7, -0.9], [2.7, -1.5], [0, -0.9]], 0.16, accent), 0, 0, -0.05));
  g.add(at(plate([[0, -0.9], [1.2, -1.75], [1.2, -2.05], [0, -1.7]], 0.12, hull)));
  for (const s of [-1, 1]) {
    const fin = at(box(0.1, 0.9, 0.7, accent), s * 0.5, -1.35, 0.4);
    fin.rotation.y = s * 0.35;
    g.add(fin);
    g.add(at(cyl(0.09, 0.09, 1.2, dark, 6), s * 1.5, 0.2, -0.05));
    g.add(at(box(0.5, 0.25, 0.2, trim), s * 2.5, -1.2, 0));
  }
  g.add(at(canopy(glass, 0.26, 0.75, 0.26), 0, 0.9, 0.3));
  g.add(at(box(0.16, 1.5, 0.12, trim), 0, -0.3, 0.42));            // смуга на спині
  g.add(at(flame(0.3, 1.4), 0, -2.2));
  addOutline(g, 0.07);
  return g;
}

export function makeDrone() {
  const g = new THREE.Group();
  const hull = droneWing, light = heroHull;
  g.add(cyl(0.2, 0.26, 1.3, light));
  g.add(at(cone(0.2, 0.6, light), 0, 0.95));
  g.add(plate([[0, 0.4], [1.0, -0.3], [1.0, -0.6], [0, -0.4]], 0.1, hull));
  g.add(at(box(0.3, 0.3, 0.12, droneTrim), 0, 0.1, 0.24));
  g.add(at(flame(0.16, 0.7, 0xff9ac4), 0, -1.0));
  addOutline(g, 0.05);
  return g;
}

const BUILD = {
  scout() {
    const g = new THREE.Group();
    const hull = M(0xd43a3a), wing = M(0x8f2020);
    g.add(cyl(0.28, 0.36, 2.0, hull));
    g.add(at(cone(0.28, 0.8, hull), 0, 1.4));
    g.add(plate([[0, 0.5], [1.7, 0.2], [1.7, -0.3], [0, -0.3]], 0.12, wing));
    g.add(at(plate([[0, -0.6], [0.7, -0.9], [0.7, -1.15], [0, -1.05]], 0.1, wing)));
    g.add(at(canopy(glass, 0.2, 0.5, 0.2), 0, 0.5, 0.25));
    g.add(at(prop(1.1, dark), 0, 1.85));
    return g;
  },
  fighter() {
    const g = new THREE.Group();
    const hull = M(0x4d7c3a), wing = M(0x2f5324), trim = M(0xd9c24a);
    g.add(cyl(0.32, 0.42, 2.6, hull));
    g.add(at(cone(0.32, 1.1, hull), 0, 1.85));
    g.add(plate([[0, 0.9], [2.1, -0.7], [2.1, -1.2], [0, -0.5]], 0.14, wing));
    g.add(at(plate([[0, -0.8], [0.9, -1.4], [0.9, -1.65], [0, -1.4]], 0.1, wing)));
    g.add(at(box(0.1, 0.8, 0.6, trim), 0, -1.1, 0.4));
    g.add(at(canopy(glass, 0.24, 0.65, 0.24), 0, 0.7, 0.28));
    g.add(at(flame(0.25, 0.9, 0xffa24a), 0, -1.7));
    return g;
  },
  kami() {
    const g = new THREE.Group();
    const hull = M(0xf08a1c), wing = M(0x3a3a3a);
    g.add(plate([[0, 1.6], [1.2, -0.9], [0.4, -0.6], [0, -0.9]], 0.3, hull));
    g.add(at(plate([[0, 0.8], [0.5, -0.5], [0, -0.5]], 0.5, wing)));
    g.add(at(flame(0.28, 1.2, 0xff5522), 0, -1.3));
    return g;
  },
  gunship() {
    const g = new THREE.Group();
    const hull = M(0x6b7280), wing = M(0x454b57), trim = M(0xc93c3c);
    g.add(cyl(0.7, 0.8, 5.0, hull));
    g.add(at(cone(0.7, 1.4, hull), 0, 3.2));
    g.add(plate([[0, 1.2], [4.2, 0.4], [4.2, -0.6], [0, -0.8]], 0.22, wing));
    g.add(at(plate([[0, -1.6], [1.8, -2.2], [1.8, -2.7], [0, -2.5]], 0.16, wing)));
    g.add(at(box(0.14, 1.2, 1.0, trim), 0, -2.1, 0.7));
    for (const s of [-1, 1]) {
      g.add(at(cyl(0.38, 0.42, 1.6, hull), s * 2.2, 0.6, 0));
      g.add(at(prop(1.9, dark), s * 2.2, 1.5, 0));
      g.add(at(box(0.6, 0.3, 0.25, trim), s * 3.9, -0.1, 0.05));
    }
    g.add(at(canopy(glass, 0.45, 0.9, 0.4), 0, 1.9, 0.5));
    g.add(at(cyl(0.45, 0.45, 0.4, dark, 10).rotateX(Math.PI / 2), 0, 0, 0.8));
    return g;
  },
};

Object.assign(BUILD, {
  strafer() {
    const g = new THREE.Group();
    const hull = M(0xdff3f1), wing = M(0x1f9e98);
    g.add(cyl(0.24, 0.34, 2.4, hull));
    g.add(at(cone(0.24, 1.2, hull), 0, 1.8));
    g.add(plate([[0, 0.2], [1.5, -1.0], [1.5, -1.4], [0, -1.0]], 0.12, wing));
    g.add(at(box(0.08, 0.7, 0.5, wing), 0, -0.9, 0.35));
    g.add(at(canopy(glass, 0.18, 0.55, 0.2), 0, 0.7, 0.22));
    g.add(at(flame(0.22, 1.3, 0x7ffff0), 0, -1.8));
    return g;
  },
  emine() {
    const g = new THREE.Group();
    const shell = M(0x16324f, { metalness: 0.6, roughness: 0.3 }), rod = M(0xbfd4e6, { metalness: 0.8, roughness: 0.2 });
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), shell));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 6, 20), GLOW(0x4fc3ff)));
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const c = at(cyl(0.07, 0.07, 0.9, rod, 5), Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0);
      c.rotation.z = a - Math.PI / 2;
      g.add(c);
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), GLOW(0xd6f3ff)), Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0));
    }
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), GLOW(0x7fdcff)), 0, 0, 0.7));
    return g;
  },
  mine() {
    const g = new THREE.Group();
    const shell = M(0x30343c), spike = M(0x8a8f99);
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), shell));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const c = at(cone(0.2, 0.7, spike, 5), Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0);
      c.rotation.z = a - Math.PI / 2;
      g.add(c);
    }
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), GLOW(0xff3322)), 0, 0, 0.75));
    return g;
  },
  bomber() {
    const g = new THREE.Group();
    const hull = M(0x3d5a85), wing = M(0x27405f), trim = M(0xe8e2c8);
    g.add(cyl(0.6, 0.7, 3.8, hull));
    g.add(at(cone(0.6, 1.0, hull), 0, 2.4));
    g.add(plate([[0, 0.9], [3.3, 0.5], [3.3, -0.4], [0, -0.7]], 0.2, wing));
    g.add(at(plate([[0, -1.3], [1.4, -1.6], [1.4, -2.0], [0, -1.9]], 0.14, wing)));
    g.add(at(box(0.12, 0.9, 0.8, trim), 0, -1.6, 0.6));
    for (const s of [-1, 1]) {
      g.add(at(cyl(0.3, 0.34, 1.3, hull), s * 1.7, 0.6, 0));
      g.add(at(prop(1.5, dark), s * 1.7, 1.35, 0));
    }
    g.add(at(canopy(glass, 0.38, 0.7, 0.34), 0, 1.5, 0.45));
    g.add(at(box(0.9, 1.6, 0.2, trim), 0, -0.2, 0.62));
    return g;
  },
  spinner() {
    const g = new THREE.Group();
    const hull = M(0x7a3fb0), arm = M(0x3a2458);
    g.add(cyl(1.0, 1.0, 0.5, hull, 8).rotateX(Math.PI / 2));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const b = at(box(0.4, 1.5, 0.25, arm), Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0);
      b.rotation.z = a - Math.PI / 2;
      g.add(b);
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), GLOW(0xff7af0)), Math.cos(a) * 2.0, Math.sin(a) * 2.0, 0));
    }
    g.add(at(canopy(GLOW(0xffc0fa), 0.45, 0.45, 0.3), 0, 0, 0.35));
    return g;
  },
  ace() {
    const g = new THREE.Group();
    const hull = M(0x1c1f26), wing = M(0x2d323d), trim = M(0xf2c230);
    g.add(cyl(0.34, 0.46, 3.0, hull));
    g.add(at(cone(0.34, 1.4, trim), 0, 2.2));
    g.add(plate([[0, -0.6], [2.4, 0.7], [2.4, 0.1], [0, -1.4]], 0.14, wing)); // крило зворотної стрілоподібності
    g.add(at(plate([[0, 1.3], [0.9, 0.9], [0.9, 0.6], [0, 0.8]], 0.1, trim)));
    for (const s of [-1, 1]) {
      const fin = at(box(0.1, 0.9, 0.7, trim), s * 0.5, -1.3, 0.4);
      fin.rotation.y = s * 0.4;
      g.add(fin);
      g.add(at(flame(0.2, 1.1, 0xffd24a), s * 0.25, -2.0));
    }
    g.add(at(canopy(M(0xf2c230, { emissive: 0x6b5200 }), 0.24, 0.7, 0.25), 0, 0.8, 0.3));
    return g;
  },
});

const protos = {};
export function makeEnemy(type) {
  protos[type] ||= BUILD[type]();
  return protos[type].clone();
}

// Боси будуються з власними матеріалами (потрібні для спалаху при влучанні).
export function makeBoss(kind) {
  const g = new THREE.Group();
  const d = M(0x23272e);
  if (kind === 3) {
    // Швидкий перехоплювач
    const hull = M(0xf0b90b), wing = M(0x2a2a2a), stripe = M(0x151515);
    g.add(cyl(0.9, 1.2, 8, hull, 8));
    g.add(at(cone(0.9, 2.6, hull, 8), 0, 5.3));
    for (const y of [1.5, -0.3, -2.1]) g.add(at(cyl(1.2, 1.24, 0.7, stripe, 8), 0, y, 0));
    g.add(plate([[0, -1.0], [4.8, 1.8], [4.8, 0.6], [1.0, -3.4], [0, -3.2]], 0.3, wing));
    g.add(at(plate([[0, 3.6], [2.0, 3.0], [2.0, 2.5], [0, 2.7]], 0.2, wing)));
    for (const s of [-1, 1]) {
      const fin = at(box(0.16, 1.8, 1.4, hull), s * 1.0, -3.2, 0.8);
      fin.rotation.y = s * 0.4;
      g.add(fin);
      g.add(at(flame(0.5, 2.4, 0xffe27a), s * 0.6, -5.0, 0));
      g.add(at(cyl(0.14, 0.14, 2.2, d, 6), s * 3.5, 1.6, 0));
    }
    g.add(at(canopy(M(0x101010, { emissive: 0x402800 }), 0.6, 1.5, 0.5), 0, 3.0, 0.7));
    return g;
  }
  if (kind === 4) {
    // Літаючий авіаносець
    const hull = M(0x56616e), deck = M(0x39424d), line = M(0xe8e2c8), trim = M(0xff8a1f, { emissive: 0x7a3a00 });
    g.add(plate([[0, 5.2], [2.4, 5.2], [3.4, 3.8], [3.4, -4.6], [2.6, -5.2], [0, -5.2]], 0.9, hull));
    g.add(at(plate([[0, 4.8], [2.0, 4.8], [2.8, 3.6], [2.8, -4.6], [0, -4.6]], 0.2, deck), 0, 0, 0.5));
    g.add(at(box(0.3, 8.6, 0.1, line), 0, 0, 0.64));
    for (const y of [3, 1, -1, -3]) g.add(at(box(1.4, 0.2, 0.1, line), 0, y, 0.64));
    g.add(at(plate([[0, 1.6], [7.6, 0.6], [7.6, -1.2], [0, -2.2]], 0.35, deck), 0, 0, -0.2));
    g.add(at(box(1.2, 2.6, 1.6, hull), 2.6, -1.0, 1.3));
    g.add(at(box(0.8, 1.0, 0.6, trim), 2.6, -0.6, 2.3));
    for (const x of [-6.2, -4.6, 4.6, 6.2]) {
      g.add(at(cyl(0.5, 0.55, 2.0, hull), x, 0.6, -0.1));
      g.add(at(prop(2.3, d), x, 1.7, -0.1));
    }
    for (const s of [-1, 1]) g.add(at(flame(0.7, 2.2, 0xffa24a), s * 1.6, -6.0, 0));
    return g;
  }
  if (kind === 5) {
    // Триголовий важкий винищувач
    const hull = M(0x1f5a4e), wing = M(0x133a33), trim = M(0x5dff9a, { emissive: 0x16a34a });
    g.add(plate([[0, 0.6], [8.4, -0.6], [8.4, -2.0], [0, -2.6]], 0.4, wing));
    for (const [x, len, y] of [[0, 9, 0.8], [-4.6, 6.5, -0.2], [4.6, 6.5, -0.2]]) {
      g.add(at(cyl(0.8, 1.0, len, hull, 8), x, y, 0.2));
      g.add(at(cone(0.8, 2.0, hull, 8), x, y + len / 2 + 1.0, 0.2));
      g.add(at(canopy(trim, 0.5, 1.1, 0.4), x, y + len / 2 - 1.2, 0.9));
      g.add(at(flame(0.6, 2.2, 0x7dffb0), x, y - len / 2 - 1.1, 0.2));
    }
    g.add(at(plate([[0, -3.0], [2.6, -3.6], [2.6, -4.3], [0, -4.0]], 0.25, wing)));
    for (const s of [-1, 1]) {
      g.add(at(box(0.2, 1.6, 1.3, trim), s * 4.6, -3.0, 0.9));
      g.add(at(cyl(0.5, 0.5, 0.5, d, 10).rotateX(Math.PI / 2), s * 2.3, -0.8, 0.5));
      g.add(at(box(1.2, 0.4, 0.3, trim), s * 7.6, -1.3, 0.1));
    }
    return g;
  }
  if (kind === 0) {
    // Важкий чотиримоторний бомбардувальник
    const hull = M(0x5b6b4a), wing = M(0x3f4c33), trim = M(0xc0392b);
    g.add(cyl(1.1, 1.3, 9, hull, 10));
    g.add(at(cone(1.1, 2.2, hull, 10), 0, 5.6));
    g.add(plate([[0, 2.2], [8.2, 0.9], [8.2, -0.7], [0, -1.6]], 0.35, wing));
    g.add(at(plate([[0, -3.2], [3.2, -4.0], [3.2, -4.9], [0, -4.6]], 0.25, wing)));
    g.add(at(box(0.2, 2.0, 1.6, trim), 0, -3.9, 1.0));
    for (const x of [-5.6, -2.9, 2.9, 5.6]) {
      g.add(at(cyl(0.5, 0.55, 2.4, hull), x, 1.3, 0));
      g.add(at(prop(2.6, d), x, 2.6, 0));
    }
    for (const s of [-1, 1]) g.add(at(box(1.2, 0.5, 0.4, trim), s * 7.5, 0.1, 0.05));
    g.add(at(canopy(M(0x0d2b4a, { emissive: 0x0a2a55 }), 0.7, 1.4, 0.6), 0, 3.6, 0.8));
    for (const y of [1, -1.5]) g.add(at(cyl(0.6, 0.6, 0.5, d, 10).rotateX(Math.PI / 2), 0, y, 1.2));
  } else if (kind === 1) {
    // Літаюче крило
    const hull = M(0x3b2d5c), wing = M(0x221a38), trim = M(0xb14cff, { emissive: 0x5a1f8a });
    g.add(plate([[0, 4.0], [1.6, 2.0], [8.0, -2.4], [7.2, -3.4], [3.0, -2.0], [0, -3.0]], 0.5, wing));
    g.add(at(plate([[0, 3.4], [1.2, 1.6], [2.2, -1.6], [0, -2.4]], 0.6, hull), 0, 0, 0.5));
    for (const s of [-1, 1]) {
      g.add(at(cyl(0.55, 0.7, 5, hull), s * 3.0, -0.2, 0.25));
      g.add(at(cone(0.55, 1.2, hull), s * 3.0, 2.9, 0.25));
      g.add(at(flame(0.55, 2.0, 0xc77dff), s * 3.0, -3.6, 0.25));
      g.add(at(box(1.6, 0.3, 0.2, trim), s * 5.6, -1.6, 0.3));
    }
    g.add(at(canopy(trim, 0.6, 1.3, 0.45), 0, 1.2, 1.0));
  } else {
    // Повітряна фортеця
    const hull = M(0x4a5560), wing = M(0x2e363d), trim = M(0xff3b30, { emissive: 0xa01208 });
    g.add(cyl(3.0, 3.4, 7, hull, 6));
    g.add(at(cone(3.0, 2.6, hull, 6), 0, 4.8));
    g.add(plate([[0, 1.0], [7.5, 3.0], [7.5, 1.4], [3.0, -3.4], [0, -4.4]], 0.5, wing));
    g.add(at(plate([[0, -3.0], [3.6, -5.2], [3.6, -6.0], [0, -5.0]], 0.4, wing)));
    for (const s of [-1, 1]) {
      g.add(at(cyl(0.7, 0.7, 0.8, d, 10).rotateX(Math.PI / 2), s * 5.2, 1.4, 0.5));
      g.add(at(cyl(0.16, 0.16, 1.6, d, 6), s * 5.2, 2.4, 0.6));
      g.add(at(flame(0.7, 2.2, 0xff7a3d), s * 1.6, -4.4, 0));
      g.add(at(prop(3.0, d), s * 7.0, 3.2, 0.1));
    }
    g.add(at(canopy(trim, 1.2, 1.2, 0.7), 0, 0.5, 2.6));
    g.add(at(cyl(1.7, 1.7, 0.4, d, 12).rotateX(Math.PI / 2), 0, 0.5, 2.3));
  }
  return g;
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.3)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function powerTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.beginPath(); x.arc(64, 64, 52, 0, 7); x.fill();
  x.lineWidth = 9; x.strokeStyle = '#fff'; x.stroke();
  x.fillStyle = '#fff';
  x.font = '900 64px system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(letter, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 66);
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 24 : 54;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
  x.lineJoin = 'round';
  x.lineWidth = 12; x.strokeStyle = 'rgba(0,0,0,0.75)'; x.stroke();
  x.fillStyle = '#fff'; x.fill();
  x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,0.9)'; x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Куля ворога: однотонний кружок із тонким темнішим обідком того самого кольору.
export function orbTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d');
  const disc = (r, fill) => { x.beginPath(); x.arc(48, 48, r, 0, 7); x.fillStyle = fill; x.fill(); };
  disc(46, color);
  disc(46, 'rgba(0,0,0,0.5)');   // затемнюємо зовнішнє кільце
  disc(40, color);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Зірка досвіду: видавлена п'ятикутна зірка з обідком темнішого відтінку її ж кольору.
const starGeo = (() => {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.22 : 0.5;
    i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false });
  g.translate(0, 0, -0.1);
  return g;
})();
export function makeStar(mat, rimMat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(starGeo, mat));
  const o = new THREE.Mesh(starGeo, rimMat);
  o.scale.set(1.16, 1.16, 1.15);
  g.add(o);
  return g;
}
