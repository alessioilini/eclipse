import { describe, it, expect } from 'vitest';
import { resolveRound, startRound } from '../resolve/round';
import { makeCtx } from '../resolve/context';
import { runAbility } from '../resolve/actions';
import { playStandard, playSwift, revealCards } from '../resolve/cards';
import { cardCost, ultimateLunaCost, validateCommands } from '../validate';
import { HEROES } from '../data/heroes';
import type { CardId, CardPlay, GameEvent, HeroAction, HeroId, MatchState, Side, SideCommands, Slot, SlotRef, Status } from '../types';
import { makeMatch, cmd, basic, skill, ult, swap, enemy, ally, setRound } from './helpers';

const A_TEAM: HeroId[] = ['tali', 'liraya', 'aira', 'fenna', 'nerisa', 'zefira'];
const B_TEAM: HeroId[] = ['kira', 'nokta', 'justina', 'aurora', 'mira', 'selena'];

const ofType = (events: GameEvent[], type: string) => events.filter(e => e.type === type);
const isRef = (a: unknown, b: SlotRef) => {
  const r = a as SlotRef | undefined;
  return !!r && r.side === b.side && r.slot === b.slot;
};
const hitsOn = (events: GameEvent[], target: SlotRef) =>
  ofType(events, 'damage').filter(e => isRef(e.target, target));
const hitsBy = (events: GameEvent[], attacker: SlotRef) =>
  ofType(events, 'damage').filter(e => isRef(e.attacker, attacker));
/** Slots that actually acted (not skipped) in the hero phase, in order. */
const actedInOrder = (events: GameEvent[]) =>
  ofType(events, 'heroAction').filter(e => e.phase === 'heroes' && e.action !== 'skipped')
    .map(e => ({ side: e.side, slot: e.slot }));
const hero = (s: MatchState, ref: SlotRef) => s.sides[ref.side].active[ref.slot];
const st = (id: Status['id'], value = 0, expiresAtRound: number | null = null): Status =>
  ({ id, value, stacks: 1, expiresAtRound });

const setCards = (s: MatchState, side: Side, cards: CardId[]) => { s.sides[side].hand = [...cards]; };
const play = (target?: SlotRef, secondary?: CardPlay['secondary']): CardPlay =>
  ({ handIndex: 0, ...(target ? { target } : {}), ...(secondary ? { secondary } : {}) });

/** A: Тали → B0, Лирая → B1, Айра → B2. */
const aCmd = (card?: CardPlay, a0: HeroAction = basic(0, enemy(0))) =>
  cmd(a0, basic(1, enemy(1)), basic(2, enemy(2)), card);
/** B: Кира → A2, Нокта → A0, Юстина → A1 (by default). */
const bCmd = (card?: CardPlay, kira: SlotRef = ally(2), nokta: SlotRef = ally(0), justina: SlotRef = ally(1)) =>
  cmd(basic(0, kira), basic(1, nokta), basic(2, justina), card);

/** Starts the round after `base` (round 1 by default), applies `tweak` to the started state, resolves it. */
function round(a: SideCommands, b: SideCommands, tweak?: (s: MatchState) => void, base?: MatchState) {
  const started = startRound(base ?? makeMatch({ a: A_TEAM, b: B_TEAM })).state;
  tweak?.(started);
  return resolveRound(started, { A: a, B: b });
}

/** A context on a started round 1, before any card is played. */
function ctxFor(tweak?: (s: MatchState) => void, a: HeroId[] = A_TEAM, b: HeroId[] = B_TEAM) {
  const s = startRound(makeMatch({ a, b })).state;
  tweak?.(s);
  return makeCtx(s, 'reveal');
}

