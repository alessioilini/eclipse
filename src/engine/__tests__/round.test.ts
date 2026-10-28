import { describe, it, expect } from 'vitest';
import { resolveRound, startRound } from '../resolve/round';
import { validateCommands } from '../validate';
import { effectiveSpd } from '../status';
import { CARD_IDS } from '../data/cards';
import type { GameEvent, MatchState, Side, SideCommands, SlotRef } from '../types';
import { makeMatch, cmd, basic, skill, ult, swap, none, enemy, ally, setHp, setHand, setRound, playRound } from './helpers';


/** A: all three hit B0; B: all three hit A2. Nobody dies in one round with the default teams. */
const aDefault = () => cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0)));
const bDefault = () => cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2)));

const ofType = (events: GameEvent[], type: string) => events.filter(e => e.type === type);
const sameRef = (a: unknown, b: SlotRef) => {
  const r = a as SlotRef;
  return r.side === b.side && r.slot === b.slot;
};
const damageBy = (events: GameEvent[], attacker: SlotRef) =>
  ofType(events, 'damage').filter(e => sameRef(e.attacker, attacker));

function healAll(state: MatchState): MatchState {
  const s = structuredClone(state);
  for (const side of ['A', 'B'] as const) {
    for (const h of [...s.sides[side].active, ...s.sides[side].reserve]) h.hp = h.maxHp;
  }
  return s;
}

/** Every living active hero hits the first living enemy slot; dead ones pass. */
function autoCmds(s: MatchState, side: Side): SideCommands {
  const foe: Side = side === 'A' ? 'B' : 'A';
  const targetSlot = s.sides[foe].active.findIndex(h => h.hp > 0) as 0 | 1 | 2;
  const act = (i: 0 | 1 | 2) =>
    s.sides[side].active[i].hp > 0 ? basic(i, { side: foe, slot: targetSlot }) : none();
  return cmd(act(0), act(1), act(2));
}

function killAllBut(state: MatchState, side: Side, aliveSlot: 0 | 1 | 2): MatchState {
  const s = structuredClone(state);
  s.sides[side].active.forEach((h, i) => { if (i !== aliveSlot) h.hp = 0; });
  s.sides[side].reserve.forEach(h => { h.hp = 0; });
  return s;
}

describe('resolveRound: начало раунда', () => {
  it('раунд 1: energy 4, luna 2, moon new, рука 4; раунд 3: energy 5, moon full; раунд 5: moon new, luna 5 (cap)', () => {
    let s = makeMatch();
    const seen: { round: number; moon: string; energy: number; luna: number; hand: number }[] = [];
    for (let i = 0; i < 6; i++) {
      s = healAll(playRound(s, aDefault(), bDefault()).state);
      for (const side of ['A', 'B'] as const) {
        const sd = s.sides[side];
        seen.push({ round: s.round, moon: s.moon, energy: sd.energy, luna: sd.luna, hand: sd.hand.length });
      }
    }
    const a = seen.filter((_, i) => i % 2 === 0);
    const b = seen.filter((_, i) => i % 2 === 1);
    expect(b).toEqual(a);
    expect(a).toEqual([
      { round: 1, moon: 'new', energy: 4, luna: 2, hand: 4 },
      { round: 2, moon: 'waxing', energy: 4, luna: 3, hand: 5 },
      { round: 3, moon: 'full', energy: 5, luna: 4, hand: 5 },
      { round: 4, moon: 'waning', energy: 5, luna: 5, hand: 5 },
      { round: 5, moon: 'new', energy: 5, luna: 5, hand: 5 },
      { round: 6, moon: 'waxing', energy: 6, luna: 5, hand: 5 },
    ]);
  });

  it('добор при руке 5 сбрасывает самую старую в discard', () => {
    const five = CARD_IDS.slice(12, 17);
    const s = setHand(makeMatch(), 'A', five);
    const top = s.sides.A.deck[0];
    const { state, events } = playRound(s, aDefault(), bDefault());
    expect(state.sides.A.hand).toEqual([...five.slice(1), top]);
    expect(state.sides.A.discard).toEqual([five[0]]);
    expect(state.sides.A.deck).toEqual(s.sides.A.deck.slice(1));
    expect(ofType(events, 'draw').map(e => [e.side, e.cardId])).toEqual([['A', top], ['B', s.sides.B.deck[0]]]);
    expect(ofType(events, 'discardOverflow').map(e => [e.side, e.cardId])).toEqual([['A', five[0]]]);
  });

  it('пустая колода перетасовывается из сброса перед добором', () => {
    const s = structuredClone(makeMatch());
    const pile = CARD_IDS.slice(12, 15);
    s.sides.A.deck = [];
    s.sides.A.discard = [...pile];
    const { state } = playRound(s, aDefault(), bDefault());
    const A = state.sides.A;
    expect(A.hand).toHaveLength(4);
    expect(A.discard).toEqual([]);
    expect(A.deck).toHaveLength(2);
    expect([...A.deck, A.hand[3]].sort()).toEqual([...pile].sort());
  });
});

