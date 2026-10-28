import { describe, expect, it } from 'vitest';
import { CARD_IDS, HEROES, chooseCommands, createRng, validateDeck } from '../engine';
import type { Deck, HeroAction, PublicState, SideCommands, Slot } from '../engine';
import { randomDeck } from '../engine/sim';
import {
  botRngSeed, confirmRound, draftEnergy, draftToCommands, secondaryCandidates, draftIssues, emptyDraft, isFinished, newMatch, opponentDeckFor, playerView, surrender,
} from './session';
import type { Draft, MatchSession } from './session';

const basicOn = (slot: Slot): HeroAction => ({ type: 'basic', target: { side: 'B', slot } });

function fullDraft(): Draft {
  return { actions: [basicOn(0), basicOn(1), basicOn(2)], card: null };
}

function start(seed = 5): MatchSession {
  return newMatch(randomDeck(createRng(seed)), { opponentDeck: randomDeck(createRng(seed + 100)), seed, mode: 'free' });
}

describe('игровая сессия', () => {
  it('newMatch даёт раунд 1 и ожидание команд', () => {
    const s = start();
    expect(s.state.round).toBe(1);
    expect(s.state.awaitingCommands).toBe(true);
    expect(s.botSeed).toBe(5);
    expect(s.mode).toBe('free');
    expect(isFinished(s)).toBe(false);
    expect(playerView(s).sides.A).not.toHaveProperty('deck');
  });

  it('draftToCommands возвращает null при пустом слоте', () => {
    const s = start();
    const d = emptyDraft(s.state);
    expect(d.actions).toEqual([null, null, null]);
    expect(draftToCommands(d)).toBeNull();
    expect(draftToCommands({ ...fullDraft(), actions: [basicOn(0), null, basicOn(2)] })).toBeNull();
    expect(draftIssues(s.state, d)).toEqual([]);
  });

  it('draftToCommands копирует карту как есть', () => {
    const d: Draft = { ...fullDraft(), card: { handIndex: 0 } };
    expect(draftToCommands(d)).toEqual({ actions: d.actions, card: { handIndex: 0 } });
    expect(draftToCommands(fullDraft())).not.toHaveProperty('card');
  });

  it('draftIssues отдаёт ошибки движка для полного черновика', () => {
    const s = start();
    const bad: Draft = { actions: [{ type: 'none' }, basicOn(1), basicOn(2)], card: null };
    expect(draftIssues(s.state, bad).map(i => i.code)).toContain('NONE_ONLY_DEAD');
    expect(draftIssues(s.state, fullDraft())).toEqual([]);
  });

  it('confirmRound с неполным черновиком бросает', () => {
    const s = start();
    expect(() => confirmRound(s, emptyDraft(s.state))).toThrow('draft incomplete');
  });

  it('confirmRound с невалидным черновиком бросает с кодами', () => {
    const s = start();
    const bad: Draft = { actions: [{ type: 'none' }, basicOn(1), basicOn(2)], card: null };
    expect(() => confirmRound(s, bad)).toThrow(/^invalid draft: .*NONE_ONLY_DEAD/);
  });

  it('полный раунд даёт раунд 2, не мутирует сессию и не раскрывает чужие cardId в draw', () => {
    const s = start();
    const before = structuredClone(s);
    const { session, events } = confirmRound(s, fullDraft());
    expect(s).toEqual(before);
    expect(session.state.round).toBe(2);
    expect(session.state.awaitingCommands).toBe(true);
    const draws = events.filter(e => e.type === 'draw');
    expect(draws.length).toBeGreaterThan(0);
    for (const e of draws) {
      if (e.type === 'draw' && e.side === 'B') expect(e.cardId).toBeUndefined();
    }
    // события нового раунда идут после событий разрешённого
    const types = events.map(e => e.type);
    expect(types.indexOf('reveal')).toBeLessThan(types.lastIndexOf('roundStart'));
    expect(events.filter(e => e.type === 'roundStart')).toHaveLength(1);
  });

  it('детерминизм: два одинаковых сеанса дают равные состояния', () => {
    const a = confirmRound(start(9), fullDraft());
    const b = confirmRound(start(9), fullDraft());
    expect(a.session.state).toEqual(b.session.state);
    expect(a.events).toEqual(b.events);
  });

  it('enemy подменяет бота', () => {
    const s0 = start();
    const enemyCmds: SideCommands = { actions: [{ type: 'basic', target: { side: 'A', slot: 0 } }, { type: 'basic', target: { side: 'A', slot: 0 } }, { type: 'basic', target: { side: 'A', slot: 0 } }] };
    const calls: number[] = [];
    const s: MatchSession = { ...s0, enemy: (round) => { calls.push(round); return enemyCmds; } };
    const { events } = confirmRound(s, fullDraft());
    expect(calls).toEqual([1]);
    const reveal = events.find(e => e.type === 'reveal');
    expect(reveal && reveal.type === 'reveal' ? reveal.commands.B : null).toEqual(enemyCmds);
  });

  it('emptyDraft ставит none погибшей героине слота 1 и черновик остаётся собираемым (Review Focus 2)', () => {
    const s0 = start();
    const state = structuredClone(s0.state);
    state.sides.A.active[1].hp = 1;
    state.sides.A.active[1].shield = 0;
    for (const h of state.sides.A.reserve) h.hp = 0; // некому заменить погибшую
    const target = { side: 'A' as const, slot: 1 as Slot };
    const hit: HeroAction = { type: 'basic', target };
    const s: MatchSession = { ...s0, state, enemy: () => ({ actions: [hit, hit, hit] }) };
    const { session } = confirmRound(s, fullDraft());
    expect(session.state.result).toBeNull();
    expect(session.state.sides.A.active[1].hp).toBe(0);

    const d = emptyDraft(session.state);
    expect(d.actions[1]).toEqual({ type: 'none' });
    expect(d.actions[0]).toBeNull();
    expect(d.actions[2]).toBeNull();
    const filled: Draft = { ...d, actions: [basicOn(0), d.actions[1], basicOn(2)] };
    expect(draftToCommands(filled)).not.toBeNull();
    expect(draftIssues(session.state, filled)).toEqual([]);
  });

  it('surrender завершает матч поражением и не меняет исходную сессию', () => {
    const s = start();
    const before = structuredClone(s);
    const r = surrender(s);
    expect(s).toEqual(before);
    expect(isFinished(r)).toBe(true);
    expect(r.surrendered).toBe(true);
    expect(r.state.result).toEqual({ winner: 'B', reason: 'wipe' });
    expect(r.state.awaitingCommands).toBe(false);
    expect(isFinished(s)).toBe(false);
  });

  it('opponentDeckFor возвращает легальную детерминированную колоду', () => {
    for (const seed of [0, 1, 2, 3, 42, 1234]) {
      const d = opponentDeckFor(seed);
      expect(validateDeck(d)).toEqual([]);
      expect(opponentDeckFor(seed)).toEqual(d);
    }
  });
});

