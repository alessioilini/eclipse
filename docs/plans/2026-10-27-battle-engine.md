# Battle Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Чистый TypeScript-модуль `src/engine`, который разыгрывает матч «Затмения» по спеке: 12 героинь, 24 карты, бот, симуляция, детерминизм.

**Architecture:** Состояние матча это обычные объекты; `resolveRound` клонирует состояние через `structuredClone`, мутирует копию внутри и возвращает её вместе со списком событий, поэтому снаружи состояние неизменяемо. Умения и карты описаны данными (примитивы + условия + триггеры), особые случаи вынесены в именованные хуки в одном реестре. Все слоты всегда заняты объектом героини, «пустой слот» это мёртвая героиня.

**Tech Stack:** TypeScript 5, Vite 5, Vitest 2, React 18 (в этом подпроекте не используется, но ставится сразу, чтобы интерфейс в подпроекте 2 лёг в тот же репозиторий). Node 20+.

**Spec:** `docs/specs/2026-10-27-battle-engine-design.md`

## Global Constraints

- Ничего в `src/engine/**` не импортирует из-за пределов `src/engine` (проверяется тестом `isolation.test.ts`).
- Случайность только через `Rng` из `src/engine/rng.ts`, никакого `Math.random`.
- Округление везде математическое, половина вверх: `roundHalfUp(4.5) === 5`.
- Урон после снижений не ниже 1; лечение не ниже 0; Luna в `[0, 5]`; HP в `[0, maxHp]`.
- Все строки интерфейса (имена, названия умений) на русском, идентификаторы на английском в `camelCase`.
- Язык тестов и комментариев: русский в описаниях тестов, английский в коде.
- Коммит после каждой задачи, сообщение на английском в стиле `feat(engine): ...` / `test(engine): ...`.

## Review Focus

1. Обе стороны теряют последнюю героиню в одном раунде: ожидается `winner: 'draw'`, а не победа стороны A (тест в Task 8).
2. Команда нацелена на слот с мёртвой героиней, когда весь резерв тоже мёртв: валидатор должен отвергнуть цель, а бот никогда не выбрать её (тест в Task 7 и Task 13).
3. Добор при руке из 5 карт: сбрасывается самая старая, рука остаётся 5, карта уходит в `discard`, а не исчезает (тест в Task 8).
4. Ульта запланирована при Luna 3, противник Swift-картой «Затмение» поднял цену до 4: действие превращается в Basic по той же цели и порождает событие `fizzle` (тест в Task 11).
5. «Переписать судьбу» при полностью мёртвом резерве: героиня остаётся в активном слоте с 1 HP, матч не падает (тест в Task 11).

---

## Карта файлов

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html, src/main.tsx (заглушка)
src/engine/
  rng.ts                 Rng: mulberry32
  types.ts               все типы движка
  data/elements.ts       elementMultiplier
  data/heroes.ts         HEROES: Record<HeroId, HeroDef>
  data/cards.ts          CARDS: Record<CardId, CardDef>
  match.ts               validateDeck, createMatch, getWinner
  status.ts              applyStatus, removeStatus, hasStatus, cleanse, expireStatuses, effectiveSpd, effectiveAtk
  damage.ts              roundHalfUp, computeDamage, dealDamage, directDamage, heal, grantShield
  targeting.ts           heroAt, resolveTarget, findLowestHpEnemy, interceptSingleHit
  validate.ts            validateCommands, energyCost, ultimateLunaCost
  view.ts                viewFor
  resolve/context.ts     Ctx (draft state + events + rng), emit
  resolve/round.ts       resolveRound
  resolve/roundStart.ts  roundStart
  resolve/order.ts       actionOrder
  resolve/actions.ts     runHeroAction, runAbility, runPrimitive
  resolve/triggers.ts    fire(trigger, ctx, payload)
  resolve/hooks.ts       HOOKS: Record<string, HookFn>
  resolve/cards.ts       playSwift, armReactions, playStandard, triggerReactions
  resolve/endRound.ts    endRound
  log.ts                 formatLog
  bot.ts                 chooseCommands
  sim.ts                 runSimulation
  __tests__/helpers.ts   makeMatch, cmd, basic, skill, ult, swap, card
  __tests__/*.test.ts    тесты по задачам
scripts/sim.ts           CLI для npm run sim
```

---

### Task 1: Каркас проекта и Rng

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `.gitignore`
- Create: `src/engine/rng.ts`
- Test: `src/engine/__tests__/rng.test.ts`, `src/engine/__tests__/isolation.test.ts`

**Interfaces:**
- Produces: `createRng(seed: number): Rng`; `type Rng = { next(): number /* [0,1) */; int(maxExclusive: number): number; pick<T>(arr: T[]): T; shuffle<T>(arr: T[]): T[] /* new array */; state(): number }`.

- [ ] **Step 1: Инициализировать git и npm-проект**

```bash
git init
npm init -y
npm i react@18 react-dom@18
npm i -D typescript@5 vite@5 @vitejs/plugin-react@4 vitest@2 @types/react@18 @types/react-dom@18 @types/node@20 tsx@4
```

`package.json` scripts: `"dev": "vite"`, `"build": "tsc -b && vite build"`, `"test": "vitest run"`, `"test:watch": "vitest"`, `"sim": "tsx scripts/sim.ts"`. `tsconfig.json`: `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `noUncheckedIndexedAccess: true`. `src/main.tsx` рендерит `<div>Затмение</div>`. `.gitignore`: `node_modules`, `dist`.

- [ ] **Step 2: Написать падающие тесты rng**

```ts
// src/engine/__tests__/rng.test.ts
import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';

describe('rng', () => {
  it('детерминирован при одном seed', () => {
    const a = createRng(42), b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('int(n) в [0, n)', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) { const v = r.int(6); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(6); }
  });
  it('shuffle не мутирует и сохраняет элементы', () => {
    const src = [1, 2, 3, 4, 5];
    const out = createRng(7).shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
```

