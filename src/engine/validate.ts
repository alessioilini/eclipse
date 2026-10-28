import type { CardId, CardPlay, HeroAction, HeroState, MatchState, Side, SideCommands, SideState, Slot, SlotRef, TargetType } from './types';
import type { ValidationCode, ValidationIssue } from './errors';
import { CARDS } from './data/cards';
import { HEROES } from './data/heroes';
import { hasStatus, isAlive } from './status';
import { aliveActive, heroAt, other } from './targeting';
import type { PublicState } from './view';

/** A full state, or the PublicState of the side being validated (its own hand is visible there). */
export type PlanningState = MatchState | PublicState;

export const ULTIMATE_ENERGY_COST = 2;
export const BLOOD_PACT_BUDGET_BONUS = 2;
const MIRA_DISCOUNT = 1;

/** Energy available to `side` in the current round (spec 2.3). Round 0 counts as round 1. */
export function energyBudget(state: PlanningState, side: Side): number {
  const r = state.round;
  const base = r >= 6 ? 6 : r >= 3 ? 5 : 4;
  const s = state.sides[side];
  return base + s.maxEnergyBonus + s.flags.energyBonus;
}

/** Luna price of one ultimate: 3, 2 under the full moon, plus the round-wide delta. */
export function ultimateLunaCost(state: PlanningState, side: Side): number {
  void side;
  const base = state.moon === 'full' ? 2 : 3;
  return base + state.roundFlags.ultLunaDelta;
}

/** Energy price of playing `cardId` this round, with all modifiers; never below 0. */
export function cardCost(state: PlanningState, side: Side, cardId: CardId): number {
  const s = state.sides[side];
  let cost = CARDS[cardId].cost + s.flags.cardCostDelta + (s.nextCardCostUp?.value ?? 0);
  const hasMira = aliveActive(state, side).some(ref => heroAt(state, ref).id === 'mira');
  if (state.round % 2 === 1 && hasMira) cost -= MIRA_DISCOUNT;
  return Math.max(0, cost);
}

/** A well-formed SlotRef: an object with `side` A or B and `slot` 0, 1 or 2 (input may be anything). */
function isSlotRef(x: unknown): x is SlotRef {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as { side?: unknown; slot?: unknown };
  return (r.side === 'A' || r.side === 'B') && (r.slot === 0 || r.slot === 1 || r.slot === 2);
}

const SLOTS: Slot[] = [0, 1, 2];

/**
 * Targets that pass `checkTarget` for a target type (spec §5, R5): living enemies for `enemy`,
 * living own actives for the ally-side types, `'auto'` for `self | allies | enemies | none`.
 */
export function legalTargetsFor(state: PlanningState, side: Side, type: TargetType): SlotRef[] | 'auto' {
  switch (type) {
    case 'enemy': return aliveActive(state, other(side));
    case 'ally': case 'allyAndGuardian': case 'slotAndReserve': case 'reserveSlot': return aliveActive(state, side);
    default: return 'auto';
  }
}

/** Checks a target against the target type; returns an issue code or null. Malformed refs never throw. */
function checkTarget(state: PlanningState, side: Side, type: TargetType, target: SlotRef | undefined): ValidationCode | null {
  switch (type) {
    case 'ally':
    case 'allyAndGuardian':
    case 'slotAndReserve':
    case 'reserveSlot':
      if (!isSlotRef(target) || target.side !== side) return 'WRONG_TARGET';
      return isAlive(heroAt(state, target)) ? null : 'TARGET_DEAD';
    case 'enemy':
      if (!isSlotRef(target) || target.side !== other(side)) return 'WRONG_TARGET';
      // A dead enemy is retargeted by the engine, so it is only an error when none is left.
      return aliveActive(state, other(side)).length > 0 ? null : 'TARGET_DEAD';
    default:
      // self / allies / enemies / none: a supplied target is ignored, but it must not be malformed.
      return target === undefined || isSlotRef(target) ? null : 'WRONG_TARGET';
  }
}

/** Checks a reserve index; a malformed index is a wrong target, never a throw. */
function checkReserve(s: Pick<SideState, 'reserve'>, index: unknown): ValidationCode | null {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 2) return 'WRONG_TARGET';
  return isAlive(s.reserve[index as Slot]) ? null : 'RESERVE_DEAD';
}

/** A living own guardian at `ref`: the secondary of an `allyAndGuardian` card («Прикрытие»). */
export function isCoverGuardian(state: PlanningState, side: Side, ref: unknown): boolean {
  if (!isSlotRef(ref) || ref.side !== side) return false;
  const hero = heroAt(state, ref);
  return isAlive(hero) && HEROES[hero.id].role === 'guardian';
}

/** Reserve indices a swap may go into (living reserve heroines), ascending. */
export function livingReserve(s: Pick<SideState, 'reserve'>): Slot[] {
  return SLOTS.filter(i => checkReserve(s, i) === null);
}

/** The side's own state (everything but the deck order); a PublicState carries it only for the side it was built for. */
export function ownSide(state: PlanningState, side: Side): Omit<SideState, 'deck'> {
  const s = state.sides[side];
  if (!('hand' in s)) throw new Error(`validateCommands: the hand of side ${side} is hidden in this view`);
  return s;
}

/** Status blocks of a skill, in check order (freeze, then silence). */
export function skillIssues(hero: HeroState): ValidationCode[] {
  const out: ValidationCode[] = [];
  if (hasStatus(hero, 'freeze')) out.push('SKILL_FREEZE');
  if (hasStatus(hero, 'silence')) out.push('SKILL_SILENCE');
  return out;
}

