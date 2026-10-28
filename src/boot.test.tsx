import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_KEYS } from './game/save/cloud';
import { defaultSave } from './game/save/defaults';
import { SAVE_KEY } from './game/save/storage';
import { boot, CLOUD_BOOT_TIMEOUT_MS } from './main';
import type { CloudStorage, Platform } from './platform';
import { createWebPlatform } from './platform/web';
import { useStore } from './store';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

function fakeCloud(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  const cloud = {
    map,
    getItem: vi.fn(async (k: string) => map.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { map.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { map.delete(k); }),
  };
  return cloud satisfies CloudStorage;
}

const withCloud = (cloud: CloudStorage): Platform => ({ ...createWebPlatform(window), cloud });

function localSave() {
  const save = defaultSave();
  save.profile.tutorialStep = 2;
  save.profile.stats.wins = 7;
  save.settings.speed = 'fast';
  return save;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('запуск приложения', () => {
  it('boot загружает сохранение из хранилища и подключает запись', async () => {
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(localSave()) });
    const detach = await boot(storage);
    try {
      expect(useStore.getState().tutorialStep).toBe(2);
      expect(useStore.getState().stats.wins).toBe(7);
      useStore.getState().recordResult('win');
      const written = JSON.parse(storage.getItem(SAVE_KEY)!);
      expect(written.profile.stats.wins).toBe(8);
    } finally {
      detach();
    }
  });

  it('без облака (web) поведение прежнее: облако не нужно, запись идёт в localStorage', async () => {
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(localSave()) });
    const detach = await boot(storage, createWebPlatform(window));
    try {
      expect(useStore.getState().stats.wins).toBe(7);
      useStore.getState().recordResult('loss');
      expect(JSON.parse(storage.getItem(SAVE_KEY)!).profile.stats.losses).toBe(1);
    } finally {
      detach();
    }
  });

  it('облачный профиль перекрывает локальный, остальные разделы — локальные', async () => {
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(localSave()) });
    const cloudProfile = { ...defaultSave().profile, tutorialStep: 3, stats: { wins: 20, losses: 1, draws: 0 }, name: 'Вера' };
    const cloud = fakeCloud({ [CLOUD_KEYS.profile]: JSON.stringify(cloudProfile) });
    const detach = await boot(storage, withCloud(cloud));
    try {
      expect(useStore.getState().stats.wins).toBe(20);
      expect(useStore.getState().tutorialStep).toBe(3);
      expect(useStore.getState().name).toBe('Вера');
      expect(useStore.getState().speed).toBe('fast');
      // Облако не пустое: переноса локального сохранения нет.
      expect(cloud.setItem).not.toHaveBeenCalled();
    } finally {
      detach();
    }
  });

  it('пустое облако: локальные разделы переносятся в облако при запуске', async () => {
    const local = localSave();
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(local) });
    const cloud = fakeCloud();
    const detach = await boot(storage, withCloud(cloud));
    try {
      // Перенос не задерживает запуск: запись идёт в фоне.
      await vi.waitFor(() => expect(cloud.setItem).toHaveBeenCalledTimes(3));
      expect(cloud.map.get(CLOUD_KEYS.profile)).toBe(JSON.stringify(local.profile));
      expect(cloud.map.get(CLOUD_KEYS.decks)).toBe(JSON.stringify({ decks: local.decks, activeDeckId: local.activeDeckId }));
      expect(cloud.map.get(CLOUD_KEYS.settings)).toBe(JSON.stringify(local.settings));
      expect(useStore.getState().stats.wins).toBe(7);
    } finally {
      detach();
    }
  });

  it('с облаком изменения пишутся и в localStorage, и в облако (матч — только локально)', async () => {
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(localSave()) });
    const cloud = fakeCloud();
    const detach = await boot(storage, withCloud(cloud));
    cloud.setItem.mockClear();
    useStore.getState().recordResult('win');
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).profile.stats.wins).toBe(8);
    detach(); // отписка досылает отложенную запись
    await vi.waitFor(() => expect(JSON.parse(cloud.map.get(CLOUD_KEYS.profile)!).stats.wins).toBe(8));
    expect(cloud.setItem).toHaveBeenCalledWith(CLOUD_KEYS.profile, expect.any(String));
    expect([...cloud.map.values()].some((v) => v.includes('"match"'))).toBe(false);
  });

  it('облако бросает при чтении → игра стартует на localStorage с одним предупреждением', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(localSave()) });
    const cloud = fakeCloud();
    cloud.getItem.mockRejectedValue(new Error('нет сети'));
    const detach = await boot(storage, withCloud(cloud));
    try {
      expect(useStore.getState().stats.wins).toBe(7);
      expect(warn).toHaveBeenCalledTimes(1);
      useStore.getState().recordResult('win');
      expect(JSON.parse(storage.getItem(SAVE_KEY)!).profile.stats.wins).toBe(8);
    } finally {
      detach();
    }
    // Облако на этом запуске считается отсутствующим: в него ничего не пишется.
    await new Promise((r) => setTimeout(r, 0));
    expect(cloud.setItem).not.toHaveBeenCalled();
  });

  it('облако молчит дольше 3000 мс → запуск на localStorage с одним предупреждением', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(localSave()) });
    const cloud = fakeCloud();
    cloud.getItem.mockImplementation(() => new Promise<string | null>(() => {}));
    let detach: (() => void) | null = null;
    const booting = boot(storage, withCloud(cloud)).then((d) => { detach = d; });
    await vi.advanceTimersByTimeAsync(CLOUD_BOOT_TIMEOUT_MS - 1);
    expect(detach).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await booting;
    try {
      expect(CLOUD_BOOT_TIMEOUT_MS).toBe(3000);
      expect(useStore.getState().stats.wins).toBe(7);
      expect(warn).toHaveBeenCalledTimes(1);
      useStore.getState().recordResult('win');
      expect(JSON.parse(storage.getItem(SAVE_KEY)!).profile.stats.wins).toBe(8);
      await vi.advanceTimersByTimeAsync(5000);
      expect(cloud.setItem).not.toHaveBeenCalled();
    } finally {
      detach!();
    }
    expect(cloud.setItem).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
