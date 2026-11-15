import { audioPause, initAudio, music } from './audio.js';
import { $ } from './core.js';
import { missilePool } from './fx.js';
import { eBullets, enemies, freshPlayer, hi, missiles, P, pBullets, pickups, queue, S, setHi } from './state.js';
import { freeEnemy } from './enemies.js';
import { clearBoss } from './bosses.js';
import { drones, input, playerHolder } from './player.js';
import { startStage } from './stage.js';
import { pickQueue, toggleInfo } from './perkui.js';

// ───────────────────────── Перебіг гри ─────────────────────────
function clearAll() {
  for (const e of enemies) freeEnemy(e);
  for (const b of pBullets) b.pool.put(b.m);
  for (const b of eBullets) b.pool.put(b.m);
  for (const m of missiles) missilePool.put(m.m);
  for (const p of pickups) p.pool.put(p.m);
  enemies.length = pBullets.length = eBullets.length = missiles.length = pickups.length = queue.length = pickQueue.length = 0;
  clearBoss();
}

function startGame() {
  audioPause(false);
  initAudio();
  clearAll();
  Object.assign(S, { mode: 'play', score: 0, shake: 0, kills: 0, playT: 0 });
  Object.assign(P, freshPlayer());
  for (const d of drones) d.m.visible = false;
  music.start('stage');
  input.useTarget = false;
  playerHolder.visible = true;
  for (const id of ['menu', 'over', 'pause', 'pick', 'settings']) $(id).classList.add('hidden');
  toggleInfo(false);
  $('hud').classList.remove('hidden');
  startStage(0);
}
function gameOver() {
  S.mode = 'over';
  music.stop();
  const record = S.score > hi;
  if (record) { setHi(S.score); try { localStorage.setItem('skystorm_hi', hi); } catch {} }
  $('final').innerHTML = `Рахунок: <b>${S.score.toLocaleString('uk')}</b><br>Етап: ${S.stage + 1} · Рівень: ${P.level + 1}` + (record ? '<br>🏆 Новий рекорд!' : `<br>Рекорд: ${hi.toLocaleString('uk')}`);
  $('over').classList.remove('hidden');
}
function togglePause() {
  if (S.mode === 'play') { S.mode = 'pause'; $('pause').classList.remove('hidden'); audioPause(true); }
  else if (S.mode === 'pause') { S.mode = 'play'; $('pause').classList.add('hidden'); audioPause(false); }
}

export {
  gameOver, startGame, togglePause,
};