```ts
// src/engine/__tests__/isolation.test.ts
// Читает все .ts под src/engine (кроме __tests__), регулярка /from\s+['"]([^'"]+)['"]/g,
// каждый импорт должен начинаться с '.' — иначе тест падает с именем файла и импорта.
```

- [ ] **Step 3: Запустить, убедиться, что падает**

Run: `npx vitest run src/engine/__tests__/rng.test.ts`
Expected: FAIL, `Cannot find module '../rng'`

- [ ] **Step 4: Реализовать `createRng` в `src/engine/rng.ts`**

mulberry32; `shuffle` это Фишер–Йетс на копии; `state()` возвращает текущее 32-битное состояние (нужно для сохранения в `MatchState.rngState`).

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run`
Expected: PASS, 4 теста

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold project, add seeded rng"
```

---

### Task 2: Типы и данные героинь, карт, стихий

**Files:**
- Create: `src/engine/types.ts`, `src/engine/data/elements.ts`, `src/engine/data/heroes.ts`, `src/engine/data/cards.ts`
- Test: `src/engine/__tests__/data.test.ts`

**Interfaces:**
- Produces (`types.ts`, используется всеми задачами; скопировать как есть):

```ts
export type Side = 'A' | 'B';
export type Slot = 0 | 1 | 2;
export type SlotRef = { side: Side; slot: Slot };
export type Element = 'fire' | 'water' | 'wind' | 'light' | 'dark' | 'star';
export type Role = 'guardian' | 'striker' | 'mage' | 'support';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';
export const MOON_ORDER: MoonPhase[] = ['new', 'waxing', 'full', 'waning'];
export type Timing = 'swift' | 'reaction' | 'standard';

export type HeroId = 'aira' | 'fenna' | 'nerisa' | 'tali' | 'zefira' | 'liraya'
  | 'aurora' | 'justina' | 'nokta' | 'kira' | 'mira' | 'selena';
export type CardId = 'lunarDash' | 'wardCircle' | 'fieldKit' | 'unseal' | 'huntersMark'
  | 'emergencySwap' | 'lunarSpark' | 'breakRhythm' | 'piercingStrike' | 'cover' | 'warCry'
  | 'reserveImpulse' | 'moonTurn' | 'moonReverse' | 'dispel' | 'healingWave' | 'bloodPact'
  | 'ashTrail' | 'swapBan' | 'deferredDeath' | 'eclipse' | 'sealBreak' | 'lastWord' | 'rewriteFate';

export type StatusId = 'burn' | 'soak' | 'freeze' | 'silence' | 'curse' | 'mark' | 'taunt'
  | 'spd' | 'atk' | 'damageReduction' | 'undying'
  | 'pierce'        // Сквозной удар: следующий удар +value, игнорирует щит
  | 'nextHitBonus'  // Селена пассивка: следующий удар +value
  | 'redirectTo'    // Нериса / Прикрытие: следующий одиночный удар уходит в source
  | 'mirrorShield'  // Зефира skill: при пробитии щита атакующий получает Mark
  | 'reflect';      // Зефира ульта: value = оставшиеся срабатывания
export const DEBUFF_ORDER: StatusId[] = ['burn', 'soak', 'freeze', 'silence', 'curse', 'mark'];
export const BUFF_IDS: StatusId[] = ['taunt', 'damageReduction', 'undying', 'pierce', 'nextHitBonus', 'reflect', 'mirrorShield'];
// spd/atk считаются баффом при value > 0 и дебаффом при value < 0.

export type Duration = 'thisRound' | 'nextRound' | 'permanent';
export type Status = { id: StatusId; value: number; stacks: number; expiresAtRound: number | null; source?: SlotRef };

export type TargetType = 'self' | 'ally' | 'enemy' | 'allies' | 'enemies' | 'none'
  | 'allyAndGuardian' | 'slotAndReserve' | 'reserveSlot';

export type Condition =
  | { kind: 'targetHpBelow'; pct: number }
  | { kind: 'targetHasStatus'; status: StatusId }
  | { kind: 'targetHasShieldOrBuff' }
  | { kind: 'selfHpBelow'; pct: number }
  | { kind: 'moonIs'; phase: MoonPhase }
  | { kind: 'isBloodMoon' }
  | { kind: 'oddRound' };

export type Primitive =
  | { op: 'damage'; mod: number; flat?: number; hits?: number; aoe?: boolean; when?: Condition; elseMod?: number }
  | { op: 'heal'; amount: number; when?: Condition; elseAmount?: number }
  | { op: 'shield'; amount: number; who?: 'self' | 'target' | 'allies' }
  | { op: 'status'; status: StatusId; value?: number; duration: Duration; who?: 'self' | 'target' | 'enemies' | 'allies'; when?: Condition }
  | { op: 'cleanse'; count: number; who?: 'target' | 'allies' }
  | { op: 'moon'; shift?: -1 | 1; set?: MoonPhase }
  | { op: 'luna'; amount: number }
  | { op: 'draw'; amount: number }
  | { op: 'selfHp'; amount: number }   // отрицательное = потеря, не ниже 1
  | { op: 'hook'; name: string };

export type TriggerEvent = 'roundStart' | 'beforeDealDamage' | 'afterDealDamage' | 'beforeTakeDamage'
  | 'onHeal' | 'onShieldGranted' | 'onEnemyBuffed' | 'onMoonShift' | 'onCardPlayed' | 'onDeath' | 'burnTick';
export type Trigger = { on: TriggerEvent; once?: 'round' | 'match'; hook: string };

export type Ability = { name: string; cost: number; target: TargetType; effects: Primitive[] };
export type HeroDef = { id: HeroId; name: string; element: Element; role: Role; rarity: Rarity;
  hp: number; atk: number; spd: number; passive: { name: string; text: string; triggers: Trigger[] };
  skill: Ability; ultimate: Ability };
export type CardDef = { id: CardId; name: string; rarity: Rarity; cost: number; timing: Timing;
  target: TargetType; effects: Primitive[]; text: string };

export type HeroState = { id: HeroId; hp: number; maxHp: number; shield: number; shieldExpiresAtRound: number | null;
  statuses: Status[]; ultimateUsed: boolean; bloodMoon: boolean; once: Partial<Record<string, number>> };
export type ArmedReaction = { cardId: CardId; target?: SlotRef; secondary?: SlotRef };
export type SideState = { energy: number; maxEnergyBonus: number; luna: number;
  hand: CardId[]; deck: CardId[]; discard: CardId[]; lastCardPlayed: { cardId: CardId; target?: SlotRef } | null;
  bloodMoonUsed: boolean; damageDealt: number; cardsPlayedThisRound: number;
  active: [HeroState, HeroState, HeroState]; reserve: [HeroState, HeroState, HeroState];
  armedReactions: ArmedReaction[];
  flags: { swapBanned: boolean; energyBonus: number; cardCostDelta: number };
  nextCardCostUp: { value: number; untilRound: number } | null };
export type MatchState = { seed: number; rngState: number; round: number; moon: MoonPhase;
  sides: Record<Side, SideState>; roundFlags: { moonShifted: boolean; ultLunaDelta: number };
  deaths: { side: Side; heroId: HeroId; round: number }[];
  result: null | { winner: Side | 'draw'; reason: 'wipe' | 'heroes' | 'hpPct' | 'damage' | 'draw' } };

export type HeroAction = { type: 'basic'; target: SlotRef } | { type: 'skill'; target?: SlotRef }
  | { type: 'ultimate'; target?: SlotRef } | { type: 'swap'; reserveIndex: Slot } | { type: 'none' };
export type CardPlay = { handIndex: number; target?: SlotRef; secondary?: SlotRef | { reserveIndex: Slot } };
export type SideCommands = { actions: [HeroAction, HeroAction, HeroAction]; card?: CardPlay };
export type Deck = { heroes: HeroId[]; starting: [Slot, Slot, Slot] /* индексы в heroes */; cards: CardId[] };

export type GameEvent = { type: string; round: number; phase: string; [k: string]: unknown };
```