describe('resolveRound: порядок действий', () => {
  it('порядок: Селена (9) раньше Миры (9) по ATK; Нериса (4) последняя', () => {
    const s = makeMatch({ b: ['mira', 'selena', 'aurora', 'justina', 'nokta', 'kira'] });
    const { events } = playRound(s, aDefault(), bDefault());
    expect(ofType(events, 'heroAction').map(e => e.heroId))
      .toEqual(['selena', 'mira', 'fenna', 'aira', 'aurora', 'nerisa']);
    expect(ofType(events, 'heroAction').every(e => e.phase === 'heroes')).toBe(true);
  });

  it('при равном SPD раньше ходит больший % HP, затем больший ATK', () => {
    // Фенна (SPD 7, ATK 4) и Нокта (SPD 7, ATK 7).
    const order = (s: MatchState) => ofType(playRound(s, aDefault(), bDefault()).events, 'heroAction').map(e => e.heroId);
    expect(order(makeMatch())).toEqual(['justina', 'nokta', 'fenna', 'aira', 'aurora', 'nerisa']);
    expect(order(setHp(makeMatch(), enemy(2), 10))).toEqual(['justina', 'fenna', 'nokta', 'aira', 'aurora', 'nerisa']);
  });
});

describe('resolveRound: basic и swap', () => {
  const teams = {
    a: ['nokta', 'mira', 'fenna', 'tali', 'selena', 'nerisa'] as const,
    b: ['aurora', 'justina', 'kira', 'aira', 'zefira', 'liraya'] as const,
  };
  const make = () => makeMatch({ a: [...teams.a], b: [...teams.b] });
  const A = () => cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0)));
  const B = () => cmd(basic(0, ally(0)), basic(1, ally(1)), basic(2, ally(2)));

  it('три basic: Нокта бьёт Аврору на 8, Аврора бьёт Нокту на 4×1.15 = 5', () => {
    // Раунд 2 (Растущая луна): без бонуса Луны к урону.
    const { state, events } = playRound(setRound(make(), 1), A(), B());
    expect(state.round).toBe(2);
    expect(state.moon).toBe('waxing');
    const dmg = (att: SlotRef) => damageBy(events, att).map(e => [(e.target as SlotRef).side, (e.target as SlotRef).slot, e.dmg]);
    expect(dmg(ally(0))).toEqual([['B', 0, 8]]); // Нокта: 7 × 1.15 = 8.05 → 8
    expect(dmg(ally(1))).toEqual([['B', 0, 4]]); // Мира: 4 × 1
    expect(dmg(ally(2))).toEqual([['B', 0, 4]]); // Фенна: 4 × 1
    expect(dmg(enemy(0))).toEqual([['A', 0, 5]]); // Аврора: 4 × 1.15 = 4.6 → 5
    expect(dmg(enemy(1))).toEqual([['A', 1, 7]]); // Юстина → Мира: 7 × 1
    expect(dmg(enemy(2))).toEqual([['A', 2, 7]]); // Кира → Фенна: 7 × 1
    expect(state.sides.B.active[0].hp).toBe(32 - 16);
    expect(state.sides.A.active.map(h => h.hp)).toEqual([15, 17, 17]);
    expect(state.sides.A.damageDealt).toBe(16);
    expect(state.sides.B.damageDealt).toBe(19);
    const nokta = damageBy(events, ally(0))[0]!;
    expect(nokta).toMatchObject({ raw: 8, flat: 0, reductions: 0, dmg: 8, absorbed: 0, hpLoss: 8, hp: 32 - 4 - 8, shield: 0 }); // Мира (SPD 9) ударила раньше
  });

  it('бонус Луны: в Новолуние Dark +1 (Нокта по Авроре 9)', () => {
    const { events } = playRound(make(), A(), B());
    expect(damageBy(events, ally(0))[0]).toMatchObject({ raw: 8, flat: 1, dmg: 9 });
    expect(damageBy(events, enemy(0))[0]).toMatchObject({ dmg: 5 });
  });

  it('swap: героиня уходит в резерв, вышедшая не действует, в следующем раунде действует', () => {
    const s0 = structuredClone(makeMatch());
    s0.sides.A.active[0].statuses = [{ id: 'taunt', value: 0, stacks: 1, expiresAtRound: 2 }];
    // Юстина (8) и Нокта (7) бьют до замены — Taunt Айры перехватывает; Аврора (5) бьёт после — по Тали.
    const r1 = playRound(s0,
      cmd(swap(0, 0), basic(1, enemy(0)), basic(2, enemy(0))),
      cmd(basic(0, ally(0)), basic(1, ally(1)), basic(2, ally(2))));
    const A1 = r1.state.sides.A;
    expect(A1.active[0].id).toBe('tali');
    expect(A1.reserve[0].id).toBe('aira');
    expect(A1.reserve[0].statuses.some(st => st.id === 'taunt')).toBe(false);
    expect(A1.reserve[0].hp).toBe(20 - 7 - 8);
    expect(A1.active[0].hp).toBe(20 - 4);
    expect(A1.active[0].once['enteredRound']).toBe(1);
    expect(ofType(r1.events, 'redirect').map(e => [e.from, e.to, e.reason])).toEqual([
      [ally(1), ally(0), 'taunt'],
      [ally(2), ally(0), 'taunt'],
    ]);
    expect(ofType(r1.events, 'swap')).toEqual([
      { type: 'swap', round: 1, phase: 'heroes', side: 'A', slot: 0, reserveIndex: 0, out: 'aira', in: 'tali' },
    ]);
    expect(ofType(r1.events, 'heroAction').filter(e => e.heroId === 'tali')).toEqual([]);
    expect(damageBy(r1.events, ally(0))).toEqual([]);

    const r2 = playRound(r1.state, cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0))), bDefault());
    expect(ofType(r2.events, 'heroAction').find(e => e.heroId === 'tali')).toMatchObject({ action: 'basic', target: enemy(0) });
    expect(damageBy(r2.events, ally(0)).map(e => e.dmg)).toEqual([6]); // Тали: 6 × 1 (Water → Light), Растущая луна
  });

  it('в резерве таймеры статусов и щита заморожены: два раунда в резерве не считаются', () => {
    const s0 = structuredClone(makeMatch());
    const aira = s0.sides.A.active[0];
    aira.statuses = [{ id: 'spd', value: 2, stacks: 1, expiresAtRound: 2 }]; // «следующий раунд» от раунда 1
    aira.shield = 5;
    aira.shieldExpiresAtRound = 2;
    const keep = () => cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0)));
    const timers = (h: MatchState['sides']['A']['active'][0]) =>
      ({ id: h.id, spd: h.statuses.find(st => st.id === 'spd')?.expiresAtRound ?? null, shield: h.shield, shieldUntil: h.shieldExpiresAtRound });

    const r1 = playRound(s0, cmd(swap(0, 0), basic(1, enemy(0)), basic(2, enemy(0))), bDefault());
    expect(timers(r1.state.sides.A.reserve[0])).toEqual({ id: 'aira', spd: 3, shield: 5, shieldUntil: 3 });

    const r2 = playRound(healAll(r1.state), keep(), bDefault());
    expect(timers(r2.state.sides.A.reserve[0])).toEqual({ id: 'aira', spd: 4, shield: 5, shieldUntil: 4 });

    const r3 = playRound(healAll(r2.state), cmd(swap(0, 0), basic(1, enemy(0)), basic(2, enemy(0))), bDefault());
    expect(timers(r3.state.sides.A.active[0])).toEqual({ id: 'aira', spd: 4, shield: 5, shieldUntil: 4 });
    expect(effectiveSpd(r3.state.sides.A.active[0])).toBe(8);

    const r4 = playRound(healAll(r3.state), keep(), bDefault());
    expect(timers(r4.state.sides.A.active[0])).toEqual({ id: 'aira', spd: null, shield: 0, shieldUntil: null });
    expect(effectiveSpd(r4.state.sides.A.active[0])).toBe(6);
  });

  it('героиня, вошедшая в этом раунде, пропускает действие', () => {
    const s = structuredClone(makeMatch());
    s.sides.A.active[1].once['enteredRound'] = 1;
    const { events } = playRound(s, aDefault(), bDefault());
    expect(ofType(events, 'heroAction').find(e => e.heroId === 'fenna')).toMatchObject({ action: 'skipped', reason: 'entered' });
    expect(damageBy(events, ally(1))).toEqual([]);
  });

  it('цель умерла раньше по SPD → удар переходит на врага с min HP (событие retarget)', () => {
    let s = setHp(makeMatch(), enemy(2), 1); // Нокта
    s = setHp(s, enemy(1), 10);              // Юстина
    const { state, events } = playRound(s,
      cmd(basic(0, enemy(2)), basic(1, enemy(2)), basic(2, enemy(0))),
      bDefault());
    // Фенна (SPD 7, 100% HP) раньше Нокты (SPD 7, 5% HP) и добивает её.
    expect(events.find(e => e.type === 'death')).toMatchObject({ side: 'B', slot: 2, heroId: 'nokta', phase: 'heroes' });
    expect(ofType(events, 'heroAction').find(e => e.heroId === 'nokta')).toMatchObject({ action: 'skipped', reason: 'dead' });
    expect(ofType(events, 'retarget')).toEqual([
      { type: 'retarget', round: 1, phase: 'heroes', from: enemy(2), to: enemy(1) },
    ]);
    // Пассивка Авроры (HP > 50%): урон по её союзницам −1.
    expect(damageBy(events, ally(0))).toEqual([expect.objectContaining({ target: enemy(1), dmg: 6, reductions: 1 })]);
    // Добивающий удар: урон 4 − 1 = 3, но в HP ушла только 1 — оверкилл не считается.
    expect(damageBy(events, ally(1))).toEqual([expect.objectContaining({ target: enemy(2), dmg: 3, hpLoss: 1, hp: 0 })]);
    expect(state.sides.A.damageDealt).toBe(1 + 6 + 4); // Фенна 1, Айра 6, Нериса → Аврора 4
    expect(state.deaths).toEqual([{ side: 'B', heroId: 'nokta', round: 1 }]);
    expect(state.sides.B.luna).toBe(3);
    expect(ofType(events, 'lunaChanged').filter(e => e.reason === 'death'))
      .toEqual([expect.objectContaining({ side: 'B', luna: 3, delta: 1 })]);
    // Нокта мертва и не ударила; первый урон Нерисы в раунде −3 (пассивка, Task 10): Юстина 7 − 3, Аврора 4.
    expect(state.sides.A.active[2].hp).toBe(31 - 4 - 4);
  });
});

