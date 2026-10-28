import { describe, expect, it } from 'vitest';
import {
  chooseCommands, createMatch, createRng, eventsFor, resolveRound, startRound, viewFor,
} from '../../engine';
import type { EngineEvent, EventInput, MatchState, Phase, Side, SideCommands, SlotRef } from '../../engine';
import { randomDeck } from '../../engine/sim';
import { BEAT_MS, SPEED_FACTOR } from './timings';
import { toBeats } from './toBeats';
import { applyBeat, applyEvent, viewFromPublic } from './viewReducer';
import type { ViewHero, ViewState } from './types';

const SIDES: Side[] = ['A', 'B'];

function ev(p: EventInput, phase: Phase = 'heroes', round = 1): EngineEvent {
  return { ...p, round, phase } as EngineEvent;
}

function startedMatch(seed = 1): MatchState {
  const rng = createRng(seed);
  return startRound(createMatch(randomDeck(rng), randomDeck(rng), seed)).state;
}

function baseView(seed = 1): ViewState {
  return viewFromPublic(viewFor(startedMatch(seed), 'A'));
}

describe('timings', () => {
  it('длительности битов и коэффициенты скорости как в спеке', () => {
    expect(BEAT_MS).toEqual({
      reveal: 600, card: 500, action: 300, hit: 400, heal: 300, status: 200, death: 500, swap: 500,
      moon: 600, bloodMoon: 800, fizzle: 400, end: 800,
    });
    expect(SPEED_FACTOR).toEqual({ normal: 1, fast: 0.4 });
  });
});

const A0 = { side: 'A' as const, slot: 0 as const };
const B0 = { side: 'B' as const, slot: 0 as const };
const B1 = { side: 'B' as const, slot: 1 as const };

const dmg = (target: SlotRef = B0, hp = 10, shield = 0): EngineEvent => ev({
  type: 'damage', attacker: A0, target, attackerId: 'aira', targetId: 'fenna',
  raw: 5, flat: 0, reductions: 0, dmg: 5, absorbed: 0, hpLoss: 5, hp, shield,
});
const action = (side: Side = 'A', slot: 0 | 1 | 2 = 0): EngineEvent =>
  ev({ type: 'heroAction', side, slot, heroId: 'aira', action: 'basic', target: B0 });
const noCmds: SideCommands = { actions: [{ type: 'none' }, { type: 'none' }, { type: 'none' }] };
const reveal = ev({ type: 'reveal', commands: { A: noCmds, B: noCmds } }, 'reveal');

