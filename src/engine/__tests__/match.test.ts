import { describe, it, expect } from 'vitest';
import { createMatch, validateDeck, getWinner } from '../match';
import { CARD_IDS } from '../data/cards';
import type { Deck, MatchState, Side } from '../types';
import { makeMatch, setHp, setLuna, setHand, enemy, ally, cmd, basic, none } from './helpers';

const deckA = (): Deck => ({
  heroes: ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'],
  starting: [0, 1, 2],
  cards: CARD_IDS.slice(0, 12),
});

function kill(state: MatchState, side: Side): MatchState {
  const s = structuredClone(state);
  for (const h of [...s.sides[side].active, ...s.sides[side].reserve]) h.hp = 0;
  return s;
}

describe('validateDeck', () => {
  it('корректная колода → пустой массив', () => {
    expect(validateDeck(deckA())).toEqual([]);
  });

  it('6 героинь, 12 карт, ≤2 копии, legendary ≤1 копия и ≤2 штуки: три нарушения → три сообщения', () => {
    const d = deckA();
    d.heroes = ['aira', 'aira', 'nerisa', 'tali', 'zefira', 'liraya'];
    d.cards = [
      'lunarDash', 'lunarDash', 'lunarDash', // 3 копии
      'rewriteFate', 'rewriteFate',          // 2 копии legendary
      'wardCircle', 'fieldKit', 'unseal', 'huntersMark', 'emergencySwap', 'lunarSpark', 'breakRhythm',
    ];
    const errors = validateDeck(d);
    expect(errors).toHaveLength(3);
    expect(errors).toContain('duplicate hero: aira');
    expect(errors).toContain('more than 2 copies of lunarDash');
    expect(errors).toContain('more than 1 copy of legendary rewriteFate');
  });

  it('неверное количество героинь и карт, плохие индексы starting', () => {
    const d = deckA();
    d.heroes = d.heroes.slice(0, 5);
    d.cards = d.cards.slice(0, 11);
    d.starting = [0, 0, 7] as unknown as Deck['starting'];
    const errors = validateDeck(d);
    expect(errors).toContain('deck must have exactly 6 heroes');
    expect(errors).toContain('deck must have exactly 12 cards');
    expect(errors).toContain('starting must be 3 distinct indices 0..5');
  });

  it('неизвестные героиня и карта', () => {
    const d = deckA();
    d.heroes[0] = 'ghost' as never;
    d.cards[0] = 'nothing' as never;
    const errors = validateDeck(d);
    expect(errors).toContain('unknown hero: ghost');
    expect(errors).toContain('unknown card: nothing');
  });
});

describe('createMatch', () => {
  it('рука 3, колода 9, luna 0, round 0, moon new', () => {
    const m = makeMatch();
    expect(m.round).toBe(0);
    expect(m.moon).toBe('new');
    expect(m.result).toBeNull();
    expect(m.deaths).toEqual([]);
    expect(m.roundFlags).toEqual({ moonShifted: false, ultLunaDelta: 0 });
    for (const side of ['A', 'B'] as const) {
      const s = m.sides[side];
      expect(s.hand).toHaveLength(3);
      expect(s.deck).toHaveLength(9);
      expect(s.discard).toEqual([]);
      expect(s.luna).toBe(0);
      expect(s.energy).toBe(0);
      expect(s.armedReactions).toEqual([]);
      expect(s.flags).toEqual({ swapBanned: false, energyBonus: 0, cardCostDelta: 0 });
      expect(s.nextCardCostUp).toBeNull();
      expect([...s.hand, ...s.deck].sort()).toEqual(CARD_IDS.slice(0, 12).sort());
      for (const h of [...s.active, ...s.reserve]) {
        expect(h.hp).toBe(h.maxHp);
        expect(h.shield).toBe(0);
        expect(h.statuses).toEqual([]);
        expect(h.ultimateUsed).toBe(false);
      }
    }
  });

  it('active определяется starting, резерв остаётся в порядке heroes', () => {
    const d = deckA();
    d.starting = [4, 0, 2] as unknown as Deck['starting']; // type says Slot, spec says indices 0..5
    const m = createMatch(d, deckA(), 5);
    expect(m.sides.A.active.map((h) => h.id)).toEqual(['zefira', 'aira', 'nerisa']);
    expect(m.sides.A.reserve.map((h) => h.id)).toEqual(['fenna', 'tali', 'liraya']);
    expect(m.sides.A.active[0]!.maxHp).toBeGreaterThan(0);
  });

  it('детерминирован: одинаковый seed → одинаковая рука и состояние', () => {
    const a = makeMatch({ seed: 123 });
    const b = makeMatch({ seed: 123 });
    expect(a.sides.A.hand).toEqual(b.sides.A.hand);
    expect(a.sides.B.hand).toEqual(b.sides.B.hand);
    expect(a).toEqual(b);
    expect(a.seed).toBe(123);
    expect(typeof a.rngState).toBe('number');
  });

  it('разные seed обычно дают разные колоды', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) results.add(makeMatch({ seed }).sides.A.hand.join(','));
    expect(results.size).toBeGreaterThan(1);
  });

  it('не мутирует входные колоды', () => {
    const d = deckA();
    const copy = structuredClone(d);
    createMatch(d, deckA(), 1);
    expect(d).toEqual(copy);
  });
});