describe('resolveRound: конец раунда', () => {
  it('Burn 2 стака → 4 урона в End Round, death при 0', () => {
    let s = makeMatch({ a: ['tali', 'fenna', 'nerisa', 'aira', 'zefira', 'liraya'] });
    s = setHp(s, enemy(1), 4);
    s.sides.B.active[0].statuses = [{ id: 'burn', value: 0, stacks: 2, expiresAtRound: null }];
    s.sides.B.active[1].statuses = [{ id: 'burn', value: 0, stacks: 2, expiresAtRound: null }];
    const { state, events } = playRound(s,
      cmd(basic(0, enemy(2)), basic(1, enemy(2)), basic(2, enemy(2))),
      bDefault());
    expect(ofType(events, 'burn')).toEqual([
      { type: 'burn', round: 1, phase: 'endRound', target: enemy(0), stacks: 2, dmg: 4, hp: 28 },
      { type: 'burn', round: 1, phase: 'endRound', target: enemy(1), stacks: 2, dmg: 4, hp: 0 },
    ]);
    expect(ofType(events, 'death')).toEqual([
      { type: 'death', round: 1, phase: 'endRound', side: 'B', slot: 1, heroId: 'justina' },
    ]);
    expect(state.deaths).toEqual([{ side: 'B', heroId: 'justina', round: 1 }]);
    expect(state.sides.B.luna).toBe(3);
    expect(state.sides.B.active[0].hp).toBe(28);
    expect(state.sides.B.active[2].hp).toBe(20 - 5 - 3 - 3); // Тали 6, Фенна 4, Нериса 4, каждая −1 от Авроры
  });

  it('автозамена: мёртвая в active[1] меняется с первой живой из reserve', () => {
    let s = setHp(makeMatch(), ally(1), 1);
    s.sides.A.reserve[0].hp = 0; // Тали мертва — выходит Зефира
    s = structuredClone(s);
    const { state, events } = playRound(s, aDefault(), cmd(basic(0, ally(2)), basic(1, ally(1)), basic(2, ally(2))));
    expect(ofType(events, 'death')).toEqual([
      { type: 'death', round: 1, phase: 'heroes', side: 'A', slot: 1, heroId: 'fenna' },
    ]);
    expect(ofType(events, 'autoFill')).toEqual([
      { type: 'autoFill', round: 1, phase: 'endRound', side: 'A', slot: 1, reserveIndex: 1, in: 'zefira' },
    ]);
    expect(state.sides.A.active.map(h => h.id)).toEqual(['aira', 'zefira', 'nerisa']);
    expect(state.sides.A.reserve.map(h => h.id)).toEqual(['tali', 'fenna', 'liraya']);
    expect(state.sides.A.reserve[1].hp).toBe(0);
    expect(state.result).toBeNull();
  });

  it('Blood Moon: последняя из шести → +2 SPD, maxEnergyBonus 1, событие bloodMoon, повторно не срабатывает', () => {
    const s = killAllBut(makeMatch(), 'B', 0);
    s.sides.B.active[0].statuses = [{ id: 'curse', value: 0, stacks: 1, expiresAtRound: null }];
    const bCmd = () => cmd(basic(0, ally(0)), none(), none());
    const r1 = playRound(s, aDefault(), bCmd());
    const aurora1 = r1.state.sides.B.active[0];
    expect(ofType(r1.events, 'bloodMoon')).toEqual([
      { type: 'bloodMoon', round: 1, phase: 'endRound', side: 'B', slot: 0, heroId: 'aurora', cleansed: ['curse'] },
    ]);
    expect(aurora1.bloodMoon).toBe(true);
    expect(aurora1.statuses).toEqual([]);
    expect(effectiveSpd(aurora1)).toBe(7);
    expect(r1.state.sides.B.maxEnergyBonus).toBe(1);
    expect(r1.state.sides.B.bloodMoonUsed).toBe(true);
    expect(r1.state.sides.A.bloodMoonUsed).toBe(false);
    expect(ofType(r1.events, 'autoFill')).toEqual([]);
    expect(r1.state.result).toBeNull();

    const r2 = playRound(r1.state, aDefault(), bCmd());
    expect(ofType(r2.events, 'bloodMoon')).toEqual([]);
    expect(r2.state.sides.B.energy).toBe(5);
    expect(r2.state.sides.B.maxEnergyBonus).toBe(1);
    expect(damageBy(r2.events, enemy(0)).map(e => e.dmg)).toEqual([5]); // 4 × 1.2 = 4.8 → 5
    expect(r2.state.sides.B.active[0].hp).toBe(32 - 15 - 15);
  });

  it('раунд 9: урон ×1.25', () => {
    // moon new → после сдвига Растущая: без бонуса Луны.
    const { state, events } = playRound(setRound(makeMatch(), 8), aDefault(),
      cmd(basic(0, ally(0)), basic(1, ally(1)), basic(2, ally(2))));
    expect(state.round).toBe(9);
    expect(state.moon).toBe('waxing');
    const dmgs = (att: SlotRef) => damageBy(events, att).map(e => e.dmg);
    expect(dmgs(ally(0))).toEqual([9]);  // Айра: 7 × 1.25 = 8.75 → 9
    expect(dmgs(ally(1))).toEqual([5]);  // Фенна: 4 × 1.25 = 5
    expect(dmgs(ally(2))).toEqual([5]);  // Нериса: 4 × 1.25 = 5
    expect(dmgs(enemy(0))).toEqual([5]); // Аврора → Айра: 4 × 1.25 = 5
    expect(dmgs(enemy(1))).toEqual([9]); // Юстина → Фенна: 7 × 1.25 → 9
    expect(dmgs(enemy(2))).toEqual([6]); // Нокта → Нериса: 7 × 1.25 → 9, −3 первый урон Нерисы (пассивка)
    expect(state.sides.B.active[0].hp).toBe(32 - 19);
    expect(state.result).toBeNull();
  });

  it('после 10 раунда result по тай-брейку; resolveRound на оконченном матче бросает', () => {
    const r9 = playRound(setRound(makeMatch(), 8), aDefault(), bDefault());
    expect(r9.state.result).toBeNull();

    const r = playRound(setRound(makeMatch(), 9), aDefault(), bDefault());
    expect(r.state.round).toBe(10);
    // Total Eclipse; живых 6:6; A потеряла 20/31 HP Нерисы (9 + 9 + 5, первый урон −3), B — 19/32 HP Авроры
    // → у B выше сумма % HP.
    expect(r.state.sides.A.active[2].hp).toBe(31 - 20);
    expect(r.state.sides.B.active[0].hp).toBe(32 - 19);
    expect(r.state.result).toEqual({ winner: 'B', reason: 'hpPct' });
    expect(r.events.at(-1)).toEqual({ type: 'matchEnd', round: 10, phase: 'endRound', winner: 'B', reason: 'hpPct' });
    expect(() => playRound(r.state, aDefault(), bDefault())).toThrow('match finished');
    expect(() => startRound(r.state)).toThrow('match finished');
    expect(() => resolveRound(r.state, { A: aDefault(), B: bDefault() })).toThrow('match finished');
  });

  it('Blood Moon не срабатывает, если матч уже решён в этом End Round (R34)', () => {
    let s = killAllBut(makeMatch(), 'A', 0);
    s = killAllBut(s, 'B', 0);
    s.sides.B.active[0].hp = 1;
    // Айра (SPD 6) — последняя у A — добивает Аврору (SPD 5), последнюю у B.
    const { state, events } = playRound(s, cmd(basic(0, enemy(0)), none(), none()), cmd(basic(0, ally(0)), none(), none()));
    expect(state.result).toEqual({ winner: 'A', reason: 'wipe' });
    expect(ofType(events, 'bloodMoon')).toEqual([]);
    expect(state.sides.A.bloodMoonUsed).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'matchEnd', winner: 'A', reason: 'wipe' });
  });

  it('урон от Burn засчитывается в damageDealt противоположной стороны (R34)', () => {
    const s = structuredClone(makeMatch());
    s.sides.B.active[0].statuses = [{ id: 'burn', value: 0, stacks: 2, expiresAtRound: null }];
    s.sides.A.active[1].statuses = [{ id: 'burn', value: 0, stacks: 1, expiresAtRound: null }];
    const { state, events } = playRound(s, cmd(basic(0, enemy(1)), basic(1, enemy(1)), basic(2, enemy(1))), bDefault());
    const hitsBySide = (side: Side) => ofType(events, 'damage')
      .filter(e => (e.attacker as SlotRef).side === side).reduce((sum, e) => sum + (e.hpLoss as number), 0);
    // По Авроре: 2 стака × 2 + 1 (пассивка Айры «Жар») = 5.
    expect(ofType(events, 'burn').map(e => [e.target, e.dmg])).toEqual([[ally(1), 2], [enemy(0), 5]]);
    expect(state.sides.A.damageDealt).toBe(hitsBySide('A') + 5);
    expect(state.sides.B.damageDealt).toBe(hitsBySide('B') + 2);
  });

  it('обе стороны теряют последнюю в одном раунде → draw', () => {
    let s = killAllBut(makeMatch(), 'A', 0);
    s = killAllBut(s, 'B', 0);
    s.sides.A.active[0].hp = 2;
    s.sides.A.active[0].statuses = [{ id: 'burn', value: 0, stacks: 1, expiresAtRound: null }];
    s.sides.B.active[0].hp = 1;
    const { state, events } = playRound(s, cmd(basic(0, enemy(0)), none(), none()), cmd(basic(0, ally(0)), none(), none()));
    expect(ofType(events, 'death').map(e => [e.heroId, e.phase])).toEqual([['aurora', 'heroes'], ['aira', 'endRound']]);
    expect(ofType(events, 'bloodMoon')).toEqual([]);
    expect(state.result).toEqual({ winner: 'draw', reason: 'wipe' });
    expect(events.at(-1)).toMatchObject({ type: 'matchEnd', winner: 'draw', reason: 'wipe' });
  });
});

