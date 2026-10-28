import type { CardId, Side, Slot, SlotRef } from '../types';
import type { Ctx } from './context';

/**
 * Re-runs the effects of a card already played by `side`, for free, with the same target
 * (Mira's ultimate «Повторение»). Card effects arrive in Task 11.
 */
export function replayCard(
  ctx: Ctx, side: Side, cardId: CardId, target?: SlotRef, secondary?: SlotRef | { reserveIndex: Slot },
): void {
  void ctx; void side; void cardId; void target; void secondary;
  throw new Error('replayCard: implemented in Task 11');
}
