import { HEROES } from '../../engine';
import type { HeroAction, PublicState, SideCommands, Slot } from '../../engine';

/**
 * Слабый детерминированный противник обучения: каждая живая противница делает «Атаку» по героине
 * игрока с наибольшим HP, учитывая уже назначенные удары (урон расходится, никто не падает).
 */
export function spreadBasics(view: PublicState): SideCommands {
  const left = view.sides.A.active.map(h => (h.hp > 0 ? h.hp : -Infinity));
  const actions = view.sides.B.active.map((h): HeroAction => {
    if (h.hp <= 0) return { type: 'none' };
    let best = 0;
    left.forEach((hp, i) => { if (hp > left[best]!) best = i; });
    left[best]! -= HEROES[h.id].atk;
    return { type: 'basic', target: { side: 'A', slot: best as Slot } };
  });
  return { actions: actions as SideCommands['actions'] };
}