- Produces (`elements.ts`): `elementMultiplier(attacker: Element, target: Element): number` по таблице §3.2.
- Produces (`heroes.ts`): `HEROES: Record<HeroId, HeroDef>`, `HERO_IDS: HeroId[]`. (`cards.ts`): `CARDS: Record<CardId, CardDef>`, `CARD_IDS: CardId[]`.

- [ ] **Step 1: Падающие тесты данных**

```ts
// data.test.ts — вместо тела каждого теста одна проверка
it('12 героинь, по две на стихию', ...)            // HERO_IDS.length === 12, count per element === 2
it('характеристики в коридорах роли', ...)        // guardian hp 28–32 atk 4–5 spd 4–7; striker 21–24/6–7/6–9; mage 19–22/6–7/5–8; support 23–26/4–5/6–9
it('числа из спеки', ...)                          // HEROES.aurora = 32/4/5; HEROES.mira = 24/4/9; HEROES.zefira.spd === 7
it('24 карты: 12 common, 7 rare, 4 epic, 1 legendary', ...)
it('стоимости карт из спеки', ...)                // bloodPact 0, reserveImpulse 0, rewriteFate 3, eclipse 2
it('тайминги', ...)                                // warCry swift, piercingStrike swift, fieldKit standard, wardCircle reaction
it('стихии', ...)                                  // fire→wind 1.2, wind→fire 0.85, light→dark 1.15, star→fire 1, fire→fire 1
```

- [ ] **Step 2: Запустить, убедиться, что падает**

Run: `npx vitest run src/engine/__tests__/data.test.ts` — Expected: FAIL, модули не найдены

- [ ] **Step 3: Написать `types.ts` (как выше), `elements.ts`, `heroes.ts`, `cards.ts`**

Все 12 героинь по §4.1 и 24 карты по §4.2. Примитивы для умений, которые выражаются без хуков; для остальных `{ op: 'hook', name }` с именами из Task 10 и Task 11. Таблица соответствия (hook-имена фиксируются здесь, реализуются позже):

| Героиня / карта | Хуки |
|---|---|
| Айра пассивка | `aira.burnBonus` (on `burnTick`) |
| Фенна пассивка / ульта | `fenna.firstHeal` (on `onHeal`, once round) / `fenna.revive` |
| Нериса пассивка / skill | `nerisa.firstHit` (on `beforeTakeDamage`, once round) / `nerisa.guard` |
| Тали пассивка | `tali.freezeSoaked` (on `afterDealDamage`, once round) ; ульта `tali.tide` |
| Зефира пассивка / skill / ульта | `zefira.intercept` (once round) / `zefira.mirror` / `zefira.reflect` |
| Лирая пассивка | `liraya.moonWind` (on `onMoonShift`) |
| Аврора пассивка / ульта | `aurora.aegis` (on `beforeTakeDamage`) / `aurora.unshaken` |
| Юстина пассивка / ульта | `justina.pursuit` (on `onEnemyBuffed`, once round) / `justina.verdict` |
| Нокта пассивка / ульта | `nokta.cursedBonus` (on `beforeDealDamage`) / `nokta.fallen` |
| Кира пассивка / ульта | `kira.rage` (on `beforeDealDamage`) / `kira.ruin` |
| Мира пассивка / skill / ульта | `mira.tactician` (учитывается в `energyCost`) / `mira.rebuild` / `mira.repeat` |
| Селена пассивка / ульта | `selena.impulse` (on `onCardPlayed`) / `selena.starfall` |
| Карты | `card.emergencySwap`, `card.cover`, `card.bloodPact`, `card.ashTrail`, `card.swapBan`, `card.eclipse`, `card.sealBreak`, `card.lastWord`, `card.rewriteFate`, `card.dispel` |

