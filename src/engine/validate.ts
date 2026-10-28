import type { CardId, HeroAction, MatchState, Side, SideCommands, SideState, SlotRef, TargetType } from './types';
import { CARDS } from './data/cards';
import { HEROES } from './data/heroes';
import { hasStatus, isAlive } from './status';
import { aliveActive, heroAt, other } from './targeting';
import type { PublicState } from './view';

/** A full state, or the PublicState of the side being validated (its own hand is visible there). */
export type PlanningState = MatchState | PublicState;

export const ULTIMATE_ENERGY_COST = 2;
const BLOOD_PACT_BUDGET_BONUS = 2;
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

/** Checks a target against the target type; returns an error string or null. */
function checkTarget(state: PlanningState, side: Side, type: TargetType, target: SlotRef | undefined): string | null {
  switch (type) {
    case 'ally':
    case 'allyAndGuardian':
    case 'slotAndReserve':
    case 'reserveSlot':
      if (!target || target.side !== side) return 'wrong target type';
      return isAlive(heroAt(state, target)) ? null : 'target slot is dead';
    case 'enemy':
      if (!target || target.side !== other(side)) return 'wrong target type';
      // A dead enemy is retargeted by the engine, so it is only an error when none is left.
      return aliveActive(state, other(side)).length > 0 ? null : 'target slot is dead';
    default:
      return null; // self / allies / enemies / none: a supplied target is ignored
  }
}

/** Checks a reserve index; a malformed index is a wrong target, never a throw. */
function checkReserve(s: Pick<SideState, 'reserve'>, index: unknown): string | null {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 2) return 'wrong target type';
  return isAlive(s.reserve[index as 0 | 1 | 2]) ? null : 'reserve hero is dead';
}

/** The side's full state; a PublicState carries it only for the side it was built for. */
function ownSide(state: PlanningState, side: Side): SideState {
  const s = state.sides[side];
  if (!('hand' in s)) throw new Error(`validateCommands: the hand of side ${side} is hidden in this view`);
  return s;
}

function validateAction(state: PlanningState, side: Side, slot: 0 | 1 | 2, action: HeroAction): string[] {
  const s = ownSide(state, side);
  const hero = s.active[slot];
  if (!isAlive(hero)) return action.type === 'none' ? [] : ['dead hero cannot act'];
  const def = HEROES[hero.id];
  const errors: string[] = [];
  const push = (e: string | null) => { if (e) errors.push(e); };
  switch (action.type) {
    case 'none':
      errors.push('none only for dead hero');
      break;
    case 'basic':
      push(checkTarget(state, side, 'enemy', action.target));
      break;
    case 'skill':
      if (hasStatus(hero, 'freeze')) errors.push('skill blocked by freeze');
      if (hasStatus(hero, 'silence')) errors.push('skill blocked by silence');
      push(checkTarget(state, side, def.skill.target, action.target));
      break;
    case 'ultimate':
      if (hasStatus(hero, 'silence')) errors.push('ultimate blocked by silence');
      if (hero.ultimateUsed) errors.push('ultimate already used');
      push(checkTarget(state, side, def.ultimate.target, action.target));
      break;
    case 'swap':
      if (s.flags.swapBanned) errors.push('swap banned');
      push(checkReserve(s, action.reserveIndex));
      break;
  }
  return errors;
}

/** Returns every violation found, in a stable order: slots 0..2, then the card, then resources. */
export function validateCommands(state: PlanningState, side: Side, cmds: SideCommands): string[] {
  const s = ownSide(state, side);
  const errors: string[] = [];
  let energy = 0;
  let ultimates = 0;

  cmds.actions.forEach((action, i) => {
    const slot = i as 0 | 1 | 2;
    errors.push(...validateAction(state, side, slot, action));
    const hero = s.active[slot];
    if (!isAlive(hero)) return;
    if (action.type === 'skill') energy += HEROES[hero.id].skill.cost;
    if (action.type === 'ultimate') { energy += ULTIMATE_ENERGY_COST; ultimates += 1; }
  });

  let budget = energyBudget(state, side);
  if (Array.isArray(cmds.card)) {
    errors.push('one card per round'); // spec §2.5: at most one card per side per round
  } else if (cmds.card) {
    const cardId = s.hand[cmds.card.handIndex];
    if (cardId === undefined) {
      errors.push('card not in hand');
    } else {
      const def = CARDS[cardId];
      const targetError = checkTarget(state, side, def.target, cmds.card.target);
      if (targetError) errors.push(targetError);
      const sec = cmds.card.secondary;
      if (def.target === 'allyAndGuardian') {
        const guardian = sec && 'slot' in sec && sec.side === side ? heroAt(state, sec) : null;
        if (!guardian || !isAlive(guardian) || HEROES[guardian.id].role !== 'guardian') errors.push('wrong target type');
      }
      if (def.target === 'slotAndReserve') {
        if (!sec || !('reserveIndex' in sec)) errors.push('wrong target type');
        else {
          const reserveError = checkReserve(s, sec.reserveIndex);
          if (reserveError) errors.push(reserveError);
        }
      }
      energy += cardCost(state, side, cardId);
      if (cardId === 'bloodPact') budget += BLOOD_PACT_BUDGET_BONUS;
    }
  }

  if (energy > budget) errors.push('not enough energy');
  if (ultimates * ultimateLunaCost(state, side) > s.luna) errors.push('not enough luna');
  return errors;
}
