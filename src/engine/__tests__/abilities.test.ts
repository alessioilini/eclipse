import { describe, it, expect } from 'vitest';
import { startRound } from '../resolve/round';
import { makeCtx } from '../resolve/context';
import { runAbility } from '../resolve/actions';
import { dealHit } from '../resolve/effects';
import { validateCommands } from '../validate';
import { HEROES } from '../data/heroes';
import { MOON_ORDER } from '../types';
import type { GameEvent, MatchState, MoonPhase, SlotRef, Status } from '../types';
import { makeMatch, cmd, basic, skill, ult, enemy, ally, setHp, setLuna, playRound } from './helpers';

const ofType = (events: GameEvent[], type: string) => events.filter(e => e.type === type);
const isRef = (a: unknown, b: SlotRef) => {
  const r = a as SlotRef | undefined;
  return !!r && r.side === b.side && r.slot === b.slot;
};
const damageBy = (events: GameEvent[], attacker: SlotRef) =>
  ofType(events, 'damage').filter(e => isRef(e.attacker, attacker));
/** Compact view of damage events: target, dmg and the parts that matter for the check. */
const hits = (events: GameEvent[], attacker: SlotRef) =>
  damageBy(events, attacker).map(e => ({ target: e.target, dmg: e.dmg, reductions: e.reductions, absorbed: e.absorbed }));

/** The next startRound lands in round 2 with the given moon phase (energy 4, Luna +1 or +2 at new moon). */
function atMoon(state: MatchState, moon: MoonPhase): MatchState {
  const s = structuredClone(state);
  s.round = 1;
  s.moon = MOON_ORDER[(MOON_ORDER.indexOf(moon) + 3) % 4]!;
  return s;
}

function withStatus(state: MatchState, ref: SlotRef, st: Status): MatchState {
  const s = structuredClone(state);
  s.sides[ref.side].active[ref.slot].statuses.push(st);
  return s;
}

const statusIds = (s: MatchState, ref: SlotRef) => s.sides[ref.side].active[ref.slot].statuses.map(x => x.id);

