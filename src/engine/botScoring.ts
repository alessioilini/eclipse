import { DEBUFF_ORDER } from './types';
import type { Ability, CardPlay, Condition, HeroAction, HeroState, Primitive, Side, SideCommands, Slot, StatusId } from './types';
import type { OwnView, PublicState } from './view';
import { HEROES } from './data/heroes';
import { elementMultiplier } from './data/elements';
import { computeDamage, healAmount, shieldAmount } from './damage';
import { effectiveAtk, hasStatus, isAlive, statusValue } from './status';
import { other } from './targeting';
import { cardCost, energyBudget, ULTIMATE_ENERGY_COST } from './validate';
import { isBuff } from './resolve/effects';

// Weights (spec §6.4): lethal > save > ultimate > element edge > raw damage.
export const KILL = 100;
export const DAMAGE_PER_HP = 1;
export const SAVE_ALLY = 60;
export const ULTIMATE = 15;
export const ELEMENT_EDGE = 5;
export const WASTED_ENERGY = -1;
export const SWAP_PENALTY = -10;
export const HEAL_PER_HP = 1;
export const SHIELD_PER_POINT = 0.8;
/** Tie-breaker: a hit on a wounded target is worth up to this much more (spec §6.4 item 5). */
const LOW_HP_FOCUS = 2;
const ELEMENT_EDGE_MULT = 1.15;
const REVIVE = 40;
const DRAW = 2;
const LUNA = 3;
const BLOOD_PACT_HP = 4;
export const BLOOD_PACT_ENERGY = 2;
const USELESS = -100;
const AURORA_AEGIS = 1;
const TICK_DAMAGE = 3; // aira.detonate: one burn tick with Aira's +1
const FALLEN_DAMAGE = 3; // nokta.fallen: direct damage per cursed target
const BASTION_SHIELD = 6; // Aurora's skill shield, granted together with her Taunt

/** Hook-only damage abilities (no `damage` primitive in data): per-hit mod, hits, AoE. */
const HOOK_DAMAGE: Record<string, { mod: number; hits: number; aoe: boolean }> = {
  'kira.ruin': { mod: 2.2, hits: 1, aoe: false },
  'selena.starfall': { mod: 0.8, hits: 3, aoe: false },
  'tali.tide': { mod: 0.9, hits: 1, aoe: true },
};
/** Fixed values of hooks with no damage of their own. */
const HOOK_VALUE: Record<string, number> = {
  'zefira.reflect': 6, 'zefira.mirror': 1, 'aurora.unshaken': 3, 'aira.burnMaxAtk': 2, 'mira.repeat': 2 * DRAW,
};
const STATUS_VALUE: Partial<Record<StatusId, number>> = {
  burn: 3, soak: 2, freeze: 4, silence: 3, curse: 2, mark: 3, spd: 1, atk: 2, damageReduction: 3, pierce: 2, undying: 3,
};

/** Predicted outcome of the commands planned so far. Arrays are indexed by active slot. */
export type Plan = {
  view: PublicState; side: Side; foe: Side;
  pool: number[];       // enemy HP + Shield still standing
  allyHp: number[];     // own HP after planned heals
  need: number[];       // protection a threatened ally still lacks (0 = not threatened)
  saved: boolean[];
  swappedOut: boolean[];
  attacked: boolean[];  // enemy slot hit by a planned single-target attack
  attackers: boolean[]; // own slot plans a single-target attack
  energy: number;       // Energy spent
};

/** The planning side's full state; the view hides only the opponent. */
export function ownSide(view: PublicState, side: Side): OwnView {
  const s = view.sides[side];
  if (!('hand' in s)) throw new Error(`bot: side ${side} cannot see its own hand`);
  return s;
}

const actives = (view: PublicState, side: Side): HeroState[] => view.sides[side].active;

/** Single-hit damage before shields: computeDamage with flat 0 and the reductions visible on the board. */
function hitDamage(view: PublicState, attacker: HeroState, mod: number, target: HeroState, targetSide: Side, slot: number): number {
  const aurora = actives(view, targetSide)
    .some((h, i) => i !== slot && h.id === 'aurora' && h.hp * 2 > h.maxHp);
  return computeDamage({
    atk: effectiveAtk(attacker), mod, attacker: HEROES[attacker.id].element, target: HEROES[target.id].element,
    flat: 0, bloodMoon: attacker.bloodMoon, round: view.round,
    reductions: statusValue(target, 'damageReduction') + (aurora ? AURORA_AEGIS : 0),
  });
}

