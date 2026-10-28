import { describe, expect, it } from 'vitest';
import { CARD_IDS, HERO_IDS, createRng } from '../../engine';
import type { Deck } from '../../engine';
import { randomDeck } from '../../engine/sim';
import type { Platform } from '../../platform/types';
import {
  CODEC_V1_CARDS, CODEC_V1_HEROES, crc8, decodeChallenge, encodeChallenge, truncateName,
} from './codec';
import type { Challenge } from './codec';
import { buildChallengeUrl, parseStartParam } from './url';

const NAMES = [
  'Alice',
  'Алёна',
  'Луна 🌙✨',
  '👩‍🚀🚀🌕🌑🌒🌓🌔🌖🌗🌘',
  '',
  'Ж'.repeat(40),
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN',
];

const B64URL = /^[A-Za-z0-9_-]+$/;

function toBytes(code: string): Uint8Array {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

function toCode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Переписать байты кода и пересчитать CRC, чтобы проверить отказы глубже CRC. */
function patch(code: string, edit: (bytes: Uint8Array) => void): string {
  const bytes = toBytes(code);
  edit(bytes);
  bytes[bytes.length - 1] = crc8(bytes.subarray(0, bytes.length - 1));
  return toCode(bytes);
}

function sample(seed = 1, name = 'Тест'): Challenge {
  const rng = createRng(seed);
  return { v: 1, deck: randomDeck(rng), seed: rng.int(2 ** 32), name };
}

describe('кодек ссылки-вызова', () => {
  it('таблицы v1 совпадают по множеству с данными движка', () => {
    expect(new Set(CODEC_V1_HEROES)).toEqual(new Set(HERO_IDS));
    expect(CODEC_V1_HEROES.length).toBe(HERO_IDS.length);
    expect(new Set(CODEC_V1_CARDS)).toEqual(new Set(CARD_IDS));
    expect(CODEC_V1_CARDS.length).toBe(CARD_IDS.length);
  });

  it('crc8: полином 0x07, начальное значение 0', () => {
    expect(crc8(new Uint8Array([]))).toBe(0);
    // Контрольное значение CRC-8/SMBUS для ASCII «123456789».
    expect(crc8(new TextEncoder().encode('123456789'))).toBe(0xf4);
  });

  it('обрезает имя до 16 символов и 32 байт UTF-8 по целым символам', () => {
    expect(truncateName('')).toBe('');
    expect(truncateName('Alice')).toBe('Alice');
    expect(truncateName('a'.repeat(40))).toBe('a'.repeat(16));
    expect(truncateName('Ж'.repeat(40))).toBe('Ж'.repeat(16)); // 32 байта
    const emoji = '🌙'.repeat(10); // по 4 байта
    expect(truncateName(emoji)).toBe('🌙'.repeat(8));
    expect(truncateName('a' + '🌙'.repeat(10))).toBe('a' + '🌙'.repeat(7));
    for (const n of NAMES) {
      const t = truncateName(n);
      expect(Array.from(t).length).toBeLessThanOrEqual(16);
      expect(new TextEncoder().encode(t).length).toBeLessThanOrEqual(32);
      expect(n.startsWith(t)).toBe(true);
    }
  });

  it('1000 случайных колод: кодирование и декодирование обратимы, код короткий и в алфавите base64url', () => {
    const rng = createRng(20261028);
    for (let i = 0; i < 1000; i++) {
      const c: Challenge = { v: 1, deck: randomDeck(rng), seed: rng.int(2 ** 32), name: rng.pick(NAMES) };
      const code = encodeChallenge(c);
      expect(code.length).toBeLessThanOrEqual(100);
      expect(code).toMatch(B64URL);
      expect(decodeChallenge(code)).toEqual({ ...c, name: truncateName(c.name) });
    }
  });

  it('стартовая тройка не хранится: стартовые героини переносятся в начало колоды', () => {
    const c = sample(7);
    const deck: Deck = { ...c.deck, starting: [4, 0, 5] };
    const h = c.deck.heroes;
    const decoded = decodeChallenge(encodeChallenge({ ...c, deck }));
    expect(decoded?.deck.starting).toEqual([0, 1, 2]);
    expect(decoded?.deck.heroes).toEqual([h[4], h[0], h[5], h[1], h[2], h[3]]);
  });

  it('seed приводится к uint32', () => {
    const c = sample(3);
    expect(decodeChallenge(encodeChallenge({ ...c, seed: -1 }))?.seed).toBe(2 ** 32 - 1);
    expect(decodeChallenge(encodeChallenge({ ...c, seed: 2 ** 32 + 5 }))?.seed).toBe(5);
  });

  it('порча одного символа ловится в ≥ 99% случаев', () => {
    const rng = createRng(99);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const trials = 500;
    let caught = 0;
    for (let i = 0; i < trials; i++) {
      const code = encodeChallenge({ v: 1, deck: randomDeck(rng), seed: rng.int(2 ** 32), name: rng.pick(NAMES) });
      const pos = rng.int(code.length);
      let ch = code[pos];
      while (ch === code[pos]) ch = alphabet[rng.int(alphabet.length)];
      const bad = code.slice(0, pos) + ch + code.slice(pos + 1);
      if (decodeChallenge(bad) === null) caught += 1;
    }
    expect(caught / trials).toBeGreaterThanOrEqual(0.99);
  });

  it('чужая версия → null', () => {
    const code = encodeChallenge(sample());
    expect(decodeChallenge(patch(code, (b) => { b[0] = 2; }))).toBeNull();
  });

  it('индекс вне таблицы → null', () => {
    const code = encodeChallenge(sample());
    expect(decodeChallenge(patch(code, (b) => { b[1] = 200; }))).toBeNull();
    expect(decodeChallenge(patch(code, (b) => { b[7] = 200; }))).toBeNull();
  });

  it('повтор героини → null', () => {
    const code = encodeChallenge(sample());
    expect(decodeChallenge(patch(code, (b) => { b[2] = b[1] as number; }))).toBeNull();
  });

  it('колода, не проходящая validateDeck → null', () => {
    const legendary = CODEC_V1_CARDS.indexOf('eclipse');
    const code = encodeChallenge(sample());
    // Три копии легендарной карты.
    expect(decodeChallenge(patch(code, (b) => { b[7] = legendary; b[8] = legendary; b[9] = legendary; }))).toBeNull();
  });

  it('неверная CRC, неверная длина и мусор → null без исключений', () => {
    const code = encodeChallenge(sample());
    const bytes = toBytes(code);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] as number) ^ 0xff;
    expect(decodeChallenge(toCode(bytes))).toBeNull();
    expect(decodeChallenge(code.slice(0, -4))).toBeNull();
    expect(decodeChallenge(code + 'AAAA')).toBeNull();
    for (const s of ['', 'A', '!!!', 'абв', 'a+b/c=', '====', 'x'.repeat(500), code + '=']) {
      expect(() => decodeChallenge(s)).not.toThrow();
      expect(decodeChallenge(s)).toBeNull();
    }
  });
});