describe('toBeats', () => {
  it('первый бит reveal, последний end при matchEnd', () => {
    const beats = toBeats([
      reveal, action(), dmg(),
      ev({ type: 'matchEnd', winner: 'A', reason: 'wipe' }, 'endRound'),
    ]);
    expect(beats[0]!.kind).toBe('reveal');
    expect(beats[0]!.durationMs).toBe(600);
    expect(beats.at(-1)!.kind).toBe('end');
    expect(beats.at(-1)!.durationMs).toBe(800);
  });

  it('действие с двумя damage даёт один бит action длительностью 300+400+400', () => {
    const beats = toBeats([reveal, action(), dmg(B0), dmg(B1), action('B', 1)]);
    expect(beats.map(b => b.kind)).toEqual(['reveal', 'action', 'action']);
    expect(beats[1]!.events.map(e => e.type)).toEqual(['heroAction', 'damage', 'damage']);
    expect(beats[1]!.durationMs).toBe(300 + 400 + 400);
  });

  it('длительность бита действия не больше 1500 мс', () => {
    const beats = toBeats([action(), dmg(), dmg(), dmg(), dmg(), dmg()]);
    expect(beats).toHaveLength(1);
    expect(beats[0]!.durationMs).toBe(1500);
  });

  it('cardPlayed со следствиями — один бит card; трата энергии перед картой входит в её бит', () => {
    const beats = toBeats([
      reveal,
      ev({ type: 'energyChanged', side: 'A', energy: 2, delta: -1, reason: 'card' }, 'swift'),
      ev({ type: 'cardPlayed', side: 'A', cardId: 'lunarSpark', target: B0, cost: 1 }, 'swift'),
      ev({ type: 'directDamage', source: { side: 'A', cardId: 'lunarSpark' }, target: B0, dmg: 2, hp: 8, reason: 'sealBreak' }, 'swift'),
      action(),
    ]);
    expect(beats.map(b => b.kind)).toEqual(['reveal', 'card', 'action']);
    expect(beats[1]!.events.map(e => e.type)).toEqual(['energyChanged', 'cardPlayed', 'directDamage']);
    expect(beats[1]!.durationMs).toBe(500 + 400);
  });

  it('moonChanged вне действия — бит moon, bloodMoon — бит bloodMoon, события без анимации — tick 0 мс', () => {
    const beats = toBeats([
      ev({ type: 'moonChanged', from: 'new', to: 'waxing', by: { side: 'A', cardId: 'moonTurn' } }, 'roundStart'),
      ev({ type: 'reshuffle', side: 'A', count: 5 }, 'roundStart'),
      ev({ type: 'bloodMoon', side: 'B', heroes: [{ heroId: 'fenna', slot: 0 }] }, 'endRound'),
    ]);
    expect(beats.map(b => [b.kind, b.durationMs])).toEqual([['moon', 600], ['tick', 0], ['bloodMoon', 800]]);
  });

  it('moonChanged внутри действия остаётся в бите действия', () => {
    const beats = toBeats([
      action(), ev({ type: 'moonChanged', from: 'new', to: 'waxing', by: A0 }),
    ]);
    expect(beats).toHaveLength(1);
    expect(beats[0]!.kind).toBe('action');
  });

  it('события End Round — по биту на видимое изменение', () => {
    const beats = toBeats([
      action(), dmg(),
      ev({ type: 'burn', target: B0, stacks: 1, dmg: 2, hp: 0 }, 'endRound'),
      ev({ type: 'death', side: 'B', slot: 0, heroId: 'fenna' }, 'endRound'),
      ev({ type: 'lunaChanged', side: 'B', luna: 3, delta: 1, reason: 'death' }, 'endRound'),
      ev({ type: 'autoFill', side: 'B', slot: 0, reserveIndex: 0, in: 'nerisa' }, 'endRound'),
    ]);
    expect(beats.map(b => b.kind)).toEqual(['action', 'hit', 'death', 'tick', 'swap']);
    expect(beats.map(b => b.durationMs)).toEqual([700, 400, 500, 0, 500]);
  });

  it('каждое событие настоящих раундов попадает ровно в один бит, порядок сохранён', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let state = createMatch(...decks(seed), seed);
      while (state.result === null) {
        const started = startRound(state);
        const cmds = botCommands(started.state, seed);
        const resolved = resolveRound(started.state, cmds);
        const events = eventsFor([...started.events, ...resolved.events], 'A');
        const beats = toBeats(events);
        expect(beats.flatMap(b => b.events)).toEqual(events);
        for (const b of beats) {
          expect(b.events.length).toBeGreaterThan(0);
          expect(b.durationMs).toBeGreaterThanOrEqual(0);
          expect(b.durationMs).toBeLessThanOrEqual(1500);
        }
        const fromResolve = toBeats(eventsFor(resolved.events, 'A'));
        expect(fromResolve[0]!.kind).toBe('reveal');
        if (resolved.state.result) expect(fromResolve.at(-1)!.kind).toBe('end');
        state = resolved.state;
      }
    }
  });
});

function decks(seed: number) {
  const rng = createRng(seed * 31 + 7);
  return [randomDeck(rng), randomDeck(rng)] as const;
}

function botCommands(started: MatchState, seed: number): Record<Side, SideCommands> {
  const cmds = {} as Record<Side, SideCommands>;
  SIDES.forEach((side, i) => {
    cmds[side] = chooseCommands(viewFor(started, side), side, createRng(seed * 7919 + started.round * 2 + i));
  });
  return cmds;
}

