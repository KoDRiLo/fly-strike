// Налаштування гравця: типові значення та перевірка того, що прочитано з localStorage.
// Чистий модуль (без DOM), покритий тестами.

export const DEFAULT_CFG = { mus: 70, sfx: 80, musOn: true, sfxOn: true, color: 0 };

// Повертає коректні налаштування: усе зіпсоване чи невідоме замінюється типовим.
export function sanitizeCfg(raw, colorCount) {
  const cfg = { ...DEFAULT_CFG };
  if (!raw || typeof raw !== 'object') return cfg;
  const vol = (v, d) => (Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : d);
  cfg.mus = vol(raw.mus, cfg.mus);
  cfg.sfx = vol(raw.sfx, cfg.sfx);
  if (typeof raw.musOn === 'boolean') cfg.musOn = raw.musOn;
  if (typeof raw.sfxOn === 'boolean') cfg.sfxOn = raw.sfxOn;
  if (Number.isInteger(raw.color) && raw.color >= 0 && raw.color < colorCount) cfg.color = raw.color;
  return cfg;
}
