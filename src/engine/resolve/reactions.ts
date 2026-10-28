import type { Slot, SlotRef } from '../types';
import { isAlive } from '../status';
import { heroAt, setHeroAt } from '../targeting';
import type { Ctx } from './context';
import { emit } from './context';
import { directHit, gainLuna, swapIn } from './effects';
import { checkDeath } from './endRound';

// Armed reactions (spec §2.5 step 5). «Защитный круг», «Отложенная смерть» and «Прикрытие» put
// their statuses on the target when armed (cards.ts), so only the `onDeath` reactions stay in
// `armedReactions`: «Переписать судьбу» (rewriteFate) and «Последнее слово» (lastWord).

const LAST_WORD_DAMAGE = 4;
const LAST_WORD_LUNA = 1;
const REWRITE_FATE_HP = 1;

export type ReactionEvent = 'onDeath';
export type ReactionPayload = { target: SlotRef; attacker?: SlotRef };
/**
 * `survived`: a reaction cancelled the death (checkDeath records nothing). `after`: follow-ups to
 * run once the death is recorded (lastWord's retaliation, so that a second death is not nested
 * inside the first one).
 */
export type ReactionOutcome = { survived: boolean; after: () => void };

const NOTHING: ReactionOutcome = { survived: false, after: () => {} };

/**
 * Runs the armed reactions of the dying heroine's side (called by checkDeath before the death is
 * recorded, ruling R16). rewriteFate (any ally, first death of the round) wins and cancels the
 * death; otherwise every lastWord armed on this heroine fires: Luna +1 now, 4 direct damage to the
 * killer after the death is recorded. Each fired reaction is removed and emits `reactionTriggered`.
 */
export function triggerReactions(ctx: Ctx, event: ReactionEvent, payload: ReactionPayload): ReactionOutcome {
  void event;
  const { target, attacker } = payload;
  const sd = ctx.s.sides[target.side];
  if (sd.armedReactions.length === 0) return NOTHING;
  const dying = heroAt(ctx.s, target);

  const fate = sd.armedReactions.findIndex(r => r.cardId === 'rewriteFate');
  if (fate >= 0) {
    sd.armedReactions.splice(fate, 1);
    emit(ctx, { type: 'reactionTriggered', side: target.side, cardId: 'rewriteFate', target, heroId: dying.id });
    rewriteFate(ctx, target);
    return { survived: true, after: () => {} };
  }

  const followUps: (() => void)[] = [];
  sd.armedReactions = sd.armedReactions.filter(r => {
    if (r.cardId !== 'lastWord' || r.heroId !== dying.id) return true;
    emit(ctx, { type: 'reactionTriggered', side: target.side, cardId: 'lastWord', target, heroId: dying.id });
    gainLuna(ctx, target.side, LAST_WORD_LUNA, 'lastWord');
    if (attacker && attacker.side !== target.side) followUps.push(() => lastWordHit(ctx, target, attacker));
    return false;
  });
  return { survived: false, after: () => followUps.forEach(f => f()) };
}

/** «Последнее слово»: the killer takes 4 direct damage (counted for the fallen heroine's side). */
function lastWordHit(ctx: Ctx, fallen: SlotRef, killer: SlotRef): void {
  if (!isAlive(heroAt(ctx.s, killer))) return;
  const dmg = directHit(ctx, fallen, killer, LAST_WORD_DAMAGE);
  emit(ctx, { type: 'directDamage', source: fallen, target: killer, dmg, hp: heroAt(ctx.s, killer).hp, reason: 'lastWord' });
  checkDeath(ctx, killer, fallen);
}

/**
 * «Переписать судьбу»: the heroine is back at 1 HP and is exchanged at once with the first living
 * reserve heroine (like a swap: Taunt is dropped, the incoming one does not act this round); with
 * no living reserve she stays in her slot.
 */
function rewriteFate(ctx: Ctx, ref: SlotRef): void {
  setHeroAt(ctx.s, ref, { ...heroAt(ctx.s, ref), hp: REWRITE_FATE_HP });
  const reserveIndex = ctx.s.sides[ref.side].reserve.findIndex(isAlive);
  if (reserveIndex >= 0) swapIn(ctx, ref.side, ref.slot, reserveIndex as Slot, 'rewriteFate');
}
