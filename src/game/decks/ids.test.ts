import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './ids';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('newId', () => {
  it('использует crypto.randomUUID, когда он есть', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
    expect(newId()).toBe('uuid-1');
  });

  it('без crypto.randomUUID возвращает разные непустые строки', () => {
    vi.stubGlobal('crypto', {});
    const ids = Array.from({ length: 50 }, () => newId());
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]{8}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('работает и совсем без crypto', () => {
    vi.stubGlobal('crypto', undefined);
    expect(newId()).not.toBe('');
  });
});
