import type { HeroAction, MoonPhase, Element, SlotRef } from '../types';
import { HEROES } from '../data/heroes';
import { elementMultiplier } from '../data/elements';
import { computeDamage, applyToHero, roundHalfUp } from '../damage';
import { effectiveAtk, hasStatus, isAlive, removeStatus, statusValue } from '../status';
import { heroAt, interceptSingleHit, resolveTarget, setHeroAt } from '../targeting';
import type { Ctx } from './context';
import { emit } from './context';
import { checkDeath } from './endRound';

const MARK_BONUS = 3;
const ENTERED_KEY = 'enteredRound';

const sameRef = (a: SlotRef, b: SlotRef): boolean => a.side === b.side && a.slot === b.slot;

/** Spec §2.4: +1 to Dark at new moon, to Light/Star at full moon, to everyone at waning moon. */
function lunarDamageBonus(moon: MoonPhase, element: Element): number {
  if (moon === 'new' && element === 'dark') return 1;
  if (moon === 'full' && (element === 'light' || element === 'star')) return 1;
  if (moon === 'waning') return 1;
  return 0;
}

/**
 * One hit from `attacker` on `target` (spec §3.1). Single hits go through the interception chain;
 * Mark (single hits only) and DamageReduction are one-shot and consumed here.
 * Task 9 inserts the trigger calls; the signature stays.
 */
export function dealHit(
  ctx: Ctx, attacker: SlotRef, target: SlotRef, mod: number, flat: number,
  opts: { single: boolean; pierce?: boolean },
): void {
  const s = ctx.s;
  let tgt = target;
  let reductions = 0;
  if (opts.single) {
    const r = interceptSingleHit(s, attacker, target);
    if (!sameRef(r.target, target)) emit(ctx, { type: 'redirect', from: target, to: r.target, reason: r.reason });
    tgt = r.target;
    reductions += r.reduction;
  }

  const att = heroAt(s, attacker);
  const attDef = HEROES[att.id];
  let victim = heroAt(s, tgt);
  const victimEl = HEROES[victim.id].element;

  const dr = statusValue(victim, 'damageReduction');
  if (dr !== 0) {
    reductions += dr;
    victim = removeStatus(victim, 'damageReduction');
  }
  let totalFlat = flat + lunarDamageBonus(s.moon, attDef.element);
  if (opts.single && hasStatus(victim, 'mark')) {
    totalFlat += MARK_BONUS;
    victim = removeStatus(victim, 'mark');
  }

  const atk = effectiveAtk(att);
  const raw = roundHalfUp(atk * mod * elementMultiplier(attDef.element, victimEl));
  const dmg = computeDamage({
    atk, mod, attacker: attDef.element, target: victimEl,
    flat: totalFlat, bloodMoon: att.bloodMoon, round: s.round, reductions,
  });
  const { hero: hit, absorbed } = applyToHero(victim, dmg, { pierce: opts.pierce });
  const hpLoss = victim.hp - hit.hp; // overkill beyond the victim's HP is not HP loss
  setHeroAt(s, tgt, hit);
  emit(ctx, {
    type: 'damage', attacker, target: tgt, raw, flat: totalFlat, reductions,
    dmg, absorbed, hpLoss, hp: hit.hp, shield: hit.shield,
  });
  s.sides[attacker.side].damageDealt += hpLoss;
  checkDeath(ctx, tgt);
}

function skip(ctx: Ctx, ref: SlotRef, reason: string): void {
  emit(ctx, { type: 'heroAction', side: ref.side, slot: ref.slot, heroId: heroAt(ctx.s, ref).id, action: 'skipped', reason });
}

/** Single-target hit on a planned enemy slot, retargeted if that slot is dead (spec §2.6). */
function attack(ctx: Ctx, ref: SlotRef, kind: 'basic' | 'skill' | 'ultimate', planned: SlotRef | undefined): void {
  const heroId = heroAt(ctx.s, ref).id;
  if (!planned) {
    emit(ctx, { type: 'heroAction', side: ref.side, slot: ref.slot, heroId, action: kind });
    return;
  }
  if (planned.side === ref.side) {
    // TODO(Task 9): ally-targeted skills; until then they act without hitting anyone.
    emit(ctx, { type: 'heroAction', side: ref.side, slot: ref.slot, heroId, action: kind, target: planned });
    return;
  }
  const t = resolveTarget(ctx.s, planned);
  if (t && !sameRef(t, planned)) emit(ctx, { type: 'retarget', from: planned, to: t });
  if (!t) { skip(ctx, ref, 'no target'); return; }
  emit(ctx, { type: 'heroAction', side: ref.side, slot: ref.slot, heroId, action: kind, target: t });
  dealHit(ctx, ref, t, 1, 0, { single: true });
}

function doSwap(ctx: Ctx, ref: SlotRef, reserveIndex: 0 | 1 | 2): void {
  const sd = ctx.s.sides[ref.side];
  if (!isAlive(sd.reserve[reserveIndex])) { skip(ctx, ref, 'reserve dead'); return; }
  if (sd.flags.swapBanned) { skip(ctx, ref, 'swap banned'); return; }
  const out = removeStatus(sd.active[ref.slot], 'taunt');
  const incoming = sd.reserve[reserveIndex];
  emit(ctx, { type: 'heroAction', side: ref.side, slot: ref.slot, heroId: out.id, action: 'swap' });
  incoming.once[ENTERED_KEY] = ctx.s.round;
  sd.active[ref.slot] = incoming;
  sd.reserve[reserveIndex] = out;
  emit(ctx, { type: 'swap', side: ref.side, slot: ref.slot, reserveIndex, out: out.id, in: incoming.id });
}

/** Runs the planned action of the heroine standing in `ref` now (spec §2.5 step 6, §2.6). */
export function runHeroAction(ctx: Ctx, ref: SlotRef, action: HeroAction): void {
  const hero = heroAt(ctx.s, ref);
  if (!isAlive(hero)) { skip(ctx, ref, 'dead'); return; }
  if (hero.once[ENTERED_KEY] === ctx.s.round) { skip(ctx, ref, 'entered'); return; }
  switch (action.type) {
    case 'none':
      return;
    case 'swap':
      doSwap(ctx, ref, action.reserveIndex);
      return;
    case 'basic':
      attack(ctx, ref, 'basic', action.target);
      return;
    case 'skill':
    case 'ultimate':
      // TODO(Task 9): runAbility (costs, primitives). Until then skill/ultimate act as a basic hit.
      attack(ctx, ref, action.type, action.target);
      return;
  }
}