describe('viewFromPublic', () => {
  it('своя рука видна, у противника только число карт; чипов нет', () => {
    const started = startedMatch(3);
    const v = viewFromPublic(viewFor(started, 'A'));
    expect(v.round).toBe(started.round);
    expect(v.moon).toBe(started.moon);
    expect(v.sides.A.hand).toEqual(started.sides.A.hand);
    expect(v.sides.A.handSize).toBe(started.sides.A.hand.length);
    expect(v.sides.B.hand).toBeUndefined();
    expect(v.sides.B.handSize).toBe(started.sides.B.hand.length);
    expect(v.sides.A.active[0]!.heroId).toBe(started.sides.A.active[0].id);
    expect(v.sides.A.active.every(h => h.chip === undefined && h.alive)).toBe(true);
    expect(v.sides.A.bloodMoon).toBe(false);
  });
});

describe('applyEvent', () => {
  it('damage меняет hp и shield как в событии и не трогает вход', () => {
    const v = baseView();
    const copy = structuredClone(v);
    const next = applyEvent(v, dmg(B0, 7, 2));
    expect(next.sides.B.active[0]!.hp).toBe(7);
    expect(next.sides.B.active[0]!.shield).toBe(2);
    expect(v).toEqual(copy);
    expect(next).not.toBe(v);
  });

  it('death → alive false и hp 0', () => {
    const next = applyEvent(baseView(), ev({ type: 'death', side: 'B', slot: 1, heroId: 'fenna' }));
    expect(next.sides.B.active[1]!.alive).toBe(false);
    expect(next.sides.B.active[1]!.hp).toBe(0);
  });

  it('swap меняет героинь местами', () => {
    const v = baseView();
    const out = v.sides.A.active[2]!;
    const inc = v.sides.A.reserve[1]!;
    const next = applyEvent(v, ev({ type: 'swap', side: 'A', slot: 2, reserveIndex: 1, out: out.heroId, in: inc.heroId }));
    expect(next.sides.A.active[2]!.heroId).toBe(inc.heroId);
    expect(next.sides.A.reserve[1]!.heroId).toBe(out.heroId);
  });

  it('autoFill ставит героиню из резерва в слот', () => {
    const v = baseView();
    const inc = v.sides.B.reserve[0]!;
    const next = applyEvent(v, ev({ type: 'autoFill', side: 'B', slot: 1, reserveIndex: 0, in: inc.heroId }, 'endRound'));
    expect(next.sides.B.active[1]!.heroId).toBe(inc.heroId);
    expect(next.sides.B.reserve[0]!.heroId).toBe(v.sides.B.active[1]!.heroId);
  });

  it('moonChanged меняет фазу', () => {
    const next = applyEvent(baseView(), ev({ type: 'moonChanged', from: 'new', to: 'full', by: A0 }));
    expect(next.moon).toBe('full');
  });

  it('cardPlayed противника уменьшает handSize, повтор карты — нет', () => {
    const v = baseView();
    const played = ev({ type: 'cardPlayed', side: 'B', cardId: 'lunarSpark', target: A0, cost: 1 });
    expect(applyEvent(v, played).sides.B.handSize).toBe(v.sides.B.handSize - 1);
    const replay = ev({ type: 'cardPlayed', side: 'B', cardId: 'lunarSpark', target: A0, cost: 0, replay: true });
    expect(applyEvent(v, replay).sides.B.handSize).toBe(v.sides.B.handSize);
  });

  it('своя cardPlayed убирает карту из руки', () => {
    const v = baseView();
    const cardId = v.sides.A.hand![0]!;
    const next = applyEvent(v, ev({ type: 'cardPlayed', side: 'A', cardId, cost: 1 }));
    expect(next.sides.A.handSize).toBe(v.sides.A.handSize - 1);
    expect(next.sides.A.hand!.length).toBe(v.sides.A.hand!.length - 1);
  });

  it('draw добавляет карту в свою руку и увеличивает handSize противника', () => {
    const v = baseView();
    const own = applyEvent(v, ev({ type: 'draw', side: 'A', cardId: 'cover' }, 'roundStart'));
    expect(own.sides.A.hand!.at(-1)).toBe('cover');
    expect(own.sides.A.handSize).toBe(v.sides.A.handSize + 1);
    const foe = applyEvent(v, ev({ type: 'draw', side: 'B' }, 'roundStart'));
    expect(foe.sides.B.handSize).toBe(v.sides.B.handSize + 1);
  });

  it('reveal ставит чипы обеим сторонам, roundStart их снимает', () => {
    const v = baseView();
    const cmds: SideCommands = { actions: [{ type: 'basic', target: B0 }, { type: 'skill' }, { type: 'none' }] };
    const revealed = applyEvent(v, ev({ type: 'reveal', commands: { A: cmds, B: noCmds } }, 'reveal'));
    expect(revealed.sides.A.active[0]!.chip).toEqual({ type: 'basic', target: B0 });
    expect(revealed.sides.B.active[0]!.chip).toEqual({ type: 'none' });
    const next = applyEvent(revealed, ev({
      type: 'roundStart', moon: 'waning', energy: { A: 4, B: 5 }, luna: { A: 2, B: 3 },
    }, 'roundStart', 2));
    expect(next.sides.A.active[0]!.chip).toBeUndefined();
    expect(next.round).toBe(2);
    expect(next.moon).toBe('waning');
    expect(next.sides.B.energy).toBe(5);
    expect(next.sides.A.luna).toBe(2);
  });

  it('statusApplied: Burn копит стаки до 3, statusRemoved снимает', () => {
    let v = baseView();
    const burn = ev({ type: 'statusApplied', source: A0, target: B0, status: 'burn', value: 0 });
    for (let i = 0; i < 4; i++) v = applyEvent(v, burn);
    const st = v.sides.B.active[0]!.statuses.filter(s => s.id === 'burn');
    expect(st).toHaveLength(1);
    expect(st[0]!.stacks).toBe(3);
    v = applyEvent(v, ev({ type: 'statusRemoved', target: B0, status: 'burn' }));
    expect(v.sides.B.active[0]!.statuses.some(s => s.id === 'burn')).toBe(false);
  });

  it('heal, shield и shieldExpired меняют hp и щит', () => {
    let v = baseView();
    v = applyEvent(v, ev({ type: 'heal', source: A0, target: A0, amount: 3, healed: 3, hp: 12 }));
    expect(v.sides.A.active[0]!.hp).toBe(12);
    v = applyEvent(v, ev({ type: 'shield', source: A0, target: A0, amount: 4, shield: 4 }));
    expect(v.sides.A.active[0]!.shield).toBe(4);
    v = applyEvent(v, ev({ type: 'shieldExpired', target: A0, amount: 4 }, 'endRound'));
    expect(v.sides.A.active[0]!.shield).toBe(0);
  });

  it('bloodMoon отмечает сторону, energyChanged и lunaChanged меняют счётчики', () => {
    let v = baseView();
    v = applyEvent(v, ev({ type: 'bloodMoon', side: 'B', heroes: [{ heroId: 'fenna', slot: 0 }] }, 'endRound'));
    expect(v.sides.B.bloodMoon).toBe(true);
    v = applyEvent(v, ev({ type: 'energyChanged', side: 'A', energy: 1, delta: -2, reason: 'skill' }));
    v = applyEvent(v, ev({ type: 'lunaChanged', side: 'A', luna: 4, delta: 1, reason: 'ability' }));
    expect(v.sides.A.energy).toBe(1);
    expect(v.sides.A.luna).toBe(4);
  });

  it('revive возвращает героиню с hp из события и без статусов', () => {
    let v = baseView();
    v = applyEvent(v, ev({ type: 'statusApplied', source: B0, target: A0, status: 'mark', value: 0 }));
    v = applyEvent(v, ev({ type: 'death', side: 'A', slot: 0, heroId: 'aira' }));
    v = applyEvent(v, ev({ type: 'revive', side: 'A', heroId: 'aira', hp: 6, slot: 0 }));
    expect(v.sides.A.active[0]).toMatchObject({ alive: true, hp: 6, statuses: [] });
  });

  it('fizzle карты (не повтор) убирает её из руки, fizzle повтора и героини — нет', () => {
    const v = baseView();
    const foe = ev({ type: 'fizzle', side: 'B', cardId: 'lunarSpark', action: 'card', reason: 'energy' }, 'swift');
    expect(applyEvent(v, foe).sides.B.handSize).toBe(v.sides.B.handSize - 1);
    const cardId = v.sides.A.hand![0]!;
    const own = applyEvent(v, ev({ type: 'fizzle', side: 'A', cardId, action: 'card', reason: 'target dead' }, 'standard'));
    expect(own.sides.A.hand).toHaveLength(v.sides.A.hand!.length - 1);
    expect(own.sides.A.handSize).toBe(v.sides.A.handSize - 1);
    const replay = ev({ type: 'fizzle', side: 'B', cardId: 'lunarSpark', action: 'card', reason: 'no target', replay: true });
    expect(applyEvent(v, replay).sides.B.handSize).toBe(v.sides.B.handSize);
    const hero = ev({ type: 'fizzle', side: 'A', slot: 0, heroId: 'aira', action: 'skill', reason: 'silence' });
    expect(applyEvent(v, hero)).toEqual(v);
  });

  it('redirect прикрытия расходует redirectTo цели, redirect Насмешки статусы не трогает', () => {
    let v = baseView();
    v = applyEvent(v, ev({ type: 'statusApplied', source: B1, target: B0, status: 'redirectTo', value: 2 }, 'reactions'));
    const taunt = applyEvent(v, ev({ type: 'redirect', from: B0, to: B1, reason: 'taunt' }));
    expect(taunt.sides.B.active[0]!.statuses.some(s => s.id === 'redirectTo')).toBe(true);
    const cover = applyEvent(v, ev({ type: 'redirect', from: B0, to: B1, reason: 'cover' }));
    expect(cover.sides.B.active[0]!.statuses.some(s => s.id === 'redirectTo')).toBe(false);
  });

  it('swap снимает Насмешку с уходящей героини, autoFill — нет', () => {
    let v = baseView();
    v = applyEvent(v, ev({ type: 'statusApplied', source: A0, target: A0, status: 'taunt', value: 0 }));
    const out = v.sides.A.active[0]!.heroId;
    const inc = v.sides.A.reserve[0]!.heroId;
    const swapped = applyEvent(v, ev({ type: 'swap', side: 'A', slot: 0, reserveIndex: 0, out, in: inc }));
    expect(swapped.sides.A.reserve[0]!.statuses.some(s => s.id === 'taunt')).toBe(false);
    const filled = applyEvent(v, ev({ type: 'autoFill', side: 'A', slot: 0, reserveIndex: 0, in: inc }, 'endRound'));
    expect(filled.sides.A.reserve[0]!.statuses.some(s => s.id === 'taunt')).toBe(true);
  });

  it('«Переписать судьбу» возвращает героиню с 1 HP', () => {
    let v = baseView();
    v = applyEvent(v, dmg(B0, 0, 0));
    v = applyEvent(v, ev({ type: 'reactionTriggered', side: 'B', cardId: 'rewriteFate', target: B0, heroId: 'fenna' }));
    expect(v.sides.B.active[0]).toMatchObject({ hp: 1, alive: true });
  });

  it('revive и bloodMoon работают с героиней в резерве', () => {
    const v = structuredClone(baseView());
    const fallen = v.sides.A.reserve[1]!;
    v.sides.A.reserve[1] = { ...fallen, hp: 0, alive: false, statuses: [{ id: 'mark', value: 0, stacks: 1, expiresAtRound: null }] };
    const revived = applyEvent(v, ev({ type: 'revive', side: 'A', heroId: fallen.heroId, hp: 6, reserveIndex: 1 }));
    expect(revived.sides.A.reserve[1]).toMatchObject({ hp: 6, alive: true, shield: 0, statuses: [] });

    const last = v.sides.A.reserve[2]!;
    v.sides.A.reserve[2] = { ...last, statuses: [{ id: 'burn', value: 0, stacks: 2, expiresAtRound: null }] };
    const first = v.sides.A.active[0]!;
    v.sides.A.active[0] = { ...first, statuses: [{ id: 'mark', value: 0, stacks: 1, expiresAtRound: null }, { id: 'curse', value: 0, stacks: 1, expiresAtRound: null }] };
    const moon = applyEvent(v, ev({
      type: 'bloodMoon', side: 'A',
      heroes: [{ heroId: first.heroId, slot: 0, cleansed: ['curse'] }, { heroId: last.heroId, slot: null, reserveIndex: 2, cleansed: ['burn'] }],
    }, 'endRound'));
    expect(moon.sides.A.bloodMoon).toBe(true);
    expect(moon.sides.A.reserve[2]!.statuses).toEqual([]);
    expect(moon.sides.A.active[0]!.statuses.map(s => s.id)).toEqual(['mark']);
  });

  it('applyBeat применяет все события бита по порядку', () => {
    const v = baseView();
    const [beat] = toBeats([action(), dmg(B0, 9, 0), dmg(B0, 4, 0)]);
    expect(applyBeat(v, beat!).sides.B.active[0]!.hp).toBe(4);
  });
});

