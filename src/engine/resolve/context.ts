import type { GameEvent, MatchState } from '../types';
import type { Rng } from '../rng';

export type Phase = 'roundStart' | 'reveal' | 'swift' | 'reactions' | 'heroes' | 'standard' | 'endRound';

/** Resolution context: `s` is the draft (a clone owned by startRound / resolveRound), mutated in place. */
export type Ctx = { s: MatchState; events: GameEvent[]; rng: Rng; phase: Phase };

/** An event before `round` and `phase` are stamped on it. */
export type EventInput = { type: string; [k: string]: unknown };

export function emit(ctx: Ctx, ev: EventInput): void {
  ctx.events.push({ ...ev, round: ctx.s.round, phase: ctx.phase });
}
