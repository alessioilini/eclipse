import { BUFF_IDS, MAX_LUNA, MOON_ORDER } from '../types';
import type { CardId, Duration, Element, HeroState, MoonPhase, Side, Slot, SlotRef, StatusId } from '../types';
import { HEROES } from '../data/heroes';
import { elementMultiplier } from '../data/elements';
import {
  applyHeal, applyShield, applyToHero, computeDamage, healAmount, roundHalfUp, shieldAmount,
} from '../damage';
import { applyStatus, cleanse, effectiveAtk, hasStatus, removeStatus, statusValue } from '../status';
import { heroAt, interceptSingleHit, resolveTarget, sameRef, setHeroAt } from '../targeting';
import type { Ctx } from './context';
import { emit, ENTERED_KEY } from './context';
import { checkDeath } from './endRound';
import { fire } from './triggers';

// Effects shared by primitives (actions.ts), hooks (hooks.ts) and cards (cards.ts, cardHooks.ts).
// `source` is the heroine causing the effect, or a card. Kept apart from actions.ts so that hooks
// and cards never import actions.ts (no cycle).

/** A tactic card as the source of an effect (it has no slot). */
export type CardSource = { side: Side; card: CardId };
/** Who causes an effect: a heroine in an active slot, or a card played by a side. */
export type Source = SlotRef | CardSource;

export const isSlotSource = (src: Source): src is SlotRef => 'slot' in src;

const MARK_BONUS = 3;

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
  const consumed: { target: SlotRef; status: StatusId }[] = [];
  if (hasStatus(att, 'pierce')) {
    totalFlat += statusValue(att, 'pierce');
    pierce = true;
    att = removeStatus(att, 'pierce');
    consumed.push({ target: attacker, status: 'pierce' });
  }
  if (hasStatus(att, 'nextHitBonus')) {
    totalFlat += statusValue(att, 'nextHitBonus');
    att = removeStatus(att, 'nextHitBonus');
    consumed.push({ target: attacker, status: 'nextHitBonus' });
  }
  setHeroAt(s, attacker, att);

  let victim = heroAt(s, tgt);
  const victimEl = HEROES[victim.id].element;
  const dr = statusValue(victim, 'damageReduction');
  if (dr !== 0) {
    reductions += dr;
    victim = removeStatus(victim, 'damageReduction');
    consumed.push({ target: tgt, status: 'damageReduction' });
  }
  if (opts.single && hasStatus(victim, 'mark')) {
    totalFlat += MARK_BONUS;
    victim = removeStatus(victim, 'mark');
    consumed.push({ target: tgt, status: 'mark' });
  }
  for (const c of consumed) emit(ctx, { type: 'statusRemoved', ...c, reason: 'consumed' });

  const atk = effectiveAtk(att);
  const raw = roundHalfUp(atk * mod * elementMultiplier(attDef.element, victimEl));
  const dmg = computeDamage({
    atk, mod, attacker: attDef.element, target: victimEl,
    flat: totalFlat, bloodMoon: att.bloodMoon, round: s.round, reductions,
  });
  const { hero: hit, absorbed, undying } = applyToHero(victim, dmg, { pierce });
  const hpLoss = victim.hp - hit.hp; // overkill beyond the victim's HP is not HP loss
  setHeroAt(s, tgt, hit);
  emit(ctx, {
    type: 'damage', attacker, target: tgt, attackerId: att.id, targetId: victim.id, raw, flat: totalFlat, reductions,
    dmg, absorbed, hpLoss, hp: hit.hp, shield: hit.shield,
  });
  if (undying) emit(ctx, { type: 'statusRemoved', target: tgt, status: 'undying', reason: 'consumed' });
  s.sides[attacker.side].damageDealt += hpLoss;
  mirrorShield(ctx, attacker, tgt, absorbed);
  fire(ctx, 'afterDealDamage', { attacker, target: tgt, amount: { v: hpLoss }, killed: hit.hp === 0 });
  checkDeath(ctx, tgt, attacker);
  reflect(ctx, attacker, tgt);
}

/** Zefira's skill: a hit that absorbed shield and left it at 0 breaks the Mirror Shield → Mark on the attacker. */
function mirrorShield(ctx: Ctx, attacker: SlotRef, target: SlotRef, absorbed: number): void {
  const victim = heroAt(ctx.s, target);
  const mirror = victim.statuses.find(st => st.id === 'mirrorShield');
  if (!mirror || absorbed <= 0 || victim.shield > 0) return;
  setHeroAt(ctx.s, target, removeStatus(victim, 'mirrorShield'));
  emit(ctx, { type: 'statusRemoved', target, status: 'mirrorShield', reason: 'consumed' });
  applyStatusTo(ctx, mirror.source ?? target, attacker, 'mark', 0, 'permanent');
}

const REFLECT_DAMAGE = 2;
const REFLECT_ROUND_KEY = 'zefira.reflectRound';
const REFLECT_SEQ_KEY = 'zefira.reflectSeq';

