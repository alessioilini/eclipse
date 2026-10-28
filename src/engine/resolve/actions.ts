import { BUFF_IDS, MOON_ORDER } from '../types';
import type {
  Ability, Condition, Duration, Element, HeroAction, MoonPhase, Primitive, SlotRef, StatusId, TargetType,
} from '../types';
import { HEROES } from '../data/heroes';
import { elementMultiplier } from '../data/elements';
import {
  applyHeal, applyShield, applyToHero, computeDamage, directDamage, healAmount, roundHalfUp, shieldAmount,
} from '../damage';
import { applyStatus, cleanse, effectiveAtk, hasStatus, isAlive, removeStatus, statusValue } from '../status';
import {
  aliveActive, findLowestHpEnemy, heroAt, interceptSingleHit, other, resolveTarget, setHeroAt,
} from '../targeting';
import { ULTIMATE_ENERGY_COST, ultimateLunaCost } from '../validate';
import type { Ctx } from './context';
import { emit } from './context';
import { checkDeath } from './endRound';
import { fire } from './triggers';
import { HOOKS } from './hooks';
import { drawCard } from './deck';

const MARK_BONUS = 3;
const MAX_LUNA = 5;
const ENTERED_KEY = 'enteredRound';

export type AbilityKind = 'skill' | 'ultimate';

const sameRef = (a: SlotRef, b: SlotRef): boolean => a.side === b.side && a.slot === b.slot;

/** Buff class (spec §3.4): BUFF_IDS, or SPD/ATK modifiers with a positive value. */
function isBuff(id: StatusId, value: number): boolean {
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
 * One hit from `attacker` on `target` (spec §3.1). Order: interception (single hits only) →
 * `beforeDealDamage` (passives add to `flat`) → `beforeTakeDamage` (passives add to `reductions`,
 * seen with the final target) → one-shot statuses (attacker's Pierce / NextHitBonus, victim's
 * DamageReduction, Mark on single hits) and the lunar bonus → computeDamage → applyToHero →
 * `damage` event → `afterDealDamage` → death check.
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
  fire(ctx, 'afterDealDamage', { attacker, target: tgt, amount: { v: hpLoss }, killed: hit.hp === 0 });
  checkDeath(ctx, tgt);
}

// ---------------------------------------------------------------------------------------------
// Effects shared by primitives and hooks. `source` is the heroine causing the effect.

