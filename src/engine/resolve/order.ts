import type { HeroAction, Side, SideCommands, Slot, SlotRef } from '../types';
import { effectiveAtk, effectiveSpd } from '../status';
import { heroAt } from '../targeting';
import type { Ctx } from './context';

export type OrderEntry = { ref: SlotRef; action: HeroAction };

const SIDES: Side[] = ['A', 'B'];
const SLOTS: Slot[] = [0, 1, 2];

/**
 * Spec §2.5 step 6: all six active slots, by effective SPD desc, then HP% desc, then ATK desc,
 * then a seeded random key drawn once per entry (A0..B2). Dead heroines stay listed and are
 * skipped when reached. The order is fixed here and not re-sorted during the phase.
 */
export function actionOrder(ctx: Ctx, cmds: Record<Side, SideCommands>): OrderEntry[] {
  const rows = SIDES.flatMap(side => SLOTS.map(slot => {
    const ref: SlotRef = { side, slot };
    const hero = heroAt(ctx.s, ref);
    return {
      ref, action: cmds[side].actions[slot],
      spd: effectiveSpd(hero), hpPct: hero.hp / hero.maxHp, atk: effectiveAtk(hero), key: ctx.rng.next(),
    };
  }));
  rows.sort((x, y) => (y.spd - x.spd) || (y.hpPct - x.hpPct) || (y.atk - x.atk) || (x.key - y.key));
  return rows.map(({ ref, action }) => ({ ref, action }));
}