Через примитивы (без хуков): skill Айры, Фенны, Тали, Лираи, Авроры, Юстины, Нокты, Киры, Селены; ульты Айры (damage + hook `aira.detonate`), Лираи, Нерисы; карты 1–5, 7–9, 11–16, 20.

- [ ] **Step 4: Запустить тесты** — `npx vitest run` — Expected: PASS

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(engine): types, hero and card data, element table"`

---

### Task 3: Создание матча и тестовые хелперы

**Files:**
- Create: `src/engine/match.ts`, `src/engine/__tests__/helpers.ts`
- Test: `src/engine/__tests__/match.test.ts`

**Interfaces:**
- Produces: `validateDeck(deck: Deck): string[]` (пустой массив = ок); `createMatch(deckA: Deck, deckB: Deck, seed: number): MatchState` (round 0, moon `'new'`, luna 0, energy 0, рука 3 карты из перетасованной колоды, все героини живы, `rngState` сохранён); `getWinner(state): MatchState['result']` по §2.2 (не меняет состояние).
- Produces (`helpers.ts`): `makeMatch(opts?: { a?: HeroId[]; b?: HeroId[]; cardsA?: CardId[]; cardsB?: CardId[]; seed?: number }): MatchState` с дефолтами (A: aira, fenna, nerisa, tali, zefira, liraya; B: aurora, justina, nokta, kira, mira, selena; карты: первые 12 `CARD_IDS`); `basic(slot, target: SlotRef)`, `skill(slot, target?)`, `ult(slot, target?)`, `swap(slot, reserveIndex)`, `none()`, `cmd(a0, a1, a2, card?): SideCommands`, `enemy(slot): SlotRef` для стороны B и `ally(slot)` для A; `setHand(state, side, cards: CardId[])`, `setHp(state, ref, hp)`, `setLuna(state, side, n)` возвращают новое состояние.

- [ ] **Step 1: Падающие тесты**

```ts
it('validateDeck: 6 героинь, 12 карт, ≤2 копии, legendary ≤1 копия и ≤2 штуки') // три нарушения → три сообщения
it('createMatch: рука 3, колода 9, luna 0, round 0, moon new')
it('createMatch детерминирован: одинаковый seed → одинаковая рука')
it('getWinner: все 6 у B мертвы → A, reason wipe')
it('getWinner: обе стороны мертвы → draw')
it('getWinner после 10 раунда: больше живых → heroes; равно и выше hp% → hpPct; равно → damage; равно → draw')
```

- [ ] **Step 2: Запустить** — Expected: FAIL
- [ ] **Step 3: Реализовать `match.ts` и `helpers.ts`**

`createMatch` строит `HeroState` из `HEROES` (`hp = maxHp`, `shield 0`, `statuses []`), `starting` определяет `active`, остальные три `reserve` в порядке `heroes`. `getWinner` возвращает `null`, если матч не окончен (`round < 10` и обе стороны живы).

- [ ] **Step 4: Запустить** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): createMatch, validateDeck, getWinner, test helpers"`

---

### Task 4: Статусы и модификаторы характеристик

**Files:**
- Create: `src/engine/status.ts`
- Test: `src/engine/__tests__/status.test.ts`

**Interfaces:**
- Produces: `expiresAt(round: number, d: Duration): number | null`; `applyStatus(hero: HeroState, s: { id; value?; duration; round; source? }): HeroState` (Burn стакуется до 3, остальные одноимённые заменяются с большим из сроков); `removeStatus(hero, id): HeroState`; `hasStatus(hero, id): boolean`; `statusValue(hero, id): number`; `cleanse(hero, count): { hero; removed: StatusId[] }` по `DEBUFF_ORDER`, затем `spd`/`atk` с `value < 0`; `removeBuffs(hero): HeroState`; `expireStatuses(hero, round): HeroState` (удаляет статусы с `expiresAtRound === round` и щит с `shieldExpiresAtRound === round`); `effectiveSpd(hero): number` (base + spd-статусы − 3 при freeze + 2 при bloodMoon); `effectiveAtk(hero): number`; `isAlive(hero): boolean` (`hp > 0`).
- Функции чистые: возвращают новый объект героини.

- [ ] **Step 1: Падающие тесты**

```ts
it('burn стакуется до 3, четвёртый не добавляется')
it('thisRound истекает в этом раунде, nextRound в следующем, permanent никогда')
it('cleanse(1) снимает burn раньше curse; cleanse(2) снимает burn и soak')
it('cleanse снимает spd −2, но не spd +2')
it('effectiveSpd: freeze −3, bloodMoon +2, статусы spd суммируются')
it('expireStatuses снимает щит в раунд истечения')
```

- [ ] **Step 2: Запустить** — FAIL · **Step 3: Реализовать `status.ts`** · **Step 4: Запустить** — PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): statuses, durations, cleanse, effective stats"`

---

### Task 5: Конвейер урона, лечения, щитов

**Files:**
- Create: `src/engine/damage.ts`
- Test: `src/engine/__tests__/damage.test.ts`

**Interfaces:**
- Produces: `roundHalfUp(x: number): number`; `computeDamage(input: { atk: number; mod: number; attacker: Element; target: Element; flat: number; bloodMoon: boolean; round: number; reductions: number }): number` (чистая формула §3.1 без щита, min 1); `applyToHero(hero: HeroState, dmg: number, opts: { pierce?: boolean }): { hero: HeroState; absorbed: number; hpLoss: number }` (учитывает `undying`: HP не ниже 1 и статус снимается); `directDamage(hero, amount, floor?: number): { hero; hpLoss }` (без щита, без снижений); `healAmount(base: number, hero: HeroState, moon: MoonPhase, round: number): number`; `shieldAmount(base: number, moon: MoonPhase, round: number): number`; `applyHeal(hero, amount): { hero; healed: number }`; `applyShield(hero, amount, round): HeroState` (`shieldExpiresAtRound = round + 1`, складывается).

