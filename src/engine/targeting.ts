import type { HeroState, MatchState, Side, Slot, SlotRef } from './types';
import { hasStatus, isAlive } from './status';

const SLOTS: Slot[] = [0, 1, 2];

/** `redirectTo` status values: set by the cover card (2) and by Nerisa's skill (1). */
export const REDIRECT_NERISA = 1;
export const REDIRECT_COVER = 2;

export const ZEFIRA_INTERCEPT_KEY = 'zefira.intercept';
export const ZEFIRA_REDUCTION = 2;

export type InterceptReason = 'taunt' | 'cover' | 'nerisa' | 'zefira' | null;
export type InterceptResult = { target: SlotRef; reason: InterceptReason; reduction: number };

export function heroAt(state: MatchState, ref: SlotRef): HeroState {
  return state.sides[ref.side].active[ref.slot];
}

/** Mutates `state`; only for draft states inside resolve. */
export function setHeroAt(state: MatchState, ref: SlotRef, hero: HeroState): void {
  state.sides[ref.side].active[ref.slot] = hero;
}

export function other(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

/** Active slots of `side` whose hero is alive, in slot order. */
export function aliveActive(state: MatchState, side: Side): SlotRef[] {
  return SLOTS.filter(slot => isAlive(state.sides[side].active[slot])).map(slot => ({ side, slot }));
}

/**
 * Lowest-current-HP living active hero on the side OPPOSITE to `side`
 * (`side` is the attacker's side). Ties go to the lowest slot index.
 */
export function findLowestHpEnemy(state: MatchState, side: Side): SlotRef | null {
  let best: SlotRef | null = null;
  for (const ref of aliveActive(state, other(side))) {
    if (best === null || heroAt(state, ref).hp < heroAt(state, best).hp) best = ref;
  }
  return best;
}

/** Living target stays; a dead one falls to the lowest-HP living hero on its side; null if none. */
export function resolveTarget(state: MatchState, ref: SlotRef): SlotRef | null {
  if (isAlive(heroAt(state, ref))) return ref;
  return findLowestHpEnemy(state, other(ref.side));
}

/** Same active slot; `undefined` never matches. */
export function sameRef(a: SlotRef | undefined, b: SlotRef | undefined): boolean {
  return !!a && !!b && a.side === b.side && a.slot === b.slot;
}

/**
 * Single-hit interception chain (spec 2.6): Taunt -> cover card -> Nerisa -> Zefira passive.
 * The first applicable link wins. AoE hits must not call this.
 *
 * RESOLVE-TIME FUNCTION: it MUTATES the draft `state` - a fired `redirectTo` status is
 * consumed and Zefira's `once['zefira.intercept']` flag is set to the current round.
 * `target` must already be resolved (alive) and on the opposite side from `attacker`.
 */
export function interceptSingleHit(state: MatchState, attacker: SlotRef, target: SlotRef): InterceptResult {
  void attacker; // interception depends only on the target's side
  const side = target.side;
  const targetHero = heroAt(state, target);
  const alive = aliveActive(state, side);

  // 1. Taunt: first living taunter other than the target.
  const taunter = alive.find(ref => !sameRef(ref, target) && hasStatus(heroAt(state, ref), 'taunt'));
  if (taunter) return { target: taunter, reason: 'taunt', reduction: 0 };

  // 2-3. redirectTo: cover card (value 2) before Nerisa (value 1); array order within the same kind.
  for (const kind of [REDIRECT_COVER, REDIRECT_NERISA]) {
    const idx = targetHero.statuses.findIndex(st => {
      if (st.id !== 'redirectTo' || st.value !== kind || !st.source) return false;
      return !sameRef(st.source, target) && st.source.side === side && isAlive(heroAt(state, st.source));
    });
    const entry = targetHero.statuses[idx];
    if (entry?.source) {
      targetHero.statuses.splice(idx, 1);
      return { target: entry.source, reason: kind === REDIRECT_COVER ? 'cover' : 'nerisa', reduction: 0 };
    }
  }

  // 4. Zefira's passive: once per round, never for hits on herself.
  if (targetHero.id !== 'zefira') {
    const zRef = alive.find(ref => heroAt(state, ref).id === 'zefira');
    if (zRef) {
      const z = heroAt(state, zRef);
      if (z.once[ZEFIRA_INTERCEPT_KEY] !== state.round) {
        z.once[ZEFIRA_INTERCEPT_KEY] = state.round;
        return { target: zRef, reason: 'zefira', reduction: ZEFIRA_REDUCTION };
      }
    }
  }

  return { target, reason: null, reduction: 0 };
}
