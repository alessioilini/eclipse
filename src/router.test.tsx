import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { navigate, parseHash, toHash, useRoute, type Route } from './router';

describe('parseHash', () => {
  it('пустой хэш и #/ ведут в меню', () => {
    expect(parseHash('')).toEqual({ name: 'menu' });
    expect(parseHash('#')).toEqual({ name: 'menu' });
    expect(parseHash('#/')).toEqual({ name: 'menu' });
  });

  it('разбирает экран героини', () => {
    expect(parseHash('#/heroes/aira')).toEqual({ name: 'hero', id: 'aira' });
    expect(parseHash('#/heroes')).toEqual({ name: 'heroes' });
  });

  it('разбирает обучение только для шагов 1..3', () => {
    expect(parseHash('#/tutorial/2')).toEqual({ name: 'tutorial', id: 2 });
    expect(parseHash('#/tutorial/4')).toEqual({ name: 'menu' });
    expect(parseHash('#/tutorial')).toEqual({ name: 'menu' });
  });

  it('разбирает бой, результат и колоды', () => {
    expect(parseHash('#/battle')).toEqual({ name: 'battle' });
    expect(parseHash('#/result')).toEqual({ name: 'result' });
    expect(parseHash('#/decks')).toEqual({ name: 'decks' });
    expect(parseHash('#/decks/d1')).toEqual({ name: 'deck', id: 'd1' });
  });

  it('битая percent-последовательность ведёт в меню, а не бросает исключение', () => {
    expect(parseHash('#/heroes/%')).toEqual({ name: 'menu' });
    expect(parseHash('#/decks/%E0%A4%A')).toEqual({ name: 'menu' });
  });

  it('разбирает вызов #/c/<код>; без кода — меню', () => {
    expect(parseHash('#/c/AQIDBA-_x')).toEqual({ name: 'challenge', code: 'AQIDBA-_x' });
    expect(parseHash('#/c')).toEqual({ name: 'menu' });
    expect(parseHash('#/c/')).toEqual({ name: 'menu' });
    expect(parseHash('#/c/%')).toEqual({ name: 'menu' });
    expect(parseHash('#/c/a/b')).toEqual({ name: 'menu' });
  });

  it('неизвестный путь ведёт в меню', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'menu' });
    expect(parseHash('#/battle/extra')).toEqual({ name: 'menu' });
  });
});

describe('toHash', () => {
  const routes: Route[] = [
    { name: 'menu' },
    { name: 'tutorial', id: 1 },
    { name: 'tutorial', id: 3 },
    { name: 'battle' },
    { name: 'result' },
    { name: 'heroes' },
    { name: 'hero', id: 'aira' },
    { name: 'decks' },
    { name: 'deck', id: 'd1' },
    { name: 'challenge', code: 'AQIDBA-_x' },
  ];

  it('обратим вместе с parseHash', () => {
    for (const r of routes) expect(parseHash(toHash(r))).toEqual(r);
  });

  it('пишет ожидаемые хэши', () => {
    expect(toHash({ name: 'menu' })).toBe('#/');
    expect(toHash({ name: 'hero', id: 'aira' })).toBe('#/heroes/aira');
    expect(toHash({ name: 'challenge', code: 'AQIDBA-_x' })).toBe('#/c/AQIDBA-_x');
  });
});

describe('useRoute и navigate', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('читает текущий хэш', () => {
    window.location.hash = '#/decks';
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ name: 'decks' });
  });

  it('обновляется при смене хэша', async () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ name: 'menu' });
    await act(async () => {
      navigate({ name: 'battle' });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(window.location.hash).toBe('#/battle');
    expect(result.current).toEqual({ name: 'battle' });
  });
});
