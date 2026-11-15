import { music, sfx } from './audio.js';
import { world } from './core.js';
import { P, S, STAGE_LEN } from './state.js';
import { showMsg } from './hud.js';
import { spawnWave } from './enemies.js';
import { spawnBoss } from './bosses.js';
import { pickQueue } from './perkui.js';

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

export {
  startStage, updateStage,
};
