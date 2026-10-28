import type { CardId, Side, SideCommands, Slot, SlotRef, Timing } from '../types';
import { CARDS } from '../data/cards';
import { HEROES } from '../data/heroes';
import { effectiveSpd, isAlive } from '../status';
import { aliveActive, heroAt, other, resolveTarget, sameRef } from '../targeting';
import { cardCost } from '../validate';
import type { Ctx, PlannedCard } from './context';
import { emit, nextAction } from './context';
import { fire } from './triggers';
import { drawCard } from './deck';
import { applyStatusTo, changeMoon, cleanseFrom, gainLuna, healHero } from './effects';
import type { CardSource } from './effects';
import { CARD_HOOKS } from './cardHooks';

// Tactic cards (spec §2.5 steps 3–5 and 7, §4.2). A side plays at most one card per round
// (validateCommands). The card leaves the hand at Reveal and waits on the table (`ctx.table`) for
// its phase, so a draw overflow during the round can never discard it.

const SIDES: Side[] = ['A', 'B'];

type Secondary = SlotRef | { reserveIndex: Slot };
/** Targets of a card checked at resolution time; enemy targets are already retargeted. */
type Checked = { target?: SlotRef; secondary?: Secondary };

/** Reveal (spec §2.5 step 3): stores the commands and moves each played card from the hand to the table. */
export function revealCards(ctx: Ctx, cmds: Record<Side, SideCommands>): void {
  ctx.cmds = cmds;
  ctx.table = {};
  for (const side of SIDES) {
    const play = cmds[side].card;
    if (!play) continue;
    const [cardId] = ctx.s.sides[side].hand.splice(play.handIndex, 1);
    if (cardId === undefined) throw new Error('card not in hand');
    ctx.table[side] = { cardId, play };
  }
}

/** Spec §2.5 step 4: Swift cards, the side with the higher Σ SPD first. */
export function playSwift(ctx: Ctx): void {
  playTiming(ctx, 'swift', true);
}

/**
 * Spec §2.5 step 5: Reaction cards are armed (A, then B: they do not interact). «Защитный круг»,
 * «Отложенная смерть» and «Прикрытие» put their status on the target now; «Последнее слово» and
 * «Переписать судьбу» wait in `armedReactions` for a death (reactions.ts).
 */
export function armReactions(ctx: Ctx): void {
  playTiming(ctx, 'reaction', false);
}

/** Spec §2.5 step 7: Standard cards, in the same side order rule as Swift (recomputed now). */
export function playStandard(ctx: Ctx): void {
  playTiming(ctx, 'standard', true);
}

function playTiming(ctx: Ctx, timing: Timing, bySpd: boolean): void {
  const table = ctx.table ?? {};
  const sides = SIDES.filter(side => {
    const card = table[side];
    return card !== undefined && CARDS[card.cardId].timing === timing;
  });
  const order = bySpd && sides.length === 2 ? cardSideOrder(ctx) : sides;
  for (const side of order) {
    const card = table[side]!;
    delete table[side];
    playCard(ctx, side, card);
  }
}

/**
 * Side order for Swift / Standard when both sides play one (spec §2.5): higher sum of effective SPD
 * of the living active heroines first; a tie is decided by the match Rng.
 */
export function cardSideOrder(ctx: Ctx): Side[] {
  const sum = (side: Side) => aliveActive(ctx.s, side).reduce((acc, ref) => acc + effectiveSpd(heroAt(ctx.s, ref)), 0);
  const a = sum('A');
  const b = sum('B');
  if (a !== b) return a > b ? ['A', 'B'] : ['B', 'A'];
  return ctx.rng.next() < 0.5 ? ['A', 'B'] : ['B', 'A'];
}

/**
 * Plays one revealed card (one action, R24). The card goes to the discard pile. Its cost is
 * recomputed now (R12): unaffordable → `fizzle` (reason 'energy'), no effect. A target that can no
 * longer be used → `fizzle` too ('target dead', 'reserve dead', 'no target'). Otherwise: Energy is
 * paid, a pending `nextCardCostUp` is consumed, `lastCardPlayed` / `cardsPlayedThisRound` are
 * updated, `cardPlayed` is emitted, `onCardPlayed` fires ({ side, card }, R23) and the effects run.
 */
export function playCard(ctx: Ctx, side: Side, card: PlannedCard): void {
  nextAction(ctx);
  const { cardId, play } = card;
  const sd = ctx.s.sides[side];
  sd.discard.push(cardId);
  const cost = cardCost(ctx.s, side, cardId);
  if (sd.energy < cost) {
    emit(ctx, { type: 'fizzle', side, card: cardId, reason: 'energy' });
    return;
  }
  const checked = checkCardTargets(ctx, side, cardId, play.target, play.secondary);
  if (typeof checked === 'string') {
    emit(ctx, { type: 'fizzle', side, card: cardId, reason: checked });
    return;
  }

  sd.energy -= cost;
  sd.nextCardCostUp = null;
  sd.lastCardPlayed = {
    cardId, ...(play.target ? { target: play.target } : {}), ...(play.secondary ? { secondary: play.secondary } : {}),
  };
  sd.cardsPlayedThisRound += 1;
  emit(ctx, { type: 'cardPlayed', side, cardId, ...withTargets(play.target, play.secondary), cost });
  fire(ctx, 'onCardPlayed', { side, card: cardId });
  runCardEffects(ctx, side, cardId, checked);
}

