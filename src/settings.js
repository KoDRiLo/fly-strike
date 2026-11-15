import * as THREE from 'three';
import { makeDrone, makePlayer, setHeroColors } from './models.js';
import { audioPause, initAudio, music, setVolume, sfx } from './audio.js';
import { $, rand } from './core.js';
import { dBulletPool } from './fx.js';
import { S } from './state.js';
import { sanitizeCfg } from './config.js';
import { showMsg } from './hud.js';

// ───────────────────────── Налаштування звуку ─────────────────────────
// Кольори, що не трапляються в ландшафтах (без синього, зеленого, пісочного, сірого).
const COLORS = [
  [0xff7a00, 'помаранчевий'], [0xff1f7a, 'малиновий'], [0xe6252a, 'червоний'], [0x9b3dff, 'фіолетовий'],
  [0xff3df0, 'фуксія'], [0x00e0d0, 'бірюзовий'], [0xffe000, 'жовтий'], [0xa6ff00, 'лаймовий'],
];
// Збережене в браузері може бути зіпсованим — беремо з нього лише коректні значення.
let saved = null;
try { saved = JSON.parse(localStorage.getItem('skystorm_cfg')); } catch {}
const cfg = sanitizeCfg(saved, COLORS.length);
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
  const [hex, name] = COLORS[cfg.color];
  setHeroColors(hex, hex);
  dBulletPool.mat.color.setHex(hex).lerp(new THREE.Color(0xffffff), 0.45);
  for (const b of $('heroCol').children) b.classList.toggle('on', +b.dataset.i === cfg.color);
  $('colName').textContent = name;
  $('muteBtn').textContent = cfg.musOn || cfg.sfxOn ? '🔊' : '🔇';
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
  if (show) { if (S.mode === 'pause') audioPause(false); initAudio(); music.preview(S.mode === 'menu' || S.mode === 'over'); } else if (S.mode === 'menu' || S.mode === 'over') music.stop();
  if (!show && S.mode === 'pause') audioPause(true);
};
$('setBtn').addEventListener('click', () => toggleSettings(true));
$('setBtn2').addEventListener('click', () => toggleSettings(true));
$('setBack').addEventListener('click', () => toggleSettings(false));
applyCfg();

// Вимикає або вмикає весь звук одразу (клавіша M і кнопка в HUD).
function toggleSound() {
  const on = !(cfg.musOn || cfg.sfxOn);
  cfg.musOn = cfg.sfxOn = on;
  applyCfg();
  showMsg(on ? 'ЗВУК УВІМК.' : 'ЗВУК ВИМК.', 0.8, 'sm');
}

export {
  preview, toggleSettings, toggleSound,
};
