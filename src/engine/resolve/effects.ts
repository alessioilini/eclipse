import { BUFF_IDS } from '../types';
import type { Duration, Element, MoonPhase, SlotRef, StatusId } from '../types';
import { HEROES } from '../data/heroes';
import { elementMultiplier } from '../data/elements';
import {
  applyHeal, applyShield, applyToHero, computeDamage, healAmount, roundHalfUp, shieldAmount,
} from '../damage';
import { applyStatus, effectiveAtk, hasStatus, removeStatus, statusValue } from '../status';
import { heroAt, interceptSingleHit, setHeroAt } from '../targeting';
import type { Ctx } from './context';
import { emit } from './context';
import { checkDeath } from './endRound';
import { fire } from './triggers';

// Effects shared by primitives (actions.ts) and hooks (hooks.ts). `source` is the heroine causing
// the effect. Kept apart from actions.ts so that hooks never import actions.ts (no cycle).

const MARK_BONUS = 3;

const sameRef = (a: SlotRef, b: SlotRef): boolean => a.side === b.side && a.slot === b.slot;

/** Buff class (spec §3.4): BUFF_IDS, or SPD/ATK modifiers with a positive value. */
export function isBuff(id: StatusId, value: number): boolean {
  return BUFF_IDS.includes(id) || ((id === 'spd' || id === 'atk') && value > 0);
}

/** Spec §2.4: +1 to Dark at new moon, to Light/Star at full moon, to everyone at waning moon. */
function lunarDamageBonus(moon: MoonPhase, element: Element): number {
  if (moon === 'new' && element === 'dark') return 1;
  if (moon === 'full' && (element === 'light' || element === 'star')) return 1;
  if (moon === 'waning') return 1;
  return 0;
}

/**
 * Options of one hit. `single` hits are intercepted (spec §2.6) unless `intercepted` says the
 * interception chain already ran for this hit at ability level (controller ruling R19): then the
 * target is final and `intercepted.reduction` (Zefira's −2, or 0) is added to the reductions.
 */
export type HitOpts = { single: boolean; pierce?: boolean; intercepted?: { reduction: number } };

/**
 * Ability-level interception (ruling R19): the reduction still owed by the ability. Only the first
 * hit of the ability receives it; later hits get 0 and are not intercepted again.
 */
export type AbilityInterception = { reduction: number };

export function takeInterception(box: AbilityInterception): { reduction: number } {
  const reduction = box.reduction;
  box.reduction = 0;
  return { reduction };
}

/**
 * One hit from `attacker` on `target` (spec §3.1). Order: interception (single hits only, unless
 * already intercepted) → `beforeDealDamage` (passives add to `flat`) → `beforeTakeDamage`
 * (passives add to `reductions`, seen with the final target) → one-shot statuses (attacker's
 * Pierce / NextHitBonus, victim's DamageReduction, Mark on single hits) and the lunar bonus →
 * computeDamage → applyToHero → `damage` event → Mirror Shield → `afterDealDamage` → death check
 * → Reflect.
 */
export function dealHit(ctx: Ctx, attacker: SlotRef, target: SlotRef, mod: number, flat: number, opts: HitOpts): void {
  const s = ctx.s;
  let tgt = target;
  let reductions = 0;
  if (opts.intercepted) {
    reductions += opts.intercepted.reduction;
  } else if (opts.single) {
    const r = interceptSingleHit(s, attacker, target);
    if (!sameRef(r.target, target)) emit(ctx, { type: 'redirect', from: target, to: r.target, reason: r.reason });
    tgt = r.target;
    reductions += r.reduction;
  }

  const flatBox = { v: flat };
  const reductionBox = { v: 0 };
  fire(ctx, 'beforeDealDamage', { attacker, target: tgt, flat: flatBox });
  fire(ctx, 'beforeTakeDamage', { attacker, target: tgt, reductions: reductionBox });
  reductions += reductionBox.v;

  let att = heroAt(s, attacker);
  const attDef = HEROES[att.id];
  let totalFlat = flatBox.v + lunarDamageBonus(s.moon, attDef.element);
  let pierce = opts.pierce ?? false;
  if (hasStatus(att, 'pierce')) {
    totalFlat += statusValue(att, 'pierce');
    pierce = true;
    att = removeStatus(att, 'pierce');
  }
  if (hasStatus(att, 'nextHitBonus')) {
    totalFlat += statusValue(att, 'nextHitBonus');
    att = removeStatus(att, 'nextHitBonus');
  }
  setHeroAt(s, attacker, att);

  let victim = heroAt(s, tgt);
  const victimEl = HEROES[victim.id].element;
  const dr = statusValue(victim, 'damageReduction');
  if (dr !== 0) {
    reductions += dr;
    victim = removeStatus(victim, 'damageReduction');
  }
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
  const { hero: hit, absorbed } = applyToHero(victim, dmg, { pierce });
  const hpLoss = victim.hp - hit.hp; // overkill beyond the victim's HP is not HP loss
  setHeroAt(s, tgt, hit);
  emit(ctx, {
    type: 'damage', attacker, target: tgt, raw, flat: totalFlat, reductions,
    dmg, absorbed, hpLoss, hp: hit.hp, shield: hit.shield,
  });
  s.sides[attacker.side].damageDealt += hpLoss;
  mirrorShield(ctx, attacker, tgt, absorbed);
  fire(ctx, 'afterDealDamage', { attacker, target: tgt, amount: { v: hpLoss }, killed: hit.hp === 0 });
  checkDeath(ctx, tgt);
  reflect(ctx, attacker, tgt);
}