describe('getWinner', () => {
  it('матч идёт: null и состояние не меняется', () => {
    const m = makeMatch();
    const before = structuredClone(m);
    expect(getWinner(m)).toBeNull();
    expect(m).toEqual(before);
  });

  it('все 6 у B мертвы → A, reason wipe', () => {
    const m = kill(makeMatch(), 'B');
    expect(getWinner(m)).toEqual({ winner: 'A', reason: 'wipe' });
  });

  it('все 6 у A мертвы → B, reason wipe', () => {
    const m = kill(makeMatch(), 'A');
    expect(getWinner(m)).toEqual({ winner: 'B', reason: 'wipe' });
  });

  it('обе стороны мертвы → draw', () => {
    const m = kill(kill(makeMatch(), 'A'), 'B');
    expect(getWinner(m)).toEqual({ winner: 'draw', reason: 'wipe' });
  });

  it('после 10 раунда: больше живых → heroes', () => {
    let m = makeMatch();
    m.round = 10;
    m = setHp(m, enemy(0), 0);
    expect(getWinner(m)).toEqual({ winner: 'A', reason: 'heroes' });
    m = setHp(m, ally(0), 0);
    m = setHp(m, ally(1), 0);
    expect(getWinner(m)).toEqual({ winner: 'B', reason: 'heroes' });
  });

  it('после 10 раунда: поровну живых, выше hp% → hpPct', () => {
    let m = makeMatch();
    m.round = 10;
    m = setHp(m, enemy(0), 1);
    expect(getWinner(m)).toEqual({ winner: 'A', reason: 'hpPct' });
    m = setHp(m, ally(0), 1);
    m = setHp(m, ally(1), 1);
    expect(getWinner(m)).toEqual({ winner: 'B', reason: 'hpPct' });
  });

  it('после 10 раунда: поровну живых и hp% → больше damageDealt → damage', () => {
    const m = makeMatch();
    m.round = 10;
    m.sides.A.damageDealt = 5;
    m.sides.B.damageDealt = 3;
    expect(getWinner(m)).toEqual({ winner: 'A', reason: 'damage' });
    m.sides.B.damageDealt = 9;
    expect(getWinner(m)).toEqual({ winner: 'B', reason: 'damage' });
  });

  it('после 10 раунда: всё равно → draw', () => {
    const m = makeMatch();
    m.round = 10;
    expect(getWinner(m)).toEqual({ winner: 'draw', reason: 'draw' });
  });

  it('до 10 раунда при живых сторонах результата нет даже при разнице hp', () => {
    let m = makeMatch();
    m.round = 9;
    m = setHp(m, enemy(0), 1);
    expect(getWinner(m)).toBeNull();
  });
});

describe('тестовые хелперы', () => {
  it('setHp/setLuna/setHand возвращают новое состояние и не мутируют исходное', () => {
    const m = makeMatch();
    const before = structuredClone(m);
    const m2 = setHand(setLuna(setHp(m, ally(1), 3), 'A', 4), 'A', ['eclipse', 'cover']);
    expect(m).toEqual(before);
    expect(m2.sides.A.active[1]!.hp).toBe(3);
    expect(m2.sides.A.luna).toBe(4);
    expect(m2.sides.A.hand).toEqual(['eclipse', 'cover']);
  });

  it('enemy/ally и конструкторы команд', () => {
    expect(enemy(2)).toEqual({ side: 'B', slot: 2 });
    expect(ally(1)).toEqual({ side: 'A', slot: 1 });
    expect(cmd(basic(0, enemy(0)), none(), none())).toEqual({
      actions: [{ type: 'basic', target: { side: 'B', slot: 0 } }, { type: 'none' }, { type: 'none' }],
    });
    const withCard = cmd(none(), none(), none(), { handIndex: 0 });
    expect(withCard.card).toEqual({ handIndex: 0 });
  });
});