describe('случайность бота', () => {
  it('seed раунда: (botSeed >>> 0) * 7919 + round, приведённое к uint32', () => {
    expect(botRngSeed(5, 1)).toBe(5 * 7919 + 1);
    expect(botRngSeed(5, 2)).toBe(5 * 7919 + 2);
    expect(botRngSeed(2 ** 32 - 1, 3)).toBe(((2 ** 32 - 1) * 7919 + 3) % 2 ** 32);
    expect(botRngSeed(-1, 1)).toBe(botRngSeed(2 ** 32 - 1, 1));
    for (let r = 1; r <= 10; r++) expect(Number.isInteger(botRngSeed(1_761_000_000_000, r))).toBe(true);
  });

  it('botSeed размера Date.now() даёт раундам 1..6 шесть разных seed (I5)', () => {
    const big = 1_761_652_800_123;
    // Старая формула теряла раунд в младших битах: botSeed * 7919 > 2^53, и раунды совпадали.
    expect(new Set([1, 2, 3, 4, 5, 6].map((r) => big * 7919 + r)).size).toBeLessThan(6);
    const seeds = [1, 2, 3, 4, 5, 6].map((r) => botRngSeed(big, r));
    expect(new Set(seeds).size).toBe(6);
    seeds.forEach((x) => expect(x).toBeGreaterThanOrEqual(0));
    seeds.forEach((x) => expect(x).toBeLessThan(2 ** 32));
  });

  it('противник не видит seed и rngState матча', () => {
    const views: PublicState[] = [];
    let s = newMatch(randomDeck(createRng(5)), {
      opponentDeck: randomDeck(createRng(105)), seed: 1_761_652_800_123, mode: 'free',
      enemy: (_round, view) => {
        views.push(view);
        return chooseCommands(view, 'B', createRng(1));
      },
    });
    for (let i = 0; i < 3 && !isFinished(s); i++) s = confirmRound(s, emptyDraftAllBasic(s)).session;
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      expect(view).not.toHaveProperty('seed');
      expect(view).not.toHaveProperty('rngState');
      expect(JSON.stringify(view)).not.toMatch(/"(seed|rngState)"/);
    }
  });
});