- [ ] **Step 1: Падающие тесты с числами спеки**

```ts
it('roundHalfUp: 4.5→5, 8.05→8, 6.9→7, 5.75→6')
it('Нокта (7, dark) basic по Авроре (light): 7×1.15 = 8')
it('Айра skill 90% по Зефире (wind): 7×0.9×1.2 = 8')
it('Fire→Water: 7×0.85 = 6')
it('Mark +3 прибавляется после округления стихии: 8 + 3 = 11')
it('снижение −3 после бонусов: 4 − 3 = 1; 4 − 4 → min 1')
it('Total Eclipse раунд 9: 8 × 1.25 = 10; Blood Moon: 8 × 1.2 = 10')
it('щит 5 поглощает 8: absorbed 5, hpLoss 3, shield 0')
it('pierce игнорирует щит: absorbed 0, hpLoss 8, shield остаётся 5')
it('undying: hp 3, урон 8 → hp 1, статус снят')
it('healAmount: curse ×0.5 (6→3), waxing +1, waning −1 не ниже 0, Eclipse ×0.5 после curse')
it('shieldAmount: Eclipse 6×0.75 = 5 (4.5→5), waxing +1')
it('applyHeal не выше maxHp')
```

- [ ] **Step 2: Запустить** — FAIL · **Step 3: Реализовать `damage.ts`** · **Step 4: Запустить** — PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): damage, heal and shield pipeline"`

---

### Task 6: Выбор цели и перехваты

**Files:**
- Create: `src/engine/targeting.ts`
- Test: `src/engine/__tests__/targeting.test.ts`

**Interfaces:**
- Produces: `heroAt(state, ref: SlotRef): HeroState`; `setHeroAt(state, ref, hero): void` (мутирует draft, используется только внутри resolve); `other(side: Side): Side`; `aliveActive(state, side): SlotRef[]`; `findLowestHpEnemy(state, side): SlotRef | null`; `resolveTarget(state, ref: SlotRef): SlotRef | null` (жива → та же; мертва → `findLowestHpEnemy` стороны ref; никого → null); `interceptSingleHit(state, attacker: SlotRef, target: SlotRef): { target: SlotRef; reason: 'taunt' | 'cover' | 'nerisa' | 'zefira' | null; reduction: number }` по §2.6 (Taunt → `redirectTo` от карты cover → `redirectTo` от Нерисы → пассивка Зефиры с `reduction 2`, если цель не сама Зефира и пассивка не сработала в этом раунде).
- Использует `hero.once['zefira.intercept'] === round` как флаг «уже сработало».

- [ ] **Step 1: Падающие тесты**

```ts
it('resolveTarget: мёртвая цель → живой враг с наименьшим HP')
it('resolveTarget: все враги мертвы → null')
it('Taunt перехватывает раньше Прикрытия')
it('Прикрытие (redirectTo от cover) перехватывает раньше Нерисы')
it('Зефира перехватывает удар по союзнице с reduction 2, второй раз в раунде не перехватывает')
it('Зефира не перехватывает удар по самой себе')
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): targeting and interception chain"`

---

### Task 7: Валидация команд и публичное представление

**Files:**
- Create: `src/engine/validate.ts`, `src/engine/view.ts`
- Test: `src/engine/__tests__/validate.test.ts`

**Interfaces:**
- Produces: `energyBudget(state, side): number` (`4/5/6` по раунду + `maxEnergyBonus` + `flags.energyBonus`); `ultimateLunaCost(state, side): number` (`3`, `2` в full, `+ roundFlags.ultLunaDelta`); `cardCost(state, side, cardId): number` (`cost + flags.cardCostDelta + (nextCardCostUp?.value ?? 0) − 1` в нечётный раунд, если Мира жива и активна; не ниже 0); `validateCommands(state, side, cmds: SideCommands): string[]`; `viewFor(state, side): PublicState` где `PublicState = Omit<MatchState,'sides'> & { sides: Record<Side, SideState | OpponentView> }`, `OpponentView = Omit<SideState,'hand'|'deck'|'discard'> & { handSize: number; deckSize: number }`.
- Ошибки валидации, строки: `'dead hero cannot act'`, `'target slot is dead'`, `'skill blocked by freeze'`, `'skill blocked by silence'`, `'ultimate blocked by silence'`, `'ultimate already used'`, `'not enough energy'`, `'not enough luna'`, `'reserve hero is dead'`, `'swap banned'`, `'card not in hand'`, `'wrong target type'`, `'none only for dead hero'`.
- Суммарная стоимость = сумма skill/ult Energy + `cardCost`; «Кровавая сделка» в этой же команде добавляет 2 к бюджету.

- [ ] **Step 1: Падающие тесты**

```ts
it('три basic по живым целям — ок')
it('цель мертва и весь резерв мёртв → target slot is dead')
it('skill при freeze → ошибка, ultimate при freeze — ок')
it('ultimate при luna 2 в new → not enough luna; в full — ок')
it('4 Energy в раунде 1: три skill по 1 + карта за 1 — ок; плюс карта за 2 → not enough energy')
it('bloodPact в команде позволяет потратить 6 в раунде 1')
it('скидка Миры: в нечётный раунд карта за 1 стоит 0')
it('viewFor прячет руку противника, оставляет handSize')
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): command validation and public view"`

---

### Task 8: Каркас раунда: старт, порядок, basic, swap, конец раунда

**Files:**
- Create: `src/engine/resolve/context.ts`, `resolve/round.ts`, `resolve/roundStart.ts`, `resolve/order.ts`, `resolve/actions.ts` (пока только basic и swap), `resolve/endRound.ts`, `resolve/triggers.ts` (диспетчер без хуков), `resolve/hooks.ts` (пустой реестр)
- Test: `src/engine/__tests__/round.test.ts`

