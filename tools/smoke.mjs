// Димовий тест у справжньому браузері: запускає гру в headless Chrome і перевіряє, що основні
// сценарії працюють без помилок виконання. Запуск: npm run smoke (потрібен Chrome або Chromium;
// шлях можна задати змінною CHROME).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Статичний сервер лише для цього прогону.
const server = createServer(async (req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const profile = await mkdtemp(path.join(tmpdir(), 'fly-strike-smoke-'));
const debugPort = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profile,
  '--no-first-run', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=600,750', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
chrome.on('error', (e) => { console.error('Не вдалося запустити Chrome: ' + e.message); process.exit(2); });

const failures = [];
const check = (name, ok, detail = '') => { console.log((ok ? '✔ ' : '✖ ') + name + (ok || !detail ? '' : ' — ' + detail)); if (!ok) failures.push(name); };
let ws;
try {
  let tabs = [];
  for (let i = 0; i < 60 && !tabs.length; i++) { try { tabs = await (await fetch('http://127.0.0.1:' + debugPort + '/json')).json(); } catch { await sleep(250); } }
  ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map(), pageErrors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  // Виконує вираз на сторінці; помилка у виразі потрапляє до списку помилок.
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: '(() => { ' + expr + ' })()', returnByValue: true, awaitPromise: true });
    const ex = r.result?.exceptionDetails;
    if (ex || !r.result) { pageErrors.push('eval: ' + (ex?.exception?.description || ex?.text || JSON.stringify(r.error))); return undefined; }
    return r.result.result.value;
  };
  const until = async (expr, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await ev('return ' + expr)) return true; await sleep(200); } return false; };
  const pickAll = async () => { for (let i = 0; i < 40 && (await ev('return __game.S.mode')) === 'pick'; i++) { await sleep(400); await ev("document.querySelector('#cards .card').click()"); } };
  const errorsSince = (n) => pageErrors.slice(n).join(' | ');

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: base + '/?debug' });
  check('сторінка завантажується, є __game', await until('!!window.__game', 15000), errorsSince(0));

  await ev("document.getElementById('startBtn').click()");
  check('гра стартує', await until("__game.S.mode === 'play'", 5000));
  await ev('__game.P.inv = 1e9; __game.P.xpMul = 0; __game.S.stageT = 1e6;');   // безсмертя, без рівнів і без хвиль

  const sets = await ev("const all = __game.BOSSES.flatMap((b) => b.atks); return { min: Math.min(...__game.BOSSES.map((b) => b.atks.length)), total: all.length, unique: new Set(all).size, missing: all.filter((a) => !__game.ATK[a]), unused: Object.keys(__game.ATK).filter((a) => !all.includes(a)) };");
  check('у кожного боса ≥ 3 атак, усі унікальні та описані', sets.min >= 3 && sets.total === sets.unique && !sets.missing.length && !sets.unused.length, JSON.stringify(sets));

  // Усі типи ворогів і хвиль.
  let mark = pageErrors.length;
  await ev("for (const t of ['scout','fighter','kami','gunship','strafer','mine','emine','bomber','spinner','ace']) __game.spawnEnemy(t, (Math.random() - 0.5) * 16, 12, { x0: 0, ph: 0, amp: 2, a: -Math.PI / 2, dir: 1, homeY: 12 }); __game.spawnElite(); for (const w of Object.keys(__game.WAVES)) __game.WAVES[w]();");
  await sleep(3000);
  check('усі вороги й хвилі працюють', pageErrors.length === mark, errorsSince(mark));

  // Кожен бос: виходить у бій, кожна його атака відпрацьовує 3 с ігрового часу.
  const stages = await ev('return __game.BOSSES.length');
  for (let s = 0; s < stages; s++) {
    mark = pageErrors.length;
    await ev('__game.startGame(); __game.P.inv = 1e9; __game.P.xpMul = 0; __game.S.stageT = 1e6; __game.startStage(' + s + '); __game.spawnBoss();');
    const fight = await until("__game.boss && __game.boss.state === 'fight'", 20000);
    const name = await ev("return document.getElementById('bossname').textContent");
    await ev("const b = __game.boss; for (const n of b.def.atks) { b.a1 = 0; b.c = 0; b.sum = false; for (let i = 0; i < 60; i++) __game.ATK[n](b, 0.05); }");
    await sleep(1200);
    check('бос ' + (s + 1) + ': ' + name, fight && pageErrors.length === mark, errorsSince(mark));
  }

  // Смерть боса → нагорода → наступний етап.
  mark = pageErrors.length;
  await ev('__game.startGame(); __game.P.inv = 1e9; __game.S.stageT = 1e6; __game.spawnBoss();');
  await until("__game.boss && __game.boss.state === 'fight'", 20000);
  await ev('__game.P.dmg = 1e6;');
  const dead = await until('!__game.boss', 40000);
  const reward = await until("__game.S.mode === 'pick'", 30000);
  await pickAll(); await sleep(800); await pickAll();
  check('перемога над босом веде до нагороди й наступного етапу', dead && reward && (await until('__game.S.stage === 1', 15000)) && pageErrors.length === mark, errorsSince(mark));

  // Кожен перк застосовується, уся зброя працює разом.
  mark = pageErrors.length;
  await ev('__game.startGame(); const P = __game.P; P.inv = 1e9; P.xpMul = 0; __game.S.stageT = 1e6; for (const p of __game.PERKS) { P.perks[p.id] = 1; p.apply(P); } for (let i = 0; i < 8; i++) __game.spawnEnemy("fighter", -10 + i * 3, 4 + (i % 3) * 4, { ph: i }).hp = 300; P.y = 0;');
  await sleep(4000);
  const used = await ev('const P = __game.P; return { laser: P.laser, chain: P.chain, orbs: P.orbs, drones: P.drones, missiles: P.missiles, kills: __game.S.kills };');
  check('усі перки застосовуються, зброя працює', pageErrors.length === mark && used.laser === 1 && used.chain === 1 && used.orbs === 2 && used.drones === 1, errorsSince(mark) || JSON.stringify(used));

  // Вибір перка через картки.
  mark = pageErrors.length;
  await ev('__game.P.xpMul = 1; __game.gainXp(60);');
  const picking = await until("__game.S.mode === 'pick'", 5000);
  const cards = await ev("return document.querySelectorAll('#cards .card').length");
  await pickAll();
  check('новий рівень відкриває вибір із трьох карток', picking && cards === 3 && (await ev('return __game.S.mode')) === 'play' && pageErrors.length === mark, errorsSince(mark));

  // Кнопки паузи та звуку.
  mark = pageErrors.length;
  await ev("document.getElementById('pauseBtn').click()");
  const paused = (await ev('return __game.S.mode')) === 'pause';
  await ev("document.getElementById('resumeBtn').click()");
  const icon0 = await ev("return document.getElementById('muteBtn').textContent");
  await ev("document.getElementById('muteBtn').click()");
  const icon1 = await ev("return document.getElementById('muteBtn').textContent");
  await ev("document.getElementById('muteBtn').click()");
  check('кнопки паузи та звуку', paused && (await ev('return __game.S.mode')) === 'play' && icon0 !== icon1 && pageErrors.length === mark, errorsSince(mark));

  // Загибель → кінець гри → новий забіг.
  mark = pageErrors.length;
  await ev('const P = __game.P; P.lives = 0; P.inv = 0; P.shield = P.shieldMax = 0; P.hp = 1; __game.hurtPlayer(50);');
  const over = await until("__game.S.mode === 'over'", 30000);
  await ev("document.getElementById('againBtn').click()");
  await sleep(1000);
  const fresh = await ev('return { mode: __game.S.mode, score: __game.S.score, enemies: __game.enemies.length, boss: !!__game.boss, level: __game.P.level, laser: __game.P.laser }');
  check('кінець гри й новий забіг із чистого стану', over && fresh.mode === 'play' && fresh.score === 0 && fresh.enemies === 0 && !fresh.boss && fresh.level === 0 && fresh.laser === 0 && pageErrors.length === mark, errorsSince(mark) || JSON.stringify(fresh));

  // Зіпсовані збережені налаштування не ламають запуск; без ?debug налагодження вимкнене.
  mark = pageErrors.length;
  await ev("localStorage.setItem('skystorm_cfg', '{\"mus\":\"x\",\"sfx\":null,\"color\":\"__proto__\"}'); localStorage.setItem('skystorm_hi', 'abc');");
  await send('Page.navigate', { url: base + '/' });
  const loaded = await until("document.getElementById('colName').textContent.length > 0", 15000);
  const plain = await ev("return { game: typeof window.__game, fpsHidden: document.getElementById('fps').hidden }");
  await ev("document.getElementById('startBtn').click()");
  const started = await until("document.getElementById('menu').classList.contains('hidden') && !document.getElementById('hud').classList.contains('hidden')", 5000);
  check('зіпсовані налаштування не заважають запуску, налагодження вимкнене без ?debug', loaded && started && plain.game === 'undefined' && plain.fpsHidden && pageErrors.length === mark, errorsSince(mark));

  check('жодної помилки виконання за весь прогін', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
} catch (e) {
  check('прогін завершився', false, e.stack || String(e));
} finally {
  ws?.close();
  chrome.kill();
  server.close();
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
console.log(failures.length ? '\nНе пройдено: ' + failures.length : '\nУсе пройдено');
process.exit(failures.length ? 1 : 0);