describe('Swift-карты', () => {
  it('lunarDash +2 SPD меняет порядок; breakRhythm −2 SPD', () => {
    const r = round(aCmd(play(ally(2))), bCmd(play(ally(0))), s => {
      setCards(s, 'A', ['lunarDash']);
      setCards(s, 'B', ['breakRhythm']);
    });
    // Σ SPD: A 7 + 7 + 6 = 20, B 6 + 7 + 8 = 21 → B играет первой.
    expect(ofType(r.events, 'cardPlayed').map(e => [e.side, e.cardId, e.cost, e.phase]))
      .toEqual([['B', 'breakRhythm', 1, 'swift'], ['A', 'lunarDash', 1, 'swift']]);
    // Юстина 8 + 1 (бафф противника) = 9; Айра 6 + 2 = 8; Нокта 7 (ATK 7) раньше Лираи 7 (ATK 6);
    // Кира 6; Тали 7 − 2 = 5.
    expect(actedInOrder(r.events)).toEqual([enemy(2), ally(2), enemy(1), ally(1), enemy(0), ally(0)]);

    const A = r.state.sides.A;
    expect(A.hand).toEqual([]);
    expect(A.discard).toEqual(['lunarDash']);
    expect(A.lastCardPlayed).toEqual({ cardId: 'lunarDash', target: ally(2) });
    expect(A.cardsPlayedThisRound).toBe(1);
    expect(A.energy).toBe(3);
    // До конца раунда: в End Round модификаторы истекли.
    expect(hero(r.state, ally(2)).statuses.filter(x => x.id === 'spd')).toEqual([]);
    expect(hero(r.state, ally(0)).statuses.filter(x => x.id === 'spd')).toEqual([]);
  });

  it('unseal снимает 1 дебафф; huntersMark даёт Mark, следующий удар +3', () => {
    const r = round(aCmd(play(ally(0))), bCmd(), s => {
      setCards(s, 'A', ['unseal']);
      s.sides.A.active[0].statuses.push(st('burn'), st('curse'));
    });
    expect(ofType(r.events, 'statusRemoved').map(e => [e.target, e.status, e.phase])).toEqual([[ally(0), 'burn', 'swift']]);
    expect(hero(r.state, ally(0)).statuses.map(x => x.id)).toEqual(['curse']);
    expect(ofType(r.events, 'burn')).toEqual([]);

    const m = round(aCmd(play(enemy(0))), bCmd(), s => setCards(s, 'A', ['huntersMark']));
    expect(ofType(m.events, 'statusApplied').filter(e => e.status === 'mark').map(e => [e.target, e.phase]))
      .toEqual([[enemy(0), 'swift']]);
    // Тали (Water → Dark ×1): 6 + 3 = 9; Mark снят.
    expect(hitsBy(m.events, ally(0)).map(e => [e.target, e.dmg, e.flat])).toEqual([[enemy(0), 9, 3]]);
    expect(hero(m.state, enemy(0)).statuses.map(x => x.id)).not.toContain('mark');
    expect(hero(m.state, enemy(0)).hp).toBe(15);
  });

  it('emergencySwap: swap без действия, вышедшая бьёт basic по цели слота', () => {
    const r = round(aCmd(play(ally(0), { reserveIndex: 0 }), basic(0, enemy(1))), bCmd(),
      s => setCards(s, 'A', ['emergencySwap']));
    expect(ofType(r.events, 'swap').map(e => [e.slot, e.reserveIndex, e.out, e.in, e.reason, e.phase]))
      .toEqual([[0, 0, 'tali', 'fenna', 'emergencySwap', 'swift']]);
    // Фенна сразу бьёт Basic по запланированной для слота цели: Fire → Dark ×1 = 4.
    expect(ofType(r.events, 'heroAction').filter(e => e.side === 'A' && e.slot === 0).map(e => [e.action, e.phase, e.reason]))
      .toEqual([['basic', 'swift', undefined], ['skipped', 'heroes', 'entered']]);
    expect(hitsBy(r.events, ally(0)).map(e => [e.target, e.dmg, e.phase])).toEqual([[enemy(1), 4, 'swift']]);
    expect(r.state.sides.A.active[0].id).toBe('fenna');
    expect(r.state.sides.A.reserve[0].id).toBe('tali');

    // План слота — swap: вышедшая ничего не делает, запланированный swap отменён.
    const n = round(aCmd(play(ally(0), { reserveIndex: 0 }), swap(0, 1)), bCmd(),
      s => setCards(s, 'A', ['emergencySwap']));
    expect(hitsBy(n.events, ally(0))).toEqual([]);
    expect(ofType(n.events, 'swap').length).toBe(1);
    expect(n.state.sides.A.reserve.map(h => h.id)).toEqual(['tali', 'nerisa', 'zefira']);
  });

  it('piercingStrike: +2 и сквозь щит', () => {
    const r = round(aCmd(play(ally(0))), bCmd(), s => {
      setCards(s, 'A', ['piercingStrike']);
      s.sides.B.active[0].shield = 5;
      s.sides.B.active[0].shieldExpiresAtRound = 2;
    });
    // Тали: 6 + 2 = 8, щит не тронут.
    expect(hitsBy(r.events, ally(0)).map(e => [e.dmg, e.flat, e.absorbed])).toEqual([[8, 2, 0]]);
    expect(hero(r.state, enemy(0)).shield).toBe(5);
    expect(hero(r.state, enemy(0)).hp).toBe(16);
    expect(hero(r.state, ally(0)).statuses.map(x => x.id)).not.toContain('pierce');
  });

  it('warCry +1 ATK всем до конца раунда', () => {
    const r = round(aCmd(play()), bCmd(), s => setCards(s, 'A', ['warCry']));
    expect(ofType(r.events, 'statusApplied').filter(e => e.status === 'atk').map(e => [e.target, e.value, e.phase]))
      .toEqual([[ally(0), 1, 'swift'], [ally(1), 1, 'swift'], [ally(2), 1, 'swift']]);
    // Тали ATK 7: raw 7.
    expect(hitsBy(r.events, ally(0)).map(e => [e.raw, e.dmg])).toEqual([[7, 7]]);
    for (const slot of [0, 1, 2] as Slot[]) {
      expect(hero(r.state, ally(slot)).statuses.filter(x => x.id === 'atk')).toEqual([]);
    }
  });

  it('moonTurn / moonReverse сдвигают луну; moonShifted = true (Лирая +1 ATK)', () => {
    const t = round(aCmd(play()), bCmd(), s => setCards(s, 'A', ['moonTurn']));
    expect(ofType(t.events, 'moonChanged').map(e => [e.from, e.to, e.phase])).toEqual([['new', 'waxing', 'swift']]);
    expect(t.state.moon).toBe('waxing');
    expect(t.state.roundFlags.moonShifted).toBe(true);
    expect(ofType(t.events, 'statusApplied').filter(e => e.status === 'atk').map(e => [e.target, e.value]))
      .toEqual([[ally(1), 1]]);
    // Лирая ATK 7, Wind → Dark ×1.
    expect(hitsBy(t.events, ally(1)).map(e => [e.raw, e.dmg])).toEqual([[7, 7]]);

    const v = round(aCmd(play()), bCmd(), s => setCards(s, 'A', ['moonReverse']));
    expect(ofType(v.events, 'moonChanged').map(e => [e.from, e.to])).toEqual([['new', 'waning']]);
    expect(v.state.roundFlags.moonShifted).toBe(true);
    // Убывающая: весь урон +1 → 7 + 1 = 8.
    expect(hitsBy(v.events, ally(1)).map(e => [e.raw, e.dmg])).toEqual([[7, 8]]);
  });

  it('dispel снимает щиты врагов до их ударов (swift)', () => {
    const r = round(aCmd(play()), bCmd(), s => {
      setCards(s, 'A', ['dispel']);
      s.sides.B.active[0].shield = 5;
      s.sides.B.active[0].shieldExpiresAtRound = 2;
      s.sides.B.active[1].shield = 3;
      s.sides.B.active[1].shieldExpiresAtRound = 2;
    });
    expect(ofType(r.events, 'shieldRemoved').map(e => [e.target, e.amount, e.phase]))
      .toEqual([[enemy(0), 5, 'swift'], [enemy(1), 3, 'swift']]);
    expect(hitsBy(r.events, ally(0)).map(e => [e.dmg, e.absorbed])).toEqual([[6, 0]]);
    expect(hero(r.state, enemy(0)).shieldExpiresAtRound).toBeNull();
    expect(r.state.sides.A.energy).toBe(2);
  });

  it('bloodPact: −4 HP не ниже 1, energyBonus 2', () => {
    // План на 5 Energy при бюджете 4: ульта Тали 2 + Лирая 1 + Айра 2 — легален только с «Кровавой сделкой».
    const a = (card?: CardPlay) => cmd(ult(0), skill(1, enemy(1)), skill(2), card);
    const started = startRound(makeMatch({ a: A_TEAM, b: B_TEAM })).state;
    started.sides.A.luna = 3;
    setCards(started, 'A', ['bloodPact']);
    expect(validateCommands(started, 'A', a())).toEqual(['not enough energy']);
    expect(validateCommands(started, 'A', a(play(ally(0))))).toEqual([]);

    const r = resolveRound(started, { A: a(play(ally(0))), B: bCmd(undefined, ally(2), ally(1), ally(1)) });
    expect(ofType(r.events, 'directDamage').map(e => [e.target, e.dmg, e.hp, e.reason, e.phase]))
      .toEqual([[ally(0), 4, 16, 'bloodPact', 'swift']]);
    expect(r.state.sides.A.flags.energyBonus).toBe(2);
    expect(ofType(r.events, 'fizzle')).toEqual([]);
    // 4 + 2 − 5 = 1.
    expect(r.state.sides.A.energy).toBe(1);

    const f = round(aCmd(play(ally(0))), bCmd(undefined, ally(2), ally(1), ally(1)), s => {
      setCards(s, 'A', ['bloodPact']);
      s.sides.A.active[0].hp = 3;
    });
    expect(ofType(f.events, 'directDamage').map(e => [e.dmg, e.hp])).toEqual([[2, 1]]);
    expect(hero(f.state, ally(0)).hp).toBe(1);
  });

  it('swapBan: swap противника отменяется, героиня бездействует', () => {
    const r = round(aCmd(play()), cmd(swap(0, 0), basic(1, ally(0)), basic(2, ally(1))), s => setCards(s, 'A', ['swapBan']));
    expect(r.state.sides.B.flags.swapBanned).toBe(true);
    expect(ofType(r.events, 'heroAction').filter(e => e.side === 'B' && e.slot === 0).map(e => [e.action, e.reason]))
      .toEqual([['skipped', 'swap banned']]);
    expect(ofType(r.events, 'swap')).toEqual([]);
    expect(r.state.sides.B.active[0].id).toBe('kira');
  });

  it('eclipse: луна new, ульта стоит 4; у противника с Luna 3 → fizzle', () => {
    // Раунд 2 — Растущая Луна, ульта стоит 3; B планирует ульту Киры с Luna 3.
    const r = round(aCmd(play()), cmd(ult(0, ally(0)), basic(1, ally(1)), basic(2, ally(1))), s => {
      setCards(s, 'A', ['eclipse']);
      s.sides.B.luna = 3;
    }, setRound(makeMatch({ a: A_TEAM, b: B_TEAM }), 1));
    expect(ofType(r.events, 'moonChanged').map(e => [e.from, e.to, e.phase])).toEqual([['waxing', 'new', 'swift']]);
    expect(r.state.moon).toBe('new');
    expect(r.state.roundFlags.moonShifted).toBe(true);
    expect(ultimateLunaCost(r.state, 'B')).toBe(4);
    expect(ofType(r.events, 'fizzle').map(e => [e.side, e.slot, e.action, e.reason])).toEqual([['B', 0, 'ultimate', 'luna']]);
    // Вместо ульты Basic по той же цели: Dark → Water ×1, 7 + 1 (Новолуние) = 8.
    expect(hitsBy(r.events, enemy(0)).map(e => [e.target, e.dmg])).toEqual([[ally(0), 8]]);
    expect(r.state.sides.B.luna).toBe(3);
    expect(hero(r.state, enemy(0)).ultimateUsed).toBe(false);
  });

  it('eclipse: при Luna 4 ульта противника проходит и стоит 4 Luna', () => {
    const r = round(aCmd(play()), cmd(ult(0, ally(0)), basic(1, ally(1)), basic(2, ally(1))), s => {
      setCards(s, 'A', ['eclipse']);
      s.sides.B.luna = 4;
    }, setRound(makeMatch({ a: A_TEAM, b: B_TEAM }), 1));
    expect(ofType(r.events, 'fizzle')).toEqual([]);
    expect(ofType(r.events, 'lunaChanged').filter(e => e.side === 'B').map(e => [e.reason, e.delta])).toEqual([['ultimate', -4]]);
    // «Разрушение»: 7 × 2.2 = 15.4 → 15, +1 Dark в Новолуние = 16.
    expect(hitsBy(r.events, enemy(0)).map(e => [e.target, e.dmg])).toEqual([[ally(0), 16]]);
    expect(r.state.sides.B.luna).toBe(0);
    expect(hero(r.state, enemy(0)).ultimateUsed).toBe(true);
  });

  it('sealBreak: щит и баффы сняты, 2 урона', () => {
    const ctx = ctxFor(s => {
      setCards(s, 'A', ['sealBreak']);
      const k = s.sides.B.active[0];
      k.shield = 6;
      k.shieldExpiresAtRound = 2;
      k.statuses.push(st('atk', 2, 1), st('damageReduction', 3, 1), st('burn'));
    });
    revealCards(ctx, { A: aCmd(play(enemy(0))), B: bCmd() });
    playSwift(ctx);
    const k = hero(ctx.s, enemy(0));
    expect([k.shield, k.hp]).toEqual([0, 22]);
    expect(k.statuses.map(x => x.id)).toEqual(['burn']);
    expect(ofType(ctx.events, 'shieldRemoved').map(e => [e.target, e.amount])).toEqual([[enemy(0), 6]]);
    expect(ofType(ctx.events, 'statusRemoved').map(e => e.status)).toEqual(['atk', 'damageReduction']);
    expect(ofType(ctx.events, 'directDamage').map(e => [e.target, e.dmg, e.reason])).toEqual([[enemy(0), 2, 'sealBreak']]);
    expect(ctx.s.sides.A.damageDealt).toBe(2);
    expect(ctx.s.sides.A.energy).toBe(2);
  });
});