/** Zefira's skill: a hit that absorbed shield and left it at 0 breaks the Mirror Shield → Mark on the attacker. */
function mirrorShield(ctx: Ctx, attacker: SlotRef, target: SlotRef, absorbed: number): void {
  const victim = heroAt(ctx.s, target);
  const mirror = victim.statuses.find(st => st.id === 'mirrorShield');
  if (!mirror || absorbed <= 0 || victim.shield > 0) return;
  setHeroAt(ctx.s, target, removeStatus(victim, 'mirrorShield'));
  emit(ctx, { type: 'statusRemoved', target, status: 'mirrorShield' });
  applyStatusTo(ctx, mirror.source ?? target, attacker, 'mark', 0, 'permanent');
}

const REFLECT_DAMAGE = 2;

/**
 * Zefira's ultimate: a hit by an enemy on the side of a living active heroine holding `reflect`
 * (value = charges left) returns 2 direct damage to the attacker and spends one charge.
 */
function reflect(ctx: Ctx, attacker: SlotRef, target: SlotRef): void {
  const s = ctx.s;
  if (attacker.side === target.side || heroAt(s, attacker).hp <= 0) return;
  const holder = ([0, 1, 2] as const)
    .map(slot => ({ side: target.side, slot }))
    .find(ref => heroAt(s, ref).hp > 0 && statusValue(heroAt(s, ref), 'reflect') > 0);
  if (!holder) return;
  const h = heroAt(s, holder);
  const charges = statusValue(h, 'reflect') - 1;
  setHeroAt(s, holder, charges > 0
    ? { ...h, statuses: h.statuses.map(st => (st.id === 'reflect' ? { ...st, value: charges } : { ...st })) }
    : removeStatus(h, 'reflect'));
  const dmg = directHit(ctx, holder, attacker, REFLECT_DAMAGE);
  emit(ctx, { type: 'reflect', from: holder, to: attacker, dmg, charges, hp: heroAt(s, attacker).hp });
  if (charges <= 0) emit(ctx, { type: 'statusRemoved', target: holder, status: 'reflect' });
  checkDeath(ctx, attacker);
}

/**
 * Direct HP loss caused by a heroine (spec §3.1: no element, shield or reductions), counted in
 * her side's `damageDealt`. Returns the HP lost. The caller emits its own event and runs checkDeath.
 */
export function directHit(ctx: Ctx, source: SlotRef, target: SlotRef, amount: number): number {
  const s = ctx.s;
  const hero = heroAt(s, target);
  const hpLoss = Math.max(0, Math.min(amount, hero.hp));
  setHeroAt(s, target, { ...hero, hp: hero.hp - hpLoss, statuses: hero.statuses.map(st => ({ ...st })) });
  if (source.side !== target.side) s.sides[source.side].damageDealt += hpLoss;
  return hpLoss;
}

/** Applies a status, emits `statusApplied`; a buff fires `onEnemyBuffed` (Justina checks the side). */
export function applyStatusTo(
  ctx: Ctx, source: SlotRef, target: SlotRef, id: StatusId, value: number, duration: Duration,
): void {
  const s = ctx.s;
  setHeroAt(s, target, applyStatus(heroAt(s, target), { id, value, duration, round: s.round, source }));
  emit(ctx, { type: 'statusApplied', source, target, status: id, value });
  if (isBuff(id, value)) fire(ctx, 'onEnemyBuffed', { source, target });
}

/** Removes every instance of a status (if present) and emits `statusRemoved`. */
export function removeStatusFrom(ctx: Ctx, target: SlotRef, id: StatusId): void {
  const hero = heroAt(ctx.s, target);
  if (!hasStatus(hero, id)) return;
  setHeroAt(ctx.s, target, removeStatus(hero, id));
  emit(ctx, { type: 'statusRemoved', target, status: id });
}

/** Spec §3.3. `onHeal` fires first with a mutable base amount (Fenna's +2), then curse/eclipse/moon apply. */
export function healHero(ctx: Ctx, source: SlotRef, target: SlotRef, base: number): void {
  const s = ctx.s;
  const box = { v: base };
  fire(ctx, 'onHeal', { source, target, amount: box });
  const hero = heroAt(s, target);
  const amount = healAmount(box.v, hero, s.moon, s.round);
  const { hero: next, healed } = applyHeal(hero, amount);
  setHeroAt(s, target, next);
  emit(ctx, { type: 'heal', source, target, amount, healed, hp: next.hp });
}

/** Spec §3.3: shield with eclipse/moon modifiers; fires `onShieldGranted` and `onEnemyBuffed`. */
export function grantShield(ctx: Ctx, source: SlotRef, target: SlotRef, base: number): void {
  const s = ctx.s;
  const amount = shieldAmount(base, s.moon, s.round);
  const next = applyShield(heroAt(s, target), amount, s.round);
  setHeroAt(s, target, next);
  emit(ctx, { type: 'shield', source, target, amount, shield: next.shield });
  fire(ctx, 'onShieldGranted', { source, target });
  fire(ctx, 'onEnemyBuffed', { source, target });
}
