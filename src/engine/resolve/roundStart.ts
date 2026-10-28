import { MOON_ORDER } from '../types';
import type { Side } from '../types';
import { energyBudget } from '../validate';
import type { Ctx } from './context';
import { emit } from './context';
import { fire } from './triggers';

const SIDES: Side[] = ['A', 'B'];
const MAX_LUNA = 5;
const MAX_HAND = 5;

/** Draws one card for `side`; an empty deck is first refilled by shuffling the discard pile. */
function drawOne(ctx: Ctx, side: Side): void {
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

/** Spec §2.5 step 1. `nextCardCostUp` survives: it is cleared by a card play or in End Round. */
export function roundStart(ctx: Ctx): void {
  const s = ctx.s;
  ctx.phase = 'roundStart';
  s.round += 1;
  if (s.round > 1) s.moon = MOON_ORDER[(MOON_ORDER.indexOf(s.moon) + 1) % MOON_ORDER.length]!;
  s.roundFlags = { moonShifted: false, ultLunaDelta: 0 };

  for (const side of SIDES) {
    const sd = s.sides[side];
    sd.flags = { swapBanned: false, energyBonus: 0, cardCostDelta: 0 };
    sd.cardsPlayedThisRound = 0;
    sd.armedReactions = [];
    sd.energy = energyBudget(s, side);
    const before = sd.luna;
    sd.luna = Math.min(MAX_LUNA, sd.luna + (s.moon === 'new' ? 2 : 1));
    if (sd.luna !== before) {
      emit(ctx, { type: 'lunaChanged', side, luna: sd.luna, delta: sd.luna - before, reason: 'roundStart' });
    }
  }
  for (const side of SIDES) drawOne(ctx, side);

  emit(ctx, {
    type: 'roundStart', moon: s.moon,
    energy: { A: s.sides.A.energy, B: s.sides.B.energy },
    luna: { A: s.sides.A.luna, B: s.sides.B.luna },
  });
  fire(ctx, 'roundStart');
}
