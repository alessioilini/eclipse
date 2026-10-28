import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudStorage } from '../../platform/types';
import { CLOUD_KEYS, createCloudWriter, loadCloud } from './cloud';
import { defaultSave, type SaveV1 } from './defaults';

/** Облако Telegram в памяти: getItem/setItem — шпионы поверх Map. */
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

function sampleSave(): SaveV1 {
  const save = defaultSave();
  save.profile.stats.wins = 3;
  save.profile.name = 'Аня';
  save.decks = [{ id: 'd1', name: 'Первая', deck: { heroes: ['aira'], starting: [0], cards: [] } as never }];
  save.activeDeckId = 'd1';
  save.settings.speed = 'fast';
  return save;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
});

describe('loadCloud', () => {
  it('пустое облако → null', async () => {
    expect(await loadCloud(fakeCloud())).toBeNull();
    // Telegram отдаёт пустую строку для отсутствующего ключа.
    expect(await loadCloud(fakeCloud({ [CLOUD_KEYS.profile]: '', [CLOUD_KEYS.decks]: '' }))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('частичное облако → только найденные разделы', async () => {
    const save = sampleSave();
    const c = await loadCloud(fakeCloud({ [CLOUD_KEYS.profile]: JSON.stringify(save.profile) }));
    expect(c).toEqual({ profile: save.profile });
  });

  it('eclipse.decks распаковывается в decks и activeDeckId', async () => {
    const save = sampleSave();
    const c = await loadCloud(fakeCloud({
      [CLOUD_KEYS.decks]: JSON.stringify({ decks: save.decks, activeDeckId: save.activeDeckId }),
      [CLOUD_KEYS.settings]: JSON.stringify(save.settings),
    }));
    expect(c).toEqual({ decks: save.decks, activeDeckId: 'd1', settings: save.settings });
  });

  it('битый JSON в одном ключе → остальные загружены, одно предупреждение', async () => {
    const save = sampleSave();
    const c = await loadCloud(fakeCloud({
      [CLOUD_KEYS.profile]: '{не json',
      [CLOUD_KEYS.decks]: JSON.stringify({ decks: save.decks, activeDeckId: null }),
      [CLOUD_KEYS.settings]: JSON.stringify(save.settings),
    }));
    expect(c).toEqual({ decks: save.decks, activeDeckId: null, settings: save.settings });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('неверная форма раздела → раздел пропущен с предупреждением', async () => {
    const save = sampleSave();
    const c = await loadCloud(fakeCloud({
      [CLOUD_KEYS.profile]: JSON.stringify(save.profile),
      [CLOUD_KEYS.decks]: JSON.stringify({ decks: 'не массив', activeDeckId: null }),
      [CLOUD_KEYS.settings]: JSON.stringify([1, 2]),
    }));
    expect(c).toEqual({ profile: save.profile });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('одна неверная колода → весь раздел колод пропущен с предупреждением', async () => {
    const save = sampleSave();
    const c = await loadCloud(fakeCloud({
      [CLOUD_KEYS.profile]: JSON.stringify(save.profile),
      [CLOUD_KEYS.decks]: JSON.stringify({ decks: [...save.decks, { id: 2, name: 'Без колоды' }], activeDeckId: 'd1' }),
    }));
    expect(c).toEqual({ profile: save.profile });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('createCloudWriter', () => {
  it('две записи за 1000 мс → один setItem на каждый изменившийся ключ', async () => {
    vi.useFakeTimers();
    const cloud = fakeCloud();
    const writer = createCloudWriter(cloud);
    const first = sampleSave();
    writer.write(first);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cloud.setItem).toHaveBeenCalledTimes(3);
    cloud.setItem.mockClear();

    const a = { ...first, profile: { ...first.profile, stats: { wins: 4, losses: 0, draws: 0 } } };
    writer.write(a);
    await vi.advanceTimersByTimeAsync(500);
    const b = { ...a, profile: { ...a.profile, stats: { wins: 5, losses: 0, draws: 0 } } };
    writer.write(b);
    expect(cloud.setItem).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    // Изменился только профиль: колоды и настройки не переписываются.
    expect(cloud.setItem).toHaveBeenCalledTimes(1);
    expect(cloud.setItem).toHaveBeenCalledWith(CLOUD_KEYS.profile, JSON.stringify(b.profile));
  });

  it('пишет разделы в ожидаемых ключах и форме', async () => {
    const cloud = fakeCloud();
    const writer = createCloudWriter(cloud);
    const save = sampleSave();
    writer.write(save);
    await writer.flush();
    expect(cloud.map.get(CLOUD_KEYS.profile)).toBe(JSON.stringify(save.profile));
    expect(cloud.map.get(CLOUD_KEYS.decks)).toBe(JSON.stringify({ decks: save.decks, activeDeckId: 'd1' }));
    expect(cloud.map.get(CLOUD_KEYS.settings)).toBe(JSON.stringify(save.settings));
  });

  it('flush выполняет отложенную запись сразу и снимает таймер', async () => {
    vi.useFakeTimers();
    const cloud = fakeCloud();
    const writer = createCloudWriter(cloud);
    writer.write(sampleSave());
    await writer.flush();
    expect(cloud.setItem).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(cloud.setItem).toHaveBeenCalledTimes(3);
  });

  it('значение длиннее 4096 символов → предупреждение и пропуск ключа, остальные пишутся', async () => {
    const cloud = fakeCloud();
    const writer = createCloudWriter(cloud);
    const save = sampleSave();
    save.decks = Array.from({ length: 60 }, (_, i) => ({ ...save.decks[0]!, id: `d${i}`, name: 'Очень длинное имя колоды '.repeat(4) }));
    expect(JSON.stringify({ decks: save.decks, activeDeckId: save.activeDeckId }).length).toBeGreaterThan(4096);
    writer.write(save);
    await writer.flush();
    expect(cloud.map.has(CLOUD_KEYS.decks)).toBe(false);
    expect(cloud.map.has(CLOUD_KEYS.profile)).toBe(true);
    expect(cloud.map.has(CLOUD_KEYS.settings)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('отказ setItem → одно предупреждение на все записи, остальные ключи пишутся', async () => {
    const cloud = fakeCloud();
    cloud.setItem.mockImplementation(async (k: string, v: string) => {
      if (k === CLOUD_KEYS.settings) throw new Error('quota');
      cloud.map.set(k, v);
    });
    const writer = createCloudWriter(cloud);
    const save = sampleSave();
    writer.write(save);
    await writer.flush();
    const next = { ...save, settings: { speed: 'normal' as const, sound: false } };
    writer.write(next);
    await writer.flush();
    // Неудачный ключ не считается записанным: следующая запись повторяет его с новым значением.
    expect(cloud.setItem).toHaveBeenCalledWith(CLOUD_KEYS.settings, JSON.stringify(next.settings));
    expect(cloud.map.has(CLOUD_KEYS.profile)).toBe(true);
    expect(cloud.map.has(CLOUD_KEYS.decks)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
