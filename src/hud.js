import { $ } from './core.js';
import { hi, P, S, threat, xpNeed } from './state.js';
import { boss } from './bosses.js';

// ───────────────────────── HUD ─────────────────────────
const ui = { score: $('score'), hi: $('hi'), stage: $('stage'), hp: $('hp'), lives: $('lives'), weap: $('weap'), xp: $('xp'), bombs: $('bombs'), msg: $('msg'), bossbar: $('bossbar'), bossname: $('bossname'), bosshp: $('bosshp'), flash: $('flash'), bombBtn: $('bombBtn') };
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
    ui.bombBtn.style.display = P.maxBombs ? '' : 'none'; // бомби з'являються лише з перком
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

export {
  screenFlash, showMsg, ui, updateHud,
};