describe('Reaction-карты', () => {
  it('wardCircle: следующий урон −4, второй полный', () => {
    const r = round(aCmd(play(ally(0))), bCmd(undefined, ally(0), ally(0)), s => setCards(s, 'A', ['wardCircle']));
    expect(ofType(r.events, 'statusApplied').filter(e => e.status === 'damageReduction').map(e => [e.target, e.value, e.phase]))
      .toEqual([[ally(0), 4, 'reactions']]);
    // Нокта (SPD 7) раньше Киры (SPD 6); обе Dark → Water: 7 + 1 (Новолуние) = 8.
    expect(hitsOn(r.events, ally(0)).map(e => [e.attacker, e.dmg, e.reductions])).toEqual([[enemy(1), 4, 4], [enemy(0), 8, 0]]);
    expect(hero(r.state, ally(0)).hp).toBe(8);
  });

  it('cover: удар по союзнице уходит в выбранную Guardian', () => {
    const team: HeroId[] = ['tali', 'liraya', 'nerisa', 'fenna', 'aira', 'zefira'];
    const r = round(aCmd(play(ally(0), ally(2))), bCmd(undefined, ally(0), ally(0)), s => setCards(s, 'A', ['cover']),
      makeMatch({ a: team, b: B_TEAM }));
    expect(ofType(r.events, 'statusApplied').filter(e => e.status === 'redirectTo').map(e => [e.source, e.target, e.value, e.phase]))
      .toEqual([[ally(2), ally(0), 2, 'reactions']]);
    expect(ofType(r.events, 'redirect').map(e => [e.from, e.to, e.reason])).toEqual([[ally(0), ally(2), 'cover']]);
    // Нокта → Нериса: 8 − 3 (пассивка Нерисы) = 5; Кира → Тали полностью: 8.
    expect(hitsBy(r.events, enemy(1)).map(e => [e.target, e.dmg])).toEqual([[ally(2), 5]]);
    expect(hitsBy(r.events, enemy(0)).map(e => [e.target, e.dmg])).toEqual([[ally(0), 8]]);
  });

  it('«Прикрытие» и «Защитница» Нерисы на одной союзнице: обе записи живут, первый удар — в Guardian «Прикрытия», второй — в Нерису (R9)', () => {
    // A: Тали(0), Зефира(1, Guardian «Прикрытия»), Нериса(2). Нериса ускорена, чтобы «Защитница» успела до ударов B.
    const team: HeroId[] = ['tali', 'zefira', 'nerisa', 'fenna', 'aira', 'liraya'];
    const a = cmd(basic(0, enemy(0)), basic(1, enemy(1)), skill(2, ally(0)), play(ally(0), ally(1)));
    const r = round(a, bCmd(undefined, ally(0), ally(0), ally(0)), s => {
      setCards(s, 'A', ['cover']);
      s.sides.A.active[2].statuses.push(st('spd', 10, 1));
    }, makeMatch({ a: team, b: B_TEAM }));
    const applied = ofType(r.events, 'statusApplied').filter(e => e.status === 'redirectTo');
    expect(applied.map(e => [e.source, e.target, e.value, e.phase]))
      .toEqual([[ally(1), ally(0), 2, 'reactions'], [ally(2), ally(0), 1, 'heroes']]);
    // Первые два одиночных удара по Тали: «Прикрытие» (value 2) приоритетнее Нерисы (value 1).
    expect(ofType(r.events, 'redirect').filter(e => isRef(e.from, ally(0))).slice(0, 2).map(e => [e.to, e.reason]))
      .toEqual([[ally(1), 'cover'], [ally(2), 'nerisa']]);
  });

  it('deferredDeath: Undying один раз', () => {
    const r = round(aCmd(play(ally(0))), bCmd(undefined, ally(0), ally(0)), s => {
      setCards(s, 'A', ['deferredDeath']);
      s.sides.A.active[0].hp = 5;
    });
    expect(ofType(r.events, 'statusApplied').filter(e => e.status === 'undying').map(e => [e.target, e.phase]))
      .toEqual([[ally(0), 'reactions']]);
    // Первый летальный удар оставляет 1 HP, второй добивает.
    expect(hitsOn(r.events, ally(0)).map(e => [e.attacker, e.dmg, e.hp])).toEqual([[enemy(1), 8, 1], [enemy(0), 8, 0]]);
    expect(ofType(r.events, 'death').map(e => e.heroId)).toEqual(['tali']);
    expect(r.state.sides.A.energy).toBe(2);
  });

  it('lastWord: союзница погибла → источник −4, Luna +1', () => {
    const r = round(aCmd(play(ally(0))), bCmd(), s => {
      setCards(s, 'A', ['lastWord']);
      s.sides.A.active[0].hp = 5;
    });
    expect(ofType(r.events, 'reactionArmed').map(e => [e.side, e.cardId, e.target, e.phase]))
      .toEqual([['A', 'lastWord', ally(0), 'reactions']]);
    expect(ofType(r.events, 'reactionTriggered').map(e => [e.side, e.cardId, e.target, e.phase]))
      .toEqual([['A', 'lastWord', ally(0), 'heroes']]);
    // Нокта убивает Тали и сразу получает 4 прямого урона (20 → 16).
    expect(ofType(r.events, 'directDamage').map(e => [e.source, e.target, e.dmg, e.hp, e.reason]))
      .toEqual([[ally(0), enemy(1), 4, 16, 'lastWord']]);
    expect(ofType(r.events, 'lunaChanged').filter(e => e.side === 'A' && e.phase === 'heroes').map(e => [e.reason, e.delta]))
      .toEqual([['lastWord', 1], ['death', 1]]);
    // Luna: 2 (раунд 1) + 1 (lastWord) + 1 (смерть) = 4; урон в сторону A.
    expect(r.state.sides.A.luna).toBe(4);
    // Урон стороны A: Лирая 6 + Айра 6 (Fire → Light ×1) + «Последнее слово» 4 = 16.
    expect(r.state.sides.A.damageDealt).toBe(16);
    // Затем Лирая бьёт Нокту ещё на 6: 16 − 6 = 10.
    expect(hero(r.state, enemy(1)).hp).toBe(10);
  });

  it('lastWord при смерти от Burn: убийцы нет — только Luna +1, без ответного урона', () => {
    const r = round(aCmd(play(ally(0))), bCmd(undefined, ally(2), ally(1), ally(1)), s => {
      setCards(s, 'A', ['lastWord']);
      s.sides.A.active[0].hp = 2;
      s.sides.A.active[0].statuses.push(st('burn'));
    });
    expect(ofType(r.events, 'burn').map(e => [e.target, e.dmg, e.hp])).toEqual([[ally(0), 2, 0]]);
    expect(ofType(r.events, 'reactionTriggered').map(e => [e.cardId, e.target, e.phase])).toEqual([['lastWord', ally(0), 'endRound']]);
    expect(ofType(r.events, 'directDamage')).toEqual([]);
    expect(ofType(r.events, 'lunaChanged').filter(e => e.side === 'A' && e.phase === 'endRound').map(e => [e.reason, e.delta]))
      .toEqual([['lastWord', 1], ['death', 1]]);
    expect(r.state.sides.A.luna).toBe(4);
  });

  it('Taunt и «Прикрытие» на одной стороне: Taunt приоритетнее (§2.6)', () => {
    const team: HeroId[] = ['tali', 'liraya', 'nerisa', 'fenna', 'aira', 'zefira'];
    const r = round(aCmd(play(ally(0), ally(2))), bCmd(undefined, ally(0), ally(0), ally(1)), s => {
      setCards(s, 'A', ['cover']);
      s.sides.A.active[1].statuses.push(st('taunt', 0, 2));
    }, makeMatch({ a: team, b: B_TEAM }));
    // Оба удара по Тали уходят в Лираю с Taunt, «Прикрытие» не срабатывает.
    expect(ofType(r.events, 'redirect').map(e => [e.from, e.to, e.reason])).toEqual([[ally(0), ally(1), 'taunt'], [ally(0), ally(1), 'taunt']]);
    expect(hitsBy(r.events, enemy(1)).map(e => e.target)).toEqual([ally(1)]);
    expect(hitsBy(r.events, enemy(0)).map(e => e.target)).toEqual([ally(1)]);
    expect(hitsOn(r.events, ally(2))).toEqual([]);
  });

  it('rewriteFate: смерть отменена, 1 HP, обмен с резервом; при мёртвом резерве остаётся в слоте', () => {
    const r = round(aCmd(play()), bCmd(), s => {
      setCards(s, 'A', ['rewriteFate']);
      s.sides.A.active[0].hp = 5;
    });
    expect(ofType(r.events, 'reactionTriggered').map(e => [e.cardId, e.target, e.heroId])).toEqual([['rewriteFate', ally(0), 'tali']]);
    expect(ofType(r.events, 'swap').map(e => [e.slot, e.reserveIndex, e.out, e.in, e.reason]))
      .toEqual([[0, 0, 'tali', 'fenna', 'rewriteFate']]);
    expect(ofType(r.events, 'death')).toEqual([]);
    expect(r.state.deaths).toEqual([]);
    expect([r.state.sides.A.reserve[0].id, r.state.sides.A.reserve[0].hp]).toEqual(['tali', 1]);
    expect(r.state.sides.A.active[0].id).toBe('fenna');
    // Вышедшая в этом раунде не действует; Luna без +1 за смерть; Energy 4 − 3.
    expect(ofType(r.events, 'heroAction').filter(e => e.side === 'A' && e.slot === 0).map(e => [e.action, e.reason]))
      .toEqual([['skipped', 'entered']]);
    expect(r.state.sides.A.luna).toBe(2);
    expect(r.state.sides.A.energy).toBe(1);

    const n = round(aCmd(play()), bCmd(), s => {
      setCards(s, 'A', ['rewriteFate']);
      s.sides.A.active[0].hp = 5;
      for (const h of s.sides.A.reserve) h.hp = 0;
    });
    expect(ofType(n.events, 'reactionTriggered').map(e => e.cardId)).toEqual(['rewriteFate']);
    expect(ofType(n.events, 'swap')).toEqual([]);
    expect(ofType(n.events, 'death')).toEqual([]);
    expect([n.state.sides.A.active[0].id, n.state.sides.A.active[0].hp]).toEqual(['tali', 1]);
    // Она осталась и действует: Тали бьёт Киру.
    expect(hitsBy(n.events, ally(0)).map(e => e.target)).toEqual([enemy(0)]);
  });

  it('rewriteFate при двух смертях в раунде спасает только первую', () => {
    const r = round(aCmd(play()), bCmd(undefined, ally(1), ally(0), ally(2)), s => {
      setCards(s, 'A', ['rewriteFate']);
      s.sides.A.active[0].hp = 5;
      s.sides.A.active[1].hp = 5;
    });
    // Нокта (SPD 7) убивает Тали первой → спасена; Кира (SPD 6) убивает Лираю → смерть.
    expect(ofType(r.events, 'reactionTriggered').map(e => e.heroId)).toEqual(['tali']);
    expect(ofType(r.events, 'death').map(e => e.heroId)).toEqual(['liraya']);
    expect(r.state.deaths).toEqual([{ side: 'A', heroId: 'liraya', round: 1 }]);
    // Спасённая Тали (1 HP) — первая живая в резерве, поэтому в End Round занимает слот Лираи.
    expect(ofType(r.events, 'autoFill').map(e => [e.slot, e.reserveIndex, e.in])).toEqual([[1, 0, 'tali']]);
    expect([r.state.sides.A.active[1].id, r.state.sides.A.active[1].hp]).toEqual(['tali', 1]);
  });
});

