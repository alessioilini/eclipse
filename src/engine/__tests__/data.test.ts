import { describe, it, expect } from 'vitest';
import { HEROES, HERO_IDS } from '../data/heroes';
import { CARDS, CARD_IDS } from '../data/cards';
import { elementMultiplier } from '../data/elements';
import type { Role } from '../types';

describe('данные движка', () => {
  it('12 героинь, по две на стихию', () => {
    expect(HERO_IDS.length).toBe(12);
    const counts: Record<string, number> = {};
    for (const id of HERO_IDS) counts[HEROES[id].element] = (counts[HEROES[id].element] ?? 0) + 1;
    expect(counts).toEqual({ fire: 2, water: 2, wind: 2, light: 2, dark: 2, star: 2 });
  });

  it('характеристики в коридорах роли', () => {
    const corridors: Record<Role, { hp: [number, number]; atk: [number, number]; spd: [number, number] }> = {
      guardian: { hp: [28, 32], atk: [4, 5], spd: [4, 7] },
      striker: { hp: [21, 24], atk: [6, 7], spd: [6, 9] },
      mage: { hp: [19, 22], atk: [6, 7], spd: [5, 8] },
      support: { hp: [23, 26], atk: [4, 5], spd: [6, 9] },
    };
    const outside: string[] = [];
    for (const id of HERO_IDS) {
      const h = HEROES[id];
      const c = corridors[h.role];
      const ok = h.hp >= c.hp[0] && h.hp <= c.hp[1] && h.atk >= c.atk[0] && h.atk <= c.atk[1]
        && h.spd >= c.spd[0] && h.spd <= c.spd[1];
      if (!ok) outside.push(id);
    }
    expect(outside).toEqual([]);
  });

  it('числа из спеки', () => {
    expect([HEROES.aurora.hp, HEROES.aurora.atk, HEROES.aurora.spd]).toEqual([32, 4, 5]);
    expect([HEROES.mira.hp, HEROES.mira.atk, HEROES.mira.spd]).toEqual([24, 4, 9]);
    expect(HEROES.zefira.spd).toBe(7);
    expect([HEROES.aira.hp, HEROES.aira.atk, HEROES.aira.spd]).toEqual([20, 6, 6]);
    expect([HEROES.kira.hp, HEROES.kira.atk, HEROES.kira.spd]).toEqual([24, 7, 6]);
    expect(HEROES.aira.skill.cost).toBe(2);
    expect(HEROES.aira.skill.effects[0]).toEqual({ op: 'damage', mod: 0.9, aoe: true });
  });

  it('у каждой героини есть пассивка, умение и ульта', () => {
    for (const id of HERO_IDS) {
      const h = HEROES[id];
      expect(h.id).toBe(id);
      expect(h.passive.name.length).toBeGreaterThan(0);
      expect(h.passive.text.length).toBeGreaterThan(0);
      expect(h.skill.effects.length).toBeGreaterThan(0);
      expect(h.ultimate.effects.length).toBeGreaterThan(0);
    }
  });

  it('24 карты: 12 common, 7 rare, 4 epic, 1 legendary', () => {
    expect(CARD_IDS.length).toBe(24);
    const count = (r: string) => CARD_IDS.filter((id) => CARDS[id].rarity === r).length;
    expect([count('common'), count('rare'), count('epic'), count('legendary')]).toEqual([12, 7, 4, 1]);
  });

  it('стоимости карт из спеки', () => {
    expect(CARDS.bloodPact.cost).toBe(0);
    expect(CARDS.reserveImpulse.cost).toBe(0);
    expect(CARDS.rewriteFate.cost).toBe(3);
    expect(CARDS.eclipse.cost).toBe(2);
    expect(CARDS.dispel.cost).toBe(2);
    expect(CARDS.lastWord.cost).toBe(1);
  });

  it('тайминги', () => {
    expect(CARDS.warCry.timing).toBe('swift');
    expect(CARDS.piercingStrike.timing).toBe('swift');
    expect(CARDS.fieldKit.timing).toBe('standard');
    expect(CARDS.wardCircle.timing).toBe('reaction');
    expect(CARDS.rewriteFate.timing).toBe('reaction');
  });

  it('цели карт', () => {
    expect(CARDS.cover.target).toBe('allyAndGuardian');
    expect(CARDS.emergencySwap.target).toBe('slotAndReserve');
    expect(CARDS.lunarSpark.target).toBe('none');
    expect(CARDS.huntersMark.target).toBe('enemy');
  });

  it('стихии', () => {
    expect(elementMultiplier('fire', 'wind')).toBe(1.2);
    expect(elementMultiplier('wind', 'fire')).toBe(0.85);
    expect(elementMultiplier('light', 'dark')).toBe(1.15);
    expect(elementMultiplier('star', 'fire')).toBe(1);
    expect(elementMultiplier('fire', 'fire')).toBe(1);
    expect(elementMultiplier('wind', 'water')).toBe(1.2);
    expect(elementMultiplier('water', 'fire')).toBe(1.2);
    expect(elementMultiplier('water', 'wind')).toBe(0.85);
    expect(elementMultiplier('fire', 'water')).toBe(0.85);
    expect(elementMultiplier('dark', 'light')).toBe(1.15);
    expect(elementMultiplier('fire', 'star')).toBe(1);
  });
});
