import { describe, it, expect } from 'vitest';
import { startRound } from '../resolve/round';
import { makeCtx } from '../resolve/context';
import { runAbility } from '../resolve/actions';
import { HEROES } from '../data/heroes';
import type { GameEvent, HeroId, MatchState, SlotRef, Status } from '../types';
import { makeMatch, enemy } from './helpers';

const ofType = (events: GameEvent[], type: string) => events.filter(e => e.type === type);
const isRef = (a: unknown, b: SlotRef) => {
  const r = a as SlotRef | undefined;
  return !!r && r.side === b.side && r.slot === b.slot;
};
/** Compact view of damage events by one attacker. */
const hits = (events: GameEvent[], attacker: SlotRef) =>
  ofType(events, 'damage').filter(e => isRef(e.attacker, attacker))
    .map(e => ({ target: e.target, dmg: e.dmg, reductions: e.reductions, absorbed: e.absorbed }));

function withStatus(state: MatchState, ref: SlotRef, st: Status): MatchState {
  const s = structuredClone(state);
  s.sides[ref.side].active[ref.slot].statuses.push(st);
  return s;
}
const st = (id: Status['id'], value = 0, expiresAtRound: number | null = null, stacks = 1): Status =>
  ({ id, value, stacks, expiresAtRound });
const statusIds = (s: MatchState, ref: SlotRef) => s.sides[ref.side].active[ref.slot].statuses.map(x => x.id);

/** A context in a started round 1 (new moon, energy 4) for the given teams. */
function ctxFor(a: HeroId[], b?: HeroId[], tweak?: (s: MatchState) => void) {
  const started = startRound(makeMatch(b ? { a, b } : { a })).state;
  tweak?.(started);
  return makeCtx(started);
}

describe('R19: перехват на уровне умения', () => {
  it('Юстина skill по Нокте при Taunt + Shield 6 у Авроры → удар в Аврору, условие по Авроре: 150% = 11', () => {
    const ctx = ctxFor(['justina', 'fenna', 'nerisa', 'aira', 'zefira', 'liraya'], undefined, s => {
      s.sides.B.active[0].statuses.push(st('taunt', 0, 2));
      s.sides.B.active[0].shield = 6;
      s.sides.B.active[0].shieldExpiresAtRound = 2;
    });
    runAbility(ctx, { side: 'A', slot: 0 }, HEROES.justina.skill, enemy(2), 'skill');
    expect(ofType(ctx.events, 'redirect').map(e => [e.from, e.to, e.reason])).toEqual([[enemy(2), enemy(0), 'taunt']]);
    // 7×1.5 = 10.5 → 11, Light → Light ×1; пассивка Авроры не снижает урон по ней самой.
    expect(hits(ctx.events, { side: 'A', slot: 0 })).toEqual([{ target: enemy(0), dmg: 11, reductions: 0, absorbed: 6 }]);
    expect(ctx.s.sides.B.active[0].hp).toBe(27);
  });

  it('Нокта skill по союзнице Авроры с Taunt → Curse ложится на Аврору', () => {
    const ctx = ctxFor(['nokta', 'fenna', 'nerisa', 'aira', 'zefira', 'liraya'], undefined, s => {
      s.sides.B.active[0].statuses.push(st('taunt', 0, 2));
    });
    runAbility(ctx, { side: 'A', slot: 0 }, HEROES.nokta.skill, enemy(1), 'skill');
    // 7×1.2×1.15 = 9.66 → 10, +1 Dark в Новолуние = 11.
    expect(hits(ctx.events, { side: 'A', slot: 0 })).toEqual([{ target: enemy(0), dmg: 11, reductions: 0, absorbed: 0 }]);
    expect(statusIds(ctx.s, enemy(0))).toContain('curse');
    expect(statusIds(ctx.s, enemy(1))).not.toContain('curse');
  });
});
