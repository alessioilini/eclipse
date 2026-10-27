import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';

describe('rng', () => {
  it('детерминирован при одном seed', () => {
    const a = createRng(42), b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('int(n) в [0, n)', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) { const v = r.int(6); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(6); }
  });
  it('shuffle не мутирует и сохраняет элементы', () => {
    const src = [1, 2, 3, 4, 5];
    const out = createRng(7).shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
