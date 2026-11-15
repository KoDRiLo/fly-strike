import { dmgMul, hpMul, threatLevel, xpForLevel } from './balance.js';
import { H } from './core.js';

// ───────────────────────── Стан гри ─────────────────────────
const STAGE_LEN = 45;
let hi = 0;
const setHi = (v) => { hi = v; };
try { hi = +localStorage.getItem('skystorm_hi') || 0; } catch {}

const S = { mode: 'menu', score: 0, stage: 0, stageT: 0, waveT: 0, phase: 'waves', phaseT: 0, shake: 0, time: 0, playT: 0, kills: 0, eliteDone: false };
// Усі характеристики літака; змінюються лише перками.
const freshPlayer = () => ({
  x: 0, y: -H + 6, vx: 0, hp: 100, maxHp: 100, lives: 0, inv: 2, dead: false, respawnT: 0,
  gun: 1, missiles: 0, drones: 0, laser: 0, laserT: 0, laserOn: 0, laserTick: 0, laserDmg: 1, laserTime: 1, laserCd: 1,
  chain: 0, chainT: 0, chainDmg: 1, chainJumps: 1, chainCd: 1, orbs: 0, orbR: 1, orbDmg: 3, bombs: 0, maxBombs: 0, shock: 0, shockT: 0, shield: 0, shieldMax: 0, shieldT: 0,
  dmg: 1, misDmg: 1, droneDmg: 1, droneGuns: 1, rate: 1, spd: 1, pierce: 0, bounce: 0, crit: 0, magnet: 7, regen: 0, luck: 0, xpMul: 1,
  xp: 0, level: 0, perks: {}, fireT: 0, misT: 0, droneT: 0, misSide: 1,
});
const P = freshPlayer();
// Складність росте з часом забігу: множник міцності ворогів.
// Щохвилини вороги стають трохи сильнішими: +35% міцності та +8% шкоди за рівень загрози.
const threat = () => threatLevel(S.playT);
const diff = () => hpMul(threat());
const threatDmg = () => dmgMul(threat());
const xpNeed = () => xpForLevel(P.level);
const enemies = [], pBullets = [], eBullets = [], missiles = [], pickups = [], queue = [];

const later = (delay, fn) => queue.push({ t: S.playT + delay, fn });

export {
  diff, eBullets, enemies, freshPlayer, hi, later, missiles, P, pBullets, pickups, queue, S, setHi, STAGE_LEN,
  threat, threatDmg, xpNeed,
};
