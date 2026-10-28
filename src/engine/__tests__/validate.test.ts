import { describe, expect, it } from 'vitest';
import { cardCost, energyBudget, ultimateLunaCost, validateCommands } from '../validate';
import { eventsFor, viewFor } from '../view';
import { ally, basic, cmd, enemy, makeMatch, setHand, setLuna, setRound, skill, ult } from './helpers';
import type { GameEvent, HeroAction, MatchState, SlotRef } from '../types';

// A: aira, fenna, nerisa. B: aurora, justina, nokta. Skill costs: aira 2, fenna 1, nerisa 1.
const base = (round = 1): MatchState => setRound(makeMatch(), round);

const killActive = (s: MatchState, ref: SlotRef): MatchState => {
  const c = structuredClone(s);
  c.sides[ref.side].active[ref.slot].hp = 0;
  return c;
};

describe('validateCommands', () => {
  it('три basic по живым целям — ок', () => {
    const s = base();
    const c = cmd(basic(0, enemy(0)), basic(1, enemy(1)), basic(2, enemy(2)));
    expect(validateCommands(s, 'A', c)).toEqual([]);
  });

  it('цель мертва и весь резерв мёртв → target slot is dead', () => {
    let s = base();
    for (const slot of [0, 1, 2] as const) s = killActive(s, enemy(slot));
    const c = cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0)));
    expect(validateCommands(s, 'A', c)).toEqual(['target slot is dead', 'target slot is dead', 'target slot is dead']);
    // а если жив хотя бы один враг — мёртвая цель допустима (ретаргет)
    let s2 = base();
    s2 = killActive(s2, enemy(0));
    expect(validateCommands(s2, 'A', c)).toEqual([]);
  });

  it('skill при freeze → ошибка, ultimate при freeze — ок', () => {
    let s = setLuna(base(), 'A', 3);
    s.sides.A.active[1].statuses.push({ id: 'freeze', value: 3, stacks: 1, expiresAtRound: 2 });
    // fenna (slot 1): skill по союзнику, ultimate без цели
    const filler = (slot: 0 | 2) => basic(slot, enemy(0));
    expect(validateCommands(s, 'A', cmd(filler(0), skill(1, ally(1)), filler(2)))).toEqual(['skill blocked by freeze']);
    expect(validateCommands(s, 'A', cmd(filler(0), ult(1), filler(2)))).toEqual([]);
  });

  it('ultimate при luna 2 в new → not enough luna; в full — ок', () => {
    let s = setLuna(base(), 'A', 2);
    s.moon = 'new';
    const c = cmd(ult(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0)));
    expect(ultimateLunaCost(s, 'A')).toBe(3);
    expect(validateCommands(s, 'A', c)).toEqual(['not enough luna']);
    s.moon = 'full';
    expect(ultimateLunaCost(s, 'A')).toBe(2);
    expect(validateCommands(s, 'A', c)).toEqual([]);
  });

  it('4 Energy в раунде 1: три skill по 1 + карта за 1 — ок; плюс карта за 2 → not enough energy', () => {
    // fenna, nerisa, tali: все три умения по 1 Energy
    const s0 = setRound(makeMatch({ a: ['fenna', 'nerisa', 'tali', 'aira', 'zefira', 'liraya'] }), 1);
    expect(energyBudget(s0, 'A')).toBe(4);
    const skills = cmd(skill(0, ally(0)), skill(1, ally(1)), skill(2, enemy(0)));
    const withCard1 = setHand(s0, 'A', ['lunarSpark']);
    expect(validateCommands(withCard1, 'A', { ...skills, card: { handIndex: 0 } })).toEqual([]);
    const withCard2 = setHand(s0, 'A', ['dispel']);
    expect(validateCommands(withCard2, 'A', { ...skills, card: { handIndex: 0 } })).toEqual(['not enough energy']);
  });

  it('bloodPact в команде позволяет потратить 6 в раунде 1', () => {
    // Айра skill 2 + ульты Фенны и Нерисы по 2 = 6 Energy (Полнолуние: две ульты по 2 Luna)
    let s = setRound(makeMatch(), 1);
    s = setLuna(s, 'A', 4);
    s.moon = 'full';
    const skills = cmd(skill(0, enemy(0)), ult(1), ult(2));
    expect(validateCommands(setHand(s, 'A', ['lunarSpark']), 'A', { ...skills, card: { handIndex: 0 } }))
      .toEqual(['not enough energy']);
    const pact = setHand(s, 'A', ['bloodPact']);
    expect(validateCommands(pact, 'A', { ...skills, card: { handIndex: 0, target: ally(0) } })).toEqual([]);
  });

  it('скидка Миры: в нечётный раунд карта за 1 стоит 0', () => {
    const s = setRound(makeMatch({ a: ['mira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'] }), 3);
    expect(cardCost(s, 'A', 'lunarSpark')).toBe(0);
    expect(cardCost(setRound(s, 4), 'A', 'lunarSpark')).toBe(1);
    expect(cardCost(s, 'B', 'lunarSpark')).toBe(1);
    expect(cardCost(s, 'A', 'reserveImpulse')).toBe(0);
  });
});

