import type { GameEvent, MatchState } from '../types';
import type { Rng } from '../rng';
import { createRngFromState } from '../rng';

export type Phase = 'roundStart' | 'reveal' | 'swift' | 'reactions' | 'heroes' | 'standard' | 'endRound';

/**
 * Resolution context: `s` is the draft (a clone owned by startRound / resolveRound), mutated in place.
 * `actionSeq` numbers the actions of this resolution (0 before the first one); every hit carries the
 * number of the action it belongs to (Zefira's Reflect: one charge per enemy action).
 */
export type Ctx = { s: MatchState; events: GameEvent[]; rng: Rng; phase: Phase; actionSeq: number };

/** An event before `round` and `phase` are stamped on it. */
export type EventInput = { type: string; [k: string]: unknown };

/** A fresh context on a clone of `state` (the input is never mutated); the Rng resumes from `state.rngState`. */
export function makeCtx(state: MatchState, phase: Phase = 'heroes'): Ctx {
  const s = structuredClone(state);
  return { s, events: [], rng: createRngFromState(s.rngState), phase, actionSeq: 0 };
}

/** Starts a new action (a hero action; Task 11: each card play too). */
export function nextAction(ctx: Ctx): void {
  ctx.actionSeq += 1;
}

export function emit(ctx: Ctx, ev: EventInput): void {
  ctx.events.push({ ...ev, round: ctx.s.round, phase: ctx.phase });
}
