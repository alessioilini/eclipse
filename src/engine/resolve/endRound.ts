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
const DEATH_KEY = 'deathRecorded';

/**
 * Records a death the moment an active heroine's HP reaches 0 (idempotent):
 * `death` event, entry in `deaths`, Luna +1 (cap 5) to the heroine's own side.
 */
export function checkDeath(ctx: Ctx, ref: SlotRef): void {
  const hero = heroAt(ctx.s, ref);
  if (hero.hp > 0 || hero.once[DEATH_KEY] === 1) return;
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

function burnTick(ctx: Ctx): void {
  for (const side of SIDES) {
    for (const slot of SLOTS) {
      const ref: SlotRef = { side, slot };
      const hero = heroAt(ctx.s, ref);
      const burn = hero.statuses.find(st => st.id === 'burn');
      if (!isAlive(hero) || !burn) continue;
      const { hero: next, hpLoss } = directDamage(hero, BURN_PER_STACK * burn.stacks);
      setHeroAt(ctx.s, ref, next);
      emit(ctx, { type: 'burn', target: ref, stacks: burn.stacks, dmg: hpLoss, hp: next.hp });
      fire(ctx, 'burnTick', { hero: ref, target: ref, amount: hpLoss });
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

/** Spec §2.5 step 8: Burn, expiry, unarmed reactions, Blood Moon, autofill, victory. */
export function endRound(ctx: Ctx): void {
  const s = ctx.s;
  ctx.phase = 'endRound';
  burnTick(ctx);

  for (const side of SIDES) {
    const sd = s.sides[side];
    sd.active = sd.active.map(h => expireStatuses(h, s.round)) as typeof sd.active;
    sd.reserve = sd.reserve.map(h => expireStatuses(h, s.round)) as typeof sd.reserve;
    sd.armedReactions = [];
    if (sd.nextCardCostUp && s.round >= sd.nextCardCostUp.untilRound) sd.nextCardCostUp = null;
  }

  // Deaths were already recorded the moment HP reached 0 (checkDeath in dealHit / Burn tick).
  for (const side of SIDES) bloodMoon(ctx, side);
  for (const side of SIDES) autoFill(ctx, side);

  s.result = getWinner(s);
  if (s.result) emit(ctx, { type: 'matchEnd', winner: s.result.winner, reason: s.result.reason });
}