/** Enemy hits counted as a threat: the opponent rarely lands more than two single hits on one slot per round. */
const THREAT_ATTACKERS = 2;

/**
 * Threat on `hero` (standing in `slot`): the Basic Attacks of the two strongest living enemies,
 * minus her shield. Balance pass 1: the sum over all three enemies flagged a third of the board
 * as threatened while the opponent spreads its hits (three hits on one slot in 9% of rounds).
 */
export function incomingOn(view: PublicState, side: Side, hero: HeroState, slot: number): number {
  const foe = other(side);
  const hits = actives(view, foe).filter(isAlive)
    .map(e => hitDamage(view, e, 1, hero, side, slot))
    .sort((a, b) => b - a)
    .slice(0, THREAT_ATTACKERS);
  const sum = hits.reduce((acc, h) => acc + h, 0);
  return Math.max(0, sum - hero.shield);
}

export function newPlan(view: PublicState, side: Side): Plan {
  const foe = other(side);
  const mine = actives(view, side);
  const need = mine.map((h, i) => {
    if (!isAlive(h) || hasStatus(h, 'undying')) return 0;
    const incoming = incomingOn(view, side, h, i);
    return incoming >= h.hp ? incoming - h.hp + 1 : 0;
  });
  return {
    view, side, foe,
    pool: actives(view, foe).map(h => (isAlive(h) ? h.hp + h.shield : 0)),
    allyHp: mine.map(h => h.hp), need,
    saved: [false, false, false], swappedOut: [false, false, false],
    attacked: [false, false, false], attackers: [false, false, false], energy: 0,
  };
}

export function clonePlan(p: Plan): Plan {
  return { ...p, pool: [...p.pool], allyHp: [...p.allyHp], need: [...p.need], saved: [...p.saved],
    swappedOut: [...p.swappedOut], attacked: [...p.attacked], attackers: [...p.attackers] };
}

export const isThreatened = (p: Plan, k: number): boolean => p.need[k]! > 0 && !p.saved[k] && !p.swappedOut[k];

/** Adds protection to own slot `k`; SAVE_ALLY when it covers what the ally still lacks. */
function protect(p: Plan, k: number, amount: number): number {
  if (!isThreatened(p, k)) return 0;
  p.need[k] = Math.max(0, p.need[k]! - amount);
  if (p.need[k] === 0) { p.saved[k] = true; return SAVE_ALLY; }
  return 0;
}

function saveOutright(p: Plan, k: number): number {
  if (!isThreatened(p, k)) return 0;
  p.saved[k] = true;
  return SAVE_ALLY;
}

/** A living enemy with Taunt pulls single hits aimed at others. */
function singleTarget(p: Plan, slot: number): number {
  const taunter = actives(p.view, p.foe).findIndex((h, i) => i !== slot && isAlive(h) && hasStatus(h, 'taunt'));
  return taunter >= 0 ? taunter : slot;
}

function strike(p: Plan, attacker: HeroState, mod: number, aimed: number, aoe: boolean): number {
  const slot = aoe ? aimed : singleTarget(p, aimed);
  const pool = p.pool[slot] ?? 0;
  if (pool <= 0) return 0;
  const target = actives(p.view, p.foe)[slot]!;
  const dmg = hitDamage(p.view, attacker, mod, target, p.foe, slot);
  const dealt = Math.min(dmg, hasStatus(target, 'undying') ? pool - 1 : pool);
  p.pool[slot] = pool - dealt;
  let v = dealt * DAMAGE_PER_HP + LOW_HP_FOCUS * (1 - pool / (target.maxHp + target.shield));
  if (p.pool[slot]! <= 0) v += KILL;
  if (!aoe) {
    p.attacked[slot] = true;
    if (elementMultiplier(HEROES[attacker.id].element, HEROES[target.id].element) >= ELEMENT_EDGE_MULT) v += ELEMENT_EDGE;
  }
  return v;
}

/** Damage that ignores shields (hooks, cards). */
function direct(p: Plan, slot: number, amount: number): number {
  const pool = p.pool[slot] ?? 0;
  if (pool <= 0 || amount <= 0) return 0;
  const dealt = Math.min(amount, pool);
  p.pool[slot] = pool - dealt;
  return dealt * DAMAGE_PER_HP + (p.pool[slot]! <= 0 ? KILL : 0);
}

