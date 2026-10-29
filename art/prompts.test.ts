import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../src/engine';
import { PROMPTS, STYLE, prompt } from './prompts';

describe('промпты арта', () => {
  it('есть у всех двенадцати героинь и только у них', () => {
    expect(Object.keys(PROMPTS).sort()).toEqual([...HERO_IDS].sort());
    expect(HERO_IDS).toHaveLength(12);
  });

  it.each(HERO_IDS)('%s: base, portrait и full непустые', (id) => {
    const p = PROMPTS[id];
    expect(p.base.length).toBeGreaterThan(40);
    expect(p.portrait).toMatch(/bust portrait, looking at the camera/);
    expect(p.full).toMatch(/full body, (standing|seated)/);
  });

  it('prompt() = STYLE + base + часть кадра', () => {
    const portrait = prompt('aira', 'portrait');
    expect(portrait.startsWith(STYLE)).toBe(true);
    expect(portrait).toContain(PROMPTS.aira.base);
    expect(portrait).toContain('bust portrait');
    expect(portrait).not.toContain('full body');

    const full = prompt('nerisa', 'full');
    expect(full.startsWith(STYLE)).toBe(true);
    expect(full).toContain(PROMPTS.nerisa.base);
    expect(full).toContain('full body');
    expect(full).not.toContain('bust portrait');
  });

  it('фирменные детали из спеки: угли у Айры, каменные наплечники у Нерисы', () => {
    expect(PROMPTS.aira.base).toMatch(/embers/);
    expect(PROMPTS.nerisa.base).toMatch(/stone pauldrons/);
  });

  it('STYLE держит правила стиль-библии и совпадает с art/style.md', () => {
    for (const rule of ['moonlight', 'top-left', 'no text', 'no logos', 'semi-realistic']) {
      expect(STYLE).toContain(rule);
    }
    const bible = readFileSync(join(__dirname, 'style.md'), 'utf8');
    expect(bible).toContain(STYLE.trim());
  });
});
