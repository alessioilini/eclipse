import type { Side, Slot, SlotRef, TriggerEvent } from '../types';
import { HEROES } from '../data/heroes';
import { isAlive } from '../status';
import { heroAt } from '../targeting';
import type { Ctx } from './context';
import { HOOKS } from './hooks';
import type { HookPayload } from './hooks';

const SIDES: Side[] = ['A', 'B'];
const SLOTS: Slot[] = [0, 1, 2];
const ONCE_MATCH = -1;

export type TriggerPayload = HookPayload;

/**
 * Passive dispatcher (spec §6.2): every living active heroine (A0..A2, then B0..B2) with a trigger
 * on `event` runs its hook with `self` = her slot. Hooks decide for themselves whether the event
 * concerns them (e.g. `sameRef(self, payload.attacker)`) and return `false` when it does not.
 * `once: 'round'` / `'match'` is stored in `hero.once[hook]` (the round, or -1) and is consumed
 * only when the hook did not return `false` (it is set during the call, then restored).
 * A trigger whose hook is not registered yet (hero hooks of Task 10) is skipped.
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
        const used = hero.once[trig.hook];
        if (trig.once === 'round' && used === ctx.s.round) continue;
        if (trig.once === 'match' && used === ONCE_MATCH) continue;
        // The flag is set before the call so that a hook re-entering `fire` (Justina's SPD buff is
        // itself a buff) cannot trigger itself again; it is restored when the hook returns false.
        if (trig.once) hero.once[trig.hook] = trig.once === 'round' ? ctx.s.round : ONCE_MATCH;
        const applied = hook(ctx, self, payload);
        if (applied === false && trig.once) {
          const once = heroAt(ctx.s, self).once;
          if (used === undefined) delete once[trig.hook];
          else once[trig.hook] = used;
        }
      }
    }
  }
}