describe('resolveRound: детерминизм и валидация', () => {
  it('детерминизм: два прогона одинаковых команд от одного seed дают равные состояния и события', () => {
    // Зеркальные составы: при полном равенстве SPD/HP/ATK порядок решает rng.
    const play = () => {
      let s = makeMatch({ b: ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], seed: 42 });
      const all: GameEvent[] = [];
      for (let i = 0; i < 4; i++) {
        const before = structuredClone(s);
        const r = playRound(s, autoCmds(s, 'A'), autoCmds(s, 'B'));
        expect(s).toEqual(before); // вход не мутируется
        expect(r.state.rngState).not.toBe(s.rngState);
        all.push(...r.events);
        s = r.state;
      }
      return { s, all };
    };
    const one = play(), two = play();
    expect(two.s).toEqual(one.s);
    expect(two.all).toEqual(one.all);
    expect(one.all.length).toBeGreaterThan(0);
  });

  it('невалидные команды → Error("invalid commands")', () => {
    const s = makeMatch();
    expect(() => playRound(s, cmd(basic(0, ally(1)), basic(1, enemy(0)), basic(2, enemy(0))), bDefault()))
      .toThrow('invalid commands: A: wrong target type');
    expect(() => playRound(s, aDefault(), cmd(none(), basic(1, ally(0)), basic(2, ally(0)))))
      .toThrow('invalid commands: B: none only for dead hero');
  });

  it('resolveRound без startRound бросает "round not started"', () => {
    const s = makeMatch();
    expect(s.awaitingCommands).toBe(false);
    expect(() => resolveRound(s, { A: aDefault(), B: bDefault() })).toThrow('round not started');
    const started = startRound(s);
    expect(started.state.awaitingCommands).toBe(true);
    expect(s.awaitingCommands).toBe(false); // вход не мутируется
    expect(started.state.rngState).toBe(s.rngState); // добор без перетасовки rng не трогает
    const done = resolveRound(started.state, { A: aDefault(), B: bDefault() });
    expect(done.state.awaitingCommands).toBe(false);
    expect(started.state.awaitingCommands).toBe(true);
    expect(() => resolveRound(done.state, { A: aDefault(), B: bDefault() })).toThrow('round not started');
    expect(() => startRound(started.state)).toThrow('round already started');
  });

  it('валидация видит начатый раунд: в раунде 3 энергия 5 и добранная карта', () => {
    const pre = structuredClone(setRound(makeMatch(), 2));
    pre.sides.A.hand[0] = 'moonTurn'; // 1 Energy, без цели
    pre.sides.A.deck[0] = 'reserveImpulse';
    // Скиллы 2 + 1 + 1 и карта 1 = 5 Energy: в раунде 2 бюджет 4, в раунде 3 бюджет 5.
    const energy5 = cmd(skill(0), skill(1, ally(0)), skill(2, ally(2)), { handIndex: 0 });
    // Карта с индексом 3 появляется в руке только после добора раунда 3.
    const drawn = cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0)), { handIndex: 3 });
    expect(validateCommands(pre, 'A', energy5)).toEqual(['not enough energy']);
    expect(validateCommands(pre, 'A', drawn)).toEqual(['card not in hand']);

    const { state: started, events } = startRound(pre);
    expect(started.round).toBe(3);
    expect(started.sides.A.energy).toBe(5);
    expect(started.sides.A.hand[3]).toBe('reserveImpulse');
    expect(events.map(e => e.phase)).toEqual(events.map(() => 'roundStart'));
    expect(validateCommands(started, 'A', energy5)).toEqual([]);
    expect(validateCommands(started, 'A', drawn)).toEqual([]);
    const r = resolveRound(started, { A: energy5, B: bDefault() });
    // Скиллы Фенны и Нерисы по союзницам урона не наносят.
    expect(damageBy(r.events, ally(1))).toEqual([]);
    expect(damageBy(r.events, ally(2))).toEqual([]);
    expect(() => resolveRound(started, { A: drawn, B: bDefault() })).not.toThrow();
  });
});

