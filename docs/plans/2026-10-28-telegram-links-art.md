# Deploy, Telegram, Challenge Links & Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Выложить «Затмение» на GitHub Pages, запустить его как Telegram Mini App тем же кодом, добавить ссылки-вызовы без сервера, кнопку «Поделиться», облачное сохранение Telegram и портреты героинь.

**Architecture:** Один интерфейс `Platform` с двумя реализациями (web, telegram) изолирует всё, что зависит от Telegram; остальной код зовёт только `platform.*`. Код вызова это самодостаточная base64url-строка с замороженными таблицами индексов, призрак это обычный бот с чужой колодой и seed. Облако Telegram хранит профиль, колоды и настройки, матч остаётся локальным. Арт генерируется скриптом вне сборки и попадает в репозиторий как WebP.

**Tech Stack:** существующий стек (React 18, Vite 5, Zustand 4, Vitest 2, Playwright 1.49) плюс `sharp` как devDependency для упаковки арта, `telegram-web-app.js` динамически, GitHub Actions.

**Spec:** `docs/specs/2026-10-28-telegram-links-art-design.md` (интерфейс: `docs/specs/2026-10-28-battle-ui-design.md`; движок: `docs/specs/2026-10-27-battle-engine-design.md`, не меняется)

## Global Constraints

- `src/engine/**` не меняется. `src/game/**` и `src/store/**` не импортируют React (тест `src/test/layering.test.ts`); движок импортируется только через `src/engine/index.ts`.
- `src/platform/**` единственное место, где встречается `window.Telegram`; остальной код получает `Platform` через `getPlatform()`.
- Все строки интерфейса в `src/i18n/ru.ts`; цвета и размеры через токены.
- Секреты только из переменных окружения: `OPENAI_API_KEY` читается в `scripts/gen-art.ts` и не попадает ни в логи, ни в репозиторий; `art/out/` в `.gitignore`.
- Код вызова: алфавит base64url без `=`, длина ≤ 100 символов; таблицы `CODEC_V1_HEROES`/`CODEC_V1_CARDS` после коммита не переупорядочиваются.
- Облако: значение ≤ 4096 байт на ключ; запись с задержкой 1000 мс; превышение не бросает.
- Тесты с русскими описаниями; коммит после каждой задачи (`feat(platform): …`, `feat(links): …`, `feat(art): …`, `chore(deploy): …`).

## Review Focus

1. Параметр запуска Telegram с битым кодом (чужая версия, мусор, пустая строка): ожидается экран «Ссылка не работает» и «В меню», а не падение (тест в Task 5).
2. Значение для облака длиннее 4096 байт: запись пропускается с предупреждением, локальное сохранение всё равно записано (тест в Task 7).
3. Перезагрузка посреди матча-вызова: `session.challenge` восстановлен, экран результата показывает «Ответный вызов» и имя соперника (тест в Task 5).
4. Шаринг в браузере без `navigator.share` и с отказом буфера обмена: результат `'none'` и подсказка, без исключения (тест в Task 2).
5. Сборка с `BASE_PATH=/eclipse/`: пути к чанкам, стилям и арту начинаются с `/eclipse/`, хэш-маршруты работают (тест в Task 1 и Task 8).

---

## Карта файлов

```
.github/workflows/deploy.yml; vite.config.ts (base); src/config.ts                 Task 1
src/platform/{types,web,telegram,index}.ts                                          Task 2
src/store/ui.ts (backHandler); src/screens/* (регистрация); BeatEffects (haptic)     Task 3
src/game/links/{codec,url}.ts                                                        Task 4
src/screens/Challenge.tsx; router; store/match (challenge); Result (вызов)           Task 5
src/game/share.ts; src/screens/NamePrompt.tsx; Result/Menu кнопки; profile.name      Task 6
src/game/save/cloud.ts; src/main.tsx (async boot); store/index (cloud persistence)   Task 7
art/style.md; art/prompts.ts; scripts/{gen-art,art-pack}.ts; src/ui/HeroArt.tsx       Task 8
e2e/challenge.spec.ts; docs                                                           Task 9
```

---

### Task 1: Базовый путь, конфиг и деплой