describe('Standard-карты', () => {
  it('fieldKit Heal 4 после ударов; healingWave Heal 3 всем; lunarSpark +1 Luna; reserveImpulse Draw 1 за 0', () => {
    // Нокта и Кира бьют Тали по 8: 20 → 4, затем аптечка: 4 → 8.
    const k = round(aCmd(play(ally(0))), bCmd(undefined, ally(0), ally(0)), s => setCards(s, 'A', ['fieldKit']));
    const heal = ofType(k.events, 'heal');
    expect(heal.map(e => [e.target, e.amount, e.hp, e.phase])).toEqual([[ally(0), 4, 8, 'standard']]);
    expect(k.events.indexOf(heal[0]!)).toBeGreaterThan(k.events.indexOf(hitsOn(k.events, ally(0)).at(-1)!));

    const w = round(aCmd(play()), bCmd(), s => {
      setCards(s, 'A', ['healingWave']);
      for (const h of s.sides.A.active) h.hp = 10;
    });
    // Удары: Тали −8, Лирая −7, Айра −8; затем Heal 3 каждой.
    expect(ofType(w.events, 'heal').map(e => [e.target, e.amount, e.hp, e.phase]))
      .toEqual([[ally(0), 3, 5, 'standard'], [ally(1), 3, 6, 'standard'], [ally(2), 3, 5, 'standard']]);
    expect(w.state.sides.A.energy).toBe(2);

    const l = round(aCmd(play()), bCmd(), s => setCards(s, 'A', ['lunarSpark']));
    expect(ofType(l.events, 'lunaChanged').filter(e => e.phase === 'standard').map(e => [e.side, e.delta, e.reason]))
      .toEqual([['A', 1, 'card']]);
    expect(l.state.sides.A.luna).toBe(3);

    let deckTop: CardId | undefined;
    const d = round(aCmd(play()), bCmd(), s => {
      setCards(s, 'A', ['reserveImpulse']);
      deckTop = s.sides.A.deck[0];
    });
    expect(ofType(d.events, 'draw').filter(e => e.phase === 'standard').map(e => [e.side, e.cardId])).toEqual([['A', deckTop]]);
    expect(d.state.sides.A.hand).toEqual([deckTop]);
    expect(d.state.sides.A.discard).toEqual(['reserveImpulse']);
    expect(d.state.sides.A.energy).toBe(4);
  });

  it('ashTrail: Burn двум врагам с max HP', () => {
    const burnTargets = (hp: [number, number, number]) => {
      const ctx = ctxFor(s => {
        setCards(s, 'A', ['ashTrail']);
        s.sides.B.active.forEach((h, i) => { h.hp = hp[i]!; });
      });
      revealCards(ctx, { A: aCmd(play()), B: bCmd() });
      playStandard(ctx);
      return ofType(ctx.events, 'statusApplied').filter(e => e.status === 'burn').map(e => e.target);
    };
    expect(burnTargets([10, 20, 23])).toEqual([enemy(2), enemy(1)]);
    // Равенство HP → меньший слот.
    expect(burnTargets([20, 20, 23])).toEqual([enemy(2), enemy(0)]);
  });

  it('порядок сторон при равной сумме SPD определяется seed', () => {
    // A: 7 + 7 + 6 = 20; B: Нокта 7 + Кира 6 + Зефира 7 = 20.
    const firsts = new Set<unknown>();
    for (let seed = 1; seed <= 12; seed++) {
      const started = startRound(makeMatch({ a: A_TEAM, b: ['nokta', 'kira', 'zefira', 'aurora', 'mira', 'selena'], seed })).state;
      setCards(started, 'A', ['lunarSpark']);
      setCards(started, 'B', ['lunarSpark']);
      const run = () => resolveRound(started, { A: aCmd(play()), B: cmd(basic(0, ally(0)), basic(1, ally(1)), basic(2, ally(2)), play()) });
      const first = ofType(run().events, 'cardPlayed')[0]!.side;
      expect(ofType(run().events, 'cardPlayed')[0]!.side).toBe(first);
      firsts.add(first);
    }
    expect([...firsts].sort()).toEqual(['A', 'B']);
  });
});

