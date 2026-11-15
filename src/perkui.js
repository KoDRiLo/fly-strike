import { sfx } from './audio.js';
import { $ } from './core.js';
import { P, S } from './state.js';
import { input } from './player.js';
import { CATS, PERKS, rollPerks } from './perks.js';

// ───────────────────────── Вибір перка та довідка ─────────────────────────
const pickQueue = [];
let pickChoices = [], pickThen = null, pickAt = 0;
function openPick() {
  const req = pickQueue.shift();
  pickChoices = rollPerks(P);
  if (!pickChoices.length) { req.then?.(); return; }
  pickThen = req.then;
  $('pickTitle').textContent = req.title;
  $('cards').innerHTML = pickChoices.map((p, i) => {
    const lvl = P.perks[p.id] || 0;
    const pips = p.max > 20 ? '' : '●'.repeat(lvl) + '◉' + '○'.repeat(p.max - lvl - 1);
    return `<button class="card ${p.cat}${p.rare ? ' rare' : ''}" data-i="${i}"><em>${p.rare ? 'РІДКІСНИЙ' : CATS[p.cat]}</em><span class="ico">${p.icon}</span><b>${p.name}</b>` +
      `<span class="desc">${p.desc}</span><span class="pips">${pips}</span><kbd>${i + 1}</kbd></button>`;
  }).join('');
  S.mode = 'pick';
  pickAt = performance.now();
  input.keys.clear();
  $('pick').classList.remove('hidden');
}
function choosePerk(i) {
  const p = pickChoices[i];
  if (S.mode !== 'pick' || !p || performance.now() < pickAt + 350) return; // захист від випадкового кліку
  P.perks[p.id] = (P.perks[p.id] || 0) + 1;
  p.apply(P);
  sfx.power();
  $('pick').classList.add('hidden');
  S.mode = 'play';
  P.inv = Math.max(P.inv, 1);
  const then = pickThen;
  pickThen = null;
  then?.();
  if (pickQueue.length) openPick();
}

// Довідка: список усіх перків, згенерований з PERKS.
$('infoList').innerHTML = Object.keys(CATS).map((cat) =>
  `<h3 class="${cat}">${CATS[cat]}</h3>` + PERKS.filter((p) => p.cat === cat).map((p) =>
    `<div class="row ${cat}${p.rare ? ' rare' : ''}"><span class="ico">${p.icon}</span><div><b>${p.name}</b>${p.rare ? '<em>рідкісний</em>' : ''}<br>${p.desc}</div>` +
    `<small>${p.max > 20 ? 'без ліміту' : 'до ' + p.max}</small></div>`).join('')).join('');
const toggleInfo = (show) => $('info').classList.toggle('hidden', !show);
$('infoBtn').addEventListener('click', () => toggleInfo(true));
$('infoBtn2').addEventListener('click', () => toggleInfo(true));
$('infoBack').addEventListener('click', () => toggleInfo(false));

export {
  choosePerk, openPick, pickQueue, toggleInfo,
};
