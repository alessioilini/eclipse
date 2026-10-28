import type { CardPlay, HeroAction, Side, SideCommands, Slot, SlotRef, TargetType } from './types';
import type { PublicState } from './view';
import type { Rng } from './rng';
import { CARDS } from './data/cards';
import { HEROES } from './data/heroes';
import { isAlive } from './status';
import { other } from './targeting';
import { energyBudget, validateCommands } from './validate';
import type { Plan } from './botScoring';
import { WASTED_ENERGY, clonePlan, isThreatened, newPlan, ownSide, scoreAction, scoreCard, scoreCommands } from './botScoring';

export { scoreCommands } from './botScoring';

const SLOTS: Slot[] = [0, 1, 2];
/** Spec §6.4: with this probability the bot plays its second-best command set. */
const NOISE = 0.1;
/** Issue that a `none` placeholder for a not-yet-planned living heroine produces; it is not the candidate's. */
const PLACEHOLDER_ERROR = 'NONE_ONLY_DEAD';

type Scored<T> = { item: T; score: number };
type Actions = SideCommands['actions'];

const living = (view: PublicState, side: Side): SlotRef[] =>
  SLOTS.filter(slot => isAlive(view.sides[side].active[slot])).map(slot => ({ side, slot }));

/** Legal-looking targets of a target type; `undefined` = the ability takes no target. */
function targetsFor(view: PublicState, side: Side, type: TargetType): (SlotRef | undefined)[] {
  switch (type) {
    case 'enemy': return living(view, other(side));
    case 'ally': case 'allyAndGuardian': case 'slotAndReserve': case 'reserveSlot': return living(view, side);
    default: return [undefined];
  }
}

/** Basic on every living enemy, skill and ultimate on every legal target, swaps only under threat. */
function heroCandidates(view: PublicState, side: Side, slot: Slot, threatened: boolean): HeroAction[] {
  const own = ownSide(view, side);
  const hero = own.active[slot];
  if (!isAlive(hero)) return [{ type: 'none' }];
  const def = HEROES[hero.id];
  const out: HeroAction[] = living(view, other(side)).map(target => ({ type: 'basic', target }));
  for (const target of targetsFor(view, side, def.skill.target)) out.push(target ? { type: 'skill', target } : { type: 'skill' });
  if (!hero.ultimateUsed) {
    for (const target of targetsFor(view, side, def.ultimate.target)) out.push(target ? { type: 'ultimate', target } : { type: 'ultimate' });
  }
  if (threatened) {
    own.reserve.forEach((r, i) => { if (isAlive(r)) out.push({ type: 'swap', reserveIndex: i as Slot }); });
  }
  return out;
}

/** Last resort when no candidate validates (cannot happen while the match runs): never a dead enemy slot. */
function fallback(view: PublicState, side: Side, slot: Slot): HeroAction {
  if (!isAlive(view.sides[side].active[slot])) return { type: 'none' };
  const target = living(view, other(side))[0];
  if (target) return { type: 'basic', target };
  const reserveIndex = ownSide(view, side).reserve.findIndex(isAlive);
  return reserveIndex >= 0 ? { type: 'swap', reserveIndex: reserveIndex as Slot } : { type: 'none' };
}

const withCard = (actions: Actions, card: CardPlay | undefined): SideCommands => (card ? { actions, card } : { actions });

/**
 * Valid candidates of `slot`, best first. Each is validated inside a full command: the planned
 * prefix, the candidate, `none` placeholders for later slots (their only error is filtered out).
 */
function rankSlot(view: PublicState, side: Side, prefix: HeroAction[], plan: Plan, slot: Slot, card?: CardPlay): Scored<HeroAction>[] {
  const ranked: Scored<HeroAction>[] = [];
  for (const action of heroCandidates(view, side, slot, isThreatened(plan, slot))) {
    const actions = [...prefix, action, ...SLOTS.slice(slot + 1).map((): HeroAction => ({ type: 'none' }))] as Actions;
    if (validateCommands(view, side, withCard(actions, card)).some(e => e.code !== PLACEHOLDER_ERROR)) continue;
    const p = clonePlan(plan);
    const spentBefore = p.energy;
    const score = scoreAction(p, slot, action) - WASTED_ENERGY * (p.energy - spentBefore);
    ranked.push({ item: action, score });
  }
  return ranked.sort((x, y) => y.score - x.score); // stable: ties keep generation order
}

