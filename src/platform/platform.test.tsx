import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebPlatform } from './web';
import { createTelegramPlatform } from './telegram';
import { createPlatform, getPlatform, isTelegramLaunch, setPlatformForTests } from './index';
import type { Platform } from './types';

const SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js';

type FakeNavigator = { share?: unknown; clipboard?: { writeText: unknown } };
const fakeWin = (navigator: FakeNavigator): Window => ({ navigator }) as unknown as Window;

function makeFakeWebApp(overrides: Record<string, unknown> = {}) {
  return {
    ready: vi.fn(),
    expand: vi.fn(),
    initDataUnsafe: { user: { id: 42, first_name: 'Аня' }, start_param: 'duel_abc' },
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
    HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
    openTelegramLink: vi.fn(),
    enableClosingConfirmation: vi.fn(),
    disableClosingConfirmation: vi.fn(),
    CloudStorage: {
      getItem: vi.fn((_k: string, cb: (err: unknown, v?: string) => void) => cb(null, 'value')),
      setItem: vi.fn((_k: string, _v: string, cb: (err: unknown, ok?: boolean) => void) => cb(null, true)),
      removeItem: vi.fn((_k: string, cb: (err: unknown, ok?: boolean) => void) => cb(null, true)),
    },
    ...overrides,
  };
}
type FakeWebApp = ReturnType<typeof makeFakeWebApp>;
const tgWin = (webApp: unknown): Window => ({ Telegram: { WebApp: webApp } }) as unknown as Window;
const injectedScripts = () =>
  Array.from(document.querySelectorAll('script')).filter((s) => s.src === SCRIPT_SRC);
const winTg = window as unknown as { Telegram?: unknown };

describe('getPlatform', () => {
  it('бросает, если createPlatform ещё не вызывался', async () => {
    vi.resetModules();
    const fresh = await import('./index');
    expect(() => fresh.getPlatform()).toThrow('platform not created');
  });

  it('возвращает платформу, заданную через setPlatformForTests', () => {
    const p = createWebPlatform(fakeWin({}));
    setPlatformForTests(p);
    expect(getPlatform()).toBe(p);
  });
});

