import { describe, expect, it } from 'vitest';
import * as engine from '../index';
import { legalActions, legalCardPlays } from '../legal';
import type { LegalActions } from '../legal';
import { createMatch } from '../match';
import { createRng } from '../rng';
import type { Rng } from '../rng';
import { resolveRound, startRound } from '../resolve/round';
import { randomDeck } from '../sim';
import { isAlive } from '../status';
import { validateCommands } from '../validate';
import { viewFor } from '../view';
import type { PublicState } from '../view';
import type { CardPlay, HeroAction, MatchState, Side, SideCommands, Slot, SlotRef } from '../types';
import { ally, basic, cmd, enemy, makeMatch, none, setHand, setLuna, setRound, skill } from './helpers';

const SIDES: Side[] = ['A', 'B'];
const SLOTS: Slot[] = [0, 1, 2];
const other = (side: Side): Side => (side === 'A' ? 'B' : 'A');
const refs = (side: Side, slots: Slot[]): SlotRef[] => slots.map(slot => ({ side, slot }));

/** fenna (skill 1, ally), nerisa (guardian, skill 1, ally), aira (skill 2, enemies). */
const trio = (): MatchState => setRound(makeMatch({ a: ['fenna', 'nerisa', 'aira', 'tali', 'zefira', 'liraya'] }), 1);

describe('validateCommands: коды', () => {
  it('validateCommands возвращает коды: цель в мёртвый слот → TARGET_DEAD со slot', () => {
    const s = structuredClone(trio());
    s.sides.A.active[0].hp = 0;
    const c = cmd(none(), skill(1, ally(0)), basic(2, enemy(0)));
    expect(validateCommands(s, 'A', c)).toEqual([{ code: 'TARGET_DEAD', slot: 1 }]);
  });
});

describe('legalActions', () => {
  it('legalActions: у героини с Freeze skill.blocked === "freeze", ultimate доступна', () => {
    const s = setLuna(trio(), 'A', 3);
    s.sides.A.active[0].statuses.push({ id: 'freeze', value: 3, stacks: 1, expiresAtRound: 2 });
    const la = legalActions(viewFor(s, 'A'), 'A', 0);
    expect(la.skill.blocked).toBe('freeze');
    expect(la.skill.cost).toBe(1);
    expect(la.skill.targets).toEqual(refs('A', [0, 1, 2]));
    expect(la.ultimate.blocked).toBeUndefined();
    expect(la.ultimate.targets).toBe('auto');
    expect(la.basic).toEqual(refs('B', [0, 1, 2]));
  });

  it('legalActions: при Luna 2 в new ultimate.blocked === "luna", в full доступна', () => {
    const s = setLuna(trio(), 'A', 2);
    s.moon = 'new';
    const blocked = legalActions(viewFor(s, 'A'), 'A', 2);
    expect(blocked.ultimate).toMatchObject({ blocked: 'luna', energy: 2, luna: 3 });
    s.moon = 'full';
    const free = legalActions(viewFor(s, 'A'), 'A', 2);
    expect(free.ultimate.blocked).toBeUndefined();
    expect(free.ultimate.luna).toBe(2);
  });

  it('legalActions: с draft, где два скилла по 1 и карта за 1 уже выбраны при бюджете 4, третий skill cost 2 → blocked "energy"', () => {
    // 1 + 1 + 2 = 4 ещё помещается в бюджет 4, поэтому в черновике есть и карта за 1.
    const s = setLuna(setHand(trio(), 'A', ['lunarSpark', 'bloodPact']), 'A', 5);
    const view = viewFor(s, 'A');
    const actions: SideCommands['actions'] = [skill(0, ally(0)), skill(1, ally(1)), none()];
    expect(legalActions(view, 'A', 2, { actions }).skill).toEqual({ targets: 'auto', cost: 2 });
    const withCard = legalActions(view, 'A', 2, { actions, card: { handIndex: 0 } });
    expect(withCard.skill.blocked).toBe('energy');
    expect(withCard.ultimate.blocked).toBe('energy');
    // «Кровавая сделка» в черновике даёт +2 к бюджету
    expect(legalActions(view, 'A', 2, { actions, card: { handIndex: 1, target: ally(0) } }).skill.blocked).toBeUndefined();
  });

  it('legalActions: swap перечисляет только живой резерв; при swapBanned swapBlocked === "banned"', () => {
    const s = structuredClone(trio());
    s.sides.A.reserve[1].hp = 0;
    expect(legalActions(viewFor(s, 'A'), 'A', 0).swap).toEqual([0, 2]);
    expect(legalActions(viewFor(s, 'A'), 'A', 0).swapBlocked).toBeUndefined();
    // резерв, уже занятый заменой другого слота в черновике, не предлагается
    const draft = { actions: [{ type: 'swap', reserveIndex: 0 }, none(), none()] as SideCommands['actions'] };
    expect(legalActions(viewFor(s, 'A'), 'A', 1, draft).swap).toEqual([2]);
    s.sides.A.flags.swapBanned = true;
    expect(legalActions(viewFor(s, 'A'), 'A', 0).swapBlocked).toBe('banned');
  });

  it('legalActions: мёртвая героиня — всё заблокировано причиной "dead"', () => {
    const s = structuredClone(trio());
    s.sides.A.active[1].hp = 0;
    const la = legalActions(viewFor(s, 'A'), 'A', 1);
    expect(la.basic).toEqual([]);
    expect(la.swap).toEqual([]);
    expect(la.skill.blocked).toBe('dead');
    expect(la.ultimate.blocked).toBe('dead');
    expect(la.swapBlocked).toBe('dead');
  });
});

