import { describe, expect, it } from 'vitest';
import { defaultSave } from './game/save/defaults';
import { SAVE_KEY } from './game/save/storage';
import { boot } from './main';
import { useStore } from './store';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

describe('запуск приложения', () => {
  it('boot загружает сохранение из хранилища и подключает запись', () => {
    const save = defaultSave();
    save.profile.tutorialStep = 2;
    save.profile.stats.wins = 7;
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify(save) });
    const detach = boot(storage);
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
});
