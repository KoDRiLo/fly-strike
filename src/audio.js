// Процедурні звуки на WebAudio — без жодних файлів.
let ctx = null, master = null, sfxGain = null, noiseBuf = null, lastShot = 0, lastStar = 0;
let paused = false; // гра на паузі або вкладка прихована — звук не відновлюється від випадкового кліку

export function initAudio() {
  if (ctx) { if (!paused) ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.3;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.connect(master);
  applyVolume();
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

// Гучність 0..1 окремо для музики та ефектів (0 = вимкнено).
const vol = { music: 0.7, sfx: 0.8 };
function applyVolume() {
  if (!ctx) return;
  musicGain.gain.value = 0.8 * vol.music;
  sfxGain.gain.value = 1.25 * vol.sfx;
}
export function setVolume(kind, v) {
  vol[kind] = v;
  applyVolume();
}

function tone(type, f0, f1, dur, gain, delay = 0) {
  if (!ctx || vol.sfx === 0) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, gain, f0, f1) {
  if (!ctx || vol.sfx === 0) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(sfxGain);
  s.start(t, Math.random()); s.stop(t + dur + 0.02);
}

export const sfx = {
  shoot() {
    if (!ctx || ctx.currentTime - lastShot < 0.09) return;
    lastShot = ctx.currentTime;
    tone('square', 880, 300, 0.06, 0.05);
  },
  missile() { noise(0.25, 0.12, 2500, 400); },
  hit() { tone('triangle', 300, 120, 0.05, 0.12); },
  laser() { tone('sawtooth', 700, 1900, 0.4, 0.07); tone('sine', 1400, 2800, 0.4, 0.05); },
  chain() { tone('square', 1900, 260, 0.11, 0.07); noise(0.07, 0.1, 7000, 2500); },
  crit() { tone('square', 1500, 600, 0.08, 0.1); tone('triangle', 2400, 1200, 0.06, 0.08); },
  boom(size = 1) {
    noise(0.25 + size * 0.25, Math.min(0.9, 0.3 + size * 0.2), 1800 / size, 60);
    tone('sine', 120 / size, 30, 0.3 + size * 0.15, 0.4);
  },
  hurt() { tone('sawtooth', 220, 60, 0.25, 0.3); noise(0.2, 0.3, 1200, 200); },
  power() { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.09, 0.1, i * 0.06)); },
  bomb() { noise(1.3, 1, 3000, 40); tone('sine', 90, 20, 1.2, 0.7); },
  warn() { for (let i = 0; i < 3; i++) tone('sawtooth', 440, 660, 0.45, 0.18, i * 0.6); },
  star(rar = 0) {
    if (!ctx || ctx.currentTime - lastStar < 0.04) return;
    lastStar = ctx.currentTime;
    tone('sine', 900 + rar * 260, 1500 + rar * 320, 0.07, 0.07 + rar * 0.02);
  },
  level() { [659, 784, 988, 1319].forEach((f, i) => tone('triangle', f, f, 0.14, 0.16, i * 0.07)); },
  zap() { tone('square', 110, 60, 0.14, 0.14); tone('sawtooth', 2200, 500, 0.09, 0.07); noise(0.08, 0.15, 6000, 2500); },
  elite() { tone('sawtooth', 180, 90, 0.5, 0.2); tone('square', 360, 180, 0.5, 0.08); },
  clear() { [392, 523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.2, 0.2, i * 0.12)); },
};

// ───────────── Фонова музика: процедурний секвенсор (ударні, бас, арпеджіо, мелодія) ─────────────
let musicGain = null, mTimer = null, mStep = 0, mNext = 0, mMode = 'stage';
const SONG = {
  stage: { bpm: 122, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] }, // Am F C G
  boss: { bpm: 146, chords: [[52, 55, 59], [52, 55, 59], [48, 52, 55], [50, 54, 57]] },  // Em Em C D
};
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function mNote(type, midi, t, dur, vol, cutoff) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = mtof(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  if (cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    o.connect(f).connect(g);
  } else o.connect(g);
  g.connect(musicGain);
  o.start(t); o.stop(t + dur + 0.02);
}
function mNoise(t, dur, vol, type, freq) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(musicGain);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function mKick(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g).connect(musicGain);
  o.start(t); o.stop(t + 0.2);
}
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
function playStep(s, t, sd) {
  const hard = mMode === 'boss', i = s % 16;
  const ch = SONG[mMode].chords[Math.floor(s / 16) % 4];
  if (i % 4 === 0) mKick(t);
  if (i === 4 || i === 12) mNoise(t, 0.13, 0.2, 'bandpass', 1800);
  if (i % 2 === 0 || hard) mNoise(t, 0.03, i % 4 === 2 ? 0.08 : 0.04, 'highpass', 7000);
  if (hard || [0, 3, 6, 8, 11, 14].includes(i)) mNote('sawtooth', ch[0] - 24 + (hard && i % 4 === 2 ? 12 : 0), t, sd * 0.95, 0.17, 480);
  mNote('square', ch[ARP[i % 8]] + (i >= 8 ? 12 : 0), t, sd * 0.8, 0.03, 2600);
  if (i === 0) for (const n of ch) mNote('sine', n, t, sd * 16, 0.035);
  if (Math.floor(s / 64) % 2 === 1 || hard) {
    const lead = { 0: ch[2] + 12, 6: ch[1] + 12, 8: ch[0] + 12, 12: ch[1] + 12, 14: ch[2] + 12 }[i];
    if (lead) mNote('triangle', lead, t, sd * 3, 0.09);
  }
}
function schedule() {
  if (!ctx || ctx.state !== 'running' || vol.music === 0) return;
  const sd = 60 / SONG[mMode].bpm / 4;
  if (mNext < ctx.currentTime) mNext = ctx.currentTime + 0.05;
  while (mNext < ctx.currentTime + 0.25) {
    playStep(mStep++, mNext, sd);
    mNext += sd;
  }
}
export const music = {
  start(mode = 'stage') {
    mMode = mode; mStep = 0; mNext = 0;
    if (!mTimer) mTimer = setInterval(schedule, 60);
  },
  mode(mode) { if (mode !== mMode) { mMode = mode; mStep = 0; } },
  stop() { clearInterval(mTimer); mTimer = null; },
  // у налаштуваннях з меню: вмикає музику, щоб було чути повзунок
  preview(idle) { if (idle && !mTimer) this.start('stage'); },
};
export function audioPause(on) {
  paused = on;
  if (ctx) on ? ctx.suspend() : ctx.resume();
}
