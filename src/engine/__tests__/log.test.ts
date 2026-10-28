import { describe, it, expect } from 'vitest';
import { formatEvent, formatLog } from '../log';
import { resolveRound, startRound } from '../resolve/round';
import { hasStatus } from '../status';
import type { GameEvent } from '../types';
import { makeMatch, cmd, basic, skill, enemy, ally, setHp, setRound, playRound } from './helpers';

describe('текстовый лог', () => {
  it('сценарий GDD §77: Зефира ставит щит 5 на союзницу, Нокта бьёт её на 8: щит −5, HP −3, Curse', () => {
    let state = makeMatch({
      a: ['zefira', 'fenna', 'aira', 'nerisa', 'tali', 'liraya'],
      b: ['nokta', 'mira', 'selena', 'justina', 'kira', 'aurora'],
    });
    // SPD 7 против SPD 7: тай-брейк по % HP, поэтому Нокта ранена и Зефира ходит первой
    state = setHp(state, enemy(0), 15);
    // Раунд 1 — новолуние: Dark +1 к урону (спека §2.4), удар Нокты был бы 9; раунд 2 — растущая Луна: щит +1.
    // Чтобы получить щит 5 и удар 8 из GDD, сценарий идёт в раунде 3 (полнолуние, бонусы только Light/Star).
    state = { ...setRound(state, 2), moon: 'waxing' }; // startRound сдвинет Луну на полнолуние
    const started = startRound(state);
    // Пассивка Зефиры (перехват, раз в раунд) уже потрачена в раунде 3, иначе единичный удар Нокты ушёл бы в неё
    started.state.sides.A.active[0]!.once['zefira.intercept'] = 3;

    const resolved = resolveRound(started.state, {
      A: cmd(skill(0, ally(1)), basic(1, enemy(2)), basic(2, enemy(2))),
      B: cmd(skill(0, ally(1)), basic(1, ally(2)), basic(2, ally(2))),
    });

    const fenna = resolved.state.sides.A.active[1]!;
    expect(fenna.id).toBe('fenna');
    expect(fenna.hp).toBe(fenna.maxHp - 3);
    expect(fenna.hp).toBe(21);
    expect(fenna.shield).toBe(0);
    expect(hasStatus(fenna, 'curse')).toBe(true);

    const log = formatLog([...started.events, ...resolved.events], resolved.state);
    for (const line of [
      'R3 Moon=full', 'A Зефира.Skill → A1', 'Shield +5', 'B Нокта.Skill → A1', 'Damage 8', 'shield -5', 'HP -3', 'Curse',
    ]) {
      expect(log).toContain(line);
    }
    expect(log.indexOf('Shield +5')).toBeLessThan(log.indexOf('Damage 8'));
  });

  it('formatLog детерминирован и содержит все раунды', () => {
    let state = makeMatch();
    const events: GameEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const r = playRound(
        state,
        cmd(basic(0, enemy(0)), basic(1, enemy(0)), basic(2, enemy(0))),
        cmd(basic(0, ally(2)), basic(1, ally(2)), basic(2, ally(2))),
      );
      state = r.state;
      events.push(...r.events);
    }
    const log = formatLog(events, state);
    expect(formatLog(structuredClone(events), structuredClone(state))).toBe(log);
    for (const n of [1, 2, 3]) expect(log).toMatch(new RegExp(`^R${n} Moon=\\w+$`, 'm'));
    expect(log).toContain('Moon=waxing');
    expect(log.split('\n').filter(l => l.startsWith('  ')).length).toBeGreaterThan(10);
  });

  it('fizzle героини и карты, взвод и срабатывание Reaction печатаются по cardId', () => {
    const s = makeMatch();
    const ev = (type: string, extra: Record<string, unknown>): GameEvent => ({ type, round: 1, phase: 'heroes', ...extra });
    expect(formatEvent(ev('fizzle', { side: 'A', slot: 0, heroId: 'aira', action: 'skill', reason: 'energy' }), s))
      .toBe('A Айра.Skill fizzles (energy)');
    expect(formatEvent(ev('fizzle', { side: 'B', cardId: 'fieldKit', action: 'card', reason: 'target dead' }), s))
      .toBe('B Полевая аптечка fizzles (target dead)');
    expect(formatEvent(ev('reactionArmed', { side: 'A', cardId: 'lastWord', target: ally(0), heroId: 'aira' }), s))
      .toBe('A arms Последнее слово → A0');
    expect(formatEvent(ev('reactionTriggered', { side: 'A', cardId: 'rewriteFate', target: ally(1), heroId: 'fenna' }), s))
      .toBe('A Переписать судьбу triggers → A1');
  });
});
