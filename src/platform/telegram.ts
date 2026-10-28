import type { CloudStorage, Platform } from './types';

type Callback<T> = (err: unknown, value?: T) => void;

/** The subset of window.Telegram.WebApp we use; every member may be missing on older clients. */
export type TelegramWebApp = {
  ready?(): void;
  expand?(): void;
  initDataUnsafe?: { user?: { id: number; first_name: string }; start_param?: string };
  BackButton?: { show?(): void; hide?(): void; onClick?(fn: () => void): void; offClick?(fn: () => void): void };
  HapticFeedback?: {
    impactOccurred?(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred?(type: 'error' | 'success' | 'warning'): void;
  };
  openTelegramLink?(url: string): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  CloudStorage?: {
    getItem?(key: string, cb: Callback<string>): void;
    setItem?(key: string, value: string, cb: Callback<boolean>): void;
    removeItem?(key: string, cb: Callback<boolean>): void;
  };
};

export const CLOUD_VALUE_MAX = 4096;

export function getTelegramWebApp(win: Window): TelegramWebApp | undefined {
  return (win as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

function call<T>(fn: ((cb: Callback<T>) => void) | undefined): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    if (!fn) {
      reject(new Error('cloud method unavailable'));
      return;
    }
    try {
      fn((err, value) => (err ? reject(toError(err)) : resolve(value)));
    } catch (e) {
      reject(toError(e));
    }
  });
}

function wrapCloud(cs: NonNullable<TelegramWebApp['CloudStorage']>): CloudStorage {
  return {
    async getItem(key) {
      const v = await call<string>(cs.getItem && ((cb) => cs.getItem!(key, cb)));
      // Telegram returns '' for a missing key.
      return v == null || v === '' ? null : v;
    },
    async setItem(key, value) {
      // UTF-16 length: a conservative stand-in for Telegram's 4096-char limit.
      if (value.length > CLOUD_VALUE_MAX) throw new Error('cloud value too long');
      await call<boolean>(cs.setItem && ((cb) => cs.setItem!(key, value, cb)));
    },
    async removeItem(key) {
      await call<boolean>(cs.removeItem && ((cb) => cs.removeItem!(key, cb)));
    },
  };
}

export function createTelegramPlatform(win: Window): Platform {
  const app = getTelegramWebApp(win) ?? {};
  const tgUser = app.initDataUnsafe?.user;
  let backHandler: (() => void) | null = null;

  const detachBack = () => {
    if (backHandler) app.BackButton?.offClick?.(backHandler);
    backHandler = null;
  };

  return {
    kind: 'telegram',
    ready() {
      app.ready?.();
      app.expand?.();
    },
    user: tgUser ? { id: String(tgUser.id), firstName: tgUser.first_name } : null,
    startParam: app.initDataUnsafe?.start_param ?? null,
    backButton: {
      show(onClick) {
        detachBack();
        backHandler = onClick;
        app.BackButton?.onClick?.(onClick);
        app.BackButton?.show?.();
      },
      hide() {
        detachBack();
        app.BackButton?.hide?.();
      },
    },
    haptic(kind) {
      if (kind === 'light' || kind === 'medium') app.HapticFeedback?.impactOccurred?.(kind);
      else app.HapticFeedback?.notificationOccurred?.(kind);
    },
    setClosingConfirmation(on) {
      if (on) app.enableClosingConfirmation?.();
      else app.disableClosingConfirmation?.();
    },
    async share(text, url) {
      app.openTelegramLink?.(
        'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text),
      );
      return 'telegram';
    },
    cloud: app.CloudStorage ? wrapCloud(app.CloudStorage) : null,
  };
}