describe('cover: secondary guardian', () => {
  const play = (s: MatchState, secondary?: SlotRef) =>
    validateCommands(setHand(s, 'A', ['cover']), 'A', {
      ...cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0))),
      card: { handIndex: 0, target: ally(0), secondary },
    });

  it('cover с живым стражем своей стороны как secondary — ок', () => {
    expect(play(base(), ally(2))).toEqual([]);
  });

  it('cover с не-стражем, мёртвым стражем, чужим или отсутствующим secondary → wrong target type', () => {
    expect(play(base(), ally(0))).toEqual(['wrong target type']);
    // мёртвая Нериса не может действовать (basic в слоте 2) и не годится как страж
    expect(play(killActive(base(), ally(2)), ally(2))).toEqual(['dead hero cannot act', 'wrong target type']);
    expect(play(base(), enemy(2))).toEqual(['wrong target type']);
    expect(play(base())).toEqual(['wrong target type']);
  });
});

describe('validateCommands: некорректный ввод не бросает исключение', () => {
  const card = (cardId: Parameters<typeof setHand>[2][number], play: Record<string, unknown>) =>
    validateCommands(setHand(base(), 'A', [cardId]), 'A', {
      ...cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0))),
      card: { handIndex: 0, ...play } as never,
    });

  it('basic по слоту 5 → wrong target type', () => {
    const bad = { type: 'basic', target: { side: 'B', slot: 5 } } as unknown as HeroAction;
    expect(validateCommands(base(), 'A', cmd(bad, basic(1, enemy(0)), basic(2, enemy(0))))).toEqual(['wrong target type']);
    const badSide = { type: 'basic', target: { side: 'C', slot: 0 } } as unknown as HeroAction;
    expect(validateCommands(base(), 'A', cmd(badSide, basic(1, enemy(0)), basic(2, enemy(0))))).toEqual(['wrong target type']);
  });

  it('союзная цель вне диапазона и не-объект → wrong target type', () => {
    expect(card('fieldKit', { target: { side: 'A', slot: 3 } })).toEqual(['wrong target type']);
    expect(card('fieldKit', { target: 'A0' })).toEqual(['wrong target type']);
    expect(card('fieldKit', { target: null })).toEqual(['wrong target type']);
  });

  it('secondary не объект или вне диапазона → wrong target type', () => {
    expect(card('emergencySwap', { target: ally(0), secondary: 1 })).toEqual(['wrong target type']);
    expect(card('cover', { target: ally(0), secondary: 'nerisa' })).toEqual(['wrong target type']);
    expect(card('cover', { target: ally(0), secondary: { side: 'A', slot: 7 } })).toEqual(['wrong target type']);
    expect(card('fieldKit', { target: ally(0), secondary: 42 })).toEqual(['wrong target type']);
  });

  it('два swap в один и тот же слот резерва → duplicate reserve index', () => {
    const c = cmd({ type: 'swap', reserveIndex: 1 }, { type: 'swap', reserveIndex: 1 }, basic(2, enemy(0)));
    expect(validateCommands(base(), 'A', c)).toEqual(['duplicate reserve index']);
    const ok = cmd({ type: 'swap', reserveIndex: 0 }, { type: 'swap', reserveIndex: 1 }, basic(2, enemy(0)));
    expect(validateCommands(base(), 'A', ok)).toEqual([]);
  });

  it('validateCommands на представлении стороны A для стороны B бросает', () => {
    const s = base();
    expect(() => validateCommands(viewFor(s, 'A'), 'B', cmd(basic(0, ally(0)), basic(1, ally(0)), basic(2, ally(0)))))
      .toThrow('hidden');
  });
});