/** Черновик: базовая атака живыми героинями по противнице того же слота, погибшие — `none`. */
function emptyDraftAllBasic(s: MatchSession): Draft {
  const draft = emptyDraft(s.state);
  return { ...draft, actions: draft.actions.map((a, i) => a ?? basicOn(i as Slot)) as Draft['actions'] };
}

describe('энергия черновика', () => {
  // Активные A: tali (скилл 1), fenna (скилл 1), nerisa; в руке будет bloodPact (0, бюджет +2).
  const deckA: Deck = { heroes: ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], starting: [3, 1, 2], cards: CARD_IDS.slice(0, 12) };
  const deckB: Deck = { heroes: ['aurora', 'justina', 'nokta', 'kira', 'mira', 'selena'], starting: [0, 1, 2], cards: CARD_IDS.slice(0, 12) };
  const session = () => newMatch(deckA, { opponentDeck: deckB, seed: 3, mode: 'free' });

  it('считает цену скилла и ульты против бюджета раунда', () => {
    const { state } = session();
    const draft: Draft = {
      actions: [{ type: 'skill', target: { side: 'B', slot: 0 } }, { type: 'ultimate' }, basicOn(1)],
      card: null,
    };
    expect(draftEnergy(state, emptyDraft(state))).toEqual({ budget: 4, spent: 0 });
    expect(draftEnergy(state, draft)).toEqual({ budget: 4, spent: HEROES.tali.skill.cost + 2 });
  });

  it('добавляет цену карты и +2 к бюджету от Кровавой сделки', () => {
    const state = structuredClone(session().state);
    state.sides.A.hand = ['bloodPact', 'cover'];
    const pact: Draft = { actions: [null, null, null], card: { handIndex: 0, target: { side: 'A', slot: 0 } } };
    expect(draftEnergy(state, pact)).toEqual({ budget: 6, spent: 0 });
    const cover: Draft = { actions: [{ type: 'skill', target: { side: 'B', slot: 0 } }, null, null], card: { handIndex: 1 } };
    expect(draftEnergy(state, cover)).toEqual({ budget: 4, spent: HEROES.tali.skill.cost + 1 });
  });
});

describe('вторые цели карт', () => {
  const deckA: Deck = { heroes: ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], starting: [3, 2, 4], cards: CARD_IDS.slice(0, 12) };
  const deckB: Deck = { heroes: ['aurora', 'justina', 'nokta', 'kira', 'mira', 'selena'], starting: [0, 1, 2], cards: CARD_IDS.slice(0, 12) };

  it('стражи — только живые guardian среди активных', () => {
    // Активные A: tali (маг), nerisa (страж), zefira (страж).
    const state = structuredClone(newMatch(deckA, { opponentDeck: deckB, seed: 3, mode: 'free' }).state);
    expect(secondaryCandidates(state, 'guardian')).toEqual({ heroes: [{ side: 'A', slot: 1 }, { side: 'A', slot: 2 }] });
    state.sides.A.active[2].hp = 0;
    expect(secondaryCandidates(state, 'guardian', { side: 'A', slot: 0 })).toEqual({ heroes: [{ side: 'A', slot: 1 }] });
  });

  it('резерв — только живые героини резерва', () => {
    const state = structuredClone(newMatch(deckA, { opponentDeck: deckB, seed: 3, mode: 'free' }).state);
    state.sides.A.reserve[1].hp = 0;
    expect(secondaryCandidates(state, 'reserve')).toEqual({ reserve: [0, 2] });
  });

  it('opponentHp ставит стартовое HP героинь противника по порядку колоды', () => {
    const deckB = randomDeck(createRng(105));
    const hp = [5, 6, 7, 8, 9, 999];
    const s = newMatch(randomDeck(createRng(5)), { opponentDeck: deckB, seed: 5, mode: 'tutorial', opponentHp: hp });
    for (const h of [...s.state.sides.B.active, ...s.state.sides.B.reserve]) {
      const want = hp[deckB.heroes.indexOf(h.id)]!;
      expect(h.hp).toBe(Math.min(want, h.maxHp));
    }
    expect(s.state.sides.A.active.every(h => h.hp === h.maxHp)).toBe(true);
  });
});
