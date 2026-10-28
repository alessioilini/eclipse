import type { Element, HeroState, MoonPhase } from './types';
import { elementMultiplier } from './data/elements';
import { hasStatus, removeStatus } from './status';

const BLOOD_MOON_DAMAGE_MULT = 1.2;
export const ECLIPSE_ROUND = 7;
const ECLIPSE_DAMAGE_MULT = 1.25;
const ECLIPSE_HEAL_MULT = 0.5;
const ECLIPSE_SHIELD_MULT = 0.75;
const CURSE_HEAL_MULT = 0.5;

const ROUND_EPSILON = 1e-9;

/** Mathematical rounding, half up; epsilon absorbs float error (9*1.2*1.25 = 13.499999999999998). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5 + ROUND_EPSILON);
}

export type DamageInput = {
  atk: number; mod: number; attacker: Element; target: Element;
  flat: number; bloodMoon: boolean; round: number; reductions: number;
};

/** Spec §3.1 without the shield step; result is never below 1. */
export function computeDamage(i: DamageInput): number {
  const raw = roundHalfUp(i.atk * i.mod * elementMultiplier(i.attacker, i.target));
  const scaled = roundHalfUp(
    (raw + i.flat)
    * (i.bloodMoon ? BLOOD_MOON_DAMAGE_MULT : 1)
    * (i.round >= ECLIPSE_ROUND ? ECLIPSE_DAMAGE_MULT : 1),
  );
  return Math.max(1, scaled - i.reductions);
}

/** Shield, then HP. `undying` is true when Undying fired (and was consumed) on this hit. */
export function applyToHero(
  hero: HeroState, dmg: number, opts: { pierce?: boolean },
): { hero: HeroState; absorbed: number; hpLoss: number; undying: boolean } {
  const absorbed = opts.pierce ? 0 : Math.min(hero.shield, dmg);
  let hpLoss = dmg - absorbed;
  let next: HeroState = { ...hero, shield: hero.shield - absorbed, statuses: hero.statuses.map(s => ({ ...s })) };
  let undying = false;
  if (hero.hp > 0 && hasStatus(hero, 'undying') && hero.hp - hpLoss < 1) {
    hpLoss = hero.hp - 1;
    next = removeStatus(next, 'undying');
    undying = true;
  }
  next.hp = Math.max(0, hero.hp - hpLoss);
  return { hero: next, absorbed, hpLoss, undying };
}

/** Ignores shield, reductions and undying. */
export function directDamage(hero: HeroState, amount: number, floor = 0): { hero: HeroState; hpLoss: number } {
  const hpLoss = Math.max(0, Math.min(amount, hero.hp - floor));
  return { hero: { ...hero, hp: hero.hp - hpLoss, statuses: hero.statuses.map(s => ({ ...s })) }, hpLoss };
}

export function healAmount(base: number, hero: HeroState, moon: MoonPhase, round: number): number {
  const h = base
    * (hasStatus(hero, 'curse') ? CURSE_HEAL_MULT : 1)
    * (round >= ECLIPSE_ROUND ? ECLIPSE_HEAL_MULT : 1);
  const moonDelta = moon === 'waxing' ? 1 : moon === 'waning' ? -1 : 0;
  return Math.max(0, roundHalfUp(h) + moonDelta);
}

export function shieldAmount(base: number, moon: MoonPhase, round: number): number {
  return roundHalfUp(base * (round >= ECLIPSE_ROUND ? ECLIPSE_SHIELD_MULT : 1)) + (moon === 'waxing' ? 1 : 0);
}

export function applyHeal(hero: HeroState, amount: number): { hero: HeroState; healed: number } {
  const healed = Math.max(0, Math.min(amount, hero.maxHp - hero.hp));
  return { hero: { ...hero, hp: hero.hp + healed, statuses: hero.statuses.map(s => ({ ...s })) }, healed };
}

export function applyShield(hero: HeroState, amount: number, round: number): HeroState {
  return {
    ...hero,
    shield: hero.shield + amount,
    shieldExpiresAtRound: Math.max(hero.shieldExpiresAtRound ?? 0, round + 1),
    statuses: hero.statuses.map(s => ({ ...s })),
  };
}
