import { describe, it, expect } from 'vitest';
import { startRound } from '../resolve/round';
import { makeCtx } from '../resolve/context';
import { runAbility, runHeroAction } from '../resolve/actions';
import { dealHit } from '../resolve/effects';
import { fire } from '../resolve/triggers';
import { cardCost } from '../validate';
import { HEROES } from '../data/heroes';
import type { GameEvent, HeroId, MatchState, SlotRef, Status } from '../types';
import { makeMatch, cmd, basic, ult, enemy, ally, setLuna, playRound } from './helpers';

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

const hpOf = (s: MatchState, ref: SlotRef) => s.sides[ref.side].active[ref.slot].hp;
const findSt = (s: MatchState, ref: SlotRef, id: Status['id']) => s.sides[ref.side].active[ref.slot].statuses.find(x => x.id === id);

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

describe('хуки героинь', () => {
  it('aira.burnBonus: тик Burn 2 → 3; aira.detonate: ульта 120% всем + лишний тик Burn (2 × стаки + 1)', () => {
    // Тик: Юстина (враг Айры) 1 стак → 2 + 1 = 3; Фенна (союзница Айры) 1 стак → 2.
    let s = withStatus(makeMatch(), enemy(1), st('burn'));
    s = withStatus(s, ally(1), st('burn'));
    const r = playRound(s, cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0))),
      cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2))));
    expect(ofType(r.events, 'burn').map(e => [e.target, e.dmg, e.hp])).toEqual([[ally(1), 2, 22], [enemy(1), 3, 20]]);

    // Ульта: 7×1.2 = 8.4 → 8 (Юстине и Нокте 8 − 1 Аврора = 7), затем один лишний тик Burn:
    // 2 × стаки + 1 (пассивка) — 3 стака → 7, 1 стак → 3.
    const ctx = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], undefined, x => {
      x.sides.A.luna = 3;
      x.sides.B.active[1].statuses.push(st('burn', 0, null, 3));
      x.sides.B.active[2].statuses.push(st('burn'));
    });
    runAbility(ctx, ally(0), HEROES.aira.ultimate, undefined, 'ultimate');
    expect(hits(ctx.events, ally(0)).map(h => [h.target, h.dmg])).toEqual([[enemy(0), 8], [enemy(1), 7], [enemy(2), 7]]);
    expect(ofType(ctx.events, 'detonate').map(e => [e.target, e.stacks, e.dmg])).toEqual([[enemy(1), 3, 7], [enemy(2), 1, 3]]);
    expect([hpOf(ctx.s, enemy(0)), hpOf(ctx.s, enemy(1)), hpOf(ctx.s, enemy(2))]).toEqual([24, 9, 10]);
  });

  it('fenna.revive: последняя погибшая возвращается 9 HP + Shield 3 на своём слоте; без погибших Heal 5 всем активным', () => {
    // Тали погибла раньше (лежит в резерве), Нериса позже (лежит в активном слоте 2).
    const ctx = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], undefined, x => {
      x.sides.A.luna = 3;
      x.sides.A.active[2].hp = 0;
      x.sides.A.active[2].once.deathRecorded = 1;
      x.sides.A.reserve[0].hp = 0;
      x.sides.A.reserve[0].once.deathRecorded = 1;
      x.deaths = [{ side: 'A', heroId: 'tali', round: 1 }, { side: 'B', heroId: 'kira', round: 1 }, { side: 'A', heroId: 'nerisa', round: 1 }];
    });
    runAbility(ctx, ally(1), HEROES.fenna.ultimate, undefined, 'ultimate');
    const nerisa = ctx.s.sides.A.active[2];
    expect([nerisa.id, nerisa.hp, nerisa.shield, nerisa.once.deathRecorded]).toEqual(['nerisa', 9, 3, undefined]);
    expect(ofType(ctx.events, 'revive').map(e => [e.side, e.heroId, e.hp])).toEqual([['A', 'nerisa', 9]]);
    expect(ctx.s.sides.A.reserve[0].hp).toBe(0);

    // Нериса уже вернулась → следующая по давности погибшая — Тали в резерве; она остаётся в резерве.
    const ctx2 = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], undefined, x => {
      x.sides.A.luna = 3;
      x.sides.A.reserve[0].hp = 0;
      x.deaths = [{ side: 'A', heroId: 'tali', round: 1 }, { side: 'A', heroId: 'nerisa', round: 1 }];
    });
    runAbility(ctx2, ally(1), HEROES.fenna.ultimate, undefined, 'ultimate');
    const tali = ctx2.s.sides.A.reserve[0];
    expect([tali.id, tali.hp, tali.shield]).toEqual(['tali', 9, 3]);
    expect(ofType(ctx2.events, 'revive').map(e => e.heroId)).toEqual(['tali']);

    // Погибших нет: Heal 5 всем активным, первое лечение +2 (пассивка).
    const ctx3 = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], undefined, x => {
      x.sides.A.luna = 3;
      x.sides.A.active[0].hp = 10;
      x.sides.A.active[1].hp = 20;
      x.sides.A.active[2].hp = 20;
    });
    runAbility(ctx3, ally(1), HEROES.fenna.ultimate, undefined, 'ultimate');
    expect(ofType(ctx3.events, 'heal').map(e => [e.target, e.amount, e.hp]))
      .toEqual([[ally(0), 7, 17], [ally(1), 5, 24], [ally(2), 5, 25]]);
    expect(ofType(ctx3.events, 'revive')).toEqual([]);
  });

  it('nerisa.firstHit: первый урон в раунде −3, второй нет; nerisa.guard: Shield 4 и redirectTo Нериса на один удар', () => {
    const ctx = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya']);
    runAbility(ctx, ally(2), HEROES.nerisa.skill, ally(1), 'skill');
    expect(ofType(ctx.events, 'shield').map(e => [e.target, e.amount])).toEqual([[ally(1), 4]]);
    // Юстина (ATK 7, Light → Water/Fire ×1): удар по Фенне уходит в Нерису, первый урон Нерисы −3.
    dealHit(ctx, enemy(1), ally(1), 1, 0, { single: true });
    // Второй удар по Фенне уже не перенаправляется: щит 4 поглощает.
    dealHit(ctx, enemy(1), ally(1), 1, 0, { single: true });
    // Второй урон Нерисы без снижения.
    dealHit(ctx, enemy(1), ally(2), 1, 0, { single: true });
    expect(ofType(ctx.events, 'redirect').map(e => [e.from, e.to, e.reason])).toEqual([[ally(1), ally(2), 'nerisa']]);
    expect(hits(ctx.events, enemy(1))).toEqual([
      { target: ally(2), dmg: 4, reductions: 3, absorbed: 0 },
      { target: ally(1), dmg: 7, reductions: 0, absorbed: 4 },
      { target: ally(2), dmg: 7, reductions: 0, absorbed: 0 },
    ]);
  });

  it('tali.freezeSoaked: удар по Soak → Freeze, раз в раунд; tali.tide: 90% всем, Soak всем, у кого был — Freeze', () => {
    const team: HeroId[] = ['tali', 'fenna', 'nerisa', 'aira', 'zefira', 'liraya'];
    const ctx = ctxFor(team, undefined, x => {
      x.sides.B.active[1].statuses.push(st('soak', 0, 2));
      x.sides.B.active[2].statuses.push(st('soak', 0, 2));
    });
    dealHit(ctx, ally(0), enemy(0), 1, 0, { single: true }); // без Soak: пассивка не тратится
    dealHit(ctx, ally(0), enemy(1), 1, 0, { single: true }); // Soak → Freeze, Soak снят
    dealHit(ctx, ally(0), enemy(2), 1, 0, { single: true }); // второй раз в раунде — нет
    expect(statusIds(ctx.s, enemy(0))).toEqual([]);
    expect(findSt(ctx.s, enemy(1), 'freeze')).toMatchObject({ expiresAtRound: 2 });
    expect(findSt(ctx.s, enemy(1), 'soak')).toBeUndefined();
    expect(statusIds(ctx.s, enemy(2))).toEqual(['soak']);

    // Ульта; пассивка в этом раунде уже потрачена, чтобы видеть только «Прилив».
    const ctx2 = ctxFor(team, undefined, x => {
      x.sides.A.luna = 3;
      x.sides.A.active[0].once['tali.freezeSoaked'] = 1;
      x.sides.B.active[0].statuses.push(st('soak', 0, 2));
    });
    runAbility(ctx2, ally(0), HEROES.tali.ultimate, undefined, 'ultimate');
    // 6×0.9 = 5.4 → 5; Юстине и Нокте 5 − 1 (Аврора) = 4.
    expect(hits(ctx2.events, ally(0)).map(h => [h.target, h.dmg])).toEqual([[enemy(0), 5], [enemy(1), 4], [enemy(2), 4]]);
    expect(statusIds(ctx2.s, enemy(0))).toEqual(['freeze']);
    expect(statusIds(ctx2.s, enemy(1))).toEqual(['soak']);
    expect(statusIds(ctx2.s, enemy(2))).toEqual(['soak']);
    expect(findSt(ctx2.s, enemy(0), 'freeze')).toMatchObject({ expiresAtRound: 2 });
  });

  it('zefira.intercept: через dealHit удар по союзнице уходит в Зефиру с −2', () => {
    const team: HeroId[] = ['zefira', 'fenna', 'nerisa', 'aira', 'tali', 'liraya'];
    const ctx = ctxFor(team);
    dealHit(ctx, enemy(1), ally(1), 1, 0, { single: true });
    dealHit(ctx, enemy(1), ally(1), 1, 0, { single: true });
    expect(ofType(ctx.events, 'redirect').map(e => [e.from, e.to, e.reason])).toEqual([[ally(1), ally(0), 'zefira']]);
    // Light → Wind ×1: 7 − 2 = 5; второй удар в раунде не перехватывается.
    expect(hits(ctx.events, enemy(1))).toEqual([
      { target: ally(0), dmg: 5, reductions: 2, absorbed: 0 },
      { target: ally(1), dmg: 7, reductions: 0, absorbed: 0 },
    ]);

    // Умение (R19): Юстина skill по Фенне → в Зефиру, 7×1.2 = 8.4 → 8 − 2 = 6.
    const ctx2 = ctxFor(team);
    runAbility(ctx2, enemy(1), HEROES.justina.skill, ally(1), 'skill');
    expect(hits(ctx2.events, enemy(1))).toEqual([{ target: ally(0), dmg: 6, reductions: 2, absorbed: 0 }]);
  });

  it('zefira.mirror: щит 5 пробит → атакующий получает Mark; не пробит → нет Mark', () => {
    const team: HeroId[] = ['zefira', 'fenna', 'nerisa', 'aira', 'tali', 'liraya'];
    const spentIntercept = (x: MatchState) => { x.sides.A.active[0].once['zefira.intercept'] = 1; };
    const ctx = ctxFor(team, undefined, spentIntercept);
    runAbility(ctx, ally(0), HEROES.zefira.skill, ally(1), 'skill');
    expect(ofType(ctx.events, 'shield').map(e => [e.target, e.amount])).toEqual([[ally(1), 5]]);
    expect(findSt(ctx.s, ally(1), 'mirrorShield')).toMatchObject({ source: ally(0), expiresAtRound: 1 });
    dealHit(ctx, enemy(1), ally(1), 1, 0, { single: true }); // 7: щит 5 пробит
    expect(ofType(ctx.events, 'statusApplied').filter(e => e.status === 'mark').map(e => [e.source, e.target]))
      .toEqual([[ally(0), enemy(1)]]);
    expect(findSt(ctx.s, ally(1), 'mirrorShield')).toBeUndefined();

    const ctx2 = ctxFor(team, undefined, spentIntercept);
    runAbility(ctx2, ally(0), HEROES.zefira.skill, ally(1), 'skill');
    dealHit(ctx2, enemy(1), ally(1), 0.5, 0, { single: true }); // 3.5 → 4: щит 5 → 1
    expect(ctx2.s.sides.A.active[1].shield).toBe(1);
    expect(ofType(ctx2.events, 'statusApplied').filter(e => e.status === 'mark')).toEqual([]);
    expect(statusIds(ctx2.s, enemy(1))).not.toContain('mark');
  });

  it('zefira.reflect: 3 срабатывания по 2 прямого урона атакующим, четвёртое нет; один заряд за действие врага', () => {
    const a: HeroId[] = ['zefira', 'fenna', 'nerisa', 'aira', 'tali', 'liraya'];
    const withReflect = (b?: HeroId[]) => {
      const ctx = ctxFor(a, b, x => { x.sides.A.luna = 3; x.sides.B.luna = 3; });
      runAbility(ctx, ally(0), HEROES.zefira.ultimate, undefined, 'ultimate');
      return ctx;
    };

    // Три отдельные Basic → три отражения, четвёртая — нет, статус снят.
    const ctx = withReflect();
    expect(findSt(ctx.s, ally(0), 'reflect')).toMatchObject({ value: 3, expiresAtRound: 2 });
    runHeroAction(ctx, enemy(1), { type: 'basic', target: ally(1) });
    runHeroAction(ctx, enemy(2), { type: 'basic', target: ally(2) });
    runHeroAction(ctx, enemy(1), { type: 'basic', target: ally(0) });
    runHeroAction(ctx, enemy(1), { type: 'basic', target: ally(1) });
    expect(ofType(ctx.events, 'reflect').map(e => [e.from, e.to, e.dmg]))
      .toEqual([[ally(0), enemy(1), 2], [ally(0), enemy(2), 2], [ally(0), enemy(1), 2]]);
    expect([hpOf(ctx.s, enemy(1)), hpOf(ctx.s, enemy(2))]).toEqual([19, 18]);
    expect(findSt(ctx.s, ally(0), 'reflect')).toBeUndefined();

    // «Звездопад» Селены (три удара одним действием) → одно отражение, осталось 2 заряда.
    const ctx2 = withReflect(['selena', 'justina', 'nokta', 'aurora', 'mira', 'kira']);
    runHeroAction(ctx2, enemy(0), { type: 'ultimate', target: ally(1) });
    expect(hits(ctx2.events, enemy(0)).length).toBe(3);
    expect(ofType(ctx2.events, 'reflect').map(e => [e.to, e.dmg])).toEqual([[enemy(0), 2]]);
    expect(hpOf(ctx2.s, enemy(0))).toBe(20);
    expect(findSt(ctx2.s, ally(0), 'reflect')).toMatchObject({ value: 2 });

    // Ульта Нокты по трём союзницам (AoE) → одно отражение, осталось 2 заряда.
    const ctx3 = withReflect();
    runHeroAction(ctx3, enemy(2), { type: 'ultimate' });
    expect(hits(ctx3.events, enemy(2)).length).toBe(3);
    expect(ofType(ctx3.events, 'reflect').map(e => [e.to, e.dmg])).toEqual([[enemy(2), 2]]);
    expect(hpOf(ctx3.s, enemy(2))).toBe(18);
    expect(findSt(ctx3.s, ally(0), 'reflect')).toMatchObject({ value: 2 });
  });

  it('aurora.unshaken: Shield 4 всем, nextCardCostUp противника 1 до конца следующего раунда: его карта за 1 стоит 2, через два раунда снова 1', () => {
    const aPlan = () => cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0)));
    const r1 = playRound(setLuna(makeMatch(), 'B', 1), aPlan(), cmd(ult(0), basic(1, ally(2)), basic(2, ally(2))));
    expect(ofType(r1.events, 'shield').map(e => [e.target, e.amount])).toEqual([[enemy(0), 4], [enemy(1), 4], [enemy(2), 4]]);
    expect(r1.state.sides.A.nextCardCostUp).toEqual({ value: 1, untilRound: 2 });
    expect(r1.state.sides.B.nextCardCostUp).toBeNull();
    const round2 = startRound(r1.state).state;
    expect(cardCost(round2, 'A', 'lunarDash')).toBe(2);
    expect(cardCost(round2, 'B', 'lunarDash')).toBe(1);
    const r2 = playRound(r1.state, aPlan(), cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2))));
    expect(cardCost(startRound(r2.state).state, 'A', 'lunarDash')).toBe(1);
  });

  it('justina.pursuit: враг получил щит → +1 SPD до конца раунда, раз в раунд; justina.verdict: 200%, убийство → +1 Luna', () => {
    const ctx = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya']);
    runAbility(ctx, enemy(0), HEROES.aurora.skill, undefined, 'skill'); // свой бафф — нет
    runAbility(ctx, ally(2), HEROES.nerisa.skill, ally(1), 'skill');    // щит врагу — да
    runAbility(ctx, ally(2), HEROES.nerisa.skill, ally(0), 'skill');    // второй раз в раунде — нет
    expect(ofType(ctx.events, 'statusApplied').filter(e => e.status === 'spd').map(e => [e.target, e.value]))
      .toEqual([[enemy(1), 1]]);
    expect(findSt(ctx.s, enemy(1), 'spd')).toMatchObject({ value: 1, expiresAtRound: 1 });

    // Две Юстины: бафф одной — «вражеский бафф» для другой; каждая получает +1 ровно один раз.
    const ctxJ = ctxFor(['justina', 'fenna', 'nerisa', 'aira', 'zefira', 'liraya'], ['justina', 'aurora', 'nokta', 'kira', 'mira', 'selena']);
    runAbility(ctxJ, ally(2), HEROES.nerisa.skill, ally(1), 'skill');
    expect(ofType(ctxJ.events, 'statusApplied').filter(e => e.status === 'spd').map(e => e.target)).toEqual([enemy(0), ally(0)]);

    // Ульта: 7×2.0 = 14 по Айре с 10 HP → гибель, Luna Юстины 3 − 3 + 1 = 1.
    const ctx2 = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], undefined, x => {
      x.sides.B.luna = 3;
      x.sides.A.active[0].hp = 10;
    });
    runAbility(ctx2, enemy(1), HEROES.justina.ultimate, ally(0), 'ultimate');
    expect(hits(ctx2.events, enemy(1))).toEqual([{ target: ally(0), dmg: 14, reductions: 0, absorbed: 0 }]);
    expect(ofType(ctx2.events, 'lunaChanged').filter(e => e.side === 'B').map(e => [e.delta, e.luna, e.reason]))
      .toEqual([[-3, 0, 'ultimate'], [1, 1, 'verdict']]);
    expect(ctx2.s.sides.B.luna).toBe(1);

    // Цель выжила — Luna не прибавляется.
    const ctx3 = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], undefined, x => { x.sides.B.luna = 3; });
    runAbility(ctx3, enemy(1), HEROES.justina.ultimate, ally(0), 'ultimate');
    expect(hpOf(ctx3.s, ally(0))).toBe(6);
    expect(ctx3.s.sides.B.luna).toBe(0);
  });

  it('nokta.fallen: 100% всем, +3 каждой с Curse, Curse снят', () => {
    const ctx = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], undefined, x => {
      x.sides.B.luna = 3;
      x.sides.A.active[0].statuses.push(st('curse'));
      x.sides.A.active[2].statuses.push(st('curse'));
    });
    runAbility(ctx, enemy(2), HEROES.nokta.ultimate, undefined, 'ultimate');
    // 7 + 1 (Dark в Новолуние) = 8; +1 Порча по проклятым; Нериса −3 (первый урон в раунде).
    expect(hits(ctx.events, enemy(2)).map(h => [h.target, h.dmg])).toEqual([[ally(0), 9], [ally(1), 8], [ally(2), 6]]);
    expect(ofType(ctx.events, 'directDamage').map(e => [e.target, e.dmg, e.reason]))
      .toEqual([[ally(0), 3, 'nokta.fallen'], [ally(2), 3, 'nokta.fallen']]);
    expect([hpOf(ctx.s, ally(0)), hpOf(ctx.s, ally(1)), hpOf(ctx.s, ally(2))]).toEqual([8, 16, 22]);
    expect(statusIds(ctx.s, ally(0))).toEqual([]);
    expect(statusIds(ctx.s, ally(2))).toEqual([]);
  });

  it('kira.ruin: 220%; при своём Blood Moon +4', () => {
    const b: HeroId[] = ['kira', 'justina', 'nokta', 'aurora', 'mira', 'selena'];
    const a: HeroId[] = ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'];
    // 7×2.2 = 15.4 → 15, +1 Dark в Новолуние = 16, Нериса −3 = 13.
    const ctx = ctxFor(a, b, x => { x.sides.B.luna = 3; });
    runAbility(ctx, enemy(0), HEROES.kira.ultimate, ally(2), 'ultimate');
    expect(hits(ctx.events, enemy(0))).toEqual([{ target: ally(2), dmg: 13, reductions: 3, absorbed: 0 }]);
    expect(hpOf(ctx.s, ally(2))).toBe(18);

    // Blood Moon: (15 + 4 + 1) × 1.2 = 24, −3 = 21.
    const ctx2 = ctxFor(a, b, x => { x.sides.B.luna = 3; x.sides.B.active[0].bloodMoon = true; });
    runAbility(ctx2, enemy(0), HEROES.kira.ultimate, ally(2), 'ultimate');
    expect(ofType(ctx2.events, 'damage').map(e => [e.raw, e.flat, e.dmg])).toEqual([[15, 5, 21]]);
    expect(hpOf(ctx2.s, ally(2))).toBe(10);
  });

  it('mira.rebuild: Heal 4 и Draw 1; mira.repeat: нет карты → Draw 2; Legendary не повторяется (Draw 2)', () => {
    const b: HeroId[] = ['mira', 'justina', 'nokta', 'aurora', 'kira', 'selena'];
    const ctx = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], b, x => { x.sides.B.active[1].hp = 15; });
    const hand = ctx.s.sides.B.hand.length;
    runAbility(ctx, enemy(0), HEROES.mira.skill, enemy(1), 'skill');
    expect(ofType(ctx.events, 'heal').map(e => [e.target, e.amount, e.hp])).toEqual([[enemy(1), 4, 19]]);
    expect(ofType(ctx.events, 'draw').map(e => e.side)).toEqual(['B']);
    expect(ctx.s.sides.B.hand.length).toBe(hand + 1);

    // Повтор обычной карты — cards.test.ts; здесь только Draw 2.
    for (const last of [null, { cardId: 'rewriteFate' as const }]) {
      const c = ctxFor(['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], b, x => {
        x.sides.B.luna = 3;
        x.sides.B.hand = [];
        x.sides.B.lastCardPlayed = last;
      });
      runAbility(c, enemy(0), HEROES.mira.ultimate, undefined, 'ultimate');
      expect(ofType(c.events, 'draw').length).toBe(2);
      expect(c.s.sides.B.hand.length).toBe(2);
    }
  });

  it('selena.impulse: после карты стороны следующий удар +2, второй без бонуса; selena.starfall: 3×80%, после смерти цели остаток на min HP', () => {
    const b: HeroId[] = ['selena', 'justina', 'nokta', 'aurora', 'mira', 'kira'];
    const a: HeroId[] = ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'];
    const ctx = ctxFor(a, b);
    fire(ctx, 'onCardPlayed', { side: 'A', card: 'lunarDash' }); // карта другой стороны — нет
    expect(findSt(ctx.s, enemy(0), 'nextHitBonus')).toBeUndefined();
    fire(ctx, 'onCardPlayed', { side: 'B', card: 'lunarDash' });
    expect(findSt(ctx.s, enemy(0), 'nextHitBonus')).toMatchObject({ value: 2, expiresAtRound: 1 });
    dealHit(ctx, enemy(0), ally(1), 1, 0, { single: true });
    dealHit(ctx, enemy(0), ally(1), 1, 0, { single: true });
    // Star → Fire ×1: 6 + 2 = 8, затем 6.
    expect(hits(ctx.events, enemy(0)).map(h => h.dmg)).toEqual([8, 6]);

    // Ульта: 6×0.8 = 4.8 → 5. Айра (5 HP) гибнет первым ударом, два оставшихся — Фенне (min HP 24 < 31).
    const ctx2 = ctxFor(a, b, x => { x.sides.B.luna = 3; x.sides.A.active[0].hp = 5; });
    runAbility(ctx2, enemy(0), HEROES.selena.ultimate, ally(0), 'ultimate');
    expect(hits(ctx2.events, enemy(0)).map(h => [h.target, h.dmg])).toEqual([[ally(0), 5], [ally(1), 5], [ally(1), 5]]);
    expect(ofType(ctx2.events, 'retarget').map(e => [e.from, e.to])).toEqual([[ally(0), ally(1)]]);
    expect([hpOf(ctx2.s, ally(0)), hpOf(ctx2.s, ally(1))]).toEqual([0, 14]);

    // Без смерти цели все три удара по ней.
    const ctx3 = ctxFor(a, b, x => { x.sides.B.luna = 3; });
    runAbility(ctx3, enemy(0), HEROES.selena.ultimate, ally(0), 'ultimate');
    expect(hits(ctx3.events, enemy(0)).map(h => [h.target, h.dmg])).toEqual([[ally(0), 5], [ally(0), 5], [ally(0), 5]]);
  });
});
