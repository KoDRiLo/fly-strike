import { initAudio, sfx } from './audio.js';
import { $, camera, canvas, clamp, H, rand, renderer, scene, updateBackground, W, world } from './core.js';
import { sweep, updateParticles, updateRings } from './fx.js';
import { enemies, hi, P, pBullets, pickups, queue, S, threat } from './state.js';
import { showMsg, ui, updateHud } from './hud.js';
import { spawnElite, spawnEnemy, updateEnemies, WAVES } from './enemies.js';
import { ATK, boss, BOSSES, spawnBoss, updateBoss } from './bosses.js';
import { dropStars, gainXp, updatePickups } from './pickups.js';
import { hurtPlayer, input, playerFlame, playerHolder, playerModel, shieldMesh, shockPlayer, updatePlayer, useBomb } from './player.js';
import { updateBullets } from './bullets.js';
import { startStage, updateStage } from './stage.js';
import { choosePerk, openPick, pickQueue, toggleInfo } from './perkui.js';
import { applyCfg, cfg, preview, toggleSettings } from './settings.js';
import { startGame, togglePause } from './game.js';

// ───────────────────────── Керування ─────────────────────────
window.addEventListener('pointerdown', initAudio);
// Вимикає або вмикає весь звук одразу (клавіша M і кнопка в HUD).
function toggleSound() {
  const on = !(cfg.musOn || cfg.sfxOn);
  cfg.musOn = cfg.sfxOn = on;
  applyCfg();
  showMsg(on ? 'ЗВУК УВІМК.' : 'ЗВУК ВИМК.', 0.8, 'sm');
}
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
  if (e.code === 'KeyM') toggleSound();
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
window.addEventListener('blur', () => { input.keys.clear(); if (S.mode === 'play') togglePause(); });

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') { if (e.button === 2) useBomb(); return; }
  input.touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
  if (!input.useTarget) { input.tx = P.x; input.ty = P.y; }
  input.useTarget = true;
});
canvas.addEventListener('pointermove', (e) => {
  // Миша літаком не керує: інакше перк швидкості нічого не дає (курсор «телепортує» літак).
  if (e.pointerType !== 'mouse' && input.touch && input.touch.id === e.pointerId) {
    // Відносне перетягування: палець не закриває літак.
    const k = 2 * W / canvas.clientWidth * 1.25;
    input.tx = clamp(input.tx + (e.clientX - input.touch.x) * k, -W + 1.5, W - 1.5);
    input.ty = clamp(input.ty - (e.clientY - input.touch.y) * k, -H + 2, H - 3);
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
$('pauseBtn').addEventListener('click', togglePause);
$('muteBtn').addEventListener('click', (e) => { toggleSound(); e.currentTarget.blur(); });
$('cards').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) choosePerk(+c.dataset.i); });

// ───────────────────────── Головний цикл ─────────────────────────
playerHolder.position.set(P.x, P.y, 0);
shieldMesh.visible = false;
ui.hi.textContent = 'рекорд ' + hi;

let last = performance.now();
const DEBUG = new URLSearchParams(location.search).has('debug'); // ?debug — лічильник FPS і window.__game
const fpsEl = $('fps');
fpsEl.hidden = !DEBUG;
let fpsN = 0, fpsT = last;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsN++;
  if (!$('settings').classList.contains('hidden')) preview(now / 1000);
  if (DEBUG && now - fpsT >= 500) { fpsEl.textContent = Math.round(fpsN * 1000 / (now - fpsT)) + ' FPS'; fpsN = 0; fpsT = now; }
  if (S.mode === 'pause') return;

  S.time += dt;
  updateBackground(dt);
  if (S.mode === 'play') {
    const th = threat();
    S.playT += dt;
    if (threat() > th) { showMsg('ЗАГРОЗА ЗРОСЛА · ' + (threat() + 1), 1.8, 'sm'); sfx.elite(); }
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
if (DEBUG) window.__game = { S, P, enemies, pickups, pickQueue, hurtPlayer, shockPlayer, spawnEnemy, spawnElite, WAVES, dropStars, gainXp, choosePerk, get boss() { return boss; }, spawnBoss, startStage, world, ATK, BOSSES, pBullets };