**Files:**
- Modify: `vite.config.ts`, `package.json` (script `build:pages`), `.gitignore` (`art/out/`)
- Create: `src/config.ts`, `.github/workflows/deploy.yml`
- Test: `src/config.test.ts`, `scripts/check-base.test.ts` (node)

**Interfaces:**
- Produces (`src/config.ts`): `export const SITE_URL = 'https://alessioilini.github.io/eclipse/'`; `export const TG_BOT: string | null = null`; `export const TG_APP = 'play'`; `export const BASE = import.meta.env.BASE_URL` (строка с завершающим `/`).
- `vite.config.ts`: `base: process.env.BASE_PATH ?? '/'`.
- `deploy.yml`: триггер `push` на `main` и `workflow_dispatch`; jobs `build` (checkout, `actions/setup-node@v4` node 20 с кэшем npm, `npm ci`, `npm test`, `BASE_PATH=/eclipse/ npm run build`, `actions/upload-pages-artifact@v3` с `path: dist`) и `deploy` (`actions/deploy-pages@v4`, permissions `pages: write`, `id-token: write`, environment `github-pages`).

- [ ] **Step 1: Падающие тесты**

```ts
it('SITE_URL заканчивается на /, TG_APP = play')
it('сборка с BASE_PATH=/eclipse/ даёт index.html с путями /eclipse/assets/')  // выполняет `BASE_PATH=/eclipse/ npx vite build --outDir .tmp-dist` через child_process, читает index.html, удаляет каталог; помечен как медленный, таймаут 120 с
```

- [ ] **Step 2–4:** FAIL → реализовать → `npm test`, `BASE_PATH=/eclipse/ npm run build` PASS
- [ ] **Step 5: Commit** — `git commit -am "chore(deploy): base path, site config, GitHub Pages workflow"`

---

### Task 2: Платформенный адаптер

**Files:**
- Create: `src/platform/types.ts`, `src/platform/web.ts`, `src/platform/telegram.ts`, `src/platform/index.ts`
- Test: `src/platform/platform.test.ts` (jsdom)

**Interfaces:**
- Produces (`types.ts`): `Platform` и `CloudStorage` ровно как в спеке §3, плюс `setClosingConfirmation(on: boolean): void` (Telegram: `enableClosingConfirmation`/`disableClosingConfirmation`; web: пусто).
- Produces (`index.ts`): `createPlatform(win: Window = window): Promise<Platform>` — Telegram, если `win.location.hash` или `win.location.search` содержит `tgWebAppPlatform`, иначе web; для Telegram вставляет `<script src="https://telegram.org/js/telegram-web-app.js">` и ждёт `win.Telegram?.WebApp` не дольше 3000 мс (`setTimeout`), при неудаче возвращает web; `getPlatform(): Platform` возвращает созданную (бросает, если `createPlatform` не вызывался); `setPlatformForTests(p)`.
- `web.ts`: `share` → `navigator.share({ text, url })` если есть → `'native'`; иначе `navigator.clipboard.writeText(text + ' ' + url)` → `'clipboard'`; любой отказ → `'none'`; `backButton` хранит обработчик для `useAppBack` (Task 3), `haptic` пустой, `cloud: null`, `user: null`, `startParam: null`.
- `telegram.ts`: обёртка над `win.Telegram.WebApp`: `ready()` = `ready()` + `expand()`; `user` из `initDataUnsafe.user` (`id` как строка, `first_name`); `startParam` из `initDataUnsafe.start_param`; `backButton.show(fn)` = `BackButton.onClick(fn)` + `show()`, `hide()` = `offClick` + `hide()`; `haptic` → `HapticFeedback.impactOccurred('light'|'medium')` / `notificationOccurred('success'|'error')`; `share` → `openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text))` → `'telegram'`; `cloud` оборачивает `CloudStorage.getItem/setItem/removeItem` (колбэки → промисы), `setItem` отвергает значения длиннее 4096 ошибкой `Error('cloud value too long')`.

