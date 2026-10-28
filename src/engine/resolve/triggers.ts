import type { Side, Slot, SlotRef, TriggerEvent } from '../types';
import { HEROES } from '../data/heroes';
import { isAlive } from '../status';
import { heroAt } from '../targeting';
import type { Ctx } from './context';
import { HOOKS } from './hooks';
import type { HookPayload } from './hooks';

const SIDES: Side[] = ['A', 'B'];
const SLOTS: Slot[] = [0, 1, 2];

export type TriggerPayload = HookPayload & { hero?: SlotRef };

/**
 * Passive dispatcher: every living active heroine (A0..A2, then B0..B2) with a trigger on `event`
 * runs its hook, honouring `once` ('round' compares to the round, 'match' fires once ever).
 * A trigger whose hook is not registered yet is skipped without consuming `once`.
 */
export function fire(ctx: Ctx, event: TriggerEvent, payload: TriggerPayload = {}): void {
  for (const side of SIDES) {
    for (const slot of SLOTS) {
      const self: SlotRef = { side, slot };
      const hero = heroAt(ctx.s, self);
      if (!isAlive(hero)) continue;
      for (const trig of HEROES[hero.id].passive.triggers) {
        if (trig.on !== event) continue;
        const hook = HOOKS[trig.hook];
        if (!hook) continue;
        const key = `trigger:${trig.hook}`;
        if (trig.once === 'round' && hero.once[key] === ctx.s.round) continue;
        if (trig.once === 'match' && hero.once[key] !== undefined) continue;
        if (trig.once) hero.once[key] = ctx.s.round;
        hook(ctx, self, payload);
      }
    }
  }
}