**Interfaces:**
- Produces: `resolveRound(state: MatchState, cmds: Record<Side, SideCommands>): { state: MatchState; events: GameEvent[] }`. Порядок внутри: `roundStart` → `emit reveal` → `playSwift` → `armReactions` → герои по `actionOrder` → `playStandard` → `endRound` (карты в этой задаче заглушки, реализуются в Task 11).
- `Ctx = { s: MatchState /* draft */; events: GameEvent[]; rng: Rng; phase: string }`; `emit(ctx, ev: Omit<GameEvent,'round'|'phase'>)`.
- `roundStart(ctx)`: `round += 1`; если `round > 1`, луна +1; энергия по §2.3; `luna += moon === 'new' ? 2 : 1` (cap 5); добор 1 с лимитом руки 5 (сброс самой старой); сброс `flags`, `roundFlags`, `cardsPlayedThisRound`, `armedReactions` (`nextCardCostUp` не сбрасывается: он снимается при розыгрыше карты этой стороной или в `endRound`, когда `round >= untilRound`); триггер `roundStart`.
- `actionOrder(ctx): { ref: SlotRef; action: HeroAction }[]` по `effectiveSpd` убыв., затем `hp/maxHp` убыв., затем `atk` убыв., затем `rng.pick` среди равных (один раз, порядок фиксируется).
- `runHeroAction(ctx, ref, action)`: мёртвая пропускает; `swap` по §2.6 (меняет местами объекты в `active[slot]` и `reserve[i]`, снимает taunt, помечает `once['enteredRound'] = round`); `basic` = `dealHit(ctx, ref, resolveTarget(target), 1, 0, { single: true })`; героиня с `once['enteredRound'] === round` не действует.
- `dealHit(ctx, attacker: SlotRef, target: SlotRef, mod: number, flat: number, opts: { single: boolean; pierce?: boolean })` в этой задаче: `interceptSingleHit` (если single) → `computeDamage` (reductions из перехвата и `damageReduction`) → `applyToHero` → событие `damage` → `damageDealt`. Task 9 добавляет сюда триггеры и Mark/pierce/nextHitBonus, сигнатура не меняется.
- `endRound(ctx)`: Burn-тик (`directDamage` 2 за стак + триггер `burnTick`); `expireStatuses` всем; сгорание невзведённых reaction; проверка смертей → события `death`, запись в `deaths`, Luna +1 стороне; Blood Moon по §2.7; автозамена: для каждого активного слота с мёртвой героиней обмен с первой живой из резерва (событие `autoFill`); `result = getWinner(s)`.
- `resolveRound` бросает `Error('match finished')`, если `state.result` не null, и `Error('invalid commands: ...')`, если `validateCommands` вернул ошибки.

- [ ] **Step 1: Падающие тесты**

```ts
it('раунд 1: energy 4, luna 2, moon new, рука 4; раунд 3: energy 5, moon full; раунд 5: moon new, luna 5 (cap)')
it('добор при руке 5 сбрасывает самую старую в discard')
it('порядок: Селена (9) раньше Миры (9) по ATK; Нериса (4) последняя')
it('три basic: Нокта бьёт Аврору на 8, Аврора бьёт Нокту на 4×1.15 = 5')
it('swap: героиня уходит в резерв, вышедшая не действует, в следующем раунде действует')
it('цель умерла раньше по SPD → удар переходит на врага с min HP (событие retarget)')
it('Burn 2 стака → 4 урона в End Round, death при 0')
it('автозамена: мёртвая в active[1] меняется с первой живой из reserve')
it('Blood Moon: последняя из шести → +2 SPD, maxEnergyBonus 1, событие bloodMoon, повторно не срабатывает')
it('раунд 9: урон ×1.25')
it('после 10 раунда result по тай-брейку; resolveRound на оконченном матче бросает')
it('обе стороны теряют последнюю в одном раунде → draw')
it('детерминизм: два прогона одинаковых команд от одного seed дают равные состояния и события')
it('невалидные команды → Error("invalid commands")')
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): round skeleton — start, order, basic, swap, end round"`

---

### Task 9: Примитивы, условия, умения и пассивки через данные

**Files:**
- Modify: `src/engine/resolve/actions.ts` (добавить `runAbility`, `runPrimitive`, `checkCondition`, `selectTargets`), `src/engine/resolve/triggers.ts`
- Test: `src/engine/__tests__/abilities.test.ts`

**Interfaces:**
- Consumes: `dealHit` из Task 8.
- Produces: `runAbility(ctx, actor: SlotRef, ability: Ability, target?: SlotRef, kind: 'skill'|'ultimate')`: списывает Energy/Luna (для ult также `ultimateUsed = true`), событие `heroAction`, затем `runPrimitive` по порядку; `runHeroAction` переключается на `runAbility` для skill/ultimate; `runPrimitive(ctx, actor, p: Primitive, target?: SlotRef)`; `checkCondition(ctx, c: Condition, actor, target?): boolean`; `dealHit` расширяется до полного пути: `interceptSingleHit` → триггеры `beforeDealDamage` / `beforeTakeDamage` (собирают flat и reductions) → `computeDamage` → `applyToHero` → событие `damage` → `afterDealDamage` → учёт Mark/pierce/nextHitBonus (снимаются) → `damageDealt`.
- `fire(ctx, event: TriggerEvent, payload: { hero: SlotRef; target?: SlotRef; amount?: number; flat?: { v: number }; reductions?: { v: number } })` — перебирает активных героинь обеих сторон, у кого есть триггер на событие, проверяет `once`, вызывает `HOOKS[name]`.
- `HookFn = (ctx: Ctx, self: SlotRef, payload: HookPayload) => void`, `HookPayload = { target?: SlotRef; amount?: number; flat?: { v: number }; reductions?: { v: number }; card?: CardId; secondary?: SlotRef | { reserveIndex: Slot } }`.
- Недостаток ресурсов в момент разрешения (цена выросла после планирования): действие становится `basic` по той же цели, событие `fizzle`.