- [ ] **Step 1: Падающие тесты** — web: `share` с `navigator.share` → `'native'`; без него и с рабочим буфером → `'clipboard'` и записанный текст; **Review Focus 4:** без обоих → `'none'`, не бросает. Telegram (подделка `window.Telegram.WebApp` с jest-fn): `createPlatform` при `#tgWebAppPlatform=ios` вставляет скрипт и после появления объекта возвращает `kind 'telegram'`; `startParam`; `user`; `share` зовёт `openTelegramLink` с корректно закодированными `url` и `text`; `backButton.show` регистрирует и `show()`; `cloud.setItem` с 4097 байтами отвергает; таймаут 3 с без объекта → web.
- [ ] **Step 2–4:** FAIL → реализовать → PASS · **Step 5: Commit** — `git commit -am "feat(platform): platform adapter — web and telegram"`

---

### Task 3: Кнопка «Назад», вибрация, инициализация платформы

**Files:**
- Modify: `src/store/ui.ts` (`backHandler`, `setBackHandler`), `src/screens/Battle/Battle.tsx`, `src/screens/DeckBuilder.tsx`, `src/screens/{Decks,Heroes,HeroDetail,Result,Tutorial}.tsx`, `src/screens/Battle/BeatEffects.tsx` (haptic), `src/App.tsx` (подписка платформы на `backHandler`), `src/main.tsx` (`createPlatform` до `boot`)
- Test: `src/screens/back.test.tsx`

**Interfaces:**
- `UiSlice` + `backHandler: (() => void) | null; setBackHandler(fn: (() => void) | null): void`.
- Хук `useAppBack(fn: () => void)` в `src/screens/useAppBack.ts`: регистрирует на mount, снимает на unmount; экраны: Battle (свободный бой → открыть диалог сдачи; обучение → меню), DeckBuilder (та же логика, что «Назад»), остальные → `navigate({name:'menu'})`; Menu ничего не регистрирует.
- `App.tsx`: эффект на `backHandler`: если не null → `platform.backButton.show(handler)`, иначе `hide()`. Во время боя `platform.setClosingConfirmation(true)`, вне боя `false`.
- `BeatEffects`: на событиях `damage`-класса `haptic('light')`, на `death` `haptic('medium')`; `Result` при mount: `haptic(win ? 'success' : 'error')`.
- `main.tsx`: `const platform = await createPlatform(); platform.ready(); boot(...)` — top-level await в модуле ES.

- [ ] **Step 1: Падающие тесты** — с `setPlatformForTests(fakeTelegram)`: открытие `#/decks/:id` показывает кнопку «Назад» платформы и её вызов ведёт в меню; в бою вызов открывает диалог сдачи; на меню кнопка скрыта; `haptic` вызван на `damage`-бите.
- [ ] **Step 2–4:** FAIL → реализовать → PASS · **Step 5: Commit** — `git commit -am "feat(platform): back button, haptics, platform boot"`

---

### Task 4: Кодек ссылки-вызова

**Files:**
- Create: `src/game/links/codec.ts`, `src/game/links/url.ts`
- Test: `src/game/links/links.test.ts`

**Interfaces:**
- `codec.ts`: `type Challenge = { v: 1; deck: Deck; seed: number; name: string }`; `CODEC_V1_HEROES: readonly HeroId[]` и `CODEC_V1_CARDS: readonly CardId[]` (литеральные массивы, скопированные из текущих `HERO_IDS`/`CARD_IDS`); `encodeChallenge(c: Challenge): string`; `decodeChallenge(s: string): Challenge | null`; `truncateName(name: string): string` (≤ 16 символов и ≤ 32 байт UTF-8, по целым символам); `crc8(bytes: Uint8Array): number` (полином 0x07); base64url через `btoa`/`atob` с заменой символов и без `=`.
- `url.ts`: `buildChallengeUrl(code: string, platform: Platform): string` — Telegram и `TG_BOT` задан → `https://t.me/${TG_BOT}/${TG_APP}?startapp=${code}`, иначе `${SITE_URL}#/c/${code}`; `parseStartParam(param: string | null): string | null` (возвращает код, если `decodeChallenge` не null).

