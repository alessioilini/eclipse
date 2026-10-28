import { describe, expect, it } from 'vitest';
import { BASE, SITE_URL, TG_APP, TG_BOT } from './config';

describe('конфиг сайта', () => {
  it('SITE_URL — https-адрес и заканчивается на /', () => {
    expect(SITE_URL.startsWith('https://')).toBe(true);
    expect(SITE_URL.endsWith('/')).toBe(true);
  });

  it('TG_APP равен play', () => {
    expect(TG_APP).toBe('play');
  });

  it('TG_BOT — null или непустая строка', () => {
    expect(TG_BOT === null || (typeof TG_BOT === 'string' && TG_BOT.length > 0)).toBe(true);
  });

  it('BASE — строка с завершающим /', () => {
    expect(typeof BASE).toBe('string');
    expect(BASE.endsWith('/')).toBe(true);
  });
});
