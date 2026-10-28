import { describe, expect, it } from 'vitest';
import { createMatch, validateDeck } from '../match';
import { createRng } from '../rng';
import { chooseCommands } from '../bot';
import { resolveRound, startRound } from '../resolve/round';
import { viewFor } from '../view';
import { CARD_IDS } from '../data/cards';
import { HERO_IDS } from '../data/heroes';
import { MAX_LUNA } from '../types';
import type { Deck, GameEvent, MatchState, Side, SideCommands } from '../types';
import { matchStats, playMatch, randomDeck, runSimulation } from '../sim';

const SIDES: Side[] = ['A', 'B'];

function checkInvariants(state: MatchState, where: string): void {
  for (const side of SIDES) {
    const sd = state.sides[side];
    for (const h of [...sd.active, ...sd.reserve]) {
      expect(h.hp, `${where} ${side} ${h.id} hp`).toBeGreaterThanOrEqual(0);
      expect(h.hp, `${where} ${side} ${h.id} hp<=max`).toBeLessThanOrEqual(h.maxHp);
      expect(h.shield, `${where} ${side} ${h.id} shield`).toBeGreaterThanOrEqual(0);
    }
    expect(sd.luna, `${where} ${side} luna`).toBeGreaterThanOrEqual(0);
    expect(sd.luna, `${where} ${side} luna`).toBeLessThanOrEqual(MAX_LUNA);
    expect(sd.hand.length, `${where} ${side} hand`).toBeLessThanOrEqual(5);
    expect(sd.energy, `${where} ${side} energy`).toBeGreaterThanOrEqual(0);
  }
}

describe('симуляция', () => {
  it('randomDeck даёт легальные колоды', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) expect(validateDeck(randomDeck(rng))).toEqual([]);
  });

  it('200 матчей без исключений, все ≤ 10 раундов, result не null', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 200; i++) {
      const seed = rng.int(2 ** 31);
      const { state, rounds } = playMatch(randomDeck(rng), randomDeck(rng), seed);
      expect(state.result, `seed ${seed}`).not.toBeNull();
      expect(rounds, `seed ${seed}`).toBeLessThanOrEqual(10);
    }
  });

  it('инварианты на каждом раунде: hp ∈ [0,maxHp], luna ∈ [0,5], shield ≥ 0, рука ≤ 5, energy ≥ 0', () => {
    const rng = createRng(77);
    for (let i = 0; i < 40; i++) {
      const seed = rng.int(2 ** 31);
      let state = createMatch(randomDeck(rng), randomDeck(rng), seed);
      const botRng = createRng(seed ^ 0x5bd1e995);
      while (state.result === null) {
        const started = startRound(state).state;
        checkInvariants(started, `seed ${seed} start r${started.round}`);
        const cmds = {} as Record<Side, SideCommands>;
        for (const side of SIDES) cmds[side] = chooseCommands(viewFor(started, side), side, botRng);
        state = resolveRound(started, cmds).state;
        checkInvariants(state, `seed ${seed} end r${state.round}`);
        expect(state.round).toBeLessThanOrEqual(10);
      }
    }
  });

  it('детерминизм: runSimulation(50, 7) дважды даёт равные отчёты', () => {
    expect(runSimulation(50, 7)).toEqual(runSimulation(50, 7));
  });

  it('отчёт содержит все 12 героинь и 24 карты', () => {
    const report = runSimulation(30, 5);
    expect(Object.keys(report.heroes).sort()).toEqual([...HERO_IDS].sort());
    expect(Object.keys(report.cards).sort()).toEqual([...CARD_IDS].sort());
    expect(report.matches).toBe(30);
    expect(report.roundHistogram.reduce((a, b) => a + b, 0)).toBe(30);
  });
});

