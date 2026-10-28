import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../engine';
import type { Deck } from '../engine';
import { fmt, ru } from '../i18n/ru';
import type { Platform } from '../platform/types';
import { buildPreset } from './decks/presets';
import { decodeChallenge } from './links/codec';
import { buildChallengeUrl } from './links/url';
import { challengeFor, displayName, shareText } from './share';

/** Минимальная платформа для чистых функций: важны только `kind` и `user`. */
function platform(kind: Platform['kind'], user: Platform['user'] = null): Platform {
  return { kind, user } as Platform;
}

/** Колода со стартовой тройкой не в начале: кодек переносит её вперёд. */
const DECK: Deck = { ...buildPreset('attack', [...HERO_IDS]), starting: [3, 1, 5] };
const normalized = (d: Deck): Deck => {
  const order = [...d.starting, ...d.heroes.map((_, i) => i).filter((i) => !(d.starting as readonly number[]).includes(i))];
  return { heroes: order.map((i) => d.heroes[i]!), starting: [0, 1, 2], cards: d.cards };
};

describe('shareText', () => {
  it('подставляет имя и ключевой момент; ссылки в тексте нет (она идёт отдельным аргументом)', () => {
    const text = shareText({ name: 'Лена', moment: 'Айра нанесла 41% урона.' });
    expect(text).toBe(fmt(ru.share.text, { name: 'Лена', moment: 'Айра нанесла 41% урона.' }));
    expect(text).toContain('Лена');
    expect(text).toContain('Айра нанесла 41% урона.');
    expect(text).not.toMatch(/\{\w+\}/);
    expect(text).not.toContain('http');
  });

  it('без момента читается как вызов', () => {
    expect(shareText({ name: 'Оля', moment: ru.share.noMoment }))
      .toBe(`Оля: ${ru.share.noMoment} Сможешь победить эту команду?`);
  });
});

describe('challengeFor', () => {
  it('код декодируется в ту же колоду, имя и seed = now() >>> 0', () => {
    const big = 2 ** 40 + 12345;
    const { code } = challengeFor(DECK, 'Алексей', () => big);
    const c = decodeChallenge(code);
    expect(c).not.toBeNull();
    expect(c!.deck).toEqual(normalized(DECK));
    expect(c!.name).toBe('Алексей');
    expect(c!.seed).toBe(big >>> 0);
  });

  it('длинное имя обрезается до 16 символов', () => {
    const { code } = challengeFor(DECK, 'Александра-Виктория', () => 1);
    expect(decodeChallenge(code)!.name).toBe('Александра-Викто');
  });

  it('url строится по платформе через buildChallengeUrl', () => {
    const { code, url } = challengeFor(DECK, 'Лена', () => 7);
    const web = platform('web');
    expect(url(web)).toBe(buildChallengeUrl(code, web));
    expect(url(web)).toContain(`#/c/${code}`);
  });
});

describe('displayName', () => {
  it('в Telegram — имя пользователя, даже если в профиле есть своё', () => {
    expect(displayName(platform('telegram', { id: '1', firstName: 'Лена' }), { name: 'Оля' })).toBe('Лена');
  });

  it('в браузере — имя из профиля, без него — null', () => {
    expect(displayName(platform('web'), { name: 'Оля' })).toBe('Оля');
    expect(displayName(platform('web'), {})).toBeNull();
  });
});
