import { BUFF_IDS, DEBUFF_ORDER } from './types';
import type { Duration, HeroState, SlotRef, Status, StatusId } from './types';
import { HEROES } from './data/heroes';

const MAX_BURN_STACKS = 3;
const FREEZE_SPD_PENALTY = 3;
const BLOOD_MOON_SPD_BONUS = 2;

export function expiresAt(round: number, d: Duration): number | null {
  switch (d) {
    case 'thisRound': return round;
    case 'nextRound': return round + 1;
    case 'permanent': return null;
  }
}

/** null (never expires) counts as later than any number. */
function laterExpiry(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.max(a, b);
}

const isModifier = (id: StatusId): boolean => id === 'spd' || id === 'atk';
/** Statuses kept as separate entries: SPD/ATK modifiers and `redirectTo` (ruling R9: cover and Nerisa coexist). */
const isAppended = (id: StatusId): boolean => isModifier(id) || id === 'redirectTo';

export function applyStatus(
  hero: HeroState,
  s: { id: StatusId; value?: number; duration: Duration; round: number; source?: SlotRef },
): HeroState {
  const value = s.value ?? 0;
  const expires = expiresAt(s.round, s.duration);
  const make = (): Status => {
    const st: Status = { id: s.id, value, stacks: 1, expiresAtRound: expires };
    if (s.source) st.source = s.source;
    return st;
  };
  const existing = hero.statuses.findIndex(x => x.id === s.id);
  const old = hero.statuses[existing];

  if (isAppended(s.id) || !old) {
    return { ...hero, statuses: [...hero.statuses.map(x => ({ ...x })), make()] };
  }
  let next: Status;
  if (s.id === 'burn') {
    if (old.stacks >= MAX_BURN_STACKS) return { ...hero, statuses: hero.statuses.map(x => ({ ...x })) };
    next = { ...old, stacks: old.stacks + 1, expiresAtRound: laterExpiry(old.expiresAtRound, expires) };
  } else {
    next = { ...make(), expiresAtRound: laterExpiry(old.expiresAtRound, expires) };
  }
  return { ...hero, statuses: hero.statuses.map((x, i) => (i === existing ? next : { ...x })) };
}

export function removeStatus(hero: HeroState, id: StatusId): HeroState {
  return { ...hero, statuses: hero.statuses.filter(s => s.id !== id).map(s => ({ ...s })) };
}

export function hasStatus(hero: HeroState, id: StatusId): boolean {
  return hero.statuses.some(s => s.id === id);
}

export function statusValue(hero: HeroState, id: StatusId): number {
  return hero.statuses.filter(s => s.id === id).reduce((sum, s) => sum + s.value, 0);
}

export function cleanse(hero: HeroState, count: number): { hero: HeroState; removed: StatusId[] } {
  let statuses = hero.statuses.map(s => ({ ...s }));
  const removed: StatusId[] = [];
  for (const id of DEBUFF_ORDER) {
    if (removed.length >= count) break;
    if (statuses.some(s => s.id === id)) {
      statuses = statuses.filter(s => s.id !== id);
      removed.push(id);
    }
  }
  while (removed.length < count) {
    const i = statuses.findIndex(s => isModifier(s.id) && s.value < 0);
    const found = statuses[i];
    if (!found) break;
    removed.push(found.id);
    statuses = statuses.filter((_, j) => j !== i);
  }
  return { hero: { ...hero, statuses }, removed };
}

export function removeBuffs(hero: HeroState): HeroState {
  return {
    ...hero,
    statuses: hero.statuses
      .filter(s => !BUFF_IDS.includes(s.id) && !(isModifier(s.id) && s.value > 0))
      .map(s => ({ ...s })),
  };
}

export function expireStatuses(hero: HeroState, round: number): HeroState {
  const shieldExpired = hero.shieldExpiresAtRound === round;
  return {
    ...hero,
    statuses: hero.statuses.filter(s => s.expiresAtRound !== round).map(s => ({ ...s })),
    shield: shieldExpired ? 0 : hero.shield,
    shieldExpiresAtRound: shieldExpired ? null : hero.shieldExpiresAtRound,
  };
}

export function effectiveSpd(hero: HeroState): number {
  const v = HEROES[hero.id].spd + statusValue(hero, 'spd')
    - (hasStatus(hero, 'freeze') ? FREEZE_SPD_PENALTY : 0)
    + (hero.bloodMoon ? BLOOD_MOON_SPD_BONUS : 0);
  return Math.max(0, v);
}

export function effectiveAtk(hero: HeroState): number {
  return Math.max(0, HEROES[hero.id].atk + statusValue(hero, 'atk'));
}

export function isAlive(hero: HeroState): boolean {
  return hero.hp > 0;
}