- [ ] **Step 1: Падающие тесты** — свойство на 1000 случайных легальных колод (`randomDeck` из `engine/sim`, разрешён в тестах), seed `rng.int(2**32)`, имена из набора (латиница, кириллица, эмодзи, пусто, 40 символов): `decode(encode(c))` равен `c` с обрезанным именем, длина строки ≤ 100, алфавит `^[A-Za-z0-9_-]+$`; порча одного символа → `null` (CRC) в ≥ 99% случаев; версия 2 → `null`; индекс 200 → `null`; таблицы совпадают по множеству с `HERO_IDS`/`CARD_IDS`; `buildChallengeUrl` обе формы; `parseStartParam` на мусор → `null`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS · **Step 5: Commit** — `git commit -am "feat(links): challenge codec and urls"`

---

### Task 5: Экран вызова и матч против призрака

**Files:**
- Create: `src/screens/Challenge.tsx`
- Modify: `src/router.tsx` (`{ name: 'challenge'; code: string }` ↔ `#/c/<code>`), `src/game/session.ts` (`NewMatchOpts.challenge?`, `MatchSession.challenge?`), `src/game/save/defaults.ts` (`SaveV1.match.challenge?`), `src/store/index.ts` (hydrate/toSave), `src/screens/Result.tsx` (заголовок, «Ещё раз» тот же вызов, кнопка «Ответный вызов» — пока зовёт `share` из Task 6; в этой задаче кнопка рендерится и отключена), `src/App.tsx` (маршрут, обработка `platform.startParam` при старте → `navigate` на `#/c/<code>`)
- Test: `src/screens/challenge.test.tsx`

**Interfaces:**
- `Challenge` экран: `decodeChallenge(code)`; null → `ru.challenge.invalid` + «В меню» (**Review Focus 1**); иначе заголовок `fmt(ru.challenge.title, { name })`, шесть героинь (`HeroArt kind='full'` для первых трёх, `portrait` для резерва), «Принять вызов» (`testId="accept"`), «В меню».
- Принятие: `playerDeck = activeDeck?.deck ?? buildPreset('balanced', HERO_IDS)`; `startMatch(playerDeck, { opponentDeck: c.deck, seed: c.seed, mode: 'free', challenge: { name: c.name, code } })`; `navigate({name:'battle'})`. Временная колода не сохраняется в `decks`.
- `Result` в матче-вызове: подзаголовок `fmt(ru.challenge.resultVs, { name })`; «Ещё раз» → `startMatch` с теми же `opponentDeck`/`seed`/`challenge`.
- `App.tsx`: при первом рендере, если `parseStartParam(platform.startParam)` не null → `navigate({ name: 'challenge', code })`.

- [ ] **Step 1: Падающие тесты** — валидный код: имя и 6 героинь; «Принять вызов» стартует матч с `opponentDeck` из кода и `botSeed === seed`, `session.challenge.name`; два принятия одного кода дают одинаковый `reveal.commands.B` в раунде 1; без активной колоды используется временная и `decks` не меняется; битый код → invalid; **Review Focus 3:** `toSave` → `hydrate` сохраняет `session.challenge`, Result показывает имя; `startParam` с кодом ведёт на `#/c/…`, с мусором остаётся меню.
- [ ] **Step 2–4:** FAIL → реализовать → PASS · **Step 5: Commit** — `git commit -am "feat(links): challenge screen and ghost match"`

---

### Task 6: Поделиться, ответный вызов, имя

**Files:**
- Create: `src/game/share.ts`, `src/screens/NamePrompt.tsx`
- Modify: `src/game/keyMoment.ts` (`KeyMoment` + `heroId?`, `value?`), `src/screens/Result.tsx` («Поделиться», «Ответный вызов»), `src/screens/Menu.tsx` («Вызвать друга»), `src/game/save/defaults.ts` (`profile.name?`), `src/store/profile.ts` (`setName`), `src/i18n/ru.ts` (`share.*`, `challenge.*`, `name.*`)
- Test: `src/game/share.test.ts`, `src/screens/share.test.tsx`

**Interfaces:**
- `share.ts` (без React): `shareText(opts: { name: string; moment: string; url: string }): string` = `fmt(ru.share.text, …)`; `challengeFor(deck: Deck, name: string, now: () => number): { code: string; url: (p: Platform) => string }` с `seed = now() >>> 0`.
- `displayName(platform, profile): string | null` = `platform.user?.firstName ?? profile.name ?? null`.
- `Result`: «Поделиться» (`testId="share"`) и «Ответный вызов» (`testId="counter"`, только в матче-вызове) → если имени нет, открыть `NamePrompt` (поле ≤ 16 символов, «Готово» → `setName`), затем `platform.share(shareText(...), url)`; результат `'clipboard'` → подсказка `ru.platform.copied`, `'none'` → `ru.platform.shareFailed`.
- `Menu`: «Вызвать друга» (`testId="invite"`), активна при наличии активной колоды, делает то же без матча (`moment = ru.share.noMoment`).