/**
 * Zefira's ultimate: an enemy ACTION (ruling: «каждая атака противника» = one action, however many
 * hits) on the side of a living active heroine holding `reflect` (value = charges left) returns
 * 2 direct damage to the attacker and spends one charge. The first hit of the action triggers it;
 * the holder's `once` remembers (round, ctx.actionSeq) so further hits of that action do not.
 */
function reflect(ctx: Ctx, attacker: SlotRef, target: SlotRef): void {
  const s = ctx.s;
  if (attacker.side === target.side || heroAt(s, attacker).hp <= 0) return;
  const holder = ([0, 1, 2] as const)
    .map(slot => ({ side: target.side, slot }))
    .find(ref => heroAt(s, ref).hp > 0 && statusValue(heroAt(s, ref), 'reflect') > 0);
  if (!holder) return;
  const h = heroAt(s, holder);
  if (h.once[REFLECT_ROUND_KEY] === s.round && h.once[REFLECT_SEQ_KEY] === ctx.actionSeq) return;
  h.once[REFLECT_ROUND_KEY] = s.round;
  h.once[REFLECT_SEQ_KEY] = ctx.actionSeq;
  const charges = statusValue(h, 'reflect') - 1;
  setHeroAt(s, holder, charges > 0
    ? { ...h, statuses: h.statuses.map(st => (st.id === 'reflect' ? { ...st, value: charges } : { ...st })) }
    : removeStatus(h, 'reflect'));
  const dmg = directHit(ctx, holder, attacker, REFLECT_DAMAGE);
  emit(ctx, { type: 'reflect', from: holder, to: attacker, dmg, charges, hp: heroAt(s, attacker).hp });
  if (charges <= 0) emit(ctx, { type: 'statusRemoved', target: holder, status: 'reflect', reason: 'consumed' });
  checkDeath(ctx, attacker, holder);
}

/**
 * Direct HP loss caused by a heroine or a card (spec §3.1: no element, shield or reductions), counted
 * in the source side's `damageDealt`. Returns the HP lost. The caller emits its own event and runs checkDeath.
 */
export function directHit(ctx: Ctx, source: Source, target: SlotRef, amount: number): number {
  const s = ctx.s;
  const hero = heroAt(s, target);
  const hpLoss = Math.max(0, Math.min(amount, hero.hp));
  setHeroAt(s, target, { ...hero, hp: hero.hp - hpLoss, statuses: hero.statuses.map(st => ({ ...st })) });
  if (source.side !== target.side) s.sides[source.side].damageDealt += hpLoss;
  return hpLoss;
}

/**
 * Applies a status, emits `statusApplied`; a buff fires `onEnemyBuffed` (Justina checks the side).
 * Only a heroine is stored as the status `source` (redirectTo, mirrorShield need a slot).
 */
export function applyStatusTo(
  ctx: Ctx, source: Source, target: SlotRef, id: StatusId, value: number, duration: Duration,
): void {
  const s = ctx.s;
  const slotSource = isSlotSource(source) ? source : undefined;
  setHeroAt(s, target, applyStatus(heroAt(s, target), {
    id, value, duration, round: s.round, ...(slotSource ? { source: slotSource } : {}),
  }));
  emit(ctx, { type: 'statusApplied', source, target, status: id, value });
  if (isBuff(id, value)) fire(ctx, 'onEnemyBuffed', slotSource ? { source: slotSource, target } : { target });
}

/** Removes every instance of a status (if present) and emits `statusRemoved`. */
export function removeStatusFrom(ctx: Ctx, target: SlotRef, id: StatusId): void {
  const hero = heroAt(ctx.s, target);
  if (!hasStatus(hero, id)) return;
  setHeroAt(ctx.s, target, removeStatus(hero, id));
  emit(ctx, { type: 'statusRemoved', target, status: id });
}

/** Spec §3.3. `onHeal` fires first with a mutable base amount (Fenna's +2), then curse/eclipse/moon apply. */
export function healHero(ctx: Ctx, source: Source, target: SlotRef, base: number): void {
  const s = ctx.s;
  const box = { v: base };
  fire(ctx, 'onHeal', isSlotSource(source) ? { source, target, amount: box } : { target, amount: box });
  const hero = heroAt(s, target);
  const amount = healAmount(box.v, hero, s.moon, s.round);
  const { hero: next, healed } = applyHeal(hero, amount);
  setHeroAt(s, target, next);
  emit(ctx, { type: 'heal', source, target, amount, healed, hp: next.hp });
}

/** A heroine in a reserve slot (Fenna's revive can shield her there). */
export type ReserveRef = { side: Side; reserveIndex: Slot };

const isReserve = (r: SlotRef | ReserveRef): r is ReserveRef => 'reserveIndex' in r;

/**
 * Spec §3.3: shield with eclipse/moon modifiers; fires `onShieldGranted` and `onEnemyBuffed`.
 * A reserve heroine is described by `side` + `reserveIndex` in the event and by `side` in the payload.
 */
