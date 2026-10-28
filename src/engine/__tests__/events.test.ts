import { describe, expect, it } from 'vitest';
import { chooseCommands } from '../bot';
import { createMatch } from '../match';
import { createRng } from '../rng';
import { resolveRound, startRound } from '../resolve/round';
import { randomDeck } from '../sim';
import { viewFor } from '../view';
import type { EngineEvent, Phase } from '../events';
import type { Side, SideCommands } from '../types';

/** The 36 event types of the engine spec §6.3, in the order of the spec. */
const EVENT_TYPES = [
  'roundStart', 'draw', 'discardOverflow', 'reshuffle', 'reveal', 'matchEnd',
  'cardPlayed', 'reactionArmed', 'reactionTriggered', 'fizzle', 'swapBanned', 'ultCostUp', 'cardCostUp',
  'heroAction', 'retarget', 'redirect', 'swap', 'autoFill',
  'damage', 'directDamage', 'selfHp', 'burn', 'detonate', 'reflect', 'heal', 'shield', 'shieldRemoved', 'shieldExpired',
  'statusApplied', 'statusRemoved',
  'energyChanged', 'lunaChanged', 'moonChanged',
  'death', 'revive', 'bloodMoon',
] as const satisfies readonly EngineEvent['type'][];

// Every member of the union is in the list (the `satisfies` above checks the other direction).
type Missing = Exclude<EngineEvent['type'], (typeof EVENT_TYPES)[number]>;
const noneMissing: [Missing] extends [never] ? true : false = true;

const PHASES: Phase[] = ['roundStart', 'reveal', 'swift', 'reactions', 'heroes', 'standard', 'endRound'];
const SIDES: Side[] = ['A', 'B'];

describe('события движка (EngineEvent)', () => {
  it('каждый тип события из §6.3 присутствует в EngineEvent (проверка по списку из 36 строк)', () => {
    expect(noneMissing).toBe(true);
    expect(EVENT_TYPES).toHaveLength(36);
    expect(new Set(EVENT_TYPES).size).toBe(36);
  });

  it('30 случайных раундов бот против бота: каждый тип события из списка, у каждого есть round и phase', () => {
    const known = new Set<string>(EVENT_TYPES);
    let rounds = 0;
    let checked = 0;
    for (let seed = 1; rounds < 30; seed++) {
      const rng = createRng(seed);
      let state = createMatch(randomDeck(rng), randomDeck(rng), seed);
      while (state.result === null && rounds < 30) {
        const started = startRound(state);
        const cmds = {} as Record<Side, SideCommands>;
        for (const side of SIDES) cmds[side] = chooseCommands(viewFor(started.state, side), side, rng);
        const resolved = resolveRound(started.state, cmds);
        for (const ev of [...started.events, ...resolved.events]) {
          expect(known.has(ev.type), ev.type).toBe(true);
          expect(ev.round).toBe(started.state.round);
          expect(PHASES).toContain(ev.phase);
          checked += 1;
        }
        state = resolved.state;
        rounds += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