describe('метрики симуляции', () => {
  it('причины исхода суммируются в число матчей; доля на лимите = heroes + hpPct + damage + draw', () => {
    const r = runSimulation(30, 5);
    const sum = Object.values(r.resultReasons).reduce((a, b) => a + b, 0);
    expect(sum).toBe(30);
    const limit = r.resultReasons.heroes + r.resultReasons.hpPct + r.resultReasons.damage + r.resultReasons.draw;
    expect(r.roundLimitRate).toBeCloseTo(limit / 30);
    expect(r.perRound.hpLost).toHaveLength(11);
    expect(r.perRound.hpLost[0]).toBe(0);
    expect(r.perRound.hpLost[1]).toBeGreaterThan(0);
    expect(r.perRound.healed).toHaveLength(11);
    expect(r.perRound.shielded).toHaveLength(11);
    expect(r.totals.burn).toBeGreaterThan(0);
  });

  it('урон героини = удары + прямой + Burn; swaps, fizzles, ults, deaths присутствуют', () => {
    const r = runSimulation(30, 5);
    for (const id of HERO_IDS) {
      const h = r.heroes[id];
      expect(h.avgDamage).toBeCloseTo(h.damageBy.hits + h.damageBy.direct + h.damageBy.burn);
      expect(h.swaps).toBeGreaterThanOrEqual(0);
      expect(h.fizzles).toBeGreaterThanOrEqual(0);
      expect(h.ults).toBeGreaterThanOrEqual(0);
      expect(h.deaths).toBeGreaterThanOrEqual(0);
    }
    expect(r.heroes.aira.damageBy.burn).toBeGreaterThan(0);
  });

  it('matchStats: Burn засчитывается той, кто его наложила, даже после её ухода в резерв', () => {
    const decks: Record<Side, Deck> = {
      A: { heroes: ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], starting: [0, 1, 2], cards: CARD_IDS.slice(0, 12) },
      B: { heroes: ['aurora', 'justina', 'nokta', 'kira', 'mira', 'selena'], starting: [0, 1, 2], cards: CARD_IDS.slice(0, 12) },
    };
    const events: GameEvent[] = [
      { type: 'statusApplied', round: 1, phase: 'heroes', source: { side: 'A', slot: 0 }, target: { side: 'B', slot: 1 }, status: 'burn', value: 0 },
      { type: 'burn', round: 1, phase: 'endRound', target: { side: 'B', slot: 1 }, stacks: 1, dmg: 3, hp: 20 },
      { type: 'heroAction', round: 2, phase: 'heroes', side: 'A', slot: 0, heroId: 'aira', action: 'swap' },
      { type: 'swap', round: 2, phase: 'heroes', side: 'A', slot: 0, reserveIndex: 0, out: 'aira', in: 'tali' },
      { type: 'burn', round: 2, phase: 'endRound', target: { side: 'B', slot: 1 }, stacks: 1, dmg: 3, hp: 17 },
      // Burn from a card is nobody's damage.
      { type: 'statusApplied', round: 3, phase: 'standard', source: { side: 'A', cardId: 'ashTrail' }, target: { side: 'B', slot: 0 }, status: 'burn', value: 0 },
      { type: 'burn', round: 3, phase: 'endRound', target: { side: 'B', slot: 0 }, stacks: 1, dmg: 3, hp: 29 },
      { type: 'fizzle', round: 3, phase: 'heroes', side: 'A', slot: 0, heroId: 'tali', action: 'skill', reason: 'energy' },
      { type: 'death', round: 3, phase: 'endRound', side: 'B', slot: 1, heroId: 'justina' },
    ];
    const m = matchStats(decks, events);
    expect(m.heroes.aira).toMatchObject({ hits: 0, direct: 0, burn: 6, swaps: 1 });
    expect(m.heroes.tali.fizzles).toBe(1);
    expect(m.heroes.justina.deaths).toBe(1);
    expect(m.burn).toBe(9);
    expect(m.hpLost).toEqual([0, 3, 3, 3]);
  });
});
