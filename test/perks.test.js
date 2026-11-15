import test from 'node:test';
import assert from 'node:assert/strict';
import { PERKS, CATS, rollPerks } from '../src/perks.js';

// мінімальний гравець з полями, які читають і змінюють перки
const player = (over = {}) => ({
  hp: 100, maxHp: 100, lives: 0, gun: 1, missiles: 0, drones: 0, bombs: 0, maxBombs: 0, shield: 0, shieldMax: 0,
  dmg: 1, misDmg: 1, droneDmg: 1, droneGuns: 1, rate: 1, spd: 1, pierce: 0, bounce: 0, crit: 0, magnet: 7, regen: 0, luck: 0, xpMul: 1,
  perks: {}, ...over,
});

test('кожен перк описаний повністю', () => {
  const ids = new Set();
  for (const p of PERKS) {
    assert.ok(p.id && !ids.has(p.id), 'унікальний id: ' + p.id);
    ids.add(p.id);
    assert.ok(CATS[p.cat], 'відома категорія: ' + p.id);
    assert.ok(p.icon && p.name && p.desc, 'тексти: ' + p.id);
    assert.ok(p.max >= 1, 'max: ' + p.id);
    assert.equal(typeof p.apply, 'function');
  }
});

test('кожен перк щось змінює в гравцеві', () => {
  for (const p of PERKS) {
    const P = player({ hp: 40, missiles: 1, drones: 1 });
    const before = JSON.stringify(P);
    p.apply(P);
    assert.notEqual(JSON.stringify(P), before, p.id);
  }
});

const perk = (id) => PERKS.find((p) => p.id === id);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ≠ ' + b);

test('баланс: прирости перків', () => {
  const P = player({ hp: 40 });
  perk('spd').apply(P); near(P.spd, 1.05);
  perk('rate').apply(P); near(P.rate, 1.05);
  perk('crit').apply(P); near(P.crit, 0.01);
  perk('magnet').apply(P); near(P.magnet, 7.7);
  perk('magnet').apply(P); near(P.magnet, 8.4);
  perk('hp').apply(P);
  assert.equal(P.maxHp, 125);
  assert.equal(P.hp, 65, 'броня додає стільки ж міцності, але не ремонтує повністю');
});

test('баланс: ліміти перків', () => {
  assert.equal(perk('life').max, 2);
  assert.equal(perk('bounce').max, 1);
  for (const id of ['spd', 'crit', 'rate', 'magnet']) assert.ok(perk(id).max > 20, id + ' без ліміту');
});

test('rollPerks дає три різні перки', () => {
  for (let i = 0; i < 300; i++) {
    const out = rollPerks(player());
    assert.equal(out.length, 3);
    assert.equal(new Set(out.map((p) => p.id)).size, 3);
  }
});

test('rollPerks не пропонує перки на максимумі чи з невиконаною умовою', () => {
  const P = player({ perks: { gun: 4, bounce: 1 } });   // немає ракет і дронів, міцність повна
  for (let i = 0; i < 300; i++) {
    for (const p of rollPerks(P)) {
      assert.ok(!['gun', 'bounce'].includes(p.id), 'на максимумі: ' + p.id);
      assert.ok(!['misdmg', 'dronedmg', 'dronegun', 'repair'].includes(p.id), 'умова не виконана: ' + p.id);
    }
  }
});

test('залежні перки відкриваються після базових', () => {
  const P = player({ missiles: 1, drones: 1, hp: 10 });
  const seen = new Set();
  for (let i = 0; i < 2000; i++) for (const p of rollPerks(P)) seen.add(p.id);
  for (const id of ['misdmg', 'dronedmg', 'dronegun', 'repair']) assert.ok(seen.has(id), id);
});

test('коли доступних перків менше трьох, повертаються всі', () => {
  const perks = Object.fromEntries(PERKS.map((p) => [p.id, p.max]));
  delete perks.luck;
  assert.deepEqual(rollPerks(player({ perks })).map((p) => p.id), ['luck']);
  perks.luck = 3;
  assert.deepEqual(rollPerks(player({ perks })), []);
});
