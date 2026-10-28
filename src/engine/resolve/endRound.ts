import type { HeroState, Side, Slot, SlotRef } from '../types';
import { getWinner } from '../match';
import { cleanse, expireStatuses, isAlive } from '../status';
import { directDamage } from '../damage';
import { heroAt, setHeroAt } from '../targeting';
import type { Ctx } from './context';
import { emit } from './context';
import { fire } from './triggers';

const SIDES: Side[] = ['A', 'B'];
const SLOTS: Slot[] = [0, 1, 2];
const MAX_LUNA = 5;
const BURN_PER_STACK = 2;
/** `hero.once` key set when a death is recorded; Fenna's revive clears it. */
export const DEATH_KEY = 'deathRecorded';

/**
 * Records a death the moment an active heroine's HP reaches 0 (idempotent):
 * `death` event, entry in `deaths`, Luna +1 (cap 5) to the heroine's own side.
 */
export function checkDeath(ctx: Ctx, ref: SlotRef): void {
  const hero = heroAt(ctx.s, ref);
  if (hero.hp > 0 || hero.once[DEATH_KEY] === 1) return;
  // TODO(Task 11): triggerReactions('onDeath') runs here, before the death is recorded.
  hero.once[DEATH_KEY] = 1;
  emit(ctx, { type: 'death', side: ref.side, slot: ref.slot, heroId: hero.id });
  ctx.s.deaths.push({ side: ref.side, heroId: hero.id, round: ctx.s.round });
  const sd = ctx.s.sides[ref.side];
  const before = sd.luna;
  sd.luna = Math.min(MAX_LUNA, sd.luna + 1);
  if (sd.luna !== before) {
    emit(ctx, { type: 'lunaChanged', side: ref.side, luna: sd.luna, delta: sd.luna - before, reason: 'death' });
  }
}

/**
 * Reserve heroines' timers are frozen (controller ruling 14): every non-null status expiry and
 * the shield expiry move one round later, so rounds spent in reserve do not count.
 */
export function freezeTimers(hero: HeroState): HeroState {
  return {
    ...hero,
    statuses: hero.statuses.map(st => ({ ...st, expiresAtRound: st.expiresAtRound === null ? null : st.expiresAtRound + 1 })),
    shieldExpiresAtRound: hero.shieldExpiresAtRound === null ? null : hero.shieldExpiresAtRound + 1,
  };
}

function burnTick(ctx: Ctx): void {
  for (const side of SIDES) {
    for (const slot of SLOTS) {
      const ref: SlotRef = { side, slot };
      const hero = heroAt(ctx.s, ref);
      const burn = hero.statuses.find(st => st.id === 'burn');
      if (!isAlive(hero) || !burn) continue;
      // `burnTick` fires before the tick with a mutable amount (Aira's «Жар» +1).
      const amount = { v: BURN_PER_STACK * burn.stacks };
      fire(ctx, 'burnTick', { target: ref, amount });
      const { hero: next, hpLoss } = directDamage(heroAt(ctx.s, ref), amount.v);
      setHeroAt(ctx.s, ref, next);
      emit(ctx, { type: 'burn', target: ref, stacks: burn.stacks, dmg: hpLoss, hp: next.hp });
      checkDeath(ctx, ref);
    }
  }
}

function bloodMoon(ctx: Ctx, side: Side): void {
  const sd = ctx.s.sides[side];
  if (sd.bloodMoonUsed) return;
  const living = [...sd.active, ...sd.reserve].filter(isAlive);
  if (living.length !== 1) return;
  const activeSlot = sd.active.findIndex(isAlive);
  const reserveIndex = sd.reserve.findIndex(isAlive);
  const hero = living[0]!;
  const { hero: cleansed, removed } = cleanse(hero, 1);
  const next: HeroState = { ...cleansed, bloodMoon: true };
  if (activeSlot >= 0) sd.active[activeSlot] = next;
  else sd.reserve[reserveIndex] = next;
  sd.maxEnergyBonus += 1;
  sd.bloodMoonUsed = true;
  emit(ctx, {
    type: 'bloodMoon', side, heroId: hero.id,
    ...(activeSlot >= 0 ? { slot: activeSlot } : { slot: null, reserveIndex }),
    ...(removed.length > 0 ? { cleansed: removed } : {}),
  });
}

function autoFill(ctx: Ctx, side: Side): void {
  const sd = ctx.s.sides[side];
  for (const slot of SLOTS) {
    if (isAlive(sd.active[slot])) continue;
    const reserveIndex = sd.reserve.findIndex(isAlive);
    if (reserveIndex < 0) return;
    const incoming = sd.reserve[reserveIndex]!;
    sd.reserve[reserveIndex] = sd.active[slot];
    sd.active[slot] = incoming;
    emit(ctx, { type: 'autoFill', side, slot, reserveIndex, in: incoming.id });
  }
}

/** Spec §2.5 step 8: Burn, expiry (active) / frozen timers (reserve), unarmed reactions, Blood Moon, autofill, victory. */
export function endRound(ctx: Ctx): void {
  const s = ctx.s;
  ctx.phase = 'endRound';
  burnTick(ctx);

  for (const side of SIDES) {
    const sd = s.sides[side];
    sd.active = sd.active.map(h => expireStatuses(h, s.round)) as typeof sd.active;
    sd.reserve = sd.reserve.map(freezeTimers) as typeof sd.reserve;
    sd.armedReactions = [];
    if (sd.nextCardCostUp && s.round >= sd.nextCardCostUp.untilRound) sd.nextCardCostUp = null;
  }

  // Deaths were already recorded the moment HP reached 0 (checkDeath in dealHit / Burn tick).
  for (const side of SIDES) bloodMoon(ctx, side);
  for (const side of SIDES) autoFill(ctx, side);

  s.result = getWinner(s);
  if (s.result) emit(ctx, { type: 'matchEnd', winner: s.result.winner, reason: s.result.reason });
}