function heal(p: Plan, k: number, base: number): number {
  const hero = actives(p.view, p.side)[k];
  if (!hero || !isAlive(hero) || p.swappedOut[k]) return 0;
  const healed = Math.min(healAmount(base, hero, p.view.moon, p.view.round), hero.maxHp - p.allyHp[k]!);
  p.allyHp[k] = p.allyHp[k]! + healed;
  return healed * HEAL_PER_HP + protect(p, k, healed);
}

function shield(p: Plan, k: number, base: number): number {
  const hero = actives(p.view, p.side)[k];
  if (!hero || !isAlive(hero) || p.swappedOut[k]) return 0;
  const amount = shieldAmount(base, p.view.moon, p.view.round);
  return amount * SHIELD_PER_POINT + protect(p, k, amount);
}

function conditionMet(p: Plan, c: Condition, self: HeroState, target: HeroState | undefined): boolean {
  switch (c.kind) {
    case 'targetHpBelow': return !!target && target.hp * 100 < target.maxHp * c.pct;
    case 'selfHpBelow': return self.hp * 100 < self.maxHp * c.pct;
    case 'targetHasStatus': return !!target && hasStatus(target, c.status);
    case 'targetHasShieldOrBuff': return !!target && (target.shield > 0 || target.statuses.some(s => isBuff(s.id, s.value)));
    case 'moonIs': return p.view.moon === c.phase;
    case 'isBloodMoon': return self.bloodMoon;
    case 'oddRound': return p.view.round % 2 === 1;
  }
}

const livingFoes = (p: Plan): number[] => [0, 1, 2].filter(i => (p.pool[i] ?? 0) > 0);
const livingMine = (p: Plan): number[] => [0, 1, 2].filter(i => isAlive(actives(p.view, p.side)[i]!) && !p.swappedOut[i]);

/** Value of one primitive of `slot`'s ability aimed at `aim` (enemy or own slot, by target type). */
function primitive(p: Plan, slot: number, e: Primitive, aim: number | undefined): number {
  const hero = actives(p.view, p.side)[slot]!;
  const foeHero = aim === undefined ? undefined : actives(p.view, p.foe)[aim];
  const allyHero = aim === undefined ? undefined : actives(p.view, p.side)[aim];
  switch (e.op) {
    case 'damage': {
      const targets = e.aoe ? livingFoes(p) : aim === undefined ? [] : [aim];
      let v = 0;
      for (const t of targets) {
        const met = !e.when || conditionMet(p, e.when, hero, actives(p.view, p.foe)[t]);
        for (let h = 0; h < (e.hits ?? 1); h++) v += strike(p, hero, met ? e.mod : (e.elseMod ?? e.mod), t, !!e.aoe);
      }
      return v;
    }
    case 'heal': {
      const met = !e.when || conditionMet(p, e.when, hero, allyHero);
      return aim === undefined ? 0 : heal(p, aim, met ? e.amount : (e.elseAmount ?? e.amount));
    }
    case 'shield': {
      const who = e.who === 'allies' ? livingMine(p) : e.who === 'self' ? [slot] : aim === undefined ? [] : [aim];
      return who.reduce((v, k) => v + shield(p, k, e.amount), 0);
    }
    case 'status': {
      if (e.when && !conditionMet(p, e.when, hero, foeHero ?? allyHero)) return 0;
      if (e.status === 'taunt') return tauntSave(p, slot);
      const n = e.who === 'enemies' ? livingFoes(p).length : e.who === 'allies' ? livingMine(p).length : 1;
      return (STATUS_VALUE[e.status] ?? 1) * n;
    }
    case 'cleanse': return 2 * e.count;
    case 'moon': return 1;
    case 'luna': return LUNA * e.amount;
    case 'draw': return DRAW * e.amount;
    case 'selfHp': return Math.max(e.amount, 1 - hero.hp) * HEAL_PER_HP;
    case 'hook': return hookValue(p, slot, e.name, aim);
  }
}

