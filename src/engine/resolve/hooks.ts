import { MAX_LUNA } from '../types';
import type { CardId, Side, Slot, SlotRef } from '../types';
import { CARDS } from '../data/cards';
import { effectiveAtk, hasStatus, isAlive } from '../status';
import { aliveActive, findLowestHpEnemy, heroAt, other, REDIRECT_NERISA, sameRef } from '../targeting';
import type { Ctx } from './context';
import { emit } from './context';
import { checkDeath, DEATH_KEY } from './endRound';
import { drawCard } from './deck';
import { replayCard } from './cards';
import {
  applyStatusTo, burnTickAmount, dealHit, directHit, grantShield, healHero, removeStatusFrom, takeInterception,
} from './effects';
import type { HitOpts } from './effects';

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

const below50 = (ctx: Ctx, ref: SlotRef): boolean => {
  const h = heroAt(ctx.s, ref);
  return h.hp * 2 < h.maxHp;
};

const AIRA_BURN_BONUS = 1;
const FENNA_FIRST_HEAL_BONUS = 2;
const FENNA_REVIVE_HP = 9;
const FENNA_REVIVE_SHIELD = 3;
const FENNA_NO_DEAD_HEAL = 5;
const NERISA_FIRST_HIT_REDUCTION = 3;
const TALI_TIDE_MOD = 0.9;
const ZEFIRA_REFLECT_CHARGES = 3;
const AURORA_AEGIS_REDUCTION = 1;
const AURORA_CARD_COST_UP = 1;
const JUSTINA_PURSUIT_SPD = 1;
const NOKTA_CURSE_BONUS = 1;
const NOKTA_FALLEN_DAMAGE = 3;
const KIRA_RAGE_BONUS = 2;
const KIRA_RUIN_MOD = 2.2;
const KIRA_BLOOD_MOON_BONUS = 4;
const MIRA_REBUILD_HEAL = 4;
const MIRA_REPEAT_DRAW = 2;
const SELENA_IMPULSE_BONUS = 2;
const SELENA_STARFALL_MOD = 0.8;
const SELENA_STARFALL_HITS = 3;

/** Options for a single hit dealt by an ability hook: the ability-level interception (R19) if any. */
function singleHit(p: HookPayload): HitOpts {
  return p.intercepted ? { single: true, intercepted: takeInterception(p.intercepted) } : { single: true };
}

/** Direct damage from an ability hook (spec §3.1): event `directDamage`, then the death check. */
function directFromHook(ctx: Ctx, source: SlotRef, target: SlotRef, amount: number, reason: string): void {
  const dmg = directHit(ctx, source, target, amount);
  emit(ctx, { type: 'directDamage', source, target, dmg, hp: heroAt(ctx.s, target).hp, reason });
  checkDeath(ctx, target, source);
}

/**
 * Fenna's ultimate: the most recent death of her side whose heroine is still dead comes back with
 * 9 HP, no statuses and Shield 3, in the slot where she lies (active or reserve). Returns false if
 * nobody qualifies.
 */
function reviveLastFallen(ctx: Ctx, self: SlotRef): boolean {
  const s = ctx.s;
  const sd = s.sides[self.side];
  for (let i = s.deaths.length - 1; i >= 0; i--) {
    const d = s.deaths[i]!;
    if (d.side !== self.side) continue;
    const isDead = (h: { id: string; hp: number }) => h.id === d.heroId && h.hp === 0;
    const slot = sd.active.findIndex(isDead);
    const reserveIndex = sd.reserve.findIndex(isDead);
    if (slot < 0 && reserveIndex < 0) continue;

    const dead = slot >= 0 ? sd.active[slot]! : sd.reserve[reserveIndex]!;
    const once = { ...dead.once };
    delete once[DEATH_KEY];
    // She comes back clean: statuses and any old shield are cleared before Shield 3 (controller ruling).
    const back = { ...dead, hp: FENNA_REVIVE_HP, shield: 0, shieldExpiresAtRound: null, statuses: [], once };
    if (slot >= 0) {
      sd.active[slot] = back;
      emit(ctx, { type: 'revive', side: self.side, heroId: back.id, hp: back.hp, slot });
      grantShield(ctx, self, { side: self.side, slot: slot as Slot }, FENNA_REVIVE_SHIELD);
    } else {
      sd.reserve[reserveIndex] = back;
      emit(ctx, { type: 'revive', side: self.side, heroId: back.id, hp: back.hp, reserveIndex });
      grantShield(ctx, self, { side: self.side, reserveIndex: reserveIndex as Slot }, FENNA_REVIVE_SHIELD);
    }
    return true;
  }
  return false;
}

