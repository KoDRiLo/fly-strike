import * as THREE from 'three';
import { createWorld } from './world.js';

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

export {
  $, camera, canvas, clamp, H, rand, renderer, scene, TAU, updateBackground, W, world,
};