describe('legalCardPlays', () => {
  it('legalCardPlays: cover → secondary "guardian", targets = свои живые; emergencySwap → secondary "reserve"', () => {
    const s = setHand(trio(), 'A', ['cover', 'emergencySwap', 'huntersMark', 'lunarSpark']);
    s.sides.A.active[2].hp = 0;
    const view = viewFor(s, 'A');
    expect(legalCardPlays(view, 'A', 0)).toEqual({ cost: 1, targets: refs('A', [0, 1]), secondary: 'guardian' });
    expect(legalCardPlays(view, 'A', 1)).toEqual({ cost: 1, targets: refs('A', [0, 1]), secondary: 'reserve' });
    expect(legalCardPlays(view, 'A', 2)).toEqual({ cost: 1, targets: refs('B', [0, 1, 2]) });
    expect(legalCardPlays(view, 'A', 3)).toEqual({ cost: 1, targets: 'auto' });
    // черновик тратит весь бюджет 4: два скилла по 1 и ульта за 2 → карта за 1 недоступна
    const s4 = setLuna(s, 'A', 5);
    s4.sides.A.active[2].hp = 20;
    const actions: SideCommands['actions'] = [skill(0, ally(0)), skill(1, ally(1)), { type: 'ultimate' }];
    expect(legalCardPlays(viewFor(s4, 'A'), 'A', 3, { actions }).blocked).toBe('energy');
  });
});

/** Every unblocked action that legalActions lists for `slot` (blocked options are skipped). */
function listed(la: LegalActions): HeroAction[] {
  const out: HeroAction[] = la.basic.map(target => ({ type: 'basic', target }));
  const ability = (type: 'skill' | 'ultimate', targets: SlotRef[] | 'auto') =>
    (targets === 'auto' ? [{ type }] : targets.map(target => ({ type, target }))) as HeroAction[];
  if (!la.skill.blocked) out.push(...ability('skill', la.skill.targets));
  if (!la.ultimate.blocked) out.push(...ability('ultimate', la.ultimate.targets));
  if (!la.swapBlocked) out.push(...la.swap.map((reserveIndex): HeroAction => ({ type: 'swap', reserveIndex })));
  return out;
}

/** Every play of the card at `handIndex` that legalCardPlays lists, with every legal secondary. */
function listedPlays(view: PublicState, side: Side, handIndex: number, draft?: Partial<SideCommands>): CardPlay[] {
  const lp = legalCardPlays(view, side, handIndex, draft);
  if (lp.blocked) return [];
  const own = view.sides[side];
  if (!('hand' in own)) throw new Error('own side expected');
  const targets = lp.targets === 'auto' ? [undefined] : lp.targets;
  return targets.flatMap((target): CardPlay[] => {
    if (lp.secondary === 'guardian') {
      return SLOTS.filter(g => isAlive(own.active[g]) && engine.HEROES[own.active[g].id].role === 'guardian')
        .map(slot => ({ handIndex, target, secondary: { side, slot } }));
    }
    if (lp.secondary === 'reserve') {
      return SLOTS.filter(i => isAlive(own.reserve[i])).map(reserveIndex => ({ handIndex, target, secondary: { reserveIndex } }));
    }
    return [target ? { handIndex, target } : { handIndex }];
  });
}

