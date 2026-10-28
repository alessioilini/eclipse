import type { Side } from '../types';
import type { Ctx } from './context';
import { emit } from './context';

const MAX_HAND = 5;

/**
 * Draws one card for `side` (Round Start and the `draw` primitive). An empty deck is first
 * refilled by shuffling the discard pile; a sixth card in hand discards the oldest one.
 */
export function drawCard(ctx: Ctx, side: Side): void {
  const sd = ctx.s.sides[side];
  if (sd.deck.length === 0 && sd.discard.length > 0) {
    sd.deck = ctx.rng.shuffle(sd.discard);
    sd.discard = [];
    emit(ctx, { type: 'reshuffle', side, count: sd.deck.length });
  }
  const cardId = sd.deck.shift();
  if (cardId === undefined) return;
  sd.hand.push(cardId);
  emit(ctx, { type: 'draw', side, cardId });
  if (sd.hand.length > MAX_HAND) {
    const oldest = sd.hand.shift()!;
    sd.discard.push(oldest);
    emit(ctx, { type: 'discardOverflow', side, cardId: oldest });
  }
}
