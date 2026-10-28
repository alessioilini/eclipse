import { describe, expect, it } from 'vitest';
import { chooseCommands } from '../bot';
import { createMatch } from '../match';
import { createRng } from '../rng';
import type { Rng } from '../rng';
import { resolveRound, startRound } from '../resolve/round';
import { validateCommands } from '../validate';
import { viewFor } from '../view';
import { randomDeck } from '../sim';
import type { HeroAction, MatchState, Side, SideCommands, SlotRef } from '../types';
import { makeMatch, setHp, setLuna } from './helpers';

const SIDES: Side[] = ['A', 'B'];

/** An Rng whose `next()` never triggers the 10% noise. */
function quietRng(): Rng {
  return { ...createRng(1), next: () => 0.5 };
}

const started = (s: MatchState): MatchState => startRound(s).state;
const targetOf = (a: HeroAction): SlotRef | undefined =>
  a.type === 'basic' || a.type === 'skill' || a.type === 'ultimate' ? a.target : undefined;
const sameSlot = (a: SlotRef | undefined, b: SlotRef): boolean => !!a && a.side === b.side && a.slot === b.slot;

describe('бот', () => {
  it('всегда возвращает валидные команды на 200 случайных состояниях (seed 1..200)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      let state = createMatch(randomDeck(rng), randomDeck(rng), seed);
      const rounds = 1 + rng.int(10);
      for (let r = 0; r < rounds && state.result === null; r++) {
        const s = started(state);
        const cmds = {} as Record<Side, SideCommands>;
        for (const side of SIDES) {
          const view = viewFor(s, side);
          const before = structuredClone(view);
          cmds[side] = chooseCommands(view, side, rng);
          expect(view).toEqual(before); // the bot does not mutate its view
          expect(validateCommands(s, side, cmds[side]), `seed ${seed}, round ${s.round}, side ${side}`).toEqual([]);
          checked += 1;
        }
        state = resolveRound(s, cmds).state;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(400);
  });

  it('выбирает летал: враг с 5 HP → по нему идёт удар, который убивает', () => {
    // A: kira, selena, justina — only single-target damage. B slot 2 (nokta) at 5 HP.
    const target: SlotRef = { side: 'B', slot: 2 };
    const s = setHp(started(makeMatch({ a: ['kira', 'selena', 'justina', 'mira', 'nokta', 'aurora'] })), target, 5);
    const cmds = chooseCommands(viewFor(s, 'A'), 'A', quietRng());
    expect(validateCommands(s, 'A', cmds)).toEqual([]);
    expect(cmds.actions.some(a => sameSlot(targetOf(a), target))).toBe(true);

    const passive: SideCommands = { actions: [0, 1, 2].map(() => ({ type: 'basic', target: { side: 'A', slot: 0 } })) as SideCommands['actions'] };
    const after = resolveRound(s, { A: cmds, B: passive }).state;
    expect(after.deaths.some(d => d.side === 'B' && d.heroId === 'nokta')).toBe(true);
  });

  it('спасает: своя героиня умрёт от суммы basic → swap или щит', () => {
    // A: aira (6 HP), fenna, nerisa. Basic of B (aurora 4 + justina 7 + nokta 7) = 18 ≥ 6.
    const threatened: SlotRef = { side: 'A', slot: 0 };
    const s = setHp(started(makeMatch()), threatened, 6);
    const cmds = chooseCommands(viewFor(s, 'A'), 'A', quietRng());
    expect(validateCommands(s, 'A', cmds)).toEqual([]);
    const swapped = cmds.actions[0].type === 'swap';
    const shielded = cmds.actions.some((a, i) => a.type === 'skill' && i === 2 && sameSlot(a.target, threatened));
    expect(swapped || shielded).toBe(true);
  });

  it('не целится в мёртвый слот при мёртвом резерве', () => {
    const s = started(makeMatch());
    s.sides.B.active[1].hp = 0;
    for (const h of s.sides.B.reserve) h.hp = 0;
    const dead: SlotRef = { side: 'B', slot: 1 };
    for (let seed = 1; seed <= 30; seed++) {
      const cmds = chooseCommands(viewFor(s, 'A'), 'A', createRng(seed));
      expect(validateCommands(s, 'A', cmds)).toEqual([]);
      expect(cmds.actions.some(a => sameSlot(targetOf(a), dead))).toBe(false);
      expect(sameSlot(cmds.card?.target, dead)).toBe(false);
    }
  });

  it('не играет вторую ульту одной героиней', () => {
    // Plenty of Luna and Energy: only `ultimateUsed` stops the ultimates.
    const s = setLuna(started(makeMatch()), 'A', 5);
    s.round = 6;
    s.sides.A.flags.energyBonus = 2;
    for (const h of s.sides.A.active) h.ultimateUsed = true;
    for (let seed = 1; seed <= 30; seed++) {
      const cmds = chooseCommands(viewFor(s, 'A'), 'A', createRng(seed));
      expect(validateCommands(s, 'A', cmds)).toEqual([]);
      expect(cmds.actions.some(a => a.type === 'ultimate')).toBe(false);
    }
    // control: with the ultimates available, the same position does use one
    const fresh = structuredClone(s);
    for (const h of fresh.sides.A.active) h.ultimateUsed = false;
    const cmds = chooseCommands(viewFor(fresh, 'A'), 'A', quietRng());
    expect(cmds.actions.some(a => a.type === 'ultimate')).toBe(true);
  });
});