describe('карты: общие правила', () => {
  it('одна карта за раунд: две → ошибка валидации', () => {
    const started = startRound(makeMatch({ a: A_TEAM, b: B_TEAM })).state;
    setCards(started, 'A', ['lunarSpark', 'reserveImpulse']);
    const two = { ...aCmd(), card: [play(), { handIndex: 1 }] } as unknown as SideCommands;
    expect(validateCommands(started, 'A', two)).toEqual(['one card per round']);
    expect(() => resolveRound(started, { A: two, B: bCmd() })).toThrow('A: one card per round');
  });

  it('ульта Авроры после планирования поднимает цену Standard-карты → карта сгорает (fizzle)', () => {
    const a: HeroId[] = ['aurora', 'tali', 'liraya', 'fenna', 'nerisa', 'zefira'];
    // B тратит 3 Energy на умения и 1 на аптечку; ульта Авроры делает карту на 1 дороже.
    const r = round(cmd(ult(0), basic(1, enemy(0)), basic(2, enemy(0))),
      cmd(skill(0, ally(1)), skill(1, ally(2)), skill(2, ally(1)), play({ side: 'B', slot: 0 })), s => {
        s.sides.A.luna = 3;
        setCards(s, 'B', ['fieldKit']);
      }, makeMatch({ a, b: B_TEAM }));
    expect(ofType(r.events, 'fizzle').map(e => [e.side, e.cardId, e.action, e.reason, e.phase]))
      .toEqual([['B', 'fieldKit', 'card', 'energy', 'standard']]);
    expect(ofType(r.events, 'fizzle').every(e => !('card' in e))).toBe(true);
    expect(ofType(r.events, 'cardPlayed')).toEqual([]);
    expect(ofType(r.events, 'heal')).toEqual([]);
    expect(r.state.sides.B.hand).toEqual([]);
    expect(r.state.sides.B.discard).toEqual(['fieldKit']);
    expect(r.state.sides.B.energy).toBe(1);
    expect(r.state.sides.B.lastCardPlayed).toBeNull();
    // R28: одна ульта Авроры наказывает одну попытку карты — повышение израсходовано и при fizzle.
    expect(r.state.sides.B.nextCardCostUp).toBeNull();
    expect(cardCost(startRound(r.state).state, 'B', 'fieldKit')).toBe(1);
  });

  it('Мира «Повторение»: последняя карта разыгрывается ещё раз бесплатно с той же целью', () => {
    const a: HeroId[] = ['mira', 'tali', 'liraya', 'fenna', 'nerisa', 'zefira'];
    const ctx = ctxFor(s => {
      s.sides.A.luna = 3;
      s.sides.A.lastCardPlayed = { cardId: 'huntersMark', target: enemy(1) };
    }, a);
    const hand = [...ctx.s.sides.A.hand];
    ctx.phase = 'heroes';
    runAbility(ctx, ally(0), HEROES.mira.ultimate, undefined, 'ultimate');
    expect(ofType(ctx.events, 'cardPlayed').map(e => [e.side, e.cardId, e.target, e.replay])).toEqual([['A', 'huntersMark', enemy(1), true]]);
    expect(hero(ctx.s, enemy(1)).statuses.map(x => x.id)).toEqual(['mark']);
    expect(ofType(ctx.events, 'draw')).toEqual([]);
    expect(ctx.s.sides.A.hand).toEqual(hand);
    expect(ctx.s.sides.A.energy).toBe(2);
    expect(ctx.s.sides.A.lastCardPlayed).toEqual({ cardId: 'huntersMark', target: enemy(1) });
  });
});
