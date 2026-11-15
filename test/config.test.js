import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CFG, sanitizeCfg } from '../src/config.js';

test('порожнє або зіпсоване сховище дає типові налаштування', () => {
  for (const raw of [null, undefined, 'рядок', 42, [], true]) assert.deepEqual(sanitizeCfg(raw, 8), DEFAULT_CFG);
});

test('коректні значення зберігаються', () => {
  const cfg = { mus: 35, sfx: 0, musOn: false, sfxOn: true, color: 5 };
  assert.deepEqual(sanitizeCfg(cfg, 8), cfg);
});

test('некоректні поля замінюються типовими, решта лишається', () => {
  const out = sanitizeCfg({ mus: 'гучно', sfx: NaN, musOn: 'так', sfxOn: false, color: 99, extra: 1 }, 8);
  assert.deepEqual(out, { ...DEFAULT_CFG, sfxOn: false });
});

test('гучність обмежується діапазоном 0–100', () => {
  assert.equal(sanitizeCfg({ mus: 250 }, 8).mus, 100);
  assert.equal(sanitizeCfg({ sfx: -5 }, 8).sfx, 0);
  assert.equal(sanitizeCfg({ mus: 33.6 }, 8).mus, 34);
});

test('індекс кольору має бути цілим у межах палітри', () => {
  for (const color of [-1, 8, 2.5, '3', '__proto__', null]) assert.equal(sanitizeCfg({ color }, 8).color, 0);
  assert.equal(sanitizeCfg({ color: 7 }, 8).color, 7);
});

test('типові налаштування не змінюються викликом', () => {
  const out = sanitizeCfg({ mus: 10 }, 8);
  out.color = 3;
  assert.equal(DEFAULT_CFG.mus, 70);
  assert.equal(DEFAULT_CFG.color, 0);
});
