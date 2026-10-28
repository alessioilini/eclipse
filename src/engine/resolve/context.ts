import type { GameEvent, MatchState } from '../types';
import type { Rng } from '../rng';
import { createRngFromState } from '../rng';

export type Phase = 'roundStart' | 'reveal' | 'swift' | 'reactions' | 'heroes' | 'standard' | 'endRound';

/** Resolution context: `s` is the draft (a clone owned by startRound / resolveRound), mutated in place. */
export type Ctx = { s: MatchState; events: GameEvent[]; rng: Rng; phase: Phase };

/** An event before `round` and `phase` are stamped on it. */
export type EventInput = { type: string; [k: string]: unknown };

/** A fresh context on a clone of `state` (the input is never mutated); the Rng resumes from `state.rngState`. */
export function makeCtx(state: MatchState, phase: Phase = 'heroes'): Ctx {
  const s = structuredClone(state);
  return { s, events: [], rng: createRngFromState(s.rngState), phase };
}

export function emit(ctx: Ctx, ev: EventInput): void {
  ctx.events.push({ ...ev, round: ctx.s.round, phase: ctx.phase });
}
