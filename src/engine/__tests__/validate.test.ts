import { describe, expect, it } from 'vitest';
import { cardCost, energyBudget, ultimateLunaCost, validateCommands } from '../validate';
import { viewFor } from '../view';
import { ally, basic, cmd, enemy, makeMatch, setHand, setLuna, setRound, skill, ult } from './helpers';
import type { MatchState, SlotRef } from '../types';

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
    expect(validateCommands(s, 'A', c)).toContain('target slot is dead');
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
    expect(validateCommands(s, 'A', c)).toContain('not enough luna');
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
    expect(validateCommands(withCard2, 'A', { ...skills, card: { handIndex: 0 } })).toContain('not enough energy');
  });

  it('bloodPact в команде позволяет потратить 6 в раунде 1', () => {
    // три aira: skill по 2 Energy, всего 6
    let s = setRound(makeMatch({ a: ['aira', 'aira', 'aira', 'fenna', 'nerisa', 'tali'] }), 1);
    s = setLuna(s, 'A', 0);
    const skills = cmd(skill(0, enemy(0)), skill(1, enemy(0)), skill(2, enemy(0)));
    expect(validateCommands(setHand(s, 'A', ['lunarSpark']), 'A', { ...skills, card: { handIndex: 0 } }))
      .toContain('not enough energy');
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
    // мёртвая Нериса сама не может действовать, поэтому проверяем только наличие ошибки secondary
    expect(play(killActive(base(), ally(2)), ally(2))).toContain('wrong target type');
    expect(play(base(), enemy(2))).toEqual(['wrong target type']);
    expect(play(base())).toEqual(['wrong target type']);
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
    // исходное состояние не изменено
    expect(s.sides.B.hand).toBeDefined();
  });
});
