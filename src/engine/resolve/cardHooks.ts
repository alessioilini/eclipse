import type { CardId, Side, Slot, SlotRef } from '../types';
import { directDamage } from '../damage';
import { removeBuffs } from '../status';
import { aliveActive, heroAt, other, REDIRECT_COVER, setHeroAt } from '../targeting';
import type { Ctx } from './context';
import { emit } from './context';
import { checkDeath } from './endRound';
import { applyStatusTo, basicAttack, changeMoon, directHit, isBuff, swapIn } from './effects';
import type { CardSource } from './effects';

/** A card being resolved: its id and the targets already checked by cards.ts (alive, enemy retargeted). */
export type CardHookPlay = { cardId: CardId; target?: SlotRef; secondary?: SlotRef | { reserveIndex: Slot } };
/** Named card logic (`op: 'hook'`, names `card.*`): runs for `side`, the side that plays the card. */
export type CardHookFn = (ctx: Ctx, side: Side, play: CardHookPlay) => void;

const BLOOD_PACT_HP_LOSS = 4;
const BLOOD_PACT_ENERGY = 2;
const ASH_TRAIL_TARGETS = 2;
const ECLIPSE_ULT_LUNA = 1;
const SEAL_BREAK_DAMAGE = 2;

const src = (side: Side, cardId: CardId): CardSource => ({ side, cardId });
const isSlotRef = (x: CardHookPlay['secondary']): x is SlotRef => !!x && 'slot' in x;

/** Shield of `target` to 0 (an effect that says «снять Shield»); `shieldRemoved` if there was one. */
function removeShield(ctx: Ctx, target: SlotRef): void {
  const hero = heroAt(ctx.s, target);
  if (hero.shield <= 0) return;
  setHeroAt(ctx.s, target, { ...hero, shield: 0, shieldExpiresAtRound: null });
  emit(ctx, { type: 'shieldRemoved', target, amount: hero.shield });
}

/** Card hooks (spec §4.2). Reactions waiting for a trigger are resolved in reactions.ts. */
export const CARD_HOOKS: Record<string, CardHookFn> = {
  /**
   * «Экстренная замена»: swap of the own slot with a reserve heroine without spending the slot's
   * action. The incoming heroine at once makes a Basic Attack on the enemy planned for the slot
   * (basic/skill/ultimate with an enemy target), otherwise nothing; the slot's planned action is
   * cancelled (swapIn marks her as entered this round, so runHeroAction skips the slot).
   */
  'card.emergencySwap': (ctx, side, { target, secondary }) => {
    if (!target || !secondary || !('reserveIndex' in secondary)) return;
    swapIn(ctx, side, target.slot, secondary.reserveIndex, 'emergencySwap');
    const planned = ctx.cmds?.[side].actions[target.slot];
    const enemyTarget = planned && (planned.type === 'basic' || planned.type === 'skill' || planned.type === 'ultimate')
      && planned.target && planned.target.side !== side ? planned.target : undefined;
    if (enemyTarget) basicAttack(ctx, target, enemyTarget);
  },

  /** «Прикрытие»: the next single hit on the ally goes to the chosen Guardian this round (R8/R10). */
  'card.cover': (ctx, side, { target, secondary }) => {
    if (!target || !isSlotRef(secondary)) return;
    void side;
    applyStatusTo(ctx, secondary, target, 'redirectTo', REDIRECT_COVER, 'thisRound');
  },

  /** «Рассеивание»: Shield 0 on every living active enemy. */
  'card.dispel': (ctx, side) => {
    for (const t of aliveActive(ctx.s, other(side))) removeShield(ctx, t);
  },

  /**
   * «Кровавая сделка»: the ally loses 4 HP (not below 1); the side gets +2 Energy this round. The
   * validator already allowed planning with the +2; `energy` was set at Round Start without it.
   */
  'card.bloodPact': (ctx, side, { cardId, target }) => {
    if (!target) return;
    const s = ctx.s;
    const { hero, hpLoss } = directDamage(heroAt(s, target), BLOOD_PACT_HP_LOSS, 1);
    setHeroAt(s, target, hero);
    emit(ctx, { type: 'directDamage', source: src(side, cardId), target, dmg: hpLoss, hp: hero.hp, reason: 'bloodPact' });
    const sd = s.sides[side];
    sd.flags.energyBonus += BLOOD_PACT_ENERGY;
    sd.energy += BLOOD_PACT_ENERGY;
    emit(ctx, { type: 'energyChanged', side, energy: sd.energy, delta: BLOOD_PACT_ENERGY, reason: 'bloodPact' });
  },

  /** «Пепельный след»: Burn on the two living enemies with the highest current HP (ties: lower slot). */
  'card.ashTrail': (ctx, side, { cardId }) => {
    const s = ctx.s;
    const targets = aliveActive(s, other(side))
      .sort((x, y) => (heroAt(s, y).hp - heroAt(s, x).hp) || (x.slot - y.slot))
      .slice(0, ASH_TRAIL_TARGETS);
    for (const t of targets) applyStatusTo(ctx, src(side, cardId), t, 'burn', 0, 'permanent');
  },

  /** «Запрет замены»: the opponent's swap actions this round are skipped (runHeroAction: 'swap banned'). */
  'card.swapBan': (ctx, side) => {
    const foe = other(side);
    ctx.s.sides[foe].flags.swapBanned = true;
    emit(ctx, { type: 'swapBanned', side: foe });
  },

  /** «Затмение»: the moon becomes new (a shift if it was not); ultimates of both sides cost +1 Luna this round. */
  'card.eclipse': (ctx, side, { cardId }) => {
    changeMoon(ctx, { set: 'new' }, src(side, cardId));
    ctx.s.roundFlags.ultLunaDelta = ECLIPSE_ULT_LUNA;
    emit(ctx, { type: 'ultCostUp', luna: ECLIPSE_ULT_LUNA });
  },

  /** «Разрыв печати»: remove the enemy's Shield and all buffs, then 2 direct damage. */
  'card.sealBreak': (ctx, side, { cardId, target }) => {
    if (!target) return;
    const s = ctx.s;
    removeShield(ctx, target);
    const before = heroAt(s, target);
    const buffs = [...new Set(before.statuses.filter(st => isBuff(st.id, st.value)).map(st => st.id))];
    setHeroAt(s, target, removeBuffs(before));
    for (const status of buffs) emit(ctx, { type: 'statusRemoved', target, status });
    const source = src(side, cardId);
    const dmg = directHit(ctx, source, target, SEAL_BREAK_DAMAGE);
    emit(ctx, { type: 'directDamage', source, target, dmg, hp: heroAt(s, target).hp, reason: 'sealBreak' });
    checkDeath(ctx, target);
  },

  /** «Последнее слово»: armed on the ally (by heroine); fires from checkDeath (reactions.ts). */
  'card.lastWord': (ctx, side, { cardId, target }) => {
    if (!target) return;
    const heroId = heroAt(ctx.s, target).id;
    ctx.s.sides[side].armedReactions.push({ cardId, target, heroId });
    emit(ctx, { type: 'reactionArmed', side, cardId, target, heroId });
  },

  /** «Переписать судьбу»: armed for the side; the first death of an ally this round is cancelled (reactions.ts). */
  'card.rewriteFate': (ctx, side, { cardId }) => {
    ctx.s.sides[side].armedReactions.push({ cardId });
    emit(ctx, { type: 'reactionArmed', side, cardId });
  },
};