const fallbackAction = (view: PublicState, side: Side, slot: Slot): HeroAction => {
  if (!isAlive(view.sides[side].active[slot])) return { type: 'none' };
  const target = SLOTS.find(t => isAlive(view.sides[other(side)].active[t]));
  return { type: 'basic', target: { side: other(side), slot: target ?? 0 } };
};

const pick = <T>(rng: Rng, xs: T[]): T | undefined => (xs.length ? xs[rng.int(xs.length)] : undefined);

describe('согласованность', () => {
  it('legalActions согласована с validateCommands: на 100 случайных состояниях каждое перечисленное действие проходит валидацию', () => {
    let checked = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      let state = createMatch(randomDeck(rng), randomDeck(rng), seed);
      const rounds = 1 + rng.int(10);
      for (let r = 0; r < rounds && state.result === null; r++) {
        const s = startRound(state).state;
        const cmds = {} as Record<Side, SideCommands>;
        for (const side of SIDES) {
          const view = viewFor(s, side);
          const own = view.sides[side];
          if (!('hand' in own)) throw new Error('own side expected');
          const base = SLOTS.map(slot => fallbackAction(view, side, slot)) as SideCommands['actions'];
          const where = `seed ${seed}, round ${s.round}, side ${side}`;
          // 1) каждое действие отдельно, остальные слоты — basic
          for (const slot of SLOTS) {
            for (const action of listed(legalActions(view, side, slot))) {
              const actions = [...base] as SideCommands['actions'];
              actions[slot] = action;
              expect(validateCommands(view, side, { actions }), `${where}, slot ${slot}, ${JSON.stringify(action)}`).toEqual([]);
              checked += 1;
            }
          }
          // 2) каждая карта отдельно при basic-действиях
          own.hand.forEach((_, handIndex) => {
            for (const card of listedPlays(view, side, handIndex)) {
              expect(validateCommands(view, side, { actions: base, card }), `${where}, ${JSON.stringify(card)}`).toEqual([]);
              checked += 1;
            }
          });
          // 3) случайный черновик: слоты по очереди с учётом уже выбранного, затем карта
          const draft: SideCommands = { actions: SLOTS.map((): HeroAction => ({ type: 'none' })) as SideCommands['actions'] };
          for (const slot of SLOTS) {
            draft.actions[slot] = pick(rng, listed(legalActions(view, side, slot, draft))) ?? fallbackAction(view, side, slot);
          }
          const card = pick(rng, own.hand.flatMap((_, i) => listedPlays(view, side, i, draft)));
          if (card) draft.card = card;
          expect(validateCommands(view, side, draft), `${where}, draft ${JSON.stringify(draft)}`).toEqual([]);
          cmds[side] = draft;
        }
        state = resolveRound(s, cmds).state;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('точка входа', () => {
  it('index.ts экспортирует startRound, resolveRound, legalActions, HEROES', () => {
    for (const name of ['createMatch', 'validateDeck', 'getWinner', 'startRound', 'resolveRound', 'validateCommands',
      'viewFor', 'eventsFor', 'chooseCommands', 'legalActions', 'legalCardPlays', 'formatLog', 'formatEvent', 'createRng'] as const) {
      expect(typeof engine[name], name).toBe('function');
    }
    expect(engine.startRound).toBe(startRound);
    expect(engine.resolveRound).toBe(resolveRound);
    expect(engine.legalActions).toBe(legalActions);
    expect(engine.HEROES.aira.id).toBe('aira');
    expect(engine.CARDS.cover.id).toBe('cover');
    expect(engine.HERO_IDS).toHaveLength(12);
    expect(engine.CARD_IDS).toHaveLength(24);
    expect(engine.MOON_ORDER).toEqual(['new', 'waxing', 'full', 'waning']);
  });
});