- [ ] **Step 1: Падающие тесты** — `shareText` подстановки; `challengeFor` даёт код, который `decodeChallenge` возвращает с той же колодой и именем; Result «Поделиться» вызывает `platform.share` с текстом, содержащим ключевой момент и ссылку; в web без имени появляется `NamePrompt`, после ввода имя в `profile.name` и в коде; «Ответный вызов» только в матче-вызове; Menu «Вызвать друга» отключена без активной колоды.
- [ ] **Step 2–4:** FAIL → реализовать → PASS · **Step 5: Commit** — `git commit -am "feat(links): share, counter-challenge, player name"`

---

### Task 7: Облако Telegram и асинхронная загрузка

**Files:**
- Create: `src/game/save/cloud.ts`
- Modify: `src/main.tsx` (`boot(storage, platform): Promise<() => void>`), `src/store/index.ts` (`attachPersistence(storage?, cloud?)`), `src/screens/Decks.tsx` (лимит 8, `ru.decks.limit`), `src/boot.test.tsx`
- Test: `src/game/save/cloud.test.ts`, `src/boot.test.tsx`

**Interfaces:**
- `cloud.ts`: `CLOUD_KEYS = { profile: 'eclipse_profile', decks: 'eclipse_decks', settings: 'eclipse_settings' }`; `loadCloud(cloud: CloudStorage): Promise<Partial<Pick<SaveV1,'profile'|'decks'|'settings'>> | null>` (null, если все три ключа пусты; битый JSON одного ключа игнорируется с warn); `createCloudWriter(cloud, delayMs = 1000): { write(save: SaveV1): void; flush(): Promise<void> }` — пишет только изменившиеся разделы (сравнение сериализованных строк), с задержкой и слиянием; значение > 4096 → `console.warn`, пропуск (**Review Focus 2**); `activeDeckId` хранится внутри `eclipse_decks` как `{ decks, activeDeckId }`.
- `boot(storage, platform)`: `local = loadSave(storage)`; если `platform.cloud`: `c = await loadCloud(cloud)`; `save = c ? { ...local, ...c } : local`; если `!c` → `writer.write(save)` и `flush()`; `hydrate(save)`; `attachPersistence(storage, platform.cloud ?? undefined)`; возвращает отписку. В `attachPersistence` при наличии облака каждая запись зовёт и `writeSave`, и `writer.write`.
- `Decks`: при `decks.length >= 8` кнопки создания скрыты, показано `ru.decks.limit`.

- [ ] **Step 1: Падающие тесты** — `loadCloud` пустое → null; частичное → только найденные разделы; битый JSON в одном ключе → остальные загружены; writer: две записи за 1000 мс → один `setItem` на изменившийся ключ; > 4096 → warn и пропуск; `boot` с облаком: облачный профиль перекрывает локальный; с пустым облаком локальный переносится в облако; без облака поведение прежнее; облако бросает → игра стартует на localStorage с одним warn; Decks лимит 8.
- [ ] **Step 2–4:** FAIL → реализовать → PASS · **Step 5: Commit** — `git commit -am "feat(platform): telegram cloud storage and async boot"`

---

### Task 8: Арт: стиль, промпты, скрипты, компонент

**Files:**
- Create: `art/style.md`, `art/prompts.ts`, `scripts/gen-art.ts`, `scripts/art-pack.ts`, `public/art/.gitkeep`
- Modify: `package.json` (`"art": "tsx scripts/gen-art.ts"`, `"art:pack": "tsx scripts/art-pack.ts"`, devDependency `sharp@0.33`), `.gitignore` (`art/out/`), `src/ui/HeroArt.tsx` (`kind`, `srcSet`, `onError`), экраны: `HeroDetail`, `DeckBuilder` (слоты), `Challenge` → `kind='full'`; бой и `Heroes` → `portrait`
- Test: `art/prompts.test.ts`, `src/ui/heroArt.test.tsx`, `scripts/art-pack.test.ts`

