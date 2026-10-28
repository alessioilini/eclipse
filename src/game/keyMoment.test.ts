import { describe, expect, it } from 'vitest';
import { HEROES } from '../engine';
import type { EngineEvent, HeroId, MatchState, Side, Slot } from '../engine';
import { fmt, ru } from '../i18n/ru';
import { keyMoment } from './keyMoment';

const base = { round: 1, phase: 'standard' as const };
const ref = (side: Side, slot: Slot) => ({ side, slot });

function final(winner: Side | 'draw' = 'A', round = 7): MatchState {
  return {
    round,
    result: { winner, reason: 'wipe' },
    sides: {
      A: { active: [{ id: 'aira' }, { id: 'fenna' }, { id: 'nerisa' }] },
      B: { active: [{ id: 'aurora' }, { id: 'justina' }, { id: 'nokta' }] },
    },
  } as unknown as MatchState;
}

function dmg(side: Side, slot: Slot, attackerId: HeroId, hpLoss: number, absorbed = 0, tSlot: Slot = 0, targetId: HeroId = 'kira'): EngineEvent {
  const other: Side = side === 'A' ? 'B' : 'A';
  return {
    ...base, type: 'damage', attacker: ref(side, slot), target: ref(other, tSlot), attackerId, targetId,
    raw: hpLoss, flat: 0, reductions: 0, dmg: hpLoss + absorbed, absorbed, hpLoss, hp: 10, shield: 0,
  };
}

const bloodMoon = (side: Side): EngineEvent => ({ ...base, type: 'bloodMoon', side, heroId: 'aira', slot: 0 });
const action = (side: Side, slot: Slot, heroId: HeroId, a: 'basic' | 'ultimate'): EngineEvent =>
  ({ ...base, type: 'heroAction', side, slot, heroId, action: a });
const death = (side: Side, slot: Slot, heroId: HeroId): EngineEvent => ({ ...base, type: 'death', side, slot, heroId });

describe('keyMoment: пять правил по приоритету', () => {
  it('1. Кровавая Луна игрока и победа: камбэк', () => {
    const k = keyMoment([bloodMoon('A')], final('A'), 'A');
    expect(k.rule).toBe('bloodMoonComeback');
    expect(k.text).toBe(fmt(ru.keyMoment.bloodMoonComeback, { name: HEROES.aira.name }));
  });

  it('Кровавая Луна без победы не даёт камбэк', () => {
    expect(keyMoment([bloodMoon('A')], final('B'), 'A').rule).toBe('rounds');
  });

  it('Кровавая Луна противника не даёт камбэк', () => {
    expect(keyMoment([bloodMoon('B')], final('A'), 'A').rule).toBe('rounds');
  });

  it('камбэк выше topDamage', () => {
    const events = [bloodMoon('A'), dmg('A', 0, 'aira', 50)];
    expect(keyMoment(events, final('A'), 'A').rule).toBe('bloodMoonComeback');
  });

  it('2. героиня с долей урона не менее 35%: topDamage с округлённым процентом', () => {
    const events = [dmg('A', 0, 'aira', 41), dmg('A', 1, 'fenna', 30), dmg('A', 2, 'nerisa', 29)];
    const k = keyMoment(events, final('A'), 'A');
    expect(k.rule).toBe('topDamage');
    expect(k.text).toBe(fmt(ru.keyMoment.topDamage, { name: HEROES.aira.name, n: 41 }));
  });

  it('урон противника и ожоги не входят в долю', () => {
    const events = [dmg('A', 0, 'aira', 10), dmg('A', 1, 'fenna', 10), dmg('A', 2, 'nerisa', 10), dmg('B', 0, 'aurora', 500)];
    expect(keyMoment(events, final('A'), 'A').rule).toBe('rounds');
  });

  it('доля ниже 35% не срабатывает', () => {
    const events = [dmg('A', 0, 'aira', 34), dmg('A', 1, 'fenna', 33), dmg('A', 2, 'nerisa', 33)];
    expect(keyMoment(events, final('A'), 'A').rule).toBe('rounds');
  });

  it('detonate и reflect игрока считаются уроном их источника', () => {
    const events: EngineEvent[] = [
      { ...base, type: 'detonate', source: ref('A', 1), target: ref('B', 0), stacks: 3, dmg: 40, hp: 5 },
      dmg('A', 0, 'aira', 10), dmg('A', 2, 'nerisa', 10),
      { ...base, type: 'reflect', from: ref('B', 1), to: ref('A', 0), dmg: 99, charges: 0, hp: 5 },
    ];
    const k = keyMoment(events, final('A'), 'A');
    expect(k.rule).toBe('topDamage');
    expect(k.text).toBe(fmt(ru.keyMoment.topDamage, { name: HEROES.fenna.name, n: 67 }));
  });

  it('3. щиты игрока поглотили 25+ урона: имя героини, чьи щиты поглотили больше всех', () => {
    const events = [
      dmg('B', 0, 'aurora', 1, 20, 0, 'aira'),
      dmg('B', 1, 'justina', 1, 15, 1, 'fenna'),
      dmg('B', 2, 'nokta', 1, 5, 1, 'fenna'),
      // атаки игрока размазаны, topDamage не срабатывает
      dmg('A', 0, 'aira', 10), dmg('A', 1, 'fenna', 10), dmg('A', 2, 'nerisa', 10),
    ];
    const k = keyMoment(events, final('A'), 'A');
    expect(k.rule).toBe('shields');
    expect(k.text).toBe(fmt(ru.keyMoment.shields, { name: HEROES.fenna.name, n: 40 }));
  });

  it('щиты меньше 25 не срабатывают', () => {
    expect(keyMoment([dmg('B', 0, 'aurora', 1, 24, 0, 'aira')], final('A'), 'A').rule).toBe('rounds');
  });

  it('4. убийство ультой: смерть врага сразу после ульты игрока', () => {
    const events = [action('A', 1, 'fenna', 'ultimate'), death('B', 0, 'aurora')];
    const k = keyMoment(events, final('A'), 'A');
    expect(k.rule).toBe('ultKill');
    expect(k.text).toBe(fmt(ru.keyMoment.ultKill, { name: HEROES.fenna.name }));
  });

  it('смерть после следующего heroAction не приписывается ульте', () => {
    const events = [action('A', 1, 'fenna', 'ultimate'), action('A', 0, 'aira', 'basic'), death('B', 0, 'aurora')];
    expect(keyMoment(events, final('A'), 'A').rule).toBe('rounds');
  });

  it('смерть своей героини после ульты не считается', () => {
    const events = [action('A', 1, 'fenna', 'ultimate'), death('A', 0, 'aira')];
    expect(keyMoment(events, final('A'), 'A').rule).toBe('rounds');
  });

  it('5. иначе: число раундов матча', () => {
    const k = keyMoment([], final('A', 7), 'A');
    expect(k.rule).toBe('rounds');
    expect(k.text).toBe(fmt(ru.keyMoment.rounds, { n: 7 }));
  });
});