/** Applies a status, emits `statusApplied`; a buff fires `onEnemyBuffed` (Justina checks the side). */
export function applyStatusTo(
  ctx: Ctx, source: SlotRef, target: SlotRef, id: StatusId, value: number, duration: Duration,
): void {
  const s = ctx.s;
  setHeroAt(s, target, applyStatus(heroAt(s, target), { id, value, duration, round: s.round, source }));
  emit(ctx, { type: 'statusApplied', source, target, status: id, value });
  if (isBuff(id, value)) fire(ctx, 'onEnemyBuffed', { source, target });
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

// ---------------------------------------------------------------------------------------------
// Abilities as data (spec §6.2).

/** Spec §6.2 conditions; target conditions are false without a target. */
export function checkCondition(ctx: Ctx, c: Condition, actor: SlotRef, target?: SlotRef): boolean {
  const s = ctx.s;
  const t = target ? heroAt(s, target) : null;
  const me = heroAt(s, actor);
  switch (c.kind) {
    case 'targetHpBelow': return t !== null && t.hp * 100 < c.pct * t.maxHp;
    case 'targetHasStatus': return t !== null && hasStatus(t, c.status);
    case 'targetHasShieldOrBuff': return t !== null && (t.shield > 0 || t.statuses.some(st => isBuff(st.id, st.value)));
    case 'selfHpBelow': return me.hp * 100 < c.pct * me.maxHp;
    case 'moonIs': return s.moon === c.phase;
    case 'isBloodMoon': return me.bloodMoon;
    case 'oddRound': return s.round % 2 === 1;
  }
}

/**
 * Living heroines an ability's target type points at. `ally`/`enemy` take the target already
 * resolved by runAbility (retargeting happens once, there): a target that has died since is dropped.
 */
export function selectTargets(ctx: Ctx, actor: SlotRef, type: TargetType, target?: SlotRef): SlotRef[] {
  const s = ctx.s;
  switch (type) {
    case 'self': return isAlive(heroAt(s, actor)) ? [actor] : [];
    case 'ally':
    case 'enemy': return target && isAlive(heroAt(s, target)) ? [target] : [];
    case 'allies': return aliveActive(s, actor.side);
    case 'enemies': return aliveActive(s, other(actor.side));
    default: return [];
  }
}

function whoTargets(
  ctx: Ctx, actor: SlotRef, who: 'self' | 'target' | 'allies' | 'enemies' | undefined,
  type: TargetType, target: SlotRef | undefined,
): SlotRef[] {
  switch (who) {
    case 'self': return selectTargets(ctx, actor, 'self');
    case 'allies': return aliveActive(ctx.s, actor.side);
    case 'enemies': return aliveActive(ctx.s, other(actor.side));
    default: return selectTargets(ctx, actor, type, target);
  }
}

function inferType(actor: SlotRef, target?: SlotRef): TargetType {
  if (!target) return 'none';
  return target.side === actor.side ? 'ally' : 'enemy';
}

/**
 * Runs one primitive for `actor`. `type` is the ability's target type (it decides who `heal`,
 * non-AoE `damage` and `who: 'target'` hit); without it, it is inferred from `target`.
 */
export function runPrimitive(
  ctx: Ctx, actor: SlotRef, p: Primitive, target?: SlotRef, type: TargetType = inferType(actor, target),
): void {
  const s = ctx.s;
  switch (p.op) {
    case 'damage': {
      // AoE: living enemies at the start of the primitive (snapshot); never intercepted.
      const targets = p.aoe ? aliveActive(s, other(actor.side))
        : selectTargets(ctx, actor, type, target).filter(t => t.side !== actor.side);
      for (const t of targets) {
        for (let i = 0; i < (p.hits ?? 1); i++) {
          if (!isAlive(heroAt(s, t)) || !isAlive(heroAt(s, actor))) break;
          const mod = p.when && !checkCondition(ctx, p.when, actor, t) ? (p.elseMod ?? p.mod) : p.mod;
          dealHit(ctx, actor, t, mod, p.flat ?? 0, { single: !p.aoe });
        }
      }
      return;
    }
    case 'heal':
      for (const t of selectTargets(ctx, actor, type, target)) {
        const base = p.when && !checkCondition(ctx, p.when, actor, t) ? (p.elseAmount ?? p.amount) : p.amount;
        healHero(ctx, actor, t, base);
      }
      return;
    case 'shield':
      for (const t of whoTargets(ctx, actor, p.who, type, target)) grantShield(ctx, actor, t, p.amount);
      return;
    case 'status':
      for (const t of whoTargets(ctx, actor, p.who, type, target)) {
        if (p.when && !checkCondition(ctx, p.when, actor, t)) continue;
        applyStatusTo(ctx, actor, t, p.status, p.value ?? 0, p.duration);
      }
      return;
    case 'cleanse':
      for (const t of whoTargets(ctx, actor, p.who, type, target)) {
        const { hero, removed } = cleanse(heroAt(s, t), p.count);
        setHeroAt(s, t, hero);
        for (const status of removed) emit(ctx, { type: 'statusRemoved', target: t, status });
      }
      return;
    case 'moon': {
      const from = s.moon;
      const to = p.set ?? MOON_ORDER[(MOON_ORDER.indexOf(from) + (p.shift ?? 0) + MOON_ORDER.length) % MOON_ORDER.length]!;
      if (to === from) return;
      s.moon = to;
      s.roundFlags.moonShifted = true;
      emit(ctx, { type: 'moonChanged', from, to, by: actor });
      fire(ctx, 'onMoonShift', { source: actor });
      return;
    }
    case 'luna': {
      const sd = s.sides[actor.side];
      const before = sd.luna;
      sd.luna = Math.max(0, Math.min(MAX_LUNA, sd.luna + p.amount));
      if (sd.luna !== before) {
        emit(ctx, { type: 'lunaChanged', side: actor.side, luna: sd.luna, delta: sd.luna - before, reason: 'ability' });
      }
      return;
    }
    case 'draw':
      for (let i = 0; i < p.amount; i++) drawCard(ctx, actor.side);
      return;
    case 'selfHp': {
      if (p.amount >= 0) throw new Error('selfHp: only HP loss is supported');
      const { hero, hpLoss } = directDamage(heroAt(s, actor), -p.amount, 1);
      setHeroAt(s, actor, hero);
      emit(ctx, { type: 'selfHp', target: actor, hpLoss, hp: hero.hp });
      return;
    }
    case 'hook': {
      const fn = HOOKS[p.name];
      if (!fn) throw new Error('unknown hook: ' + p.name);
      fn(ctx, actor, target ? { target } : {});
      return;
    }
  }
}

/** Why a planned skill/ultimate cannot be performed at resolution time (spec §3.4, rulings), or null. */
function fizzleReason(ctx: Ctx, actor: SlotRef, ability: Ability, kind: AbilityKind): string | null {
  const s = ctx.s;
  const hero = heroAt(s, actor);
  const sd = s.sides[actor.side];
  if (hasStatus(hero, 'silence')) return 'silence';
  if (kind === 'skill' && hasStatus(hero, 'freeze')) return 'freeze';
  if (sd.energy < (kind === 'skill' ? ability.cost : ULTIMATE_ENERGY_COST)) return 'energy';
  if (kind === 'ultimate' && sd.luna < ultimateLunaCost(s, actor.side)) return 'luna';
  return null;
}

/**
 * Skill / ultimate (spec §2.3, §6.2). If the side can no longer perform it (price raised or
 * Freeze/Silence received after planning), it fizzles into a Basic Attack on the same enemy target
 * (lowest-HP enemy for other target types). Otherwise the single target is resolved once
 * (retarget), Energy (and for an ultimate Luna + `ultimateUsed`) is paid, `heroAction` is emitted
 * and the primitives run in order.
 */
export function runAbility(ctx: Ctx, actor: SlotRef, ability: Ability, target: SlotRef | undefined, kind: AbilityKind): void {
  const s = ctx.s;
  const hero = heroAt(s, actor);
  const reason = fizzleReason(ctx, actor, ability, kind);
  if (reason) {
    emit(ctx, { type: 'fizzle', side: actor.side, slot: actor.slot, heroId: hero.id, action: kind, reason });
    const fallback = target && target.side !== actor.side ? target : findLowestHpEnemy(s, actor.side) ?? undefined;
    basicAttack(ctx, actor, fallback);
    return;
  }

  let tgt: SlotRef | undefined;
  if (ability.target === 'ally' || ability.target === 'enemy') {
    const r = target ? resolveTarget(s, target) : null;
    if (r && target && !sameRef(r, target)) emit(ctx, { type: 'retarget', from: target, to: r });
    if (!r) { skip(ctx, actor, 'no target'); return; }
    tgt = r;
  }

  const sd = s.sides[actor.side];
  if (kind === 'skill') {
    sd.energy -= ability.cost;
  } else {
    const luna = ultimateLunaCost(s, actor.side);
    sd.energy -= ULTIMATE_ENERGY_COST;
    sd.luna -= luna;
    setHeroAt(s, actor, { ...heroAt(s, actor), ultimateUsed: true });
    emit(ctx, { type: 'lunaChanged', side: actor.side, luna: sd.luna, delta: -luna, reason: 'ultimate' });
  }
  emit(ctx, {
    type: 'heroAction', side: actor.side, slot: actor.slot, heroId: hero.id, action: kind,
    ...(tgt ? { target: tgt } : {}),
  });
  for (const p of ability.effects) runPrimitive(ctx, actor, p, tgt, ability.target);
}

// ---------------------------------------------------------------------------------------------
// Hero actions.

function skip(ctx: Ctx, ref: SlotRef, reason: string): void {
  emit(ctx, { type: 'heroAction', side: ref.side, slot: ref.slot, heroId: heroAt(ctx.s, ref).id, action: 'skipped', reason });
}

/** Basic Attack (spec §2.3) on a planned enemy slot, retargeted if that slot is dead (spec §2.6). */
function basicAttack(ctx: Ctx, ref: SlotRef, planned: SlotRef | undefined): void {
  const t = planned ? resolveTarget(ctx.s, planned) : null;
  if (t && planned && !sameRef(t, planned)) emit(ctx, { type: 'retarget', from: planned, to: t });
  if (!t) { skip(ctx, ref, 'no target'); return; }
  emit(ctx, { type: 'heroAction', side: ref.side, slot: ref.slot, heroId: heroAt(ctx.s, ref).id, action: 'basic', target: t });
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
  const def = HEROES[hero.id];
  switch (action.type) {
    case 'none':
      return;
    case 'swap':
      doSwap(ctx, ref, action.reserveIndex);
      return;
    case 'basic':
      basicAttack(ctx, ref, action.target);
      return;
    case 'skill':
      runAbility(ctx, ref, def.skill, action.target, 'skill');
      return;
    case 'ultimate':
      runAbility(ctx, ref, def.ultimate, action.target, 'ultimate');
      return;
  }
}
