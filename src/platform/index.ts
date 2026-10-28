import type { Platform } from './types';
import { createWebPlatform } from './web';
import { createTelegramPlatform, getTelegramWebApp } from './telegram';

export type { Platform, CloudStorage, HapticKind, ShareResult } from './types';

export const TELEGRAM_SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js';
export const TELEGRAM_LOAD_TIMEOUT_MS = 3000;
const POLL_MS = 50;

let current: Platform | null = null;

/** Telegram launches carry `tgWebAppPlatform` in the hash (or, rarely, the query). */
export function isTelegramLaunch(win: Window): boolean {
  const { hash, search } = win.location;
  return hash.includes('tgWebAppPlatform') || search.includes('tgWebAppPlatform');
}

/** Injects the Telegram script once and resolves true when WebApp appears, false on error/timeout. */
function loadTelegram(win: Window): Promise<boolean> {
  if (getTelegramWebApp(win)) return Promise.resolve(true);
  const doc = win.document;
  let script = Array.from(doc.querySelectorAll('script')).find((s) => s.src === TELEGRAM_SCRIPT_SRC);
  if (!script) {
    script = doc.createElement('script');
    script.src = TELEGRAM_SCRIPT_SRC;
    script.async = true;
    (doc.head ?? doc.documentElement).appendChild(script);
  }
  const el = script;

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      win.clearTimeout(deadline);
      win.clearInterval(poll);
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
      resolve(ok);
    };
    const check = () => {
      if (getTelegramWebApp(win)) finish(true);
    };
    const onLoad = () => finish(Boolean(getTelegramWebApp(win)));
    const onError = () => finish(false);
    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);
    const poll = win.setInterval(check, POLL_MS);
    const deadline = win.setTimeout(() => finish(false), TELEGRAM_LOAD_TIMEOUT_MS);
  });
}

export async function createPlatform(win: Window = window): Promise<Platform> {
  let platform: Platform | null = null;
  if (isTelegramLaunch(win)) {
    if (await loadTelegram(win)) platform = createTelegramPlatform(win);
    else console.warn('[platform] Telegram WebApp unavailable, falling back to web');
  }
  current = platform ?? createWebPlatform(win);
  return current;
}

export function getPlatform(): Platform {
  if (!current) throw new Error('platform not created');
  return current;
}

export function setPlatformForTests(p: Platform): void {
  current = p;
}
