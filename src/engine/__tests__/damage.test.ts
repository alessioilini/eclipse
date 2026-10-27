import { describe, it, expect } from 'vitest';
import {
  roundHalfUp, computeDamage, applyToHero, directDamage,
  healAmount, shieldAmount, applyHeal, applyShield,
} from '../damage';
import { applyStatus, hasStatus } from '../status';
import { makeMatch } from './helpers';
import type { HeroState } from '../types';

const base = { flat: 0, bloodMoon: false, round: 1, reductions: 0 };
const hero = (over: Partial<HeroState> = {}): HeroState => ({
  ...makeMatch().sides.A.active[0], hp: 20, maxHp: 20, shield: 0, shieldExpiresAtRound: null, statuses: [], ...over,
});

describe('roundHalfUp', () => {
  it('roundHalfUp: 4.5→5, 8.05→8, 6.9→7, 5.75→6', () => {
    expect(roundHalfUp(4.5)).toBe(5);
    expect(roundHalfUp(8.05)).toBe(8);
    expect(roundHalfUp(6.9)).toBe(7);
    expect(roundHalfUp(5.75)).toBe(6);
  });
});

describe('computeDamage', () => {
  it('Нокта (7, dark) basic по Авроре (light): 7×1.15 = 8', () => {
    expect(computeDamage({ ...base, atk: 7, mod: 1, attacker: 'dark', target: 'light' })).toBe(8);
  });
  it('Айра skill 90% по Зефире (wind): 7×0.9×1.2 = 8', () => {
    expect(computeDamage({ ...base, atk: 7, mod: 0.9, attacker: 'fire', target: 'wind' })).toBe(8);
  });
  it('Fire→Water: 7×0.85 = 6', () => {
    expect(computeDamage({ ...base, atk: 7, mod: 1, attacker: 'fire', target: 'water' })).toBe(6);
  });
  it('Mark +3 прибавляется после округления стихии: 8 + 3 = 11', () => {
    expect(computeDamage({ ...base, atk: 7, mod: 1, attacker: 'dark', target: 'light', flat: 3 })).toBe(11);
  });
  it('снижение −3 после бонусов: 4 − 3 = 1; 4 − 4 → min 1', () => {
    expect(computeDamage({ ...base, atk: 4, mod: 1, attacker: 'star', target: 'star', reductions: 3 })).toBe(1);
    expect(computeDamage({ ...base, atk: 4, mod: 1, attacker: 'star', target: 'star', reductions: 4 })).toBe(1);
  });
  it('Total Eclipse раунд 9: 8 × 1.25 = 10; Blood Moon: 8 × 1.2 = 10', () => {
    expect(computeDamage({ ...base, atk: 8, mod: 1, attacker: 'star', target: 'star', round: 9 })).toBe(10);
    expect(computeDamage({ ...base, atk: 8, mod: 1, attacker: 'star', target: 'star', bloodMoon: true })).toBe(10);
  });
});

describe('applyToHero', () => {
  it('щит 5 поглощает 8: absorbed 5, hpLoss 3, shield 0', () => {
    const r = applyToHero(hero({ shield: 5 }), 8, {});
    expect(r.absorbed).toBe(5);
    expect(r.hpLoss).toBe(3);
    expect(r.hero.shield).toBe(0);
    expect(r.hero.hp).toBe(17);
  });
  it('pierce игнорирует щит: absorbed 0, hpLoss 8, shield остаётся 5', () => {
    const r = applyToHero(hero({ shield: 5 }), 8, { pierce: true });
    expect(r.absorbed).toBe(0);
    expect(r.hpLoss).toBe(8);
    expect(r.hero.shield).toBe(5);
  });
  it('undying: hp 3, урон 8 → hp 1, статус снят', () => {
    const h = applyStatus(hero({ hp: 3 }), { id: 'undying', duration: 'thisRound', round: 1 });
    const r = applyToHero(h, 8, {});
    expect(r.hero.hp).toBe(1);
    expect(r.hpLoss).toBe(2);
    expect(hasStatus(r.hero, 'undying')).toBe(false);
  });
  it('не мутирует исходного героя', () => {
    const h = hero({ shield: 5 });
    applyToHero(h, 8, {});
    expect(h.hp).toBe(20);
    expect(h.shield).toBe(5);
  });
});

describe('directDamage', () => {
  it('игнорирует щит, не опускает ниже floor и 0', () => {
    expect(directDamage(hero({ shield: 5 }), 3).hero.hp).toBe(17);
    expect(directDamage(hero({ hp: 3 }), 8, 1)).toMatchObject({ hpLoss: 2, hero: { hp: 1 } });
    expect(directDamage(hero({ hp: 3 }), 8).hero.hp).toBe(0);
    expect(directDamage(hero({ hp: 1 }), 5, 2).hpLoss).toBe(0);
  });
});

describe('heal / shield', () => {
  it('healAmount: curse ×0.5 (6→3), waxing +1, waning −1 не ниже 0, Eclipse ×0.5 после curse', () => {
    const cursed = applyStatus(hero(), { id: 'curse', duration: 'permanent', round: 1 });
    expect(healAmount(6, cursed, 'new', 1)).toBe(3);
    expect(healAmount(6, hero(), 'waxing', 1)).toBe(7);
    expect(healAmount(0, hero(), 'waning', 1)).toBe(0);
    expect(healAmount(6, cursed, 'waning', 9)).toBe(1);
  });
  it('shieldAmount: Eclipse 6×0.75 = 5 (4.5→5), waxing +1', () => {
    expect(shieldAmount(6, 'new', 9)).toBe(5);
    expect(shieldAmount(6, 'waxing', 1)).toBe(7);
  });
  it('applyHeal не выше maxHp', () => {
    const r = applyHeal(hero({ hp: 18 }), 5);
    expect(r.healed).toBe(2);
    expect(r.hero.hp).toBe(20);
  });
  it('applyShield складывается и ставит shieldExpiresAtRound = round + 1', () => {
    const h = applyShield(applyShield(hero(), 3, 2), 4, 2);
    expect(h.shield).toBe(7);
    expect(h.shieldExpiresAtRound).toBe(3);
  });
});