describe('emergencySwap и swap: резерв', () => {
  const fill = [basic(0, enemy(0)), basic(1, enemy(0))] as const;
  const play = (s: MatchState, card: { target?: SlotRef; secondary?: unknown }) =>
    validateCommands(setHand(s, 'A', ['emergencySwap']), 'A', {
      ...cmd(fill[0], fill[1], basic(2, enemy(0))),
      card: { handIndex: 0, ...card } as never,
    });

  it('emergencySwap: живой слот и живой резерв — ок', () => {
    expect(play(base(), { target: ally(0), secondary: { reserveIndex: 0 } })).toEqual([]);
  });

  it('emergencySwap без secondary или с SlotRef вместо reserveIndex → wrong target type', () => {
    expect(play(base(), { target: ally(0) })).toEqual(['wrong target type']);
    expect(play(base(), { target: ally(0), secondary: ally(1) })).toEqual(['wrong target type']);
  });

  it('emergencySwap: мёртвый резерв → reserve hero is dead', () => {
    const s = base();
    s.sides.A.reserve[1].hp = 0;
    expect(play(s, { target: ally(0), secondary: { reserveIndex: 1 } })).toEqual(['reserve hero is dead']);
  });

  it('emergencySwap: reserveIndex вне 0..2 не бросает исключение', () => {
    expect(play(base(), { target: ally(0), secondary: { reserveIndex: 5 } })).toEqual(['wrong target type']);
  });

  it('swap с reserveIndex 5 даёт ошибку, а не исключение', () => {
    const bad = { type: 'swap', reserveIndex: 5 } as unknown as HeroAction;
    expect(validateCommands(base(), 'A', cmd(bad, basic(1, enemy(0)), basic(2, enemy(0))))).toEqual(['wrong target type']);
  });
});

describe('viewFor', () => {
  it('viewFor прячет руку противника, оставляет handSize', () => {
    const s = base();
    const v = viewFor(s, 'A');
    const opp = v.sides.B as Record<string, unknown>;
    expect(opp.hand).toBeUndefined();
    expect(opp.deck).toBeUndefined();
    expect(opp.discard).toBeUndefined();
    expect(opp.handSize).toBe(s.sides.B.hand.length);
    expect(opp.deckSize).toBe(s.sides.B.deck.length);
    expect((v.sides.A as { hand: unknown }).hand).toEqual(s.sides.A.hand);
    expect('hand' in v.sides.B).toBe(false);
    // изменение представления не затрагивает исходное состояние
    (v.sides.A as { hand: string[] }).hand.length = 0;
    (v.sides.B as { handSize: number }).handSize = -1;
    expect(s.sides.A.hand.length).toBeGreaterThan(0);
    expect(s.sides.B.hand.length).toBeGreaterThan(0);
  });

  it('viewFor: без seed и rngState, своя колода только размером (R33)', () => {
    const s = base();
    const v = viewFor(s, 'A') as unknown as Record<string, unknown>;
    expect('seed' in v).toBe(false);
    expect('rngState' in v).toBe(false);
    const own = (v.sides as Record<string, Record<string, unknown>>).A!;
    expect('deck' in own).toBe(false);
    expect(own.deckSize).toBe(s.sides.A.deck.length);
    expect(own.hand).toEqual(s.sides.A.hand);
    expect(own.discard).toEqual(s.sides.A.discard);
  });
});

describe('eventsFor', () => {
  const ev = (type: string, extra: Record<string, unknown>): GameEvent => ({ type, round: 1, phase: 'roundStart', ...extra });

  it('скрывает cardId только в draw / discardOverflow противника, остальное без изменений', () => {
    const events: GameEvent[] = [
      ev('draw', { side: 'A', cardId: 'fieldKit' }),
      ev('draw', { side: 'B', cardId: 'eclipse' }),
      ev('discardOverflow', { side: 'A', cardId: 'unseal' }),
      ev('discardOverflow', { side: 'B', cardId: 'cover' }),
      ev('cardPlayed', { side: 'B', cardId: 'dispel', cost: 2 }),
      ev('reshuffle', { side: 'B', count: 4 }),
    ];
    const before = structuredClone(events);
    const forA = eventsFor(events, 'A');
    expect(forA).toEqual([
      ev('draw', { side: 'A', cardId: 'fieldKit' }),
      ev('draw', { side: 'B' }),
      ev('discardOverflow', { side: 'A', cardId: 'unseal' }),
      ev('discardOverflow', { side: 'B' }),
      ev('cardPlayed', { side: 'B', cardId: 'dispel', cost: 2 }),
      ev('reshuffle', { side: 'B', count: 4 }),
    ]);
    expect('cardId' in forA[1]!).toBe(false);
    expect(eventsFor(events, 'B').map(e => e['cardId'])).toEqual([undefined, 'eclipse', undefined, 'cover', 'dispel', undefined]);
    // исходный список не меняется
    expect(events).toEqual(before);
  });
});
