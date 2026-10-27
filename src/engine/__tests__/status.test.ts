import { describe, it, expect } from 'vitest';
import {
  expiresAt, applyStatus, removeStatus, hasStatus, statusValue, cleanse, removeBuffs,
  expireStatuses, effectiveSpd, effectiveAtk, isAlive,
} from '../status';
import { HEROES } from '../data/heroes';
import { makeMatch } from './helpers';
import type { HeroState } from '../types';

const hero = (): HeroState => structuredClone(makeMatch().sides.A.active[0]); // aira

describe('expiresAt', () => {
  it('thisRound истекает в этом раунде, nextRound в следующем, permanent никогда', () => {
    expect(expiresAt(3, 'thisRound')).toBe(3);
    expect(expiresAt(3, 'nextRound')).toBe(4);
    expect(expiresAt(3, 'permanent')).toBeNull();
  });
});

describe('applyStatus', () => {
  it('burn стакуется до 3, четвёртый не добавляется', () => {
    let h = hero();
    for (let i = 0; i < 4; i++) h = applyStatus(h, { id: 'burn', duration: 'permanent', round: 1 });
    expect(h.statuses.filter(s => s.id === 'burn')).toHaveLength(1);
    expect(h.statuses[0]!.stacks).toBe(3);
  });

  it('не мутирует исходную героиню', () => {
    const h = hero();
    const before = structuredClone(h);
    applyStatus(h, { id: 'curse', duration: 'permanent', round: 1 });
    expect(h).toEqual(before);
  });

  it('value по умолчанию 0, stacks 1, source сохраняется', () => {
    const h = applyStatus(hero(), { id: 'mark', duration: 'permanent', round: 2, source: { side: 'B', slot: 1 } });
    expect(h.statuses[0]).toEqual({ id: 'mark', value: 0, stacks: 1, expiresAtRound: null, source: { side: 'B', slot: 1 } });
  });

  it('одноимённый статус заменяется, срок — больший из двух, null позже любого числа', () => {
    let h = applyStatus(hero(), { id: 'silence', duration: 'nextRound', round: 1, value: 1 }); // 2
    h = applyStatus(h, { id: 'silence', duration: 'thisRound', round: 1, value: 5 }); // 1
    expect(h.statuses).toHaveLength(1);
    expect(h.statuses[0]!.expiresAtRound).toBe(2);
    expect(h.statuses[0]!.value).toBe(5);
    h = applyStatus(h, { id: 'silence', duration: 'permanent', round: 1 });
    expect(h.statuses[0]!.expiresAtRound).toBeNull();
    h = applyStatus(h, { id: 'silence', duration: 'nextRound', round: 1 });
    expect(h.statuses[0]!.expiresAtRound).toBeNull();
  });

  it('spd и atk модификаторы складываются отдельными записями', () => {
    let h = applyStatus(hero(), { id: 'spd', value: 2, duration: 'thisRound', round: 1 });
    h = applyStatus(h, { id: 'spd', value: 2, duration: 'nextRound', round: 1 });
    expect(h.statuses.filter(s => s.id === 'spd')).toHaveLength(2);
    expect(statusValue(h, 'spd')).toBe(4);
  });
});

describe('removeStatus / hasStatus / statusValue / isAlive', () => {
  it('removeStatus снимает все записи id, hasStatus и statusValue отражают это', () => {
    let h = applyStatus(hero(), { id: 'atk', value: 1, duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'atk', value: 2, duration: 'permanent', round: 1 });
    expect(hasStatus(h, 'atk')).toBe(true);
    expect(statusValue(h, 'atk')).toBe(3);
    const r = removeStatus(h, 'atk');
    expect(hasStatus(r, 'atk')).toBe(false);
    expect(statusValue(r, 'atk')).toBe(0);
    expect(hasStatus(h, 'atk')).toBe(true);
  });

  it('isAlive: hp > 0', () => {
    const h = hero();
    expect(isAlive(h)).toBe(true);
    expect(isAlive({ ...h, hp: 0 })).toBe(false);
  });
});

