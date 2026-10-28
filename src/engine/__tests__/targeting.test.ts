import { describe, it, expect } from 'vitest';
import { aliveActive, findLowestHpEnemy, heroAt, interceptSingleHit, other, resolveTarget, setHeroAt } from '../targeting';
import { applyStatus } from '../status';
import { ally, enemy, makeMatch, setHp } from './helpers';
import type { MatchState, SlotRef, StatusId } from '../types';

// Side A active: aira(0), zefira(1), nerisa(2). Side B active: aurora, justina, nokta.
const mk = () => makeMatch({ a: ['aira', 'zefira', 'nerisa', 'tali', 'fenna', 'liraya'] });

function withStatus(state: MatchState, ref: SlotRef, id: StatusId, value: number, source?: SlotRef): MatchState {
  const s = structuredClone(state);
  const hero = applyStatus(heroAt(s, ref), { id, value, duration: 'permanent', round: s.round, ...(source ? { source } : {}) });
  setHeroAt(s, ref, hero);
  return s;
}

describe('targeting', () => {
  it('heroAt/other/aliveActive: базовые помощники', () => {
    const s = setHp(mk(), enemy(1), 0);
    expect(heroAt(s, enemy(0)).id).toBe('aurora');
    expect(other('A')).toBe('B');
    expect(aliveActive(s, 'B')).toEqual([enemy(0), enemy(2)]);
  });

  it('findLowestHpEnemy: смотрит на противоположную сторону, ничья по HP → меньший слот', () => {
    let s = setHp(mk(), enemy(0), 10);
    s = setHp(s, enemy(2), 10);
    expect(findLowestHpEnemy(s, 'A')).toEqual(enemy(0));
  });

  it('resolveTarget: живая цель остаётся той же', () => {
    expect(resolveTarget(mk(), enemy(1))).toEqual(enemy(1));
  });

  it('resolveTarget: мёртвая цель → живой враг с наименьшим HP', () => {
    let s = setHp(mk(), enemy(0), 0);
    s = setHp(s, enemy(1), 12);
    s = setHp(s, enemy(2), 5);
    expect(resolveTarget(s, enemy(0))).toEqual(enemy(2));
  });

  it('resolveTarget: все враги мертвы → null', () => {
    let s = setHp(mk(), enemy(0), 0);
    s = setHp(s, enemy(1), 0);
    s = setHp(s, enemy(2), 0);
    expect(resolveTarget(s, enemy(0))).toBeNull();
    expect(findLowestHpEnemy(s, 'A')).toBeNull();
  });

  it('без перехватчиков удар идёт в цель', () => {
    const s = setHp(mk(), ally(1), 0); // no Zefira
    expect(interceptSingleHit(s, enemy(0), ally(0))).toEqual({ target: ally(0), reason: null, reduction: 0 });
  });

  it('Taunt перехватывает раньше Прикрытия', () => {
    let s = withStatus(mk(), ally(2), 'taunt', 0);
    s = withStatus(s, ally(0), 'redirectTo', 2, ally(1));
    const r = interceptSingleHit(s, enemy(0), ally(0));
    expect(r).toEqual({ target: ally(2), reason: 'taunt', reduction: 0 });
    // cover not consumed
    expect(heroAt(s, ally(0)).statuses.some(x => x.id === 'redirectTo')).toBe(true);
  });

  it('Прикрытие (redirectTo от cover) перехватывает раньше Нерисы', () => {
    // Nerisa's entry first in the array: priority is by value (cover 2 before Nerisa 1), not by order (R9).
    const s = mk();
    heroAt(s, ally(0)).statuses.push(
      { id: 'redirectTo', value: 1, stacks: 1, expiresAtRound: null, source: ally(2) },
      { id: 'redirectTo', value: 2, stacks: 1, expiresAtRound: null, source: ally(1) },
    );
    const r = interceptSingleHit(s, enemy(0), ally(0));
    expect(r).toEqual({ target: ally(1), reason: 'cover', reduction: 0 });
    const left = heroAt(s, ally(0)).statuses.filter(x => x.id === 'redirectTo');
    expect(left.map(x => x.value)).toEqual([1]);
  });

  it('Нериса перехватывает раньше Зефиры, redirectTo расходуется', () => {
    const s = withStatus(mk(), ally(0), 'redirectTo', 1, ally(2));
    const r = interceptSingleHit(s, enemy(0), ally(0));
    expect(r).toEqual({ target: ally(2), reason: 'nerisa', reduction: 0 });
    expect(heroAt(s, ally(0)).statuses.some(x => x.id === 'redirectTo')).toBe(false);
    expect(heroAt(s, ally(1)).once['zefira.intercept']).toBeUndefined();
  });

  it('redirectTo с мёртвым защитником не срабатывает', () => {
    let s = withStatus(mk(), ally(0), 'redirectTo', 1, ally(2));
    s = setHp(s, ally(2), 0);
    s = setHp(s, ally(1), 0); // no zefira either
    const r = interceptSingleHit(s, enemy(0), ally(0));
    expect(r).toEqual({ target: ally(0), reason: null, reduction: 0 });
  });

  it('Зефира перехватывает удар по союзнице с reduction 2, второй раз в раунде не перехватывает', () => {
    const s = mk();
    const r1 = interceptSingleHit(s, enemy(0), ally(0));
    expect(r1).toEqual({ target: ally(1), reason: 'zefira', reduction: 2 });
    expect(heroAt(s, ally(1)).once['zefira.intercept']).toBe(s.round);
    const r2 = interceptSingleHit(s, enemy(0), ally(2));
    expect(r2).toEqual({ target: ally(2), reason: null, reduction: 0 });
    s.round += 1;
    expect(interceptSingleHit(s, enemy(0), ally(0)).reason).toBe('zefira');
  });

  it('Зефира не перехватывает удар по самой себе', () => {
    const s = mk();
    const r = interceptSingleHit(s, enemy(0), ally(1));
    expect(r).toEqual({ target: ally(1), reason: null, reduction: 0 });
    expect(heroAt(s, ally(1)).once['zefira.intercept']).toBeUndefined();
  });

  it('мёртвая Зефира не перехватывает', () => {
    const s = setHp(mk(), ally(1), 0);
    expect(interceptSingleHit(s, enemy(0), ally(0)).reason).toBeNull();
  });
});