function fakePlatform(kind: Platform['kind']): Platform {
  return {
    kind,
    ready() {},
    user: null,
    startParam: null,
    backButton: { show() {}, hide() {} },
    haptic() {},
    share: async () => 'none',
    cloud: null,
    setClosingConfirmation() {},
  };
}

describe('адреса вызова', () => {
  const code = encodeChallenge(sample());

  it('сайт: адрес с хешем #/c/<код>', () => {
    expect(buildChallengeUrl(code, fakePlatform('web'))).toBe(`https://alessioilini.github.io/eclipse/#/c/${code}`);
  });

  it('Telegram без бота: тоже адрес сайта', () => {
    expect(buildChallengeUrl(code, fakePlatform('telegram'))).toBe(`https://alessioilini.github.io/eclipse/#/c/${code}`);
  });

  it('Telegram с ботом: ссылка t.me со startapp', () => {
    const cfg = { TG_BOT: 'eclipse_bot', TG_APP: 'play', SITE_URL: 'https://example.org/x/' };
    expect(buildChallengeUrl(code, fakePlatform('telegram'), cfg)).toBe(`https://t.me/eclipse_bot/play?startapp=${code}`);
    expect(buildChallengeUrl(code, fakePlatform('web'), cfg)).toBe(`https://example.org/x/#/c/${code}`);
  });

  it('parseStartParam: корректный код возвращается, мусор → null', () => {
    expect(parseStartParam(code)).toBe(code);
    expect(parseStartParam(null)).toBeNull();
    expect(parseStartParam('')).toBeNull();
    expect(parseStartParam('hello-world')).toBeNull();
    expect(parseStartParam('ref_12345')).toBeNull();
  });
});
