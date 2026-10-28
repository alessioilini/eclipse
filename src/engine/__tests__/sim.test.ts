import { describe, expect, it } from 'vitest';
import { createMatch, validateDeck } from '../match';
import { createRng } from '../rng';
import { chooseCommands } from '../bot';
import { resolveRound, startRound } from '../resolve/round';
import { viewFor } from '../view';
import { CARD_IDS } from '../data/cards';
import { HERO_IDS } from '../data/heroes';
import { MAX_LUNA } from '../types';
import type { MatchState, Side, SideCommands } from '../types';
import { playMatch, randomDeck, runSimulation } from '../sim';

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