/** Named hero logic (spec §6.2, §4.1). Card hooks (`card.*`) live in cardHooks.ts. */
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
  /** Passive «Жар» (burnTick): a Burn tick on an enemy of Aira deals +1. */
  'aira.burnBonus': (ctx, self, p) => {
    if (!p.target || !p.amount || p.target.side === self.side) return false;
    p.amount.v += AIRA_BURN_BONUS;
  },

  /**
   * Ultimate «Запретный дар» (after the 120% AoE): every burning enemy takes one extra Burn tick
   * at once, computed like the End Round tick (2 × stacks, +1 from «Жар» via `burnTick`).
   */
  'aira.detonate': (ctx, self) => {
    for (const t of aliveActive(ctx.s, other(self.side))) {
      const burn = heroAt(ctx.s, t).statuses.find(st => st.id === 'burn');
      if (!burn) continue;
      const dmg = directHit(ctx, self, t, burnTickAmount(ctx, t, burn.stacks));
      emit(ctx, { type: 'detonate', source: self, target: t, stacks: burn.stacks, dmg, hp: heroAt(ctx.s, t).hp });
      checkDeath(ctx, t, self);
    }
  },

  /** Ultimate «Из пепла»: revive the last fallen ally (9 HP, Shield 3); nobody dead → Heal 5 all active allies. */
  'fenna.revive': (ctx, self) => {
    if (reviveLastFallen(ctx, self)) return;
    for (const t of aliveActive(ctx.s, self.side)) healHero(ctx, self, t, FENNA_NO_DEAD_HEAL);
  },

  /** Passive «Каменная вода» (beforeTakeDamage, once per round): the first damage Nerisa takes −3. */
  'nerisa.firstHit': (ctx, self, p) => {
    if (!sameRef(p.target, self) || !p.reductions) return false;
    p.reductions.v += NERISA_FIRST_HIT_REDUCTION;
  },

  /** Passive «Морозная глубина» (afterDealDamage, once per round): Tali's first hit on a Soaked target → Freeze, Soak spent. */
  'tali.freezeSoaked': (ctx, self, p) => {
    const t = p.target;
    if (!sameRef(p.attacker, self) || !t) return false;
    const victim = heroAt(ctx.s, t);
    if (!isAlive(victim) || !hasStatus(victim, 'soak')) return false;
    removeStatusFrom(ctx, t, 'soak');
    applyStatusTo(ctx, self, t, 'freeze', 0, 'nextRound');
  },

  /**
   * Ultimate «Прилив»: 90% to every living enemy (AoE, no interception); then each living enemy that
   * had Soak before the ultimate gets Freeze (Soak spent), the others get Soak.
   */
  'tali.tide': (ctx, self) => {
    const s = ctx.s;
    const targets = aliveActive(s, other(self.side));
    const hadSoak = new Set(targets.filter(t => hasStatus(heroAt(s, t), 'soak')).map(t => t.slot));
    for (const t of targets) {
      if (!isAlive(heroAt(s, self))) break;
      if (isAlive(heroAt(s, t))) dealHit(ctx, self, t, TALI_TIDE_MOD, 0, { single: false });
    }
    for (const t of aliveActive(s, other(self.side))) {
      if (hadSoak.has(t.slot)) {
        removeStatusFrom(ctx, t, 'soak');
        applyStatusTo(ctx, self, t, 'freeze', 0, 'nextRound');
      } else {
        applyStatusTo(ctx, self, t, 'soak', 0, 'nextRound');
      }
    }
  },

  /**
   * Passive «Иллюзорный страж»: performed by interceptSingleHit (targeting.ts), which sets
   * `once['zefira.intercept']` itself. The trigger is kept as data; the hook never applies.
   */
  'zefira.intercept': () => false,

  /** Skill «Зеркальный щит» (after Shield 5): Mirror Shield this round; breaking the shield marks the attacker (dealHit). */
  'zefira.mirror': (ctx, self, p) => {
    const t = p.target;
    if (!t || !isAlive(heroAt(ctx.s, t))) return;
    applyStatusTo(ctx, self, t, 'mirrorShield', 0, 'thisRound');
  },

  /** Ultimate «Отражение»: Reflect with 3 charges until the end of the next round (applied in dealHit). */
  'zefira.reflect': (ctx, self) => {
    applyStatusTo(ctx, self, self, 'reflect', ZEFIRA_REFLECT_CHARGES, 'nextRound');
  },

  /** Ultimate «Непоколебимая» (after Shield 4 to all): the opponent's next card costs +1 until the end of the next round. */
  'aurora.unshaken': (ctx, self) => {
    const side = other(self.side);
    const untilRound = ctx.s.round + 1;
    ctx.s.sides[side].nextCardCostUp = { value: AURORA_CARD_COST_UP, untilRound };
    emit(ctx, { type: 'cardCostUp', source: self, side, value: AURORA_CARD_COST_UP, untilRound });
  },

  /**
   * Passive «Преследование» (onEnemyBuffed, once per round): an enemy got a Shield or buff → Justina
   * +1 SPD until the end of the next round (balance pass 1: the hero-phase order is fixed before a
   * buff granted in that phase, so a this-round bonus was lost in 43% of the cases).
   */
  'justina.pursuit': (ctx, self, p) => {
    const side = p.target?.side ?? p.side;
    if (side === undefined || side === self.side) return false;
    applyStatusTo(ctx, self, self, 'spd', JUSTINA_PURSUIT_SPD, 'nextRound');
  },

  /** Ultimate «Приговор» (after the 200% hit): the target died → Luna +1 (cap 5). */
  'justina.verdict': (ctx, self, p) => {
    if (!p.target || heroAt(ctx.s, p.target).hp > 0) return;
    const sd = ctx.s.sides[self.side];
    const before = sd.luna;
    sd.luna = Math.min(MAX_LUNA, sd.luna + 1);
    if (sd.luna !== before) {
      emit(ctx, { type: 'lunaChanged', side: self.side, luna: sd.luna, delta: sd.luna - before, reason: 'verdict' });
    }
  },

  /** Ultimate «Падшая» (after the 100% AoE): every living cursed enemy takes 3 direct damage and loses Curse. */
  'nokta.fallen': (ctx, self) => {
    for (const t of aliveActive(ctx.s, other(self.side))) {
      if (!hasStatus(heroAt(ctx.s, t), 'curse')) continue;
      directFromHook(ctx, self, t, NOKTA_FALLEN_DAMAGE, 'nokta.fallen');
      removeStatusFrom(ctx, t, 'curse');
    }
  },

  /** Ultimate «Разрушение»: 220% to one target; +4 flat during Kira's own Blood Moon. */
  'kira.ruin': (ctx, self, p) => {
    const t = p.target;
    if (!t || !isAlive(heroAt(ctx.s, t))) return;
    const flat = heroAt(ctx.s, self).bloodMoon ? KIRA_BLOOD_MOON_BONUS : 0;
    dealHit(ctx, self, t, KIRA_RUIN_MOD, flat, singleHit(p));
  },

  /** Skill «Перестройка»: ally Heal 4, then Draw 1. */
  'mira.rebuild': (ctx, self, p) => {
    if (p.target && isAlive(heroAt(ctx.s, p.target))) healHero(ctx, self, p.target, MIRA_REBUILD_HEAL);
    drawCard(ctx, self.side);
  },

  /** Ultimate «Повторение»: replay the side's last card (not Legendary) with the same target for free; else Draw 2. */
  'mira.repeat': (ctx, self) => {
    const last = ctx.s.sides[self.side].lastCardPlayed;
    if (!last || CARDS[last.cardId].rarity === 'legendary') {
      for (let i = 0; i < MIRA_REPEAT_DRAW; i++) drawCard(ctx, self.side);
      return;
    }
    replayCard(ctx, self.side, last.cardId, last.target, last.secondary);
  },

  /** Passive «Импульс» (onCardPlayed, payload.side): Selena's next hit this round +2. */
  'selena.impulse': (ctx, self, p) => {
    if ((p.side ?? p.source?.side) !== self.side) return false;
    applyStatusTo(ctx, self, self, 'nextHitBonus', SELENA_IMPULSE_BONUS, 'thisRound');
  },

  /**
   * Ultimate «Звездопад»: three 80% hits on the target. Once the target is dead the remaining hits
   * go to the lowest-HP living enemy (`retarget` event). Only the first hit receives the ability's
   * interception reduction; no hit is intercepted again (retargeted ones included).
   */
  'selena.starfall': (ctx, self, p) => {
    const s = ctx.s;
    let t = p.target;
    let retargeted = false;
    for (let i = 0; i < SELENA_STARFALL_HITS; i++) {
      if (!isAlive(heroAt(s, self))) return;
      if (!t || !isAlive(heroAt(s, t))) {
        const next = findLowestHpEnemy(s, self.side);
        if (!next) return;
        if (t) emit(ctx, { type: 'retarget', from: t, to: next });
        t = next;
        retargeted = true;
      }
      const opts: HitOpts = retargeted ? { single: true, intercepted: { reduction: 0 } } : singleHit(p);
      dealHit(ctx, self, t, SELENA_STARFALL_MOD, 0, opts);
    }
  },
};