describe('web-платформа', () => {
  it('базовые поля: kind web, нет пользователя, нет startParam, нет облака', () => {
    const p = createWebPlatform(fakeWin({}));
    expect(p.kind).toBe('web');
    expect(p.user).toBeNull();
    expect(p.startParam).toBeNull();
    expect(p.cloud).toBeNull();
    expect(() => {
      p.ready();
      p.haptic('light');
      p.haptic('error');
      p.setClosingConfirmation(true);
    }).not.toThrow();
  });

  it('backButton.show запоминает обработчик, hide его сбрасывает', () => {
    const p = createWebPlatform(fakeWin({}));
    const fn = vi.fn();
    expect(p.getBackHandler()).toBeNull();
    p.backButton.show(fn);
    expect(p.getBackHandler()).toBe(fn);
    p.backButton.hide();
    expect(p.getBackHandler()).toBeNull();
  });

  it('share через navigator.share возвращает native', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const p = createWebPlatform(fakeWin({ share, clipboard: { writeText } }));
    await expect(p.share('Вызов!', 'https://x.test/#/duel')).resolves.toBe('native');
    expect(share).toHaveBeenCalledWith({ text: 'Вызов!', url: 'https://x.test/#/duel' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('без navigator.share пишет в буфер и возвращает clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const p = createWebPlatform(fakeWin({ clipboard: { writeText } }));
    await expect(p.share('Вызов!', 'https://x.test/#/duel')).resolves.toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('Вызов! https://x.test/#/duel');
  });

  it('отмена navigator.share (AbortError) падает в буфер обмена', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const p = createWebPlatform(fakeWin({ share, clipboard: { writeText } }));
    await expect(p.share('t', 'u')).resolves.toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('t u');
  });

  it('без navigator.share и без буфера возвращает none и не бросает', async () => {
    const p = createWebPlatform(fakeWin({}));
    await expect(p.share('t', 'u')).resolves.toBe('none');
  });

  it('если и share, и буфер отказывают — none', async () => {
    const share = vi.fn().mockRejectedValue(new Error('nope'));
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const p = createWebPlatform(fakeWin({ share, clipboard: { writeText } }));
    await expect(p.share('t', 'u')).resolves.toBe('none');
  });
});

describe('telegram-платформа', () => {
  let app: FakeWebApp;
  let p: Platform;
  beforeEach(() => {
    app = makeFakeWebApp();
    p = createTelegramPlatform(tgWin(app));
  });

  it('kind telegram; ready вызывает ready и expand', () => {
    expect(p.kind).toBe('telegram');
    p.ready();
    expect(app.ready).toHaveBeenCalledTimes(1);
    expect(app.expand).toHaveBeenCalledTimes(1);
  });

  it('user и startParam берутся из initDataUnsafe', () => {
    expect(p.user).toEqual({ id: '42', firstName: 'Аня' });
    expect(p.startParam).toBe('duel_abc');
  });

  it('без user и start_param — null', () => {
    const bare = createTelegramPlatform(tgWin(makeFakeWebApp({ initDataUnsafe: {} })));
    expect(bare.user).toBeNull();
    expect(bare.startParam).toBeNull();
  });

  it('share зовёт openTelegramLink с закодированными url и text', async () => {
    const text = 'Вызов: колода «Луна» & ещё';
    const url = 'https://x.test/eclipse/#/duel?d=a+b&s=1';
    await expect(p.share(text, url)).resolves.toBe('telegram');
    expect(app.openTelegramLink).toHaveBeenCalledWith(
      'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text),
    );
  });

  it('backButton.show регистрирует обработчик и показывает кнопку; повторный show снимает старый', () => {
    const a = vi.fn();
    const b = vi.fn();
    p.backButton.show(a);
    expect(app.BackButton.onClick).toHaveBeenCalledWith(a);
    expect(app.BackButton.show).toHaveBeenCalledTimes(1);
    p.backButton.show(b);
    expect(app.BackButton.offClick).toHaveBeenCalledWith(a);
    expect(app.BackButton.onClick).toHaveBeenLastCalledWith(b);
    p.backButton.hide();
    expect(app.BackButton.offClick).toHaveBeenLastCalledWith(b);
    expect(app.BackButton.hide).toHaveBeenCalledTimes(1);
  });

  it('haptic: light/medium → impactOccurred, success/error → notificationOccurred', () => {
    p.haptic('light');
    p.haptic('medium');
    p.haptic('success');
    p.haptic('error');
    expect(app.HapticFeedback.impactOccurred.mock.calls).toEqual([['light'], ['medium']]);
    expect(app.HapticFeedback.notificationOccurred.mock.calls).toEqual([['success'], ['error']]);
  });

  it('setClosingConfirmation включает и выключает подтверждение закрытия', () => {
    p.setClosingConfirmation(true);
    expect(app.enableClosingConfirmation).toHaveBeenCalledTimes(1);
    p.setClosingConfirmation(false);
    expect(app.disableClosingConfirmation).toHaveBeenCalledTimes(1);
  });

  it('cloud оборачивает CloudStorage в промисы', async () => {
    const cloud = p.cloud!;
    await expect(cloud.getItem('k')).resolves.toBe('value');
    await expect(cloud.setItem('k', 'v')).resolves.toBeUndefined();
    await expect(cloud.removeItem('k')).resolves.toBeUndefined();
    expect(app.CloudStorage.setItem).toHaveBeenCalledWith('k', 'v', expect.any(Function));
  });

  it('cloud.getItem отдаёт null для отсутствующего (пустого) значения', async () => {
    app.CloudStorage.getItem.mockImplementation((_k, cb) => cb(null, ''));
    await expect(p.cloud!.getItem('k')).resolves.toBeNull();
  });

  it('cloud: ошибка в колбэке отвергает промис', async () => {
    app.CloudStorage.setItem.mockImplementation((_k, _v, cb) => cb('STORAGE_FULL'));
    await expect(p.cloud!.setItem('k', 'v')).rejects.toThrow('STORAGE_FULL');
  });

  it('cloud.setItem с 4097 символами отвергает, не вызывая Telegram', async () => {
    await expect(p.cloud!.setItem('k', 'x'.repeat(4097))).rejects.toThrow('cloud value too long');
    expect(app.CloudStorage.setItem).not.toHaveBeenCalled();
    await expect(p.cloud!.setItem('k', 'x'.repeat(4096))).resolves.toBeUndefined();
  });

  it('cloud отвергает недопустимый ключ, не вызывая Telegram', async () => {
    for (const key of ['eclipse.profile', '', 'k'.repeat(129), 'ключ']) {
      await expect(p.cloud!.getItem(key)).rejects.toThrow(Error);
      await expect(p.cloud!.setItem(key, 'v')).rejects.toThrow('invalid cloud key');
      await expect(p.cloud!.removeItem(key)).rejects.toThrow('invalid cloud key');
    }
    expect(app.CloudStorage.getItem).not.toHaveBeenCalled();
    expect(app.CloudStorage.setItem).not.toHaveBeenCalled();
    expect(app.CloudStorage.removeItem).not.toHaveBeenCalled();
    await expect(p.cloud!.setItem('eclipse_profile-1', 'v')).resolves.toBeUndefined();
    await expect(p.cloud!.setItem('k'.repeat(128), 'v')).resolves.toBeUndefined();
  });

  it('старый клиент без CloudStorage и HapticFeedback: cloud null, haptic не бросает', () => {
    const old = createTelegramPlatform(
      tgWin(makeFakeWebApp({ CloudStorage: undefined, HapticFeedback: undefined, enableClosingConfirmation: undefined })),
    );
    expect(old.cloud).toBeNull();
    expect(() => {
      old.haptic('light');
      old.haptic('success');
      old.setClosingConfirmation(true);
    }).not.toThrow();
  });
});

describe('isTelegramLaunch', () => {
  const at = (hash: string, search: string) => ({ location: { hash, search } }) as unknown as Window;
  it('маркер tgWebAppPlatform в hash или query — Telegram', () => {
    expect(isTelegramLaunch(at('#tgWebAppData=x&tgWebAppPlatform=ios', ''))).toBe(true);
    expect(isTelegramLaunch(at('', '?tgWebAppPlatform=android'))).toBe(true);
  });
  it('без маркера — не Telegram', () => {
    expect(isTelegramLaunch(at('#/duel?d=abc', '?x=1'))).toBe(false);
  });
});

describe('createPlatform', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete winTg.Telegram;
    injectedScripts().forEach((s) => s.remove());
    window.location.hash = '';
  });

  it('без маркера возвращает web и не грузит скрипт Telegram', async () => {
    const p = await createPlatform(window);
    expect(p.kind).toBe('web');
    expect(injectedScripts()).toHaveLength(0);
    expect(getPlatform()).toBe(p);
  });

  it('с #tgWebAppPlatform=ios вставляет скрипт и после его загрузки возвращает telegram', async () => {
    window.location.hash = '#tgWebAppPlatform=ios';
    const pending = createPlatform(window);
    const scripts = injectedScripts();
    expect(scripts).toHaveLength(1);
    const app = makeFakeWebApp();
    winTg.Telegram = { WebApp: app };
    scripts[0]!.dispatchEvent(new Event('load'));
    const p = await pending;
    expect(p.kind).toBe('telegram');
    expect(p.startParam).toBe('duel_abc');
    expect(getPlatform()).toBe(p);
  });

  it('если WebApp уже есть, скрипт не вставляется повторно', async () => {
    window.location.hash = '#tgWebAppPlatform=ios';
    winTg.Telegram = { WebApp: makeFakeWebApp() };
    const p = await createPlatform(window);
    expect(p.kind).toBe('telegram');
    expect(injectedScripts()).toHaveLength(0);
  });

  it('за 3 с объект не появился — web и одно предупреждение', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.location.hash = '#tgWebAppPlatform=ios';
    const pending = createPlatform(window);
    expect(injectedScripts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2999);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const p = await pending;
    expect(p.kind).toBe('web');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('ошибка загрузки скрипта — web и одно предупреждение', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.location.hash = '#tgWebAppPlatform=ios';
    const pending = createPlatform(window);
    injectedScripts()[0]!.dispatchEvent(new Event('error'));
    const p = await pending;
    expect(p.kind).toBe('web');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
