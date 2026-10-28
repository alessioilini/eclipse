import type { HeroAction, Side, SideCommands, Slot, SlotRef } from './types';
import type { ValidationCode } from './errors';
import { CARDS } from './data/cards';
import { HEROES } from './data/heroes';
import { isAlive } from './status';
import type { PlanningState } from './validate';
import {
  ULTIMATE_ENERGY_COST, actionEnergy, cardCost, cardEnergy, energyBudget, isCoverGuardian, legalTargetsFor,
  livingReserve, ownSide, skillIssues, ultimateIssues, ultimateLunaCost,
} from './validate';

/** Why an option is greyed out in the planning UI. */
export type BlockReason = 'dead' | 'energy' | 'luna' | 'used' | 'freeze' | 'silence' | 'banned';

/**
 * Options of one heroine for the planning UI. Targets are listed even for a blocked ability
 * (the UI shows them greyed); `swap` lists candidates, `swapBlocked` says whether any swap is allowed.
 */
export type LegalActions = {
  basic: SlotRef[];
  skill: { targets: SlotRef[] | 'auto'; cost: number; blocked?: BlockReason };
  ultimate: { targets: SlotRef[] | 'auto'; energy: number; luna: number; blocked?: BlockReason };
  swap: Slot[];
  swapBlocked?: BlockReason;
};

/** Options of one hand card; `secondary` names what the card needs besides `target`. */
export type LegalCardPlay = { cost: number; targets: SlotRef[] | 'auto'; secondary?: 'guardian' | 'reserve'; blocked?: 'energy' };

const SLOTS: Slot[] = [0, 1, 2];
/** Shown block when several apply (spec §10.4 of the UI spec). */
const PRECEDENCE: BlockReason[] = ['used', 'silence', 'freeze', 'luna', 'energy'];
const BLOCK_OF: Partial<Record<ValidationCode, BlockReason>> = {
  SKILL_FREEZE: 'freeze', SKILL_SILENCE: 'silence', ULT_SILENCE: 'silence', ULT_USED: 'used',
};

const firstBlock = (reasons: (BlockReason | undefined | false)[]): BlockReason | undefined =>
  PRECEDENCE.find(r => reasons.includes(r));
const withBlock = <T extends object>(o: T, blocked: BlockReason | undefined): T & { blocked?: BlockReason } =>
  (blocked ? { ...o, blocked } : o);

/** Draft actions of the other slots whose heroine is alive (dead heroines' actions are not resolved). */
function otherActions(view: PlanningState, side: Side, slot: Slot | null, draft?: Partial<SideCommands>): { slot: Slot; action: HeroAction }[] {
  const own = ownSide(view, side);
  return SLOTS.filter(k => k !== slot && isAlive(own.active[k]))
    .flatMap(k => (draft?.actions?.[k] ? [{ slot: k, action: draft.actions[k] }] : []));
}

/** Energy left after the draft's other actions (and its card, if counted), with the Blood Pact bonus. */
function remainingEnergy(view: PlanningState, side: Side, slot: Slot | null, draft: Partial<SideCommands> | undefined, countCard: boolean): number {
  let remaining = energyBudget(view, side);
  for (const o of otherActions(view, side, slot, draft)) remaining -= actionEnergy(view, side, o.slot, o.action);
  if (countCard) {
    const card = cardEnergy(view, side, draft?.card);
    remaining += card.bonus - card.cost;
  }
  return remaining;
}

/**
 * What heroine `slot` of `side` may do, built on the predicates of `validateCommands`; `draft` is the
 * plan so far (Energy, Luna and reserve slots already taken by other slots and by the card count).
 */
export function legalActions(view: PlanningState, side: Side, slot: Slot, draft?: Partial<SideCommands>): LegalActions {
  const own = ownSide(view, side);
  const hero = own.active[slot];
  const def = HEROES[hero.id];
  const luna = ultimateLunaCost(view, side);
  if (!isAlive(hero)) {
    return {
      basic: [],
      skill: { targets: [], cost: def.skill.cost, blocked: 'dead' },
      ultimate: { targets: [], energy: ULTIMATE_ENERGY_COST, luna, blocked: 'dead' },
      swap: [],
      swapBlocked: 'dead',
    };
  }

  const others = otherActions(view, side, slot, draft);
  const energyLeft = remainingEnergy(view, side, slot, draft, true);
  const otherUltimates = others.filter(o => o.action.type === 'ultimate').length;
  const basic = legalTargetsFor(view, side, 'enemy');

  const skillBlock = firstBlock([
    ...skillIssues(hero).map(code => BLOCK_OF[code]),
    def.skill.cost > energyLeft && 'energy',
  ]);
  const ultimateBlock = firstBlock([
    ...ultimateIssues(hero).map(code => BLOCK_OF[code]),
    (otherUltimates + 1) * luna > own.luna && 'luna',
    ULTIMATE_ENERGY_COST > energyLeft && 'energy',
  ]);
  const taken = new Set(others.flatMap(o => (o.action.type === 'swap' ? [o.action.reserveIndex] : [])));

  const out: LegalActions = {
    basic: basic === 'auto' ? [] : basic,
    skill: withBlock({ targets: legalTargetsFor(view, side, def.skill.target), cost: def.skill.cost }, skillBlock),
    ultimate: withBlock({ targets: legalTargetsFor(view, side, def.ultimate.target), energy: ULTIMATE_ENERGY_COST, luna }, ultimateBlock),
    swap: livingReserve(own).filter(i => !taken.has(i)),
  };
  if (own.flags.swapBanned) out.swapBlocked = 'banned';
  return out;
}

/**
 * How the card at `handIndex` may be played. Targets come from the card's target type; with no
 * living guardian («Прикрытие») or no living reserve («Экстренная замена») there is no legal play
 * and `targets` is empty. `blocked: 'energy'` counts the draft's three actions.
 */
export function legalCardPlays(view: PlanningState, side: Side, handIndex: number, draft?: Partial<SideCommands>): LegalCardPlay {
  const own = ownSide(view, side);
  const cardId = own.hand[handIndex];
  if (cardId === undefined) throw new Error(`legalCardPlays: no card at hand index ${handIndex}`);
  const def = CARDS[cardId];
  const cost = cardCost(view, side, cardId);
  const targets = legalTargetsFor(view, side, def.target);
  const out: LegalCardPlay = { cost, targets };
  if (def.target === 'allyAndGuardian') {
    out.secondary = 'guardian';
    if (!SLOTS.some(k => isCoverGuardian(view, side, { side, slot: k }))) out.targets = [];
  } else if (def.target === 'slotAndReserve') {
    out.secondary = 'reserve';
    if (livingReserve(own).length === 0) out.targets = [];
  }
  const remaining = remainingEnergy(view, side, null, draft, false) + cardEnergy(view, side, { handIndex }).bonus;
  if (cost > remaining) out.blocked = 'energy';
  return out;
}
