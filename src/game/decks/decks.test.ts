import { describe, expect, it } from 'vitest';
import { CARDS, HEROES, HERO_IDS, validateDeck } from '../../engine';
import type { Deck, HeroId } from '../../engine';
import { ru } from '../../i18n/ru';
import { opponentDeckFor } from '../session';
import { ARCHETYPES, ARCHETYPE_KEYS, buildPreset } from './presets';
import { deckIssues } from './validation';

const first = (n: number): HeroId[] => HERO_IDS.slice(0, n);

describe('ARCHETYPES', () => {
  it('содержит четыре архетипа с 12 картами и 6 ролями', () => {
    expect(ARCHETYPE_KEYS).toEqual(['attack', 'defense', 'control', 'balanced']);
    for (const key of ARCHETYPE_KEYS) {
      expect(ARCHETYPES[key].cards).toHaveLength(12);
      expect(ARCHETYPES[key].roles).toHaveLength(6);
    }
  });

  it('балансный архетип — по одной карте каждого из 12 Common', () => {
    const commons = Object.values(CARDS).filter((c) => c.rarity === 'common').map((c) => c.id);
    expect(commons).toHaveLength(12);
    expect(ARCHETYPES.balanced.cards).toEqual(commons);
  });

  it('атака — таблица спеки §6.2', () => {
    expect(ARCHETYPES.attack.roles).toEqual(['striker', 'mage', 'striker', 'mage', 'support', 'guardian']);
    expect(ARCHETYPES.attack.cards).toEqual([
      'huntersMark', 'huntersMark', 'piercingStrike', 'piercingStrike', 'warCry', 'warCry',
      'lunarDash', 'lunarDash', 'bloodPact', 'ashTrail', 'lunarSpark', 'lunarSpark',
    ]);
  });
});

describe('buildPreset', () => {
  for (const key of ARCHETYPE_KEYS) {
    for (const n of [6, 8, 12]) {
      it(`${key}: при ${n} открытых героинях колода легальна`, () => {
        const deck = buildPreset(key, first(n));
        expect(validateDeck(deck)).toEqual([]);
        expect(deck.starting).toEqual([0, 1, 2]);
        expect(deck.cards).toEqual(ARCHETYPES[key].cards);
      });
    }
  }

  it('при шести открытых без части ролей колода всё равно легальна', () => {
    // aira, fenna, nerisa, tali, zefira, liraya: нет striker
    const unlocked = first(6);
    expect(unlocked.some((id) => HEROES[id].role === 'striker')).toBe(false);
    for (const key of ARCHETYPE_KEYS) {
      expect(validateDeck(buildPreset(key, unlocked))).toEqual([]);
    }
  });

  it('при менее чем шести открытых бросает «not enough heroes»', () => {
    expect(() => buildPreset('attack', ['aira', 'fenna', 'nerisa', 'justina'])).toThrow('not enough heroes');
  });

  it('«атака» при 12 открытых начинается со striker', () => {
    const deck = buildPreset('attack', HERO_IDS);
    expect(HEROES[deck.heroes[0]!].role).toBe('striker');
    expect(deck.heroes.map((id) => HEROES[id].role)).toEqual(ARCHETYPES.attack.roles);
  });

  it('берёт героинь по порядку HERO_IDS внутри роли и без повторов', () => {
    const deck = buildPreset('attack', HERO_IDS);
    expect(deck.heroes[0]).toBe('justina');
    expect(deck.heroes[2]).toBe('kira');
    expect(new Set(deck.heroes).size).toBe(6);
  });

  it('недостающую роль добирает следующей открытой героиней', () => {
    const unlocked: HeroId[] = ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'];
    const deck = buildPreset('attack', unlocked);
    // striker нет: первая и третья позиции — первые неиспользованные открытые
    expect(deck.heroes[0]).toBe('aira');
    expect(new Set(deck.heroes).size).toBe(6);
  });

  it('детерминирована', () => {
    expect(buildPreset('control', HERO_IDS)).toEqual(buildPreset('control', HERO_IDS));
  });
});

describe('deckIssues', () => {
  const ok = (): Deck => buildPreset('balanced', HERO_IDS);

  it('для корректной колоды пуст', () => {
    expect(deckIssues(ok())).toEqual([]);
  });

  it('три копии — русский текст с названием карты', () => {
    const deck = ok();
    deck.cards = [...deck.cards.slice(0, 9), 'lunarDash', 'lunarDash', 'lunarDash'];
    const issues = deckIssues(deck);
    expect(issues).toContain(ru.deckErrors.copies.replace('{name}', CARDS.lunarDash.name));
    expect(issues.join(' ')).toContain('Лунный рывок');
  });

  it('две копии легендарной — текст с названием', () => {
    const deck = ok();
    deck.cards = [...deck.cards.slice(0, 10), 'rewriteFate', 'rewriteFate'];
    const issues = deckIssues(deck);
    expect(issues.some((s) => s.includes(CARDS.rewriteFate.name) && s.includes('Легендарная'))).toBe(true);
  });

  it('неверное число героинь, дубликат, стартовая тройка, число карт', () => {
    const deck = ok();
    expect(deckIssues({ ...deck, heroes: deck.heroes.slice(0, 5) })).toContain(ru.deckErrors.count6);
    expect(deckIssues({ ...deck, heroes: [deck.heroes[0]!, ...deck.heroes.slice(0, 5)] }))
      .toContain(ru.deckErrors.duplicateHero);
    expect(deckIssues({ ...deck, starting: [0, 0, 1] })).toContain(ru.deckErrors.starting);
    expect(deckIssues({ ...deck, cards: deck.cards.slice(0, 11) })).toContain(ru.deckErrors.count12);
  });

  it('более двух легендарных карт', () => {
    const deck = ok();
    deck.cards = [...deck.cards.slice(0, 9), 'rewriteFate', 'rewriteFate', 'rewriteFate'];
    expect(deckIssues(deck)).toContain(ru.deckErrors.legendaryCount);
  });

  it('неизвестная карта или героиня — общий текст', () => {
    const deck = ok();
    const bad = { ...deck, cards: [...deck.cards.slice(0, 11), 'nope' as never] };
    expect(deckIssues(bad)).toContain(ru.deckErrors.unknown);
    expect(deckIssues({ ...deck, heroes: [...deck.heroes.slice(0, 5), 'zzz' as never] }))
      .toContain(ru.deckErrors.unknown);
  });
});

describe('opponentDeckFor', () => {
  it('детерминирован и легален для seed 0..7', () => {
    for (let seed = 0; seed < 8; seed++) {
      const deck = opponentDeckFor(seed);
      expect(validateDeck(deck)).toEqual([]);
      expect(opponentDeckFor(seed)).toEqual(deck);
    }
  });

  it('выбирает архетип по seed % 4', () => {
    for (let seed = 0; seed < 8; seed++) {
      expect(opponentDeckFor(seed).cards).toEqual(ARCHETYPES[ARCHETYPE_KEYS[seed % 4]!].cards);
    }
  });
});
