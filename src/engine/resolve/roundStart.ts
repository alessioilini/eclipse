import { MAX_LUNA, MOON_ORDER } from '../types';
import type { Side } from '../types';
import { energyBudget } from '../validate';
import type { Ctx } from './context';
import { emit } from './context';
import { fire } from './triggers';
import { drawCard } from './deck';

const SIDES: Side[] = ['A', 'B'];

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
  for (const side of SIDES) drawCard(ctx, side);

  emit(ctx, {
    type: 'roundStart', moon: s.moon,
    energy: { A: s.sides.A.energy, B: s.sides.B.energy },
    luna: { A: s.sides.A.luna, B: s.sides.B.luna },
  });
  fire(ctx, 'roundStart');
}
