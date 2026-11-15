# AGENTS.md

Орієнтир по проєкту для ШІ-агентів і розробників: що де лежить і як із цим працювати.

## Що це

«Небесний Шторм» — браузерний вертикальний скрол-шутер із роглайк-перками на Three.js. Чистий JavaScript (ES-модулі), без збирання, без `package.json`, без тестів і лінтера. Усі ресурси (моделі, ландшафт, текстури, звук, музика) генеруються процедурно — у репозиторії немає жодного файлу з графікою чи аудіо.

## Запуск

```bash
python3 -m http.server 8000   # потім відкрити http://localhost:8000
```

Через `file://` гра не запуститься: модулі та import map потребують HTTP. Кроку збирання немає — після зміни файлу достатньо оновити сторінку.

## Дерево файлів

```
.
├── index.html              розмітка, усі стилі, import map, підключення src/main.js
├── src/
│   ├── main.js             ігрова логіка, стан, HUD, керування, головний цикл (~1300 рядків)
│   ├── models.js           моделі літаків, ворогів, босів; процедурні текстури
│   ├── world.js            біоми та прокручуваний ландшафт
│   └── audio.js            звукові ефекти та музика на Web Audio
├── vendor/
│   └── three.module.js     Three.js r170, мініфікований — не редагувати
├── README.md               опис для людей
└── AGENTS.md                цей файл
```

Залежності між модулями: `main.js` імпортує `models.js`, `world.js` і `audio.js`; `models.js` і `world.js` імпортують лише `three`; `audio.js` не має імпортів. Назва `three` розв'язується через import map в `index.html` на `./vendor/three.module.js`.

## index.html

- Весь CSS — в одному блоці `<style>`.
- `#game` — контейнер із портретними пропорціями; у ньому `<canvas id="c">` та шари інтерфейсу.
- `#hud` — рахунок, рекорд, етап, смуга боса, життя, міцність, досвід, кнопка бомби, повідомлення.
- Оверлеї (клас `.overlay`, ховаються класом `.hidden`): `#menu`, `#pause`, `#pick` (вибір перка), `#info` (довідник перків), `#settings`, `#over` (кінець гри).
- `main.js` звертається до елементів за `id`, тому перейменування `id` потребує правки в обох файлах.

## src/main.js

Один великий модуль, поділений коментарями-заголовками виду `// ───── Назва ─────`. Розділи за порядком:

| Розділ | Що всередині |
| --- | --- |
| Сцена | рендерер, камера, світло, `resize()`; розміри поля `H` (пів-висоти) і `W` (пів-ширини) |
| Ландшафт | `createWorld(scene)`, серпанок, `updateBackground()` |
| Частинки та кільця | пул із 1800 частинок, `explode()`, `sparks()`, `ring()` |
| Пули об'єктів | клас `Pool`, пули спрайтів куль і ракет, `sweep()` |
| Стан гри | `S` — стан сесії, `P` — гравець (`freshPlayer()`), масиви `enemies`, `pBullets`, `eBullets`, `missiles`, `pickups`; формули складності `threat()`, `diff()`, `xpNeed()` |
| HUD | `showMsg()`, `updateHud()`, `screenFlash()` |
| Вороги | таблиця `DEF` (характеристики типів), `WAVES` (шаблони хвиль), `ELITE`, `spawnEnemy()`, `spawnWave()`, `updateEnemies()` |
| Боси | `BOSSES`, атаки `ATK`, `spawnBoss()`, `damageBoss()`, `updateBoss()` |
| Зірки досвіду та перк-сфери | `STARS` (рідкості), `dropStars()`, `gainXp()`, `updatePickups()` |
| Гравець | `input`, `hurtPlayer()`, `killPlayer()`, ураження струмом (`SHOCK`), `GUN`, `useBomb()`, `updatePlayer()` |
| Снаряди | `hitTest()`, `applyHit()`, `updateBullets()` |
| Етапи | `STAGE_LEN`, `updateStage()` (фази `waves` → `warn` → `boss` → `clear` → `reward`), `startStage()` |
| Роглайк-перки | `PERKS`, `CATS`, `openPick()`, `choosePerk()` |
| Налаштування | `cfg`, `COLORS`, прев'ю літака, `applyCfg()`, `startGame()`, `gameOver()`, `togglePause()` |
| Керування | клавіатура, миша, дотик; `toWorld()` |
| Головний цикл | `frame(now)` через `requestAnimationFrame` |