- [ ] **Step 1: Падающие тесты (умения без хуков)**

```ts
it('Айра skill: 90% всем врагам, Burn на враге с max ATK; Energy −2')
it('Фенна skill: Heal 6; при HP < 50% Heal 8 (+2 пассивка первое лечение раунда = 10)')
it('Тали skill: 110% и Soak')
it('Лирая skill: 120% и луна new→waxing; пассивка даёт +1 ATK до конца раунда')
it('Аврора skill: Shield 6 и Taunt; пассивка −1 урона союзницам, пока HP > 50%')
it('Юстина skill: 120%, против щита 150%')
it('Нокта skill: 120% и Curse; повторный удар по проклятой +1')
it('Кира skill: теряет 3 HP (не ниже 1), 160%; ниже 50% HP +2')
it('Селена skill: 140%')
it('ultimate списывает luna 3 (2 в full) и energy 2, второй раз → ошибка валидации')
it('ультa Лираи: 100% всем, луна становится full')
it('ульта Нерисы: Shield 6 всем активным, cleanse 1')
it('Eclipse поднял цену ульты после планирования → fizzle, выполняется basic')
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): data-driven abilities, conditions, trigger dispatcher"`

---

### Task 10: Хуки героинь

**Files:**
- Modify: `src/engine/resolve/hooks.ts`
- Test: `src/engine/__tests__/heroes.test.ts`

**Interfaces:**
- Consumes: реестр `HOOKS` и имена из Task 2.
- Produces: реализации всех хуков героинь из таблицы Task 2.

- [ ] **Step 1: Падающие тесты, по одному на хук**

```ts
it('aira.burnBonus: тик Burn 2 → 3; aira.detonate: ульта 120% всем + 2(+1) за каждый Burn')
it('fenna.revive: последняя погибшая возвращается 9 HP + Shield 3 на своём слоте; без погибших Heal 5 всем активным')
it('nerisa.firstHit: первый урон в раунде −3, второй нет; nerisa.guard: Shield 4 и redirectTo Нериса на один удар')
it('tali.freezeSoaked: удар по Soak → Freeze, раз в раунд; tali.tide: 90% всем, Soak всем, у кого был — Freeze')
it('zefira.intercept: через dealHit удар по союзнице уходит в Зефиру с −2')
it('zefira.mirror: щит 5 пробит → атакующий получает Mark; не пробит → нет Mark')
it('zefira.reflect: 3 срабатывания по 2 прямого урона атакующим, четвёртое нет')
it('aurora.unshaken: Shield 4 всем, nextCardCostUp противника 1 до конца следующего раунда: его карта за 1 стоит 2, через два раунда снова 1')
it('justina.pursuit: враг получил щит → +1 SPD до конца раунда, раз в раунд; justina.verdict: 200%, убийство → +1 Luna')
it('nokta.fallen: 100% всем, +3 каждой с Curse, Curse снят')
it('kira.ruin: 220%; при своём Blood Moon +4')
it('mira.rebuild: Heal 4 и Draw 1; mira.repeat: повторяет lastCardPlayed с той же целью бесплатно; нет карты → Draw 2; Legendary не повторяется')
it('selena.impulse: после карты стороны следующий удар +2, второй без бонуса; selena.starfall: 3×80%, после смерти цели остаток на min HP')
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): hero hooks"`

---

### Task 11: Карты: Swift, Reaction, Standard

**Files:**
- Create: `src/engine/resolve/cards.ts`
- Modify: `src/engine/resolve/hooks.ts` (хуки `card.*`), `src/engine/resolve/round.ts` (подключить)
- Test: `src/engine/__tests__/cards.test.ts`

**Interfaces:**
- Produces: `playSwift(ctx, cmds)`, `armReactions(ctx, cmds)`, `playStandard(ctx, cmds)`; порядок сторон по сумме `effectiveSpd` активных, tie → `rng`. Общий `playCard(ctx, side, play: CardPlay)`: списывает `cardCost`, переносит карту из руки в `discard`, `lastCardPlayed`, `cardsPlayedThisRound += 1`, событие `cardPlayed`, триггер `onCardPlayed`, затем примитивы или хук.
- `triggerReactions(ctx, event: 'beforeTakeDamage' | 'onDeath', payload)` вызывается из `dealHit` и `endRound`: для каждой `armedReactions` соответствующей стороны с подходящей картой выполняет её и удаляет; событие `reactionTriggered`. Соответствие: `wardCircle` и `deferredDeath` накладывают статус сразу при взводе (`armReactions`), `cover` накладывает `redirectTo` сразу; `lastWord` и `rewriteFate` ждут `onDeath` — смерть проверяется сразу после каждого `applyToHero`, не только в End Round, чтобы `rewriteFate` отменила её до следующего удара.
- Хуки карт: `card.emergencySwap` (swap без действия; вышедшая делает basic по цели, запланированной для слота, если план был basic/skill/ultimate с целью-врагом), `card.bloodPact` (`selfHp −4` floor 1; бюджет уже учтён валидатором), `card.ashTrail` (Burn двум врагам с max HP), `card.swapBan` (`flags.swapBanned` противнику; его `swap` → `none`), `card.eclipse` (`moon = 'new'`, `roundFlags.ultLunaDelta = 1`, `roundFlags.moonShifted = true`), `card.sealBreak` (снять щит и баффы, 2 прямого урона), `card.dispel` (щит 0 всем активным врагам), `card.lastWord` (при смерти цели: 4 прямого урона источнику, Luna +1), `card.rewriteFate` (первая смерть союзницы: hp 1, обмен с первой живой из резерва; нет живых — остаётся).

- [ ] **Step 1: Падающие тесты, по одному на карту**