/** Blocks of an ultimate, in check order (silence, then already used). */
export function ultimateIssues(hero: HeroState): ValidationCode[] {
  const out: ValidationCode[] = [];
  if (hasStatus(hero, 'silence')) out.push('ULT_SILENCE');
  if (hero.ultimateUsed) out.push('ULT_USED');
  return out;
}

/** Energy price of one hero action (0 for a dead heroine, whose action is not resolved). */
export function actionEnergy(state: PlanningState, side: Side, slot: Slot, action: HeroAction | undefined): number {
  const hero = ownSide(state, side).active[slot];
  if (!action || !isAlive(hero)) return 0;
  if (action.type === 'skill') return HEROES[hero.id].skill.cost;
  if (action.type === 'ultimate') return ULTIMATE_ENERGY_COST;
  return 0;
}

/** Energy price of a card play and the budget it adds (Blood Pact); nothing for an absent, unknown or multiple card. */
export function cardEnergy(state: PlanningState, side: Side, card: CardPlay | undefined): { cost: number; bonus: number } {
  if (!card || Array.isArray(card)) return { cost: 0, bonus: 0 };
  const cardId = ownSide(state, side).hand[card.handIndex];
  if (cardId === undefined) return { cost: 0, bonus: 0 };
  return { cost: cardCost(state, side, cardId), bonus: cardId === 'bloodPact' ? BLOOD_PACT_BUDGET_BONUS : 0 };
}

function validateAction(state: PlanningState, side: Side, slot: Slot, action: HeroAction): ValidationIssue[] {
  const s = ownSide(state, side);
  const hero = s.active[slot];
  if (!isAlive(hero)) return action.type === 'none' ? [] : [{ code: 'DEAD_HERO', slot }];
  const def = HEROES[hero.id];
  const codes: ValidationCode[] = [];
  const push = (e: ValidationCode | null) => { if (e) codes.push(e); };
  switch (action.type) {
    case 'none':
      codes.push('NONE_ONLY_DEAD');
      break;
    case 'basic':
      push(checkTarget(state, side, 'enemy', action.target));
      break;
    case 'skill':
      codes.push(...skillIssues(hero));
      push(checkTarget(state, side, def.skill.target, action.target));
      break;
    case 'ultimate':
      codes.push(...ultimateIssues(hero));
      push(checkTarget(state, side, def.ultimate.target, action.target));
      break;
    case 'swap':
      if (s.flags.swapBanned) codes.push('SWAP_BANNED');
      push(checkReserve(s, action.reserveIndex));
      break;
  }
  return codes.map(code => ({ code, slot }));
}

/** Card issues: one card per round, card in hand, target and secondary shape (spec §5). */
function validateCard(state: PlanningState, side: Side, card: CardPlay | CardPlay[]): ValidationCode[] {
  // spec §2.5: at most one card per side per round
  if (Array.isArray(card)) return ['ONE_CARD'];
  const s = ownSide(state, side);
  const cardId = s.hand[card.handIndex];
  if (cardId === undefined) return ['CARD_NOT_IN_HAND'];
  const def = CARDS[cardId];
  const codes: ValidationCode[] = [];
  const targetError = checkTarget(state, side, def.target, card.target);
  if (targetError) codes.push(targetError);
  const sec: unknown = card.secondary;
  const secIsObject = typeof sec === 'object' && sec !== null;
  if (sec !== undefined && !secIsObject) {
    codes.push('WRONG_TARGET');
  } else if (def.target === 'allyAndGuardian') {
    if (!isCoverGuardian(state, side, sec)) codes.push('WRONG_TARGET');
  } else if (def.target === 'slotAndReserve') {
    if (!secIsObject || !('reserveIndex' in sec)) codes.push('WRONG_TARGET');
    else {
      const reserveError = checkReserve(s, sec.reserveIndex);
      if (reserveError) codes.push(reserveError);
    }
  }
  return codes;
}

/** Returns every violation found, in a stable order: slots 0..2, then the card, then resources. */
export function validateCommands(state: PlanningState, side: Side, cmds: SideCommands): ValidationIssue[] {
  const s = ownSide(state, side);
  const issues: ValidationIssue[] = [];
  let energy = 0;
  let ultimates = 0;
  const swapInto = new Set<unknown>();

  cmds.actions.forEach((action, i) => {
    const slot = i as Slot;
    issues.push(...validateAction(state, side, slot, action));
    if (!isAlive(s.active[slot])) return;
    energy += actionEnergy(state, side, slot, action);
    if (action.type === 'ultimate') ultimates += 1;
    if (action.type === 'swap') {
      if (swapInto.has(action.reserveIndex)) issues.push({ code: 'DUPLICATE_RESERVE', slot });
      swapInto.add(action.reserveIndex);
    }
  });

  let budget = energyBudget(state, side);
  if (cmds.card) {
    issues.push(...validateCard(state, side, cmds.card).map((code): ValidationIssue => ({ code, card: true })));
    const card = cardEnergy(state, side, cmds.card);
    energy += card.cost;
    budget += card.bonus;
  }

  if (energy > budget) issues.push({ code: 'ENERGY' });
  if (ultimates * ultimateLunaCost(state, side) > s.luna) issues.push({ code: 'LUNA' });
  return issues;
}