/**
 * Mira's ultimate «Повторение»: re-runs the effects of a card already played by `side`, for free,
 * with the same targets. No card moves, `lastCardPlayed` is unchanged, `onCardPlayed` does not
 * fire; `cardPlayed` is emitted with `replay: true`. The caller excludes Legendary cards.
 */
export function replayCard(ctx: Ctx, side: Side, cardId: CardId, target?: SlotRef, secondary?: Secondary): void {
  const checked = checkCardTargets(ctx, side, cardId, target, secondary);
  if (typeof checked === 'string') {
    emit(ctx, { type: 'fizzle', side, card: cardId, reason: checked, replay: true });
    return;
  }
  emit(ctx, { type: 'cardPlayed', side, cardId, ...withTargets(target, secondary), cost: 0, replay: true });
  runCardEffects(ctx, side, cardId, checked);
}

function withTargets(target?: SlotRef, secondary?: Secondary): Checked {
  return { ...(target ? { target } : {}), ...(secondary ? { secondary } : {}) };
}

/**
 * Checks the card's targets at resolution time; returns the fizzle reason or the targets to use.
 * Ally targets must still be alive (a Standard card on an ally who died during the hero phase
 * fizzles); a dead enemy target is retargeted to the lowest-HP enemy like a single hit (spec §2.6).
 */
function checkCardTargets(
  ctx: Ctx, side: Side, cardId: CardId, target: SlotRef | undefined, secondary: Secondary | undefined,
): Checked | string {
  const s = ctx.s;
  const aliveAlly = (ref: SlotRef | undefined): ref is SlotRef =>
    !!ref && ref.side === side && isAlive(heroAt(s, ref));
  switch (CARDS[cardId].target) {
    case 'enemy': {
      const t = target ? resolveTarget(s, target) : null;
      if (!t) return 'no target';
      if (target && !sameRef(t, target)) emit(ctx, { type: 'retarget', from: target, to: t });
      return { target: t };
    }
    case 'ally':
      return aliveAlly(target) ? { target } : 'target dead';
    case 'allyAndGuardian': {
      const guardian = secondary && 'slot' in secondary ? secondary : undefined;
      if (!aliveAlly(target) || !aliveAlly(guardian)) return 'target dead';
      if (HEROES[heroAt(s, guardian).id].role !== 'guardian') return 'no guardian';
      return { target, secondary: guardian };
    }
    case 'slotAndReserve': {
      if (!aliveAlly(target)) return 'target dead';
      if (!secondary || !('reserveIndex' in secondary)) return 'no target';
      if (!isAlive(s.sides[side].reserve[secondary.reserveIndex])) return 'reserve dead';
      return { target, secondary };
    }
    default:
      return {};
  }
}

/** Runs a card's primitives (spec §6.2) or its hook; `self`/`ally` targets come from `checked`. */
function runCardEffects(ctx: Ctx, side: Side, cardId: CardId, checked: Checked): void {
  const s = ctx.s;
  const def = CARDS[cardId];
  const source: CardSource = { side, card: cardId };
  const targets = (): SlotRef[] => {
    if (def.target === 'allies') return aliveActive(s, side);
    if (def.target === 'enemies') return aliveActive(s, other(side));
    return checked.target && isAlive(heroAt(s, checked.target)) ? [checked.target] : [];
  };
  for (const p of def.effects) {
    switch (p.op) {
      case 'status': {
        const who = p.who === 'allies' ? aliveActive(s, side) : p.who === 'enemies' ? aliveActive(s, other(side)) : targets();
        for (const t of who) applyStatusTo(ctx, source, t, p.status, p.value ?? 0, p.duration);
        break;
      }
      case 'heal':
        for (const t of targets()) healHero(ctx, source, t, p.amount);
        break;
      case 'cleanse':
        for (const t of targets()) cleanseFrom(ctx, t, p.count);
        break;
      case 'moon':
        changeMoon(ctx, p, source);
        break;
      case 'luna':
        gainLuna(ctx, side, p.amount, 'card');
        break;
      case 'draw':
        for (let i = 0; i < p.amount; i++) drawCard(ctx, side);
        break;
      case 'hook': {
        const fn = CARD_HOOKS[p.name];
        if (!fn) throw new Error('unknown card hook: ' + p.name);
        fn(ctx, side, { cardId, ...checked });
        break;
      }
      default:
        throw new Error(`card primitive not supported: ${p.op}`);
    }
  }
}
