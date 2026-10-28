import { validateDeck } from '../../engine';
import type { CardId, Deck, HeroId } from '../../engine';

/** Вызов на матч: колода, seed и имя автора (спека §4.1). */
export type Challenge = { v: 1; deck: Deck; seed: number; name: string };

/*
 * Замороженные таблицы индексов версии 1 — копии порядка HERO_IDS / CARD_IDS на момент выпуска.
 * НЕ ПЕРЕСТАВЛЯТЬ И НЕ УДАЛЯТЬ элементы: это сломает все выпущенные ссылки.
 * Новые героини и карты только дописываются в конец.
 */
export const CODEC_V1_HEROES: readonly HeroId[] = [
  'aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya',
  'aurora', 'justina', 'nokta', 'kira', 'mira', 'selena',
];

/* НЕ ПЕРЕСТАВЛЯТЬ И НЕ УДАЛЯТЬ — только дописывать в конец (см. выше). */
export const CODEC_V1_CARDS: readonly CardId[] = [
  'lunarDash', 'wardCircle', 'fieldKit', 'unseal', 'huntersMark', 'emergencySwap',
  'lunarSpark', 'breakRhythm', 'piercingStrike', 'cover', 'warCry', 'reserveImpulse',
  'moonTurn', 'moonReverse', 'dispel', 'healingWave', 'bloodPact', 'ashTrail',
  'swapBan', 'deferredDeath', 'eclipse', 'sealBreak', 'lastWord', 'rewriteFate',
];

const VERSION = 1;
const HEROES = 6;
const CARDS = 12;
const NAME_MAX_CHARS = 16;
const NAME_MAX_BYTES = 32;
/** v + героини + карты + seed + длина имени + CRC. */
const FIXED_BYTES = 1 + HEROES + CARDS + 4 + 1 + 1;
const NAME_LEN_AT = 1 + HEROES + CARDS + 4;

const encoder = new TextEncoder();

/** CRC-8: полином 0x07, начальное значение 0x00, без отражения и финального XOR. */
export function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

/** Не больше 16 символов (кодовых точек) и 32 байт UTF-8; режет по целым символам. */
export function truncateName(name: string): string {
  let out = '';
  let bytes = 0;
  let chars = 0;
  for (const ch of Array.from(name)) {
    const n = encoder.encode(ch).length;
    if (chars + 1 > NAME_MAX_CHARS || bytes + n > NAME_MAX_BYTES) break;
    out += ch;
    bytes += n;
    chars += 1;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  // Только каноничная запись: иначе разные строки (лишние младшие биты в последнем символе) давали бы один код.
  return toBase64Url(bytes) === s ? bytes : null;
}

/** Код вызова: base64url без `=`. Стартовая тройка переносится в начало колоды; seed приводится к uint32. */
export function encodeChallenge(c: Challenge): string {
  const { heroes, starting, cards } = c.deck;
  const start: readonly number[] = starting;
  const order = [...start, ...heroes.map((_, i) => i).filter((i) => !start.includes(i))];
  const name = encoder.encode(truncateName(c.name));
  const bytes = new Uint8Array(FIXED_BYTES + name.length);
  let at = 0;
  bytes[at++] = VERSION;
  for (const i of order) bytes[at++] = indexOf(CODEC_V1_HEROES, heroes[i]);
  for (const id of cards) bytes[at++] = indexOf(CODEC_V1_CARDS, id);
  new DataView(bytes.buffer).setUint32(at, c.seed >>> 0, false);
  at += 4;
  bytes[at++] = name.length;
  bytes.set(name, at);
  at += name.length;
  bytes[at] = crc8(bytes.subarray(0, at));
  return toBase64Url(bytes);
}

function indexOf<T>(table: readonly T[], id: T | undefined): number {
  const i = id === undefined ? -1 : table.indexOf(id);
  if (i < 0) throw new Error(`encodeChallenge: unknown id ${String(id)}`);
  return i;
}

/** Разбор кода; `null` при любой ошибке (формат, версия, CRC, индексы, нелегальная колода). Не бросает. */
export function decodeChallenge(s: string): Challenge | null {
  try {
    const bytes = fromBase64Url(s);
    if (!bytes || bytes.length < FIXED_BYTES) return null;
    const nameLen = bytes[NAME_LEN_AT] as number;
    if (nameLen > NAME_MAX_BYTES || bytes.length !== FIXED_BYTES + nameLen) return null;
    if (bytes[0] !== VERSION) return null;
    if (crc8(bytes.subarray(0, bytes.length - 1)) !== bytes[bytes.length - 1]) return null;

    const heroes: HeroId[] = [];
    for (let i = 1; i <= HEROES; i++) {
      const id = CODEC_V1_HEROES[bytes[i] as number];
      if (id === undefined || heroes.includes(id)) return null;
      heroes.push(id);
    }
    const cards: CardId[] = [];
    for (let i = 1 + HEROES; i < 1 + HEROES + CARDS; i++) {
      const id = CODEC_V1_CARDS[bytes[i] as number];
      if (id === undefined) return null;
      cards.push(id);
    }
    const seed = new DataView(bytes.buffer).getUint32(1 + HEROES + CARDS, false);
    const name = new TextDecoder('utf-8', { fatal: true })
      .decode(bytes.subarray(NAME_LEN_AT + 1, NAME_LEN_AT + 1 + nameLen));
    if (truncateName(name) !== name) return null;

    const deck: Deck = { heroes, starting: [0, 1, 2], cards };
    if (validateDeck(deck).length !== 0) return null;
    return { v: 1, deck, seed, name };
  } catch {
    return null;
  }
}