Типові зміни:

- **Новий перк** — додати об'єкт у `PERKS`: `id`, `cat` (`atk` / `def` / `util`), `icon`, `name`, `desc`, `max`, `apply()`; необов'язково `ok()` (умова появи), `w` (вага), `rare`. Довідник `#info` і картки будуються з цього масиву.
- **Новий ворог** — модель у `BUILD` (`models.js`), характеристики в `DEF`, поведінка в `updateEnemies()`, поява у `WAVES`.
- **Баланс** — `STAGE_LEN`, `diff()`, `threatDmg()`, `xpNeed()`, `ELITE`, `DEF`.

## src/models.js

Низькополігональні моделі з примітивів. Угода про осі: ніс моделі дивиться в +Y, верх — +Z.

- Допоміжні фігури: `cyl`, `cone`, `box`, `plate` (симетрична пластина за контуром половини), `canopy`, `flame`, `prop`.
- `addOutline()` — чорний контур методом «вивернутої оболонки».
- `BUILD` — конструктори ворогів: `scout`, `fighter`, `kami`, `gunship`, `strafer`, `emine`, `mine`, `bomber`, `spinner`, `ace`.
- Експорт: `makePlayer()`, `makeDrone()`, `makeEnemy(type)` (клонує кешований прототип), `makeBoss(kind)`, `setHeroColors(plane, drone)`, `makeStar()`, текстури на canvas `glowTexture()`, `powerTexture()`, `starTexture()`, `orbTexture()`.
- Деталі з іменами `flame` і `spin` анімуються з `main.js` (пошук через `getObjectByName`).

## src/world.js

- Земля — три плитки, що прокручуються вниз і переставляються нагору. Кожна плитка — одна злита геометрія з кольорами у вершинах плюс одна для світних деталей, тобто два draw call на плитку.
- `Builder` — збирає фігури (`box`, `quad`, `pyr`, `ico`, `disc`, `cone`, `frustum`) у спільні масиви; `spot()` шукає вільне місце.
- Готові об'єкти: `palm`, `conifer`, `leafy`, `rock`, `house`.
- `BIOMES` — масив біомів (`name`, `ground`, `build(b)`): ОКЕАН, ЛІС, ПУСТЕЛЯ, МІСТО, ФЕРМИ, АРКТИКА, ВУЛКАН. Новий біом — новий елемент масиву.
- Експорт: `createWorld(scene)` → `{ name(i), setBiome(i, force), update(dt), debugEdge() }`, а також `CW`, `CH`, `GROUND_Z`, `BIOME_COUNT`.

## src/audio.js

- Усе синтезується на Web Audio: осцилятори (`tone`) і фільтрований шум (`noise`).
- Експорт: `initAudio()` (викликати після дії користувача), `setVolume(kind, v)` для `music` / `sfx`, об'єкт `sfx` (`shoot`, `missile`, `hit`, `boom`, `hurt`, `power`, `bomb`, `warn`, `star`, `level`, `zap`, `elite`, `clear`), об'єкт `music` (`start`, `mode`, `stop`, `preview`), `audioPause(paused)`.

## Збережені дані

`localStorage`: `skystorm_hi` — рекорд, `skystorm_cfg` — налаштування (гучність, увімкнення музики й ефектів, індекс кольору).

## Угоди

- Мова інтерфейсу та коментарів у коді — українська.
- Жодних зовнішніх ресурсів і залежностей: нову графіку чи звук робити процедурно.
- Продуктивність важлива: об'єкти, що часто з'являються (кулі, частинки, ракети), беруться з пулів — не створювати меші в головному циклі.
- Стиль коду компактний: короткі імена для глобального стану (`S`, `P`), таблиці даних замість класів.
