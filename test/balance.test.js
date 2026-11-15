import test from 'node:test';
import assert from 'node:assert/strict';
import { threatLevel, hpMul, dmgMul, xpForLevel, bossHp, starRarity, weightedPick } from '../src/balance.js';

test('загроза росте щохвилини', () => {
  assert.equal(threatLevel(0), 0);
  assert.equal(threatLevel(59.9), 0);
  assert.equal(threatLevel(60), 1);
  assert.equal(threatLevel(185), 3);
});

test('множники складності', () => {
  assert.equal(hpMul(0), 1);
  assert.equal(hpMul(2), 1.7);
  assert.equal(dmgMul(0), 1);
  assert.ok(Math.abs(dmgMul(5) - 1.4) < 1e-9);
});

test('досвід для рівня зростає', () => {
  assert.equal(xpForLevel(0), 12);
  assert.equal(xpForLevel(1), 20);
  for (let l = 0; l < 30; l++) assert.ok(xpForLevel(l + 1) > xpForLevel(l));
});

test('міцність боса залежить від кола й часу', () => {
  assert.equal(bossHp(520, 0, 0), 520);
  assert.equal(bossHp(520, 1, 0), 832);
  assert.equal(bossHp(1000, 0, 400), 2000);
});

test('рідкість зірок: пороги без удачі', () => {
  assert.equal(starRarity(0, 0, 0), 3);
  assert.equal(starRarity(0, 0, 0.011), 3);
  assert.equal(starRarity(0, 0, 0.012), 2);
  assert.equal(starRarity(0, 0, 0.069), 2);
  assert.equal(starRarity(0, 0, 0.07), 1);
  assert.equal(starRarity(0, 0, 0.269), 1);
  assert.equal(starRarity(0, 0, 0.27), 0);
  assert.equal(starRarity(0, 0, 0.999), 0);
});

test('удача та бонус підвищують рідкість і не знижують її', () => {
  assert.equal(starRarity(0, 0, 0.015), 2);
  assert.equal(starRarity(3, 0, 0.015), 3);
  assert.equal(starRarity(0, 1.5, 0.1), 2);
  for (let r = 0; r < 1; r += 0.01) assert.ok(starRarity(3, 1, r) >= starRarity(0, 0, r));
});

test('weightedPick: різні елементи, не більше n, pool не змінюється', () => {
  const pool = [{ id: 'a' }, { id: 'b', w: 2 }, { id: 'c', w: 0.2 }, { id: 'd' }];
  for (let i = 0; i < 200; i++) {
    const out = weightedPick(pool, 3);
    assert.equal(out.length, 3);
    assert.equal(new Set(out).size, 3);
  }
  assert.equal(pool.length, 4);
  assert.equal(weightedPick(pool.slice(0, 2), 3).length, 2);
  assert.deepEqual(weightedPick([], 3), []);
});

test('weightedPick: вага визначає шанс', () => {
  const pool = [{ id: 'rare', w: 0.2 }, { id: 'common', w: 1.8 }];
  assert.equal(weightedPick(pool, 1, () => 0.05)[0].id, 'rare');   // 0.05 * 2 = 0.1 < 0.2
  assert.equal(weightedPick(pool, 1, () => 0.5)[0].id, 'common');
  assert.equal(weightedPick(pool, 1, () => 0.999999)[0].id, 'common');
});