describe('cleanse', () => {
  it('cleanse(1) снимает burn раньше curse; cleanse(2) снимает burn и soak', () => {
    let h = applyStatus(hero(), { id: 'curse', duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'soak', duration: 'nextRound', round: 1 });
    h = applyStatus(h, { id: 'burn', duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'burn', duration: 'permanent', round: 1 });
    const one = cleanse(h, 1);
    expect(one.removed).toEqual(['burn']);
    expect(hasStatus(one.hero, 'burn')).toBe(false);
    expect(hasStatus(one.hero, 'curse')).toBe(true);
    const two = cleanse(h, 2);
    expect(two.removed).toEqual(['burn', 'soak']);
    expect(hasStatus(two.hero, 'curse')).toBe(true);
    expect(hasStatus(h, 'burn')).toBe(true);
  });

  it('cleanse снимает spd −2, но не spd +2', () => {
    let h = applyStatus(hero(), { id: 'spd', value: 2, duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'spd', value: -2, duration: 'permanent', round: 1 });
    const r = cleanse(h, 5);
    expect(r.removed).toEqual(['spd']);
    expect(r.hero.statuses).toHaveLength(1);
    expect(r.hero.statuses[0]!.value).toBe(2);
  });

  it('cleanse: сначала DEBUFF_ORDER, затем отрицательные spd/atk', () => {
    let h = applyStatus(hero(), { id: 'atk', value: -1, duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'mark', duration: 'permanent', round: 1 });
    expect(cleanse(h, 1).removed).toEqual(['mark']);
    expect(cleanse(h, 2).removed).toEqual(['mark', 'atk']);
  });
});

describe('removeBuffs', () => {
  it('снимает баффы и положительные spd/atk, не трогает дебаффы и щит', () => {
    let h: HeroState = { ...hero(), shield: 4, shieldExpiresAtRound: 2 };
    h = applyStatus(h, { id: 'taunt', duration: 'nextRound', round: 1 });
    h = applyStatus(h, { id: 'undying', duration: 'thisRound', round: 1 });
    h = applyStatus(h, { id: 'spd', value: 2, duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'atk', value: -1, duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'burn', duration: 'permanent', round: 1 });
    const r = removeBuffs(h);
    expect(r.statuses.map(s => s.id).sort()).toEqual(['atk', 'burn']);
    expect(r.shield).toBe(4);
    expect(r.shieldExpiresAtRound).toBe(2);
  });
});

describe('expireStatuses', () => {
  it('снимает статусы с expiresAtRound === round, остальные остаются', () => {
    let h = applyStatus(hero(), { id: 'taunt', duration: 'thisRound', round: 2 });
    h = applyStatus(h, { id: 'freeze', duration: 'nextRound', round: 2 });
    h = applyStatus(h, { id: 'curse', duration: 'permanent', round: 2 });
    const r = expireStatuses(h, 2);
    expect(r.statuses.map(s => s.id)).toEqual(['freeze', 'curse']);
  });

  it('expireStatuses снимает щит в раунд истечения', () => {
    const h: HeroState = { ...hero(), shield: 5, shieldExpiresAtRound: 3 };
    const early = expireStatuses(h, 2);
    expect(early.shield).toBe(5);
    const r = expireStatuses(h, 3);
    expect(r.shield).toBe(0);
    expect(r.shieldExpiresAtRound).toBeNull();
    expect(h.shield).toBe(5);
  });
});

describe('effective stats', () => {
  it('effectiveSpd: freeze −3, bloodMoon +2, статусы spd суммируются', () => {
    const base = HEROES.aira.spd;
    let h = hero();
    expect(effectiveSpd(h)).toBe(base);
    h = applyStatus(h, { id: 'spd', value: 2, duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'spd', value: 1, duration: 'permanent', round: 1 });
    expect(effectiveSpd(h)).toBe(base + 3);
    h = applyStatus(h, { id: 'freeze', duration: 'nextRound', round: 1 });
    expect(effectiveSpd(h)).toBe(base);
    expect(effectiveSpd({ ...h, bloodMoon: true })).toBe(base + 2);
  });

  it('effectiveSpd и effectiveAtk не опускаются ниже 0', () => {
    let h = applyStatus(hero(), { id: 'spd', value: -20, duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'atk', value: -20, duration: 'permanent', round: 1 });
    expect(effectiveSpd(h)).toBe(0);
    expect(effectiveAtk(h)).toBe(0);
  });

  it('effectiveAtk: база + сумма atk-статусов', () => {
    let h = applyStatus(hero(), { id: 'atk', value: 2, duration: 'permanent', round: 1 });
    h = applyStatus(h, { id: 'atk', value: -1, duration: 'permanent', round: 1 });
    expect(effectiveAtk(h)).toBe(HEROES.aira.atk + 1);
  });
});
