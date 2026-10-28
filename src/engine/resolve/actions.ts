import type { Ability, Condition, HeroAction, Primitive, SlotRef, TargetType } from '../types';
import { HEROES } from '../data/heroes';
import { directDamage } from '../damage';
import { hasStatus, isAlive, removeStatus } from '../status';
import {
  aliveActive, findLowestHpEnemy, heroAt, interceptSingleHit, other, resolveTarget, sameRef, setHeroAt,
} from '../targeting';
import { ULTIMATE_ENERGY_COST, ultimateLunaCost } from '../validate';
import type { Ctx } from './context';
import { emit, ENTERED_KEY, nextAction } from './context';
import { HOOKS } from './hooks';
import { drawCard } from './deck';
import {
  applyStatusTo, basicAttack, changeMoon, cleanseFrom, dealHit, gainLuna, grantShield, healHero, isBuff,
  skipAction, takeInterception,
} from './effects';
import type { AbilityInterception } from './effects';

export type AbilityKind = 'skill' | 'ultimate';


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
 * `intercepted` is set when the ability already ran the interception chain (ruling R19): single
 * hits then go to `target` as is; without it a single hit is intercepted inside dealHit.
 */
export function runPrimitive(
  ctx: Ctx, actor: SlotRef, p: Primitive, target?: SlotRef, type: TargetType = inferType(actor, target),
  intercepted?: AbilityInterception,
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
          const opts = p.aoe ? { single: false }
            : intercepted ? { single: true, intercepted: takeInterception(intercepted) } : { single: true };
          dealHit(ctx, actor, t, mod, p.flat ?? 0, opts);
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
      for (const t of whoTargets(ctx, actor, p.who, type, target)) cleanseFrom(ctx, t, p.count);
      return;
    case 'moon':
      changeMoon(ctx, p, actor);
      return;
    case 'luna':
      gainLuna(ctx, actor.side, p.amount, 'ability');
      return;
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
      fn(ctx, actor, { ...(target ? { target } : {}), ...(intercepted ? { intercepted } : {}) });
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
 * (retarget), Energy (and for an ultimate Luna + `ultimateUsed`) is paid, `heroAction` is emitted,
 * an enemy single target is intercepted once (R19) and the primitives run in order.
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
    if (!r) { skipAction(ctx, actor, 'no target'); return; }
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

  // Ruling R19: a single-target enemy ability is intercepted once, here; the victim is the target
  // of every primitive (damage conditions, statuses, hooks), and dealHit does not intercept again.
  let intercepted: AbilityInterception | undefined;
  if (ability.target === 'enemy' && tgt) {
    const r = interceptSingleHit(s, actor, tgt);
    if (!sameRef(r.target, tgt)) emit(ctx, { type: 'redirect', from: tgt, to: r.target, reason: r.reason });
    tgt = r.target;
    intercepted = { reduction: r.reduction };
  }
  for (const p of ability.effects) runPrimitive(ctx, actor, p, tgt, ability.target, intercepted);
}

// ---------------------------------------------------------------------------------------------
// Hero actions.

function doSwap(ctx: Ctx, ref: SlotRef, reserveIndex: 0 | 1 | 2): void {
  const sd = ctx.s.sides[ref.side];
  if (!isAlive(sd.reserve[reserveIndex])) { skipAction(ctx, ref, 'reserve dead'); return; }
  if (sd.flags.swapBanned) { skipAction(ctx, ref, 'swap banned'); return; }
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
  nextAction(ctx);
  const hero = heroAt(ctx.s, ref);
  if (!isAlive(hero)) { skipAction(ctx, ref, 'dead'); return; }
  if (hero.once[ENTERED_KEY] === ctx.s.round) { skipAction(ctx, ref, 'entered'); return; }
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
