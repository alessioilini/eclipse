import type { GameEvent, MatchState, Side, SideCommands } from '../types';
import { validateCommands } from '../validate';
import type { Ctx } from './context';
import { emit, makeCtx } from './context';
import { roundStart } from './roundStart';
import { actionOrder } from './order';
import { runHeroAction } from './actions';
import { endRound } from './endRound';

type Result = { state: MatchState; events: GameEvent[] };

function closeCtx(ctx: Ctx): Result {
  ctx.s.rngState = ctx.rng.state();
  return { state: ctx.s, events: ctx.events };
}

/**
 * Spec §2.5 step 1 (Round Start). Pure. The returned state is what both sides plan on:
 * this round's energy, moon, Luna and hand (with the drawn card). Then call resolveRound.
 */
export function startRound(state: MatchState): Result {
  if (state.result !== null) throw new Error('match finished');
  if (state.awaitingCommands) throw new Error('round already started');
  const ctx = makeCtx(state, 'roundStart');
  roundStart(ctx);
  ctx.s.awaitingCommands = true;
  return closeCtx(ctx);
}

/**
 * Spec §2.5 steps 3–8 on a state returned by startRound. Pure: the input is cloned, never mutated.
 * Throws on a finished match, on a round that was not started, or on commands rejected by
 * validateCommands (checked against the started round).
 */
export function resolveRound(state: MatchState, cmds: Record<Side, SideCommands>): Result {
  if (state.result !== null) throw new Error('match finished');
  if (!state.awaitingCommands) throw new Error('round not started');
  const errors = [
    ...validateCommands(state, 'A', cmds.A).map(e => `A: ${e}`),
    ...validateCommands(state, 'B', cmds.B).map(e => `B: ${e}`),
  ];
  if (errors.length > 0) throw new Error('invalid commands: ' + errors.join('; '));

  const ctx = makeCtx(state, 'reveal');
  ctx.s.awaitingCommands = false;
  emit(ctx, { type: 'reveal', commands: structuredClone(cmds) });

  ctx.phase = 'swift';
  // TODO(Task 11): playSwift(ctx, cmds)

  ctx.phase = 'reactions';
  // TODO(Task 11): armReactions(ctx, cmds)

  ctx.phase = 'heroes';
  for (const { ref, action } of actionOrder(ctx, cmds)) runHeroAction(ctx, ref, action);

  ctx.phase = 'standard';
  // TODO(Task 11): playStandard(ctx, cmds)

  endRound(ctx);
  return closeCtx(ctx);
}
