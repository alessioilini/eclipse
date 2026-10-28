import { SITE_URL, TG_APP, TG_BOT } from '../../config';
import type { Platform } from '../../platform/types';

export type LinkConfig = { TG_BOT: string | null; TG_APP: string; SITE_URL: string };

const DEFAULT_CFG: LinkConfig = { TG_BOT, TG_APP, SITE_URL };

/** Адрес вызова (спека §4.2): в Telegram с заданным ботом — t.me со startapp, иначе сайт с `#/c/<код>`. */
export function buildChallengeUrl(code: string, platform: Platform, cfg: LinkConfig = DEFAULT_CFG): string {
  if (platform.kind === 'telegram' && cfg.TG_BOT) return `https://t.me/${cfg.TG_BOT}/${cfg.TG_APP}?startapp=${code}`;
  return `${cfg.SITE_URL}#/c/${code}`;
}