/** Taunt on `slot` (Aurora): saves every threatened ally if the guardian outlasts the whole enemy row. */
function tauntSave(p: Plan, slot: number): number {
  const g = actives(p.view, p.side)[slot]!;
  if (incomingOn(p.view, p.side, g, slot) >= p.allyHp[slot]! + shieldAmount(BASTION_SHIELD, p.view.moon, p.view.round)) return 1;
  return [0, 1, 2].filter(k => k !== slot).reduce((v, k) => v + saveOutright(p, k), 1);
}

function hookValue(p: Plan, slot: number, name: string, aim: number | undefined): number {
  const hero = actives(p.view, p.side)[slot]!;
  const dmg = HOOK_DAMAGE[name];
  if (dmg) {
    const targets = dmg.aoe ? livingFoes(p) : aim === undefined ? [] : [aim];
    let v = 0;
    for (const t of targets) {
      for (let h = 0; h < dmg.hits; h++) {
        // Starfall: hits after a kill move to the weakest living enemy (spec §4.1).
        const alive = livingFoes(p);
        const to = (p.pool[t] ?? 0) > 0 || dmg.aoe || alive.length === 0 ? t : alive.reduce((a, b) => (p.pool[a]! <= p.pool[b]! ? a : b));
        v += strike(p, hero, dmg.mod, to, dmg.aoe);
      }
    }
    return v + (name === 'tali.tide' ? (STATUS_VALUE.soak ?? 0) * targets.length : 0);
  }
  const foes = actives(p.view, p.foe);
  switch (name) {
    case 'aira.detonate':
      return livingFoes(p).reduce((v, t) => v + direct(p, t, hasStatus(foes[t]!, 'burn') ? TICK_DAMAGE : 0), 0);
    case 'nokta.fallen':
      return livingFoes(p).reduce((v, t) => v + direct(p, t, hasStatus(foes[t]!, 'curse') ? FALLEN_DAMAGE : 0), 0);
    case 'fenna.revive': {
      const own = ownSide(p.view, p.side);
      if ([...own.active, ...own.reserve].some(h => !isAlive(h))) return REVIVE;
      return livingMine(p).reduce((v, k) => v + heal(p, k, 5), 0);
    }
    case 'mira.rebuild': return (aim === undefined ? 0 : heal(p, aim, 4)) + DRAW;
    case 'nerisa.guard': return aim === undefined || aim === slot ? 0 : saveOutright(p, aim);
    default: return HOOK_VALUE[name] ?? 0;
  }
}

/** Value of an ability; an offensive one with no known damage counts as 1.0×ATK per target. */
function ability(p: Plan, slot: number, ab: Ability, aim: number | undefined): number {
  let v = 0;
  for (const e of ab.effects) v += primitive(p, slot, e, aim);
  const hasDamage = ab.effects.some(e => e.op === 'damage' || (e.op === 'hook' && e.name in HOOK_DAMAGE));
  if (!hasDamage && (ab.target === 'enemy' || ab.target === 'enemies')) {
    const aoe = ab.target === 'enemies';
    const targets = aoe ? livingFoes(p) : aim === undefined ? [] : [aim];
    for (const t of targets) v += strike(p, actives(p.view, p.side)[slot]!, 1, t, aoe);
  }
  return v;
}

/** Scores `action` of own `slot` and records its predicted outcome in `p`. */
export function scoreAction(p: Plan, slot: Slot, action: HeroAction): number {
  const hero = actives(p.view, p.side)[slot]!;
  if (!isAlive(hero)) return 0;
  const def = HEROES[hero.id];
  const aim = action.type !== 'none' && action.type !== 'swap' ? action.target?.slot : undefined;
  switch (action.type) {
    case 'none': return 0;
    case 'basic': p.attackers[slot] = true; return strike(p, hero, 1, action.target.slot, false);
    case 'swap': {
      const incoming = ownSide(p.view, p.side).reserve[action.reserveIndex];
      const wasThreatened = isThreatened(p, slot);
      p.swappedOut[slot] = true;
      if (wasThreatened && incoming && incomingOn(p.view, p.side, incoming, slot) < incoming.hp) {
        p.saved[slot] = true;
        return SAVE_ALLY;
      }
      return SWAP_PENALTY;
    }
    case 'skill':
      p.energy += def.skill.cost;
      if (def.skill.target === 'enemy') p.attackers[slot] = true;
      return ability(p, slot, def.skill, aim);
    case 'ultimate': {
      p.energy += ULTIMATE_ENERGY_COST;
      if (def.ultimate.target === 'enemy') p.attackers[slot] = true;
      const v = ability(p, slot, def.ultimate, aim);
      return v > 0 ? v + ULTIMATE : v;
    }
  }
}