**Interfaces:**
- `art/prompts.ts`: `export const STYLE: string` (общий стиль из `style.md` одной строкой), `export const PROMPTS: Record<HeroId, { base: string; portrait: string; full: string }>`; `export function prompt(id: HeroId, kind: 'portrait' | 'full'): string` = `STYLE + base + kind-часть`.
- `scripts/gen-art.ts`: аргументы `--only <id>`, `--kind portrait|full`, `--force`; для каждой героини: портрет `POST https://api.openai.com/v1/images/generations` (`model: 'gpt-image-1'`, `size: '1024x1024'`, `quality: 'medium'`, `n: 1`) → `art/out/<id>-portrait.png`; арт в рост `POST /v1/images/edits` (multipart: `image` = портрет, `prompt` = full, `size: '1024x1536'`) → `art/out/<id>-full.png`; при ошибке edits падение назад на generations с `size 1024x1536`; существующие файлы пропускаются без `--force`; ключ из `process.env.OPENAI_API_KEY`, при отсутствии выход с подсказкой; в логах только id героини и статус.
- `scripts/art-pack.ts`: для каждого `art/out/<id>-portrait.png` и `-full.png` делает WebP `public/art/<id>-portrait-128.webp` (128×128), `-portrait-512.webp`, `-full-512.webp` (512×768), `-full-1024.webp` (1024×1536), `quality 80`; отсутствующие исходники пропускает с сообщением.
- `HeroArt({ heroId, kind = 'portrait', size })`: `<img src={BASE + 'art/' + id + '-' + kind + '-' + (kind === 'portrait' ? 128 : 512) + '.webp'} srcSet=… loading="lazy" decoding="async" alt={name}>` внутри прежнего контейнера; при `onError` рендерит инициал как сейчас; `kind='full'` даёт соотношение 2:3 и градиент цвета стихии снизу.

- [ ] **Step 1: Падающие тесты** — `PROMPTS` содержит все 12 id, `prompt()` включает `STYLE`, `base` и слово кадра; `HeroArt` рендерит `<img>` с правильным путём для обоих `kind` и показывает инициал после события `error`; `art-pack` на синтетическом PNG 64×64 (создать через `sharp` в тесте) выдаёт четыре WebP нужных размеров и пропускает отсутствующие; **Review Focus 5:** путь начинается с `import.meta.env.BASE_URL`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Запуск генерации — делает пользователь:** `OPENAI_API_KEY=… npm run art && npm run art:pack`, затем `git add public/art && git commit -m "feat(art): hero portraits and full-body art"`. План не блокируется: без файлов остаются инициалы.
- [ ] **Step 6: Commit** — `git commit -am "feat(art): style bible, prompts, generation and packing scripts, HeroArt kinds"`

---

### Task 9: Сквозной тест вызова, Lighthouse, документация

**Files:**
- Create: `e2e/challenge.spec.ts`
- Modify: `docs/specs/2026-10-28-telegram-links-art-design.md` (§1 числа, §4.2 имя бота после создания), `README.md` (как запустить, как сгенерировать арт, как создать бота)
- Test: e2e

**Interfaces:**
- `e2e/challenge.spec.ts`: сгенерировать код в тесте через `encodeChallenge` (импорт из `src/game/links/codec.ts`), открыть `/#/c/<код>`, проверить имя и «Принять вызов», принять, в бою проверить, что `hero-B-0..2` носят имена героинь из кода; второй сценарий: битый код показывает `ru.challenge.invalid`.
- Lighthouse: как в спеке интерфейса §13, после добавления арта; Performance ≥ 80, числа в §1 спеки.
- README: разделы «Запуск», «Тесты», «Деплой», «Арт», «Telegram-бот» (шаги BotFather, куда вписать `TG_BOT` в `src/config.ts`).

- [ ] **Step 1: Падающий e2e** → реализовать → `npm run e2e` PASS (оба спека)
- [ ] **Step 2: Lighthouse** — записать числа
- [ ] **Step 3: Commit** — `git commit -am "test(e2e): challenge link flow; docs: README and spec numbers"`
