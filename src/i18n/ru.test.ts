import { describe, expect, it } from 'vitest';
import { fmt, ru, type BlockReason, type ValidationCode } from './ru';

const CODES: ValidationCode[] = [
  'DEAD_HERO', 'NONE_ONLY_DEAD', 'TARGET_DEAD', 'WRONG_TARGET', 'SKILL_FREEZE', 'SKILL_SILENCE',
  'ULT_SILENCE', 'ULT_USED', 'ENERGY', 'LUNA', 'RESERVE_DEAD', 'DUPLICATE_RESERVE', 'SWAP_BANNED',
  'CARD_NOT_IN_HAND', 'ONE_CARD',
];
const REASONS: BlockReason[] = ['dead', 'energy', 'luna', 'used', 'freeze', 'silence', 'banned'];

describe('ru', () => {
  it('содержит тексты для всех 15 кодов ошибок', () => {
    expect(Object.keys(ru.errors).sort()).toEqual([...CODES].sort());
    for (const c of CODES) expect(ru.errors[c].length).toBeGreaterThan(0);
  });

  it('содержит тексты для всех 7 причин блокировки', () => {
    expect(Object.keys(ru.blocked).sort()).toEqual([...REASONS].sort());
    for (const r of REASONS) expect(ru.blocked[r].length).toBeGreaterThan(0);
  });

  it('описывает четыре фазы Луны, шесть стихий и четыре роли', () => {
    expect(Object.keys(ru.moon).sort()).toEqual(['full', 'new', 'waning', 'waxing']);
    expect(Object.keys(ru.elements)).toHaveLength(6);
    expect(Object.keys(ru.roles)).toHaveLength(4);
  });
});

describe('fmt', () => {
  it('подставляет значения вместо {key}', () => {
    expect(fmt('{name} нанесла {n} урона', { name: 'Аира', n: 7 })).toBe('Аира нанесла 7 урона');
  });

  it('подставляет повторяющийся ключ и оставляет неизвестный', () => {
    expect(fmt('{n}+{n}={x}', { n: 1 })).toBe('1+1={x}');
  });
});

describe('ru: статусы и тайминги', () => {
  it('содержит уникальные короткие коды и названия для всех 16 статусов', () => {
    const entries = Object.values(ru.statuses);
    expect(entries).toHaveLength(16);
    expect(new Set(entries.map((e) => e.short)).size).toBe(16);
    for (const e of entries) expect(e.name.length).toBeGreaterThan(0);
  });

  it('описывает три тайминга карт', () => {
    expect(Object.keys(ru.cardTiming).sort()).toEqual(['reaction', 'standard', 'swift']);
  });
});
