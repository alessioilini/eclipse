import type { CardId, CardPlay, GameEvent, MatchState, Side, SideCommands } from '../types';
import type { Rng } from '../rng';
import { createRngFromState } from '../rng';

export type Phase = 'roundStart' | 'reveal' | 'swift' | 'reactions' | 'heroes' | 'standard' | 'endRound';

/** `hero.once` key: the round in which the heroine entered an active slot (swap, cards); she does not act in it. */
export const ENTERED_KEY = 'enteredRound';

/** A card revealed by a side: it left the hand at Reveal and waits on the table for its phase. */
export type PlannedCard = { cardId: CardId; play: CardPlay };

/**
 * Resolution context: `s` is the draft (a clone owned by startRound / resolveRound), mutated in place.
 * `actionSeq` numbers the actions of this resolution (0 before the first one); every hit carries the
 * number of the action it belongs to (Zefira's Reflect: one charge per enemy action).
 * `cmds` (the revealed commands) and `table` (the revealed cards not resolved yet) are set by
 * revealCards (resolve/cards.ts).
 */
export type Ctx = {
  s: MatchState; events: GameEvent[]; rng: Rng; phase: Phase; actionSeq: number;
  cmds?: Record<Side, SideCommands>; table?: Partial<Record<Side, PlannedCard>>;
};

/** An event before `round` and `phase` are stamped on it. */
export type EventInput = { type: string; [k: string]: unknown };

/** A fresh context on a clone of `state` (the input is never mutated); the Rng resumes from `state.rngState`. */
export function makeCtx(state: MatchState, phase: Phase = 'heroes'): Ctx {
  const s = structuredClone(state);
  return { s, events: [], rng: createRngFromState(s.rngState), phase, actionSeq: 0 };
}

/** Starts a new action (a hero action or a card play). */
export function nextAction(ctx: Ctx): void {
  ctx.actionSeq += 1;
}

export function emit(ctx: Ctx, ev: EventInput): void {
  ctx.events.push({ ...ev, round: ctx.s.round, phase: ctx.phase });
}