/** Greedy by slot: slot 0, then slot 1 given slot 0's predicted kills, then slot 2. */
function planActions(view: PublicState, side: Side, card?: CardPlay, altSlot?: Slot): { actions: Actions; plan: Plan } | null {
  const plan = newPlan(view, side);
  const actions: HeroAction[] = [];
  for (const slot of SLOTS) {
    const ranked = rankSlot(view, side, actions, plan, slot, card);
    const pickIndex = slot === altSlot ? 1 : 0;
    if (slot === altSlot && ranked.length < 2) return null;
    const pick = ranked[pickIndex]?.item ?? fallback(view, side, slot);
    scoreAction(plan, slot, pick);
    actions.push(pick);
  }
  return { actions: actions as Actions, plan };
}

/** Every play of the card at `handIndex`, with targets by its target type. */
function cardPlays(view: PublicState, side: Side, handIndex: number): CardPlay[] {
  const own = ownSide(view, side);
  const def = CARDS[own.hand[handIndex]!];
  const mine = living(view, side);
  switch (def.target) {
    case 'allyAndGuardian':
      return mine.flatMap(target => mine
        .filter(g => g.slot !== target.slot && HEROES[own.active[g.slot].id].role === 'guardian')
        .map(secondary => ({ handIndex, target, secondary })));
    case 'slotAndReserve':
      return mine.flatMap(target => SLOTS.filter(i => isAlive(own.reserve[i]))
        .map(reserveIndex => ({ handIndex, target, secondary: { reserveIndex } })));
    default:
      return targetsFor(view, side, def.target).map(target => (target ? { handIndex, target } : { handIndex }));
  }
}

/** Best card for the planned actions, if its value is above zero. Blood Pact is planned separately. */
function chooseCard(view: PublicState, side: Side, actions: Actions, plan: Plan): CardPlay | undefined {
  let best: Scored<CardPlay> | undefined;
  ownSide(view, side).hand.forEach((id, handIndex) => {
    if (id === 'bloodPact') return;
    for (const play of cardPlays(view, side, handIndex)) {
      if (validateCommands(view, side, { actions, card: play }).length > 0) continue;
      const score = scoreCard(clonePlan(plan), play, actions);
      if (score > 0 && (!best || score > best.score)) best = { item: play, score };
    }
  });
  return best?.item;
}

/** Blood Pact on the healthiest ally, worth it only if the +2 Energy is actually spent. */
function bloodPactVariant(view: PublicState, side: Side, altSlot?: Slot): SideCommands | null {
  const own = ownSide(view, side);
  const handIndex = own.hand.indexOf('bloodPact');
  const donor = living(view, side).sort((a, b) => own.active[b.slot].hp - own.active[a.slot].hp)[0];
  if (handIndex < 0 || !donor) return null;
  const card: CardPlay = { handIndex, target: donor };
  const planned = planActions(view, side, card, altSlot);
  if (!planned || planned.plan.energy <= energyBudget(view, side)) return null;
  return { actions: planned.actions, card };
}

/** The best command set; with `altSlot`, the first living heroine takes her second-ranked action. */
function bestCommands(view: PublicState, side: Side, altSlot?: Slot): Scored<SideCommands> | null {
  const planned = planActions(view, side, undefined, altSlot);
  if (!planned) return null;
  const options = [withCard(planned.actions, chooseCard(view, side, planned.actions, planned.plan))];
  const pact = bloodPactVariant(view, side, altSlot);
  if (pact) options.push(pact);
  return options
    .map(item => ({ item, score: scoreCommands(view, side, item) }))
    .reduce((a, b) => (b.score > a.score ? b : a));
}

/**
 * Heuristic bot (spec §6.4). Reads only `view` (the opponent's hand and deck are hidden).
 * Noise: one `rng.next()` per call; below 0.1 the bot plays the second-best variant, which
 * replaces the first living heroine's action by her second-ranked one and re-plans the rest.
 */
export function chooseCommands(view: PublicState, side: Side, rng: Rng): SideCommands {
  const noisy = rng.next() < NOISE;
  const best = bestCommands(view, side);
  const first = SLOTS.find(slot => isAlive(view.sides[side].active[slot]));
  const alt = noisy && first !== undefined ? bestCommands(view, side, first) : null;
  const chosen = alt ?? best;
  if (!chosen) return { actions: [fallback(view, side, 0), fallback(view, side, 1), fallback(view, side, 2)] };
  return chosen.item;
}
