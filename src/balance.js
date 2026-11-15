// Чисті формули балансу: без DOM і Three.js, тож їх можна перевіряти тестами в Node.

// Рівень загрози росте щохвилини забігу.
export const threatLevel = (playT) => Math.floor(playT / 60);
// +35% міцності ворогів і +8% їхньої шкоди за кожен рівень загрози.
export const hpMul = (threat) => 1 + 0.35 * threat;
export const dmgMul = (threat) => 1 + 0.08 * threat;
// Досвід, потрібний для наступного рівня.
export const xpForLevel = (level) => 12 + 8 * level;
// Міцність боса: базова × коло проходження × час забігу.
export const bossHp = (base, loop, playT) => Math.round(base * (1 + 0.6 * loop) * (1 + playT / 400));

// Рідкість зірки 0..3 (зелена → синя → фіолетова → золота) для випадкового r з [0, 1).
export function starRarity(luck, boost, r) {
  const k = 1 + luck * 0.6 + boost;
  if (r < 0.012 * k) return 3;
  if (r < 0.07 * k) return 2;
  if (r < 0.27 * Math.min(k, 2.5)) return 1;
  return 0;
}

// До n різних елементів з pool з урахуванням ваги w (типово 1). Сам pool не змінюється.
export function weightedPick(pool, n, rng = Math.random) {
  const rest = pool.slice(), out = [];
  while (out.length < n && rest.length) {
    let r = rng() * rest.reduce((a, p) => a + (p.w || 1), 0), i = 0;
    while (i < rest.length - 1 && (r -= rest[i].w || 1) > 0) i++;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}
