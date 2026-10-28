import type { CardId, Side, Slot, SlotRef } from '../types';
import { effectiveAtk, hasStatus, isAlive } from '../status';
import { aliveActive, heroAt, other, REDIRECT_NERISA } from '../targeting';
import type { Ctx } from './context';
import { applyStatusTo } from './effects';

/**
 * Data passed to a hook. Mutable boxes (`amount`, `flat`, `reductions`) let passives change a value
 * before it is applied. `source` is who caused the event (healer, shield giver, moon shifter),
 * `attacker`/`target` describe a hit, `killed` is set on `afterDealDamage`.
 */
export type HookPayload = {
  source?: SlotRef; attacker?: SlotRef; target?: SlotRef;
  amount?: { v: number }; flat?: { v: number }; reductions?: { v: number };
  card?: CardId; secondary?: SlotRef | { reserveIndex: Slot }; killed?: boolean;
  /** Side of the event when no active slot describes it (`onCardPlayed`, a buff on a reserve heroine). */
  side?: Side;
  /** Ability hooks: the ability already ran the interception chain (R19); see AbilityInterception. */
  intercepted?: { reduction: number };
};
/** Returning `false` means "did not apply": a `once` trigger is then not consumed. */
export type HookFn = (ctx: Ctx, self: SlotRef, payload: HookPayload) => boolean | void;

const sameRef = (a: SlotRef | undefined, b: SlotRef): boolean => !!a && a.side === b.side && a.slot === b.slot;
const below50 = (ctx: Ctx, ref: SlotRef): boolean => {
  const h = heroAt(ctx.s, ref);
  return h.hp * 2 < h.maxHp;
};

const FENNA_FIRST_HEAL_BONUS = 2;
const NOKTA_CURSE_BONUS = 1;
const KIRA_RAGE_BONUS = 2;
const AURORA_AEGIS_REDUCTION = 1;

/** Named hero/card logic (spec §6.2). Task 9: the hooks its tests need; Task 10–11 add the rest. */
export const HOOKS: Record<string, HookFn> = {
  /** Skill «Ларец бедствий»: Burn on the living enemy with the highest effective ATK (ties: lowest slot). */
  'aira.burnMaxAtk': (ctx, self) => {
    let best: SlotRef | null = null;
    for (const ref of aliveActive(ctx.s, other(self.side))) {
      if (best === null || effectiveAtk(heroAt(ctx.s, ref)) > effectiveAtk(heroAt(ctx.s, best))) best = ref;
    }
    if (best) applyStatusTo(ctx, self, best, 'burn', 0, 'permanent');
  },

  /** Passive «Тепло» (onHeal, once per round): Fenna's first heal of the round +2. */
  'fenna.firstHeal': (ctx, self, p) => {
    if (!sameRef(p.source, self) || !p.amount) return false;
    p.amount.v += FENNA_FIRST_HEAL_BONUS;
  },

  /** Skill «Защитница» (after the shield primitive): the next single hit on the ally goes to Nerisa this round. */
  'nerisa.guard': (ctx, self, p) => {
    const t = p.target;
    if (!t || sameRef(t, self) || !isAlive(heroAt(ctx.s, t))) return;
    applyStatusTo(ctx, self, t, 'redirectTo', REDIRECT_NERISA, 'thisRound');
  },

  /** Passive «Лунный ветер» (onMoonShift, once per round via the trigger): +1 ATK until the end of the round. */
  'liraya.moonWind': (ctx, self) => {
    applyStatusTo(ctx, self, self, 'atk', 1, 'thisRound');
  },

  /** Passive «Свет защиты» (beforeTakeDamage): while Aurora's HP > 50%, damage to other allies −1. */
  'aurora.aegis': (ctx, self, p) => {
    const t = p.target;
    if (!t || !p.reductions || t.side !== self.side || sameRef(t, self)) return false;
    const me = heroAt(ctx.s, self);
    if (me.hp * 2 <= me.maxHp) return false;
    p.reductions.v += AURORA_AEGIS_REDUCTION;
  },

  /** Passive «Порча» (beforeDealDamage): Nokta's damage to a cursed target +1. */
  'nokta.cursedBonus': (ctx, self, p) => {
    if (!sameRef(p.attacker, self) || !p.target || !p.flat) return false;
    if (!hasStatus(heroAt(ctx.s, p.target), 'curse')) return false;
    p.flat.v += NOKTA_CURSE_BONUS;
  },

  /** Passive «Ярость» (beforeDealDamage): below 50% HP Kira's damage +2. */
  'kira.rage': (ctx, self, p) => {
    if (!sameRef(p.attacker, self) || !p.flat || !below50(ctx, self)) return false;
    p.flat.v += KIRA_RAGE_BONUS;
  },
};