describe('умения героинь через данные', () => {
  it('Айра skill: 90% всем врагам, Burn на враге с max ATK; Energy −2', () => {
    // Раунд 1, Новолуние. 7×0.9 = 6.3 → 6. Аврора (HP > 50%) снижает урон по союзницам на 1.
    const { state, events } = playRound(makeMatch(),
      cmd(skill(0), basic(1, enemy(0)), basic(2, enemy(0))),
      cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2))));
    expect(hits(events, ally(0))).toEqual([
      { target: enemy(0), dmg: 6, reductions: 0, absorbed: 0 },
      { target: enemy(1), dmg: 5, reductions: 1, absorbed: 0 },
      { target: enemy(2), dmg: 5, reductions: 1, absorbed: 0 },
    ]);
    // Юстина и Нокта обе ATK 7 → меньший слот, Юстина.
    expect(ofType(events, 'statusApplied').filter(e => e.status === 'burn').map(e => e.target)).toEqual([enemy(1)]);
    expect(state.sides.B.active[1].statuses.find(x => x.id === 'burn')).toMatchObject({ stacks: 1, expiresAtRound: null });
    expect(state.sides.A.energy).toBe(2);
    expect(ofType(events, 'heroAction').find(e => e.heroId === 'aira')).toMatchObject({ action: 'skill' });
  });

  it('Фенна skill: Heal 6; при HP < 50% Heal 8 (+2 пассивка первое лечение раунда = 10)', () => {
    const plan = () => cmd(basic(0, enemy(0)), skill(1, ally(0)), basic(2, enemy(0)));
    const bPlan = () => cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2)));

    // 11/20 = 55%: Heal 6 + 2 = 8.
    const r1 = playRound(setHp(makeMatch(), ally(0), 11), plan(), bPlan());
    expect(ofType(r1.events, 'heal').map(e => ({ source: e.source, target: e.target, amount: e.amount, healed: e.healed, hp: e.hp })))
      .toEqual([{ source: ally(1), target: ally(0), amount: 8, healed: 8, hp: 19 }]);

    // 9/20 = 45%: Heal 8 + 2 = 10.
    const r2 = playRound(setHp(makeMatch(), ally(0), 9), plan(), bPlan());
    expect(ofType(r2.events, 'heal').map(e => [e.amount, e.healed, e.hp])).toEqual([[10, 10, 19]]);

    // Пассивка срабатывает раз в раунд: второе лечение Фенны в том же раунде идёт без +2.
    const ctx = makeCtx(startRound(setHp(makeMatch(), ally(0), 5)).state);
    runAbility(ctx, ally(1), HEROES.fenna.skill, ally(0), 'skill'); // 25%: 8 + 2 = 10 → 15
    runAbility(ctx, ally(1), HEROES.fenna.skill, ally(0), 'skill'); // 75%: 6, пассивка уже сработала → 20
    expect(ofType(ctx.events, 'heal').map(e => [e.amount, e.hp])).toEqual([[10, 15], [6, 20]]);
    expect(ctx.s.sides.A.energy).toBe(2);
  });

  it('Тали skill: 110% и Soak', () => {
    const { state, events } = playRound(makeMatch({ a: ['tali', 'fenna', 'nerisa', 'aira', 'zefira', 'liraya'] }),
      cmd(skill(0, enemy(0)), basic(1, enemy(1)), basic(2, enemy(1))),
      cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2))));
    // 6×1.1 = 6.6 → 7, Water → Light ×1.
    expect(hits(events, ally(0))).toEqual([{ target: enemy(0), dmg: 7, reductions: 0, absorbed: 0 }]);
    expect(state.sides.B.active[0].statuses.find(x => x.id === 'soak')).toMatchObject({ expiresAtRound: 2 });
  });

  it('Лирая skill: 120% и луна new→waxing; пассивка даёт +1 ATK до конца раунда', () => {
    // Две Лираи. Лирая B (HP 100%) ходит раньше Лираи A (HP 20/21) при равной SPD 7.
    const s = setHp(makeMatch({
      a: ['liraya', 'fenna', 'nerisa', 'aira', 'zefira', 'tali'],
      b: ['liraya', 'justina', 'nokta', 'aurora', 'mira', 'selena'],
    }), ally(0), 20);
    const { state, events } = playRound(s,
      cmd(skill(0, enemy(1)), basic(1, enemy(2)), basic(2, enemy(2))),
      cmd(skill(0, ally(1)), basic(1, ally(2)), basic(2, ally(2))));
    // Лирая B: 6×1.2×0.85 (Wind → Fire) = 6.12 → 6; луна new → waxing.
    expect(hits(events, enemy(0))).toEqual([{ target: ally(1), dmg: 6, reductions: 0, absorbed: 0 }]);
    // Сдвиг Луны: обе Лираи получают ATK +1 до конца раунда, по одному разу.
    expect(ofType(events, 'statusApplied').filter(e => e.status === 'atk').map(e => [e.target, e.value]))
      .toEqual([[ally(0), 1], [enemy(0), 1]]);
    // Лирая A бьёт уже с ATK 7: 7×1.2 = 8.4 → 8; луна waxing → full.
    expect(hits(events, ally(0))).toEqual([{ target: enemy(1), dmg: 8, reductions: 0, absorbed: 0 }]);
    expect(ofType(events, 'moonChanged').map(e => [e.from, e.to, e.by]))
      .toEqual([['new', 'waxing', enemy(0)], ['waxing', 'full', ally(0)]]);
    expect(state.moon).toBe('full');
    expect(state.roundFlags.moonShifted).toBe(true);
    // ATK +1 «до конца раунда» истёк в End Round.
    expect(statusIds(state, ally(0))).not.toContain('atk');
  });

  it('Аврора skill: Shield 6 и Taunt; пассивка −1 урона союзницам, пока HP > 50%', () => {
    const aPlan = () => cmd(basic(0, enemy(1)), basic(1, enemy(1)), basic(2, enemy(1)));
    // Порядок: Юстина 8, Нокта 7, Фенна 7, Айра 6, Аврора 5, Нериса 4.
    const { state, events } = playRound(makeMatch(), aPlan(),
      cmd(skill(0), basic(1, ally(0)), basic(2, ally(0))));
    // Айра бьёт Юстину до Бастиона: 7 − 1 (Аврора) = 6.
    expect(hits(events, ally(0))).toEqual([{ target: enemy(1), dmg: 6, reductions: 1, absorbed: 0 }]);
    expect(ofType(events, 'shield').map(e => [e.source, e.target, e.amount])).toEqual([[enemy(0), enemy(0), 6]]);
    expect(ofType(events, 'statusApplied').filter(e => e.status === 'taunt').map(e => e.target)).toEqual([enemy(0)]);
    // Нериса после Бастиона: удар по Юстине уходит в Аврору (Taunt), себе Аврора не снижает, щит поглощает 4.
    expect(ofType(events, 'redirect').map(e => [e.from, e.to, e.reason])).toEqual([[enemy(1), enemy(0), 'taunt']]);
    expect(hits(events, ally(2))).toEqual([{ target: enemy(0), dmg: 4, reductions: 0, absorbed: 4 }]);
    expect(state.sides.B.active[0].shield).toBe(2);
    expect(state.sides.B.active[0].hp).toBe(32);
    expect(state.sides.B.active[0].statuses.find(x => x.id === 'taunt')).toMatchObject({ expiresAtRound: 2 });

    // HP Авроры ровно 50% — снижения нет.
    const r2 = playRound(setHp(makeMatch(), enemy(0), 16), aPlan(),
      cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2))));
    expect(hits(r2.events, ally(0))).toEqual([{ target: enemy(1), dmg: 7, reductions: 0, absorbed: 0 }]);
  });

  it('Юстина skill: 120%, против щита 150%', () => {
    const aPlan = () => cmd(basic(0, enemy(2)), basic(1, enemy(2)), basic(2, enemy(2)));
    const bPlan = () => cmd(basic(0, ally(2)), skill(1, ally(0)), basic(2, ally(2)));
    // 7×1.2 = 8.4 → 8.
    expect(hits(playRound(makeMatch(), aPlan(), bPlan()).events, enemy(1)))
      .toEqual([{ target: ally(0), dmg: 8, reductions: 0, absorbed: 0 }]);

    // Щит 5: 7×1.5 = 10.5 → 11, щит поглощает 5.
    const shielded = structuredClone(makeMatch());
    shielded.sides.A.active[0].shield = 5;
    shielded.sides.A.active[0].shieldExpiresAtRound = 2;
    expect(hits(playRound(shielded, aPlan(), bPlan()).events, enemy(1)))
      .toEqual([{ target: ally(0), dmg: 11, reductions: 0, absorbed: 5 }]);

    // Бафф (ATK +1) тоже: 150%.
    const buffed = withStatus(makeMatch(), ally(0), { id: 'atk', value: 1, stacks: 1, expiresAtRound: 1 });
    expect(hits(playRound(buffed, aPlan(), bPlan()).events, enemy(1)))
      .toEqual([{ target: ally(0), dmg: 11, reductions: 0, absorbed: 0 }]);
  });

  it('Нокта skill: 120% и Curse; повторный удар по проклятой +1', () => {
    // Раунд 2, Растущая (без бонуса Dark в Новолуние). 7×1.2 = 8.4 → 8.
    const aPlan = () => cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0)));
    const r1 = playRound(atMoon(makeMatch(), 'waxing'), aPlan(),
      cmd(basic(0, ally(2)), basic(1, ally(2)), skill(2, ally(0))));
    expect(hits(r1.events, enemy(2))).toEqual([{ target: ally(0), dmg: 8, reductions: 0, absorbed: 0 }]);
    expect(r1.state.sides.A.active[0].statuses.find(x => x.id === 'curse')).toMatchObject({ expiresAtRound: null });

    // Раунд 3, Полнолуние: Basic 7 + 1 (Порча) = 8.
    const r2 = playRound(r1.state, aPlan(), cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(0))));
    expect(damageBy(r2.events, enemy(2)).map(e => [e.target, e.raw, e.flat, e.dmg])).toEqual([[ally(0), 7, 1, 8]]);
  });

  it('Кира skill: теряет 3 HP (не ниже 1), 160%; ниже 50% HP +2', () => {
    const b = ['kira', 'justina', 'nokta', 'aurora', 'mira', 'selena'] as const;
    const aPlan = () => cmd(basic(0, enemy(2)), basic(1, enemy(2)), basic(2, enemy(2)));
    const bPlan = () => cmd(skill(0, ally(0)), basic(1, ally(2)), basic(2, ally(2)));
    // Раунд 2, Растущая. HP 24 → 21 (87.5%): 7×1.6 = 11.2 → 11.
    const r1 = playRound(atMoon(makeMatch({ b: [...b] }), 'waxing'), aPlan(), bPlan());
    expect(ofType(r1.events, 'selfHp').map(e => [e.target, e.hpLoss, e.hp])).toEqual([[enemy(0), 3, 21]]);
    expect(hits(r1.events, enemy(0))).toEqual([{ target: ally(0), dmg: 11, reductions: 0, absorbed: 0 }]);

    // HP 2 → 1 (не ниже 1), ниже 50%: 11 + 2 = 13.
    const r2 = playRound(setHp(atMoon(makeMatch({ b: [...b] }), 'waxing'), enemy(0), 2), aPlan(), bPlan());
    expect(ofType(r2.events, 'selfHp').map(e => [e.hpLoss, e.hp])).toEqual([[1, 1]]);
    expect(damageBy(r2.events, enemy(0)).map(e => [e.flat, e.dmg])).toEqual([[2, 13]]);
    expect(r2.state.sides.B.active[0].hp).toBe(1);
  });

  it('Селена skill: 140%', () => {
    const { events } = playRound(makeMatch({ b: ['selena', 'justina', 'nokta', 'aurora', 'mira', 'kira'] }),
      cmd(basic(0, enemy(2)), basic(1, enemy(2)), basic(2, enemy(2))),
      cmd(skill(0, ally(0)), basic(1, ally(2)), basic(2, ally(2))));
    // 6×1.4 = 8.4 → 8, Star → Fire ×1.
    expect(hits(events, enemy(0))).toEqual([{ target: ally(0), dmg: 8, reductions: 0, absorbed: 0 }]);
  });

  it('ultimate списывает luna 3 (2 в full) и energy 2, второй раз → ошибка валидации', () => {
    const plan = () => cmd(basic(0, enemy(0)), basic(1, enemy(0)), ult(2));
    // B бьёт Нерису (31 HP): никто не гибнет, Luna за смерть не начисляется.
    const bPlan = () => cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2)));

    // Новолуние: Luna 1 + 2 = 3 → 0.
    const r1 = playRound(setLuna(makeMatch(), 'A', 1), plan(), bPlan());
    expect(r1.state.sides.A.luna).toBe(0);
    expect(r1.state.sides.A.energy).toBe(2);
    expect(r1.state.sides.A.active[2].ultimateUsed).toBe(true);
    expect(ofType(r1.events, 'lunaChanged').filter(e => e.reason === 'ultimate').map(e => [e.side, e.delta, e.luna]))
      .toEqual([['A', -3, 0]]);

    // Полнолуние: Luna 1 + 1 = 2 → 0.
    const r2 = playRound(setLuna(atMoon(makeMatch(), 'full'), 'A', 1), plan(), bPlan());
    expect(r2.state.sides.A.luna).toBe(0);
    expect(r2.state.sides.A.energy).toBe(2);

    // Повторная ульта той же героини.
    const next = setLuna(r2.state, 'A', 5);
    const started = startRound(next).state;
    expect(validateCommands(started, 'A', plan())).toEqual(['ultimate already used']);
    expect(() => playRound(next, plan(), bPlan())).toThrow('ultimate already used');
  });

  it('ультa Лираи: 100% всем, луна становится full', () => {
    const s = setLuna(makeMatch({
      a: ['liraya', 'fenna', 'nerisa', 'aira', 'zefira', 'tali'],
      b: ['justina', 'nokta', 'kira', 'aurora', 'mira', 'selena'],
    }), 'A', 1);
    const { state, events } = playRound(s,
      cmd(ult(0), basic(1, enemy(0)), basic(2, enemy(0))),
      cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2))));
    // 6×1.0 по всем трём, Wind → Light/Dark ×1.
    expect(hits(events, ally(0))).toEqual([
      { target: enemy(0), dmg: 6, reductions: 0, absorbed: 0 },
      { target: enemy(1), dmg: 6, reductions: 0, absorbed: 0 },
      { target: enemy(2), dmg: 6, reductions: 0, absorbed: 0 },
    ]);
    expect(ofType(events, 'moonChanged').map(e => [e.from, e.to])).toEqual([['new', 'full']]);
    expect(state.moon).toBe('full');
    expect(state.sides.A.luna).toBe(0);
    expect(state.sides.A.active[0].ultimateUsed).toBe(true);
  });

  it('ульта Нерисы: Shield 6 всем активным, cleanse 1', () => {
    let s = setLuna(makeMatch(), 'A', 1);
    s = withStatus(s, ally(0), { id: 'burn', value: 0, stacks: 1, expiresAtRound: null });
    s = withStatus(s, ally(1), { id: 'soak', value: 0, stacks: 1, expiresAtRound: 2 });
    s = withStatus(s, ally(1), { id: 'curse', value: 0, stacks: 1, expiresAtRound: null });
    const { state, events } = playRound(s,
      cmd(basic(0, enemy(0)), basic(1, enemy(0)), ult(2)),
      cmd(basic(0, ally(0)), basic(1, ally(0)), basic(2, ally(0))));
    expect(ofType(events, 'shield').map(e => [e.source, e.target, e.amount]))
      .toEqual([[ally(2), ally(0), 6], [ally(2), ally(1), 6], [ally(2), ally(2), 6]]);
    // Cleanse 1: первый дебафф по порядку списка (Soak раньше Curse).
    expect(ofType(events, 'statusRemoved').filter(e => e.reason === undefined).map(e => [e.target, e.status]))
      .toEqual([[ally(0), 'burn'], [ally(1), 'soak']]);
    expect(statusIds(state, ally(0))).toEqual([]);
    expect(statusIds(state, ally(1))).toEqual(['curse']);
    expect(ofType(events, 'burn')).toEqual([]);
  });

  it('Eclipse поднял цену ульты после планирования → fizzle, выполняется basic', () => {
    // Карта «Затмение» появится в Task 11, а валидация видит цену на момент планирования, поэтому
    // подъём цены после планирования моделируется напрямую: ultLunaDelta = 1 на контексте разрешения.
    const started = startRound(makeMatch()).state;
    started.sides.B.luna = 3;
    const ctx = makeCtx(started);
    ctx.s.roundFlags.ultLunaDelta = 1; // ульта стоит 4

    // Одиночная ульта Юстины → Basic по той же цели: 7.
    runAbility(ctx, enemy(1), HEROES.justina.ultimate, ally(0), 'ultimate');
    expect(ofType(ctx.events, 'fizzle').map(e => [e.side, e.slot, e.heroId, e.action, e.reason]))
      .toEqual([['B', 1, 'justina', 'ultimate', 'luna']]);
    expect(ofType(ctx.events, 'heroAction').map(e => [e.heroId, e.action, e.target])).toEqual([['justina', 'basic', ally(0)]]);
    expect(hits(ctx.events, enemy(1))).toEqual([{ target: ally(0), dmg: 7, reductions: 0, absorbed: 0 }]);
    expect(ctx.s.sides.B.luna).toBe(3);
    expect(ctx.s.sides.B.energy).toBe(4);
    expect(ctx.s.sides.B.active[1].ultimateUsed).toBe(false);

    // Ульта без цели (Нериса, 'allies') → Basic по врагу с наименьшим HP (Нокта 20): 4 − 1 (Аврора) = 3.
    runAbility(ctx, ally(2), HEROES.nerisa.ultimate, undefined, 'ultimate');
    expect(hits(ctx.events, ally(2))).toEqual([{ target: enemy(2), dmg: 3, reductions: 1, absorbed: 0 }]);

    // Нехватка Energy (Аврора подняла цену): скилл Айры за 2 при Energy 1 → fizzle 'energy'.
    ctx.s.sides.A.energy = 1;
    runAbility(ctx, ally(0), HEROES.aira.skill, undefined, 'skill');
    expect(ofType(ctx.events, 'fizzle').map(e => [e.heroId, e.action, e.reason]).slice(1))
      .toEqual([['nerisa', 'ultimate', 'luna'], ['aira', 'skill', 'energy']]);
    expect(ctx.s.sides.A.energy).toBe(1);
  });

  it('Freeze, полученный после планирования Skill → fizzle, выполняется basic по той же цели', () => {
    const started = withStatus(startRound(makeMatch()).state, enemy(1),
      { id: 'freeze', value: 0, stacks: 1, expiresAtRound: 2 });
    const ctx = makeCtx(started);
    runAbility(ctx, enemy(1), HEROES.justina.skill, ally(0), 'skill');
    expect(ofType(ctx.events, 'fizzle').map(e => e.reason)).toEqual(['freeze']);
    expect(hits(ctx.events, enemy(1))).toEqual([{ target: ally(0), dmg: 7, reductions: 0, absorbed: 0 }]);
    expect(ctx.s.sides.B.energy).toBe(4);
  });

  it('Нериса skill: Shield 4 и следующий одиночный удар по союзнице уходит в Нерису', () => {
    const ctx = makeCtx(startRound(makeMatch()).state);
    runAbility(ctx, ally(2), HEROES.nerisa.skill, ally(1), 'skill');
    expect(ofType(ctx.events, 'shield').map(e => [e.target, e.amount])).toEqual([[ally(1), 4]]);
    dealHit(ctx, enemy(1), ally(1), 1, 0, { single: true });
    expect(ofType(ctx.events, 'redirect').map(e => [e.from, e.to, e.reason])).toEqual([[ally(1), ally(2), 'nerisa']]);
    expect(damageBy(ctx.events, enemy(1)).map(e => e.target)).toEqual([ally(2)]);
  });
});