describe('resolveRound: события тихих изменений', () => {
  // A: Айра(0), Фенна(1), Нериса(2). B: Аврора(0), Юстина(1), Нокта(2). На стороне B нет перехватчиков.
  const removed = (events: GameEvent[], reason: string) =>
    ofType(events, 'statusRemoved').filter(e => e.reason === reason).map(e => [e.target, e.status, e.phase]);

  it.each([
    ['mark', enemy(0)],
    ['damageReduction', enemy(0)],
    ['pierce', ally(0)],
    ['nextHitBonus', ally(0)],
  ] as const)('одноразовый %s расходуется в ударе → statusRemoved reason consumed', (id, holder) => {
    const s = structuredClone(makeMatch());
    s.sides[holder.side].active[holder.slot].statuses = [{ id, value: 2, stacks: 1, expiresAtRound: null }];
    const { events } = playRound(s, cmd(basic(0, enemy(0)), basic(1, enemy(1)), basic(2, enemy(1))), bDefault());
    expect(removed(events, 'consumed')).toEqual([[holder, id, 'heroes']]);
  });

  it('Undying спасает от летального удара → statusRemoved reason consumed', () => {
    const s = setHp(makeMatch(), enemy(0), 1);
    s.sides.B.active[0].statuses = [{ id: 'undying', value: 0, stacks: 1, expiresAtRound: 1 }];
    const { state, events } = playRound(s, cmd(basic(0, enemy(0)), basic(1, enemy(1)), basic(2, enemy(1))), bDefault());
    expect(removed(events, 'consumed')).toEqual([[enemy(0), 'undying', 'heroes']]);
    expect(state.sides.B.active[0].hp).toBe(1);
  });

  it('End Round: истёкшие статусы → statusRemoved reason expired, истёкший щит → shieldExpired', () => {
    const s = structuredClone(makeMatch());
    const aira = s.sides.A.active[0];
    aira.statuses = [{ id: 'spd', value: 2, stacks: 1, expiresAtRound: 1 }, { id: 'curse', value: 0, stacks: 1, expiresAtRound: null }];
    aira.shield = 5;
    aira.shieldExpiresAtRound = 1;
    const { state, events } = playRound(s, aDefault(), bDefault());
    expect(ofType(events, 'statusRemoved').filter(e => e.reason === 'expired').map(e => [e.target, e.status, e.value, e.phase]))
      .toEqual([[ally(0), 'spd', 2, 'endRound']]);
    expect(ofType(events, 'shieldExpired').map(e => [e.target, e.amount, e.phase])).toEqual([[ally(0), 5, 'endRound']]);
    expect(state.sides.A.active[0].shield).toBe(0);
    expect(state.sides.A.active[0].statuses.map(x => x.id)).toEqual(['curse']);
  });

  it('Energy, потраченная на Skill, Ultimate и карту → energyChanged с причиной', () => {
    const started = startRound(makeMatch()).state;
    started.sides.A.luna = 3;
    started.sides.A.hand = ['fieldKit'];
    // Фенна (SPD 7) лечит, Айра (6) бьёт, Нериса (4) — ульта; затем Standard-карта.
    const a = cmd(basic(0, enemy(0)), skill(1, ally(2)), ult(2), { handIndex: 0, target: ally(2) });
    const { events } = resolveRound(started, { A: a, B: bDefault() });
    expect(ofType(events, 'energyChanged').filter(e => e.side === 'A').map(e => [e.energy, e.delta, e.reason, e.phase]))
      .toEqual([[3, -1, 'skill', 'heroes'], [1, -2, 'ultimate', 'heroes'], [0, -1, 'card', 'standard']]);
  });
});
