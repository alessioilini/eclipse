import type { GameEvent, MatchState, Side, SideCommands } from '../types';
import { createRngFromState } from '../rng';
import { validateCommands } from '../validate';
import type { Ctx } from './context';
import { emit } from './context';
import { roundStart } from './roundStart';
import { actionOrder } from './order';
import { runHeroAction } from './actions';
import { endRound } from './endRound';

/**
 * Resolves one full round (spec §2.5). Pure: the input state is cloned, never mutated.
 * Throws on a finished match or on commands rejected by validateCommands.
 */
export function resolveRound(state: MatchState, cmds: Record<Side, SideCommands>): { state: MatchState; events: GameEvent[] } {
  if (state.result !== null) throw new Error('match finished');
  const errors = [
    ...validateCommands(state, 'A', cmds.A).map(e => `A: ${e}`),
    ...validateCommands(state, 'B', cmds.B).map(e => `B: ${e}`),
  ];
  if (errors.length > 0) throw new Error('invalid commands: ' + errors.join('; '));

  const s = structuredClone(state);
  const ctx: Ctx = { s, events: [], rng: createRngFromState(s.rngState), phase: 'roundStart' };

  roundStart(ctx);

  ctx.phase = 'reveal';
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

  s.rngState = ctx.rng.state();
  return { state: s, events: ctx.events };
}
