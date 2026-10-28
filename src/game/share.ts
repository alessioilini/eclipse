import type { Deck } from '../engine';
import { fmt, ru } from '../i18n/ru';
import type { Platform } from '../platform/types';
import { encodeChallenge, truncateName } from './links/codec';
import { buildChallengeUrl } from './links/url';

/** Текст шаринга (спека §5): имя, ключевой момент и ссылка-вызов. */
export function shareText(opts: { name: string; moment: string; url: string }): string {
  return fmt(ru.share.text, opts);
}

/**
 * Вызов на колоду игрока: код с новым seed `now() >>> 0` (uint32) и именем, обрезанным по правилам кодека;
 * адрес зависит от платформы (t.me в Telegram с ботом, иначе сайт).
 */
export function challengeFor(deck: Deck, name: string, now: () => number): { code: string; url: (p: Platform) => string } {
  const code = encodeChallenge({ v: 1, deck, seed: now() >>> 0, name: truncateName(name) });
  return { code, url: (p) => buildChallengeUrl(code, p) };
}

/** Имя автора вызова: в Telegram — имя пользователя, иначе сохранённое в профиле; нет — null. */
export function displayName(platform: Platform, profile: { name?: string }): string | null {
  return platform.user?.firstName ?? profile.name ?? null;
}