```ts
it('lunarDash +2 SPD меняет порядок; breakRhythm −2 SPD')
it('wardCircle: следующий урон −4, второй полный')
it('fieldKit Heal 4 после ударов; healingWave Heal 3 всем; lunarSpark +1 Luna; reserveImpulse Draw 1 за 0')
it('unseal снимает 1 дебафф; huntersMark даёт Mark, следующий удар +3')
it('emergencySwap: swap без действия, вышедшая бьёт basic по цели слота')
it('piercingStrike: +2 и сквозь щит')
it('cover: удар по союзнице уходит в выбранную Guardian')
it('warCry +1 ATK всем до конца раунда')
it('moonTurn / moonReverse сдвигают луну; moonShifted = true (Лирая +1 ATK)')
it('dispel снимает щиты врагов до их ударов (swift)')
it('bloodPact: −4 HP не ниже 1, energyBonus 2')
it('ashTrail: Burn двум врагам с max HP')
it('swapBan: swap противника отменяется, героиня бездействует')
it('deferredDeath: Undying один раз')
it('eclipse: луна new, ульта стоит 4; у противника с Luna 3 → fizzle')
it('sealBreak: щит и баффы сняты, 2 урона')
it('lastWord: союзница погибла → источник −4, Luna +1')
it('rewriteFate: смерть отменена, 1 HP, обмен с резервом; при мёртвом резерве остаётся в слоте')
it('rewriteFate при двух смертях в раунде спасает только первую')
it('одна карта за раунд: две → ошибка валидации')
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): tactic cards — swift, reaction, standard"`

---

### Task 12: Текстовый лог и сценарий из GDD

**Files:**
- Create: `src/engine/log.ts`
- Test: `src/engine/__tests__/log.test.ts`

**Interfaces:**
- Produces: `formatLog(events: GameEvent[], state: MatchState): string` в стиле GDD §77: заголовок `R{n} Moon={phase}`, затем по одной строке на событие: `A Zefira.Skill → B2`, `  Zefira SPD7 Shield +5`, `  Nokta SPD7 Damage 8 (shield −5, HP −3) Curse`.

- [ ] **Step 1: Падающий тест**

```ts
it('сценарий GDD §77: Зефира ставит щит 5 на союзницу, Нокта бьёт её на 8: щит −5, HP −3, Curse', () => {
  // A: zefira в слоте 0, fenna в слоте 1; B: nokta в слоте 0; A: skill(0, ally(1)); B: skill(0, enemy(1))
  // ожидание: fenna.hp === 24 − 3; fenna.shield === 0; hasStatus(fenna,'curse'); лог содержит 'Shield +5' и 'Damage 8'
});
it('formatLog детерминирован и содержит все раунды')
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): text combat log"`

---

### Task 13: Бот

**Files:**
- Create: `src/engine/bot.ts`
- Test: `src/engine/__tests__/bot.test.ts`

**Interfaces:**
- Consumes: `viewFor`, `validateCommands`, `computeDamage`, `effectiveAtk`, `elementMultiplier`.
- Produces: `chooseCommands(view: PublicState, side: Side, rng: Rng): SideCommands`; внутренняя `scoreCommands(view, side, cmds): number`; генератор кандидатов: для каждой живой активной героини варианты {basic по каждому живому врагу, skill по каждой легальной цели, ultimate если доступна, swap на каждую живую из резерва, при угрозе смерти}; карты: каждая легальная карта руки по каждой цели + «без карты». Берётся лучшая комбинация из ограниченного перебора (жадно по героиням, затем карта), с вероятностью 0.1 вторая по оценке.
- Оценка (веса в коде как константы): убийство +100 за героиню; ожидаемый урон +1 за HP; спасение своей героини от прогнозируемой смерти +60 (прогноз = сумма basic всех живых врагов по ней); ульта +15; стихийное преимущество +5; Energy впустую −1 за единицу.

- [ ] **Step 1: Падающие тесты**

```ts
it('всегда возвращает валидные команды на 200 случайных состояниях (seed 1..200)')
it('выбирает летал: враг с 5 HP → по нему идёт удар, который убивает')
it('спасает: своя героиня умрёт от суммы basic → swap или щит')
it('не целится в мёртвый слот при мёртвом резерве')
it('не играет вторую ульту одной героиней')
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(engine): heuristic bot"`

---

### Task 14: Симуляция и свойства

**Files:**
- Create: `src/engine/sim.ts`, `scripts/sim.ts`
- Test: `src/engine/__tests__/sim.test.ts`

**Interfaces:**
- Produces: `randomDeck(rng): Deck` (6 случайных героинь, стартовые первые три, 12 карт с соблюдением `validateDeck`); `playMatch(deckA, deckB, seed): { state: MatchState; events: GameEvent[]; rounds: number }`; `runSimulation(n: number, seed: number): SimReport` где `SimReport = { matches: number; avgRounds: number; roundHistogram: number[]; drawRate: number; bloodMoonRate: number; bloodMoonComebackRate: number; heroes: Record<HeroId, { picks: number; wins: number; winRate: number; avgDamage: number }>; cards: Record<CardId, { picks: number; plays: number; winRate: number }> }`; `scripts/sim.ts` печатает отчёт таблицей, аргументы `--n 1000 --seed 1`.

- [ ] **Step 1: Падающие тесты**

```ts
it('200 матчей без исключений, все ≤ 10 раундов, result не null')
it('инварианты на каждом раунде: hp ∈ [0,maxHp], luna ∈ [0,5], shield ≥ 0, рука ≤ 5, energy ≥ 0')
it('детерминизм: runSimulation(50, 7) дважды даёт равные отчёты')
it('отчёт содержит все 12 героинь и 24 карты')
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS
- [ ] **Step 5: Запустить `npm run sim -- --n 1000 --seed 1`, вставить итоговую таблицу винрейтов в `docs/specs/2026-10-27-battle-engine-design.md` раздел «9. Первая симуляция»**

Expected: все героини в коридоре 40–60%; если нет, записать выбросы в тот же раздел как список для балансировки, код не менять.

- [ ] **Step 6: Commit** — `git commit -am "feat(engine): simulation, invariants, first balance report"`