export function grantShield(ctx: Ctx, source: SlotRef, target: SlotRef | ReserveRef, base: number): void {
  const s = ctx.s;
  const amount = shieldAmount(base, s.moon, s.round);
  const sd = s.sides[target.side];
  const hero: HeroState = isReserve(target) ? sd.reserve[target.reserveIndex] : heroAt(s, target);
  const next = applyShield(hero, amount, s.round);
  if (isReserve(target)) sd.reserve[target.reserveIndex] = next;
  else setHeroAt(s, target, next);
  const who = isReserve(target) ? { side: target.side, reserveIndex: target.reserveIndex } : { target };
  emit(ctx, { type: 'shield', source, ...who, amount, shield: next.shield });
  const payload = isReserve(target) ? { source, side: target.side } : { source, target };
  fire(ctx, 'onShieldGranted', payload);
  fire(ctx, 'onEnemyBuffed', payload);
}

const BURN_PER_STACK = 2;

/**
 * Damage of one Burn tick on `ref`: 2 per stack, then `burnTick` fires with the mutable amount
 * (Aira's «Жар» +1). Used by the End Round tick and by Aira's ultimate (one extra tick).
 */
export function burnTickAmount(ctx: Ctx, ref: SlotRef, stacks: number): number {
  const amount = { v: BURN_PER_STACK * stacks };
  fire(ctx, 'burnTick', { target: ref, amount });
  return amount.v;
}

/** Cleanse `count` debuffs (spec §3.4 order) from `target`; `statusRemoved` per removed status. */
export function cleanseFrom(ctx: Ctx, target: SlotRef, count: number): void {
  const { hero, removed } = cleanse(heroAt(ctx.s, target), count);
  setHeroAt(ctx.s, target, hero);
  for (const status of removed) emit(ctx, { type: 'statusRemoved', target, status });
}

/**
 * Moon shift by ±1 phase or to a set phase (spec §2.4). A change sets `roundFlags.moonShifted`,
 * emits `moonChanged` and fires `onMoonShift`; the same phase is not a shift (ruling R20).
 */
export function changeMoon(ctx: Ctx, change: { shift?: -1 | 1; set?: MoonPhase }, by: Source): void {
  const s = ctx.s;
  const from = s.moon;
  const to = change.set
    ?? MOON_ORDER[(MOON_ORDER.indexOf(from) + (change.shift ?? 0) + MOON_ORDER.length) % MOON_ORDER.length]!;
  if (to === from) return;
  s.moon = to;
  s.roundFlags.moonShifted = true;
  emit(ctx, { type: 'moonChanged', from, to, by });
  fire(ctx, 'onMoonShift', isSlotSource(by) ? { source: by } : { side: by.side });
}

/** Luna ± `amount` for `side`, clamped to 0..5; `lunaChanged` when it changed. */
export function gainLuna(ctx: Ctx, side: Side, amount: number, reason: string): void {
  const sd = ctx.s.sides[side];
  const before = sd.luna;
  sd.luna = Math.max(0, Math.min(MAX_LUNA, sd.luna + amount));
  if (sd.luna !== before) emit(ctx, { type: 'lunaChanged', side, luna: sd.luna, delta: sd.luna - before, reason });
}

/** `heroAction` with `action: 'skipped'` for the heroine in `ref`. */
export function skipAction(ctx: Ctx, ref: SlotRef, reason: string): void {
  emit(ctx, { type: 'heroAction', side: ref.side, slot: ref.slot, heroId: heroAt(ctx.s, ref).id, action: 'skipped', reason });
}

/** Basic Attack (spec §2.3) on a planned enemy slot, retargeted if that slot is dead (spec §2.6). */
export function basicAttack(ctx: Ctx, ref: SlotRef, planned: SlotRef | undefined): void {
  const t = planned ? resolveTarget(ctx.s, planned) : null;
  if (t && planned && !sameRef(t, planned)) emit(ctx, { type: 'retarget', from: planned, to: t });
  if (!t) { skipAction(ctx, ref, 'no target'); return; }
  emit(ctx, { type: 'heroAction', side: ref.side, slot: ref.slot, heroId: heroAt(ctx.s, ref).id, action: 'basic', target: t });
  dealHit(ctx, ref, t, 1, 0, { single: true });
}

/**
 * Exchanges the active heroine in `slot` with reserve heroine `reserveIndex` (spec §2.6): the
 * outgoing one loses Taunt, the incoming one is marked as entered this round (she does not act),
 * event `swap` (with `reason` for card swaps). Callers check that the reserve heroine is alive.
 */
export function swapIn(ctx: Ctx, side: Side, slot: Slot, reserveIndex: Slot, reason?: string): void {
  const sd = ctx.s.sides[side];
  const out = removeStatus(sd.active[slot], 'taunt');
  const incoming = sd.reserve[reserveIndex];
  incoming.once[ENTERED_KEY] = ctx.s.round;
  sd.active[slot] = incoming;
  sd.reserve[reserveIndex] = out;
  emit(ctx, { type: 'swap', side, slot, reserveIndex, out: out.id, in: incoming.id, ...(reason ? { reason } : {}) });
}