// --- Spec §4.3 property --------------------------------------------------------------------------

type HeroSnap = Pick<ViewHero, 'heroId' | 'hp' | 'maxHp' | 'shield' | 'alive'> & { statuses: string[] };
const snapHero = (h: ViewHero): HeroSnap => ({
  heroId: h.heroId, hp: h.hp, maxHp: h.maxHp, shield: h.shield, alive: h.alive,
  statuses: h.statuses.map(s => `${s.id}:${s.stacks}:${s.value}`).sort(),
});
function snap(v: ViewState) {
  return {
    round: v.round, moon: v.moon,
    sides: Object.fromEntries(SIDES.map(side => {
      const sd = v.sides[side];
      return [side, {
        active: sd.active.map(snapHero), reserve: sd.reserve.map(snapHero),
        energy: sd.energy, luna: sd.luna, handSize: sd.handSize, bloodMoon: sd.bloodMoon,
        hand: sd.hand ? [...sd.hand].sort() : null,
      }];
    })),
  };
}

/** Freezes an object graph so that any mutation by the reducer throws (ES modules run in strict mode). */
function deepFreeze<T>(x: T): T {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const value of Object.values(x)) deepFreeze(value);
  }
  return x;
}

describe('свойство §4.3', () => {
  it('на 200 случайных раундах applyEvent по событиям раунда даёт состояние viewFor после resolveRound', () => {
    let rounds = 0;
    for (let seed = 100; rounds < 200; seed++) {
      let state = createMatch(...decks(seed), seed);
      while (state.result === null && rounds < 200) {
        const started = startRound(state).state;
        const after = resolveRound(started, botCommands(started, seed));
        for (const side of SIDES) {
          const before = viewFromPublic(viewFor(started, side));
          const pristine = structuredClone(before);
          const events = deepFreeze(eventsFor(after.events, side));
          // Every step gets a frozen input: a reducer that mutates its state or the event throws here.
          const replayed = events.reduce((v, e) => applyEvent(deepFreeze(v), e), before);
          const expected = viewFromPublic(viewFor(after.state, side));
          const where = `seed ${seed}, round ${started.round}, view ${side}`;
          expect(snap(replayed), where).toEqual(snap(expected));
          expect(before, where).toEqual(pristine);
        }
        state = after.state;
        rounds++;
      }
    }
    expect(rounds).toBe(200);
  });
});
