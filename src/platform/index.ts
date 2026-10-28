import type { Platform } from './types';
import { createWebPlatform } from './web';
import { createTelegramPlatform, getTelegramWebApp } from './telegram';

export type { Platform, CloudStorage, HapticKind, ShareResult } from './types';

export const TELEGRAM_SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js';
export const TELEGRAM_LOAD_TIMEOUT_MS = 3000;
const POLL_MS = 50;

let current: Platform | null = null;

/** Our sessionStorage flag: this tab was launched by Telegram (survives reloads, which drop the hash). */
export const TG_SESSION_KEY = 'eclipse.tg';
/** Where telegram-web-app.js keeps the launch params for the session. */
const TG_INIT_PARAMS_KEY = '__telegram__initParams';
/** The start param already consumed in this tab (see takeStartParam). */
export const START_PARAM_KEY = 'eclipse.startParam';

function sessionGet(win: Window, key: string): string | null {
  try {
    return win.sessionStorage.getItem(key);
  } catch {
    return null; // no sessionStorage, or blocked
  }
}

function sessionSet(win: Window, key: string, value: string): void {
  try {
    win.sessionStorage.setItem(key, value);
  } catch {
    // no sessionStorage, or blocked: detection then relies on the hash only
  }
}

/**
 * Telegram launches carry `tgWebAppPlatform` in the hash (or, rarely, the query); a launch marker is
 * remembered in sessionStorage. After a reload inside Telegram the hash is gone, so our flag or
 * Telegram's own `__telegram__initParams` in sessionStorage also count.
 */
export function isTelegramLaunch(win: Window): boolean {
  const { hash, search } = win.location;
  if (hash.includes('tgWebAppPlatform') || search.includes('tgWebAppPlatform')) {
    sessionSet(win, TG_SESSION_KEY, '1');
    return true;
  }
  return sessionGet(win, TG_SESSION_KEY) === '1' || sessionGet(win, TG_INIT_PARAMS_KEY) !== null;
}

/**
 * The platform's start param, once per tab session: the consumed value is remembered in sessionStorage,
 * so a reload (e.g. mid-battle) does not jump back to the challenge screen. Empty/absent → null.
 */
export function takeStartParam(platform: Platform, win: Window = window): string | null {
  const param = platform.startParam;
  if (!param) return null;
  if (sessionGet(win, START_PARAM_KEY) === param) return null;
  sessionSet(win, START_PARAM_KEY, param);
  return param;
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