const hasDebuff = (h: HeroState): boolean =>
  h.statuses.some(s => DEBUFF_ORDER.includes(s.id) || ((s.id === 'spd' || s.id === 'atk') && s.value < 0));

/** Scores a card play after the actions are planned (spec §6.4: played only when the value is > 0). */
export function scoreCard(p: Plan, play: CardPlay, actions: HeroAction[]): number {
  const own = ownSide(p.view, p.side);
  const id = own.hand[play.handIndex];
  if (id === undefined) return USELESS;
  p.energy += cardCost(p.view, p.side, id);
  const k = play.target?.slot;
  const ally = k === undefined ? undefined : own.active[k];
  const foe = k === undefined ? undefined : actives(p.view, p.foe)[k];
  const lirayaActive = livingMine(p).some(i => own.active[i]!.id === 'liraya');
  switch (id) {
    case 'lunarDash': case 'breakRhythm': return 2;
    case 'wardCircle': return k === undefined ? 0 : 4 * SHIELD_PER_POINT + protect(p, k, 4);
    case 'fieldKit': return k === undefined ? 0 : heal(p, k, 4);
    case 'healingWave': return livingMine(p).reduce((v, i) => v + heal(p, i, 3), 0);
    case 'unseal': return ally && hasDebuff(ally) ? 3 : 0;
    case 'huntersMark': return k !== undefined && p.attacked[k] ? 3 : 1;
    case 'emergencySwap': {
      const sec = play.secondary;
      const incoming = sec && 'reserveIndex' in sec ? own.reserve[sec.reserveIndex] : undefined;
      if (k === undefined || !incoming || actions[k]?.type === 'swap') return 0;
      return incomingOn(p.view, p.side, incoming, k) < incoming.hp ? saveOutright(p, k) : 0;
    }
    case 'lunarSpark': return own.luna < 5 ? 4 : 0;
    case 'reserveImpulse': return DRAW;
    case 'piercingStrike': return k !== undefined && p.attackers[k] ? 3 : 0;
    case 'cover': {
      const sec = play.secondary;
      const g = sec && 'slot' in sec ? sec.slot : undefined;
      if (k === undefined || g === undefined || g === k) return 0;
      const guardian = own.active[g]!;
      return incomingOn(p.view, p.side, guardian, g) < p.allyHp[g]! ? saveOutright(p, k) : 0;
    }
    case 'warCry': return livingMine(p).length;
    case 'moonTurn': case 'moonReverse': return lirayaActive ? 2 : 0;
    case 'dispel': return actives(p.view, p.foe).some(h => isAlive(h) && h.shield > 0) ? 3 : 0;
    case 'bloodPact': {
      if (!ally) return USELESS;
      const usesBonus = p.energy > energyBudget(p.view, p.side);
      return usesBonus ? -Math.min(BLOOD_PACT_HP, ally.hp - 1) * HEAL_PER_HP : USELESS;
    }
    case 'ashTrail': return 4;
    case 'swapBan': case 'eclipse': return 2;
    case 'deferredDeath': return k === undefined ? 0 : saveOutright(p, k);
    case 'lastWord': return k !== undefined && isThreatened(p, k) ? 3 : 0;
    case 'rewriteFate': {
      const first = [0, 1, 2].find(i => isThreatened(p, i));
      return first === undefined ? 0 : saveOutright(p, first);
    }
    case 'sealBreak': return k === undefined || !foe ? 0 : direct(p, k, 2 + foe.shield);
  }
}

/** Heuristic value of a full command set for `side` (spec §6.4); higher is better. */
export function scoreCommands(view: PublicState, side: Side, cmds: SideCommands): number {
  const p = newPlan(view, side);
  let v = 0;
  cmds.actions.forEach((a, i) => { v += scoreAction(p, i as Slot, a); });
  let budget = energyBudget(view, side);
  if (cmds.card) {
    v += scoreCard(p, cmds.card, cmds.actions);
    if (ownSide(view, side).hand[cmds.card.handIndex] === 'bloodPact') budget += BLOOD_PACT_ENERGY;
  }
  return v + WASTED_ENERGY * Math.max(0, budget - p.energy);
}
