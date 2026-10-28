import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadSave, writeSave, SAVE_KEY } from './storage';
import { defaultSave } from './defaults';
import { ENGINE_VERSION } from '../../engine';
import { newMatch, opponentDeckFor } from '../session';

type FakeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('сохранение', () => {
  it('пустое хранилище даёт сохранение по умолчанию без предупреждений', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadSave(fakeStorage())).toEqual(defaultSave());
    expect(warn).not.toHaveBeenCalled();
  });

  it('значения по умолчанию соответствуют спецификации', () => {
    const s = defaultSave();
    expect(s.version).toBe(1);
    expect(s.profile.unlocked).toEqual(['aira', 'fenna', 'nerisa', 'justina']);
    expect(s.profile.tutorialStep).toBe(0);
    expect(s.profile.stats).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(s.decks).toEqual([]);
    expect(s.activeDeckId).toBeNull();
    expect(s.settings).toEqual({ speed: 'normal', sound: true });
    expect(s.match).toBeNull();
  });

  it('запись и чтение возвращают равное сохранение', () => {
    const storage = fakeStorage();
    const save = defaultSave();
    save.profile.tutorialStep = 2;
    save.profile.stats.wins = 3;
    save.settings.speed = 'fast';
    save.decks.push({ id: 'd1', name: 'Первая', deck: { heroes: ['aira', 'fenna', 'nerisa'], starting: [0, 1, 2], cards: ['lunarDash'] } });
    save.activeDeckId = 'd1';
    writeSave(save, storage);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    expect(loadSave(storage)).toEqual(save);
  });

  it('битый JSON даёт сохранение по умолчанию и предупреждение', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadSave(fakeStorage({ [SAVE_KEY]: '{' }))).toEqual(defaultSave());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('[save]');
  });

  it('чужая версия даёт сохранение по умолчанию и предупреждение', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadSave(fakeStorage({ [SAVE_KEY]: JSON.stringify({ version: 99 }) }))).toEqual(defaultSave());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('[save]');
  });

  it('запись при QuotaExceededError не бросает, а предупреждает', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage: FakeStorage = {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
    };
    expect(() => writeSave(defaultSave(), storage)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('[save]');
  });

  it('сохранение с матчем правильной формы читается вместе с матчем', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const playerDeck = opponentDeckFor(0);
    const opponentDeck = opponentDeckFor(1);
    const session = newMatch(playerDeck, { opponentDeck, seed: 5, mode: 'free' });
    const save = defaultSave();
    save.match = { state: session.state, botSeed: 5, mode: 'free', playerDeck, opponentDeck, engineVersion: ENGINE_VERSION };
    const storage = fakeStorage();
    writeSave(save, storage);
    expect(loadSave(storage)).toEqual(save);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['другая версия движка', ENGINE_VERSION + 1],
    ['версии нет (считается 0)', undefined],
  ])('матч, сохранённый другим движком (%s), отбрасывается с предупреждением', (_name, engineVersion) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const playerDeck = opponentDeckFor(0);
    const opponentDeck = opponentDeckFor(1);
    const session = newMatch(playerDeck, { opponentDeck, seed: 5, mode: 'free' });
    const save = defaultSave();
    save.profile.stats.wins = 2;
    const match = { state: session.state, botSeed: 5, mode: 'free', playerDeck, opponentDeck, engineVersion };
    const loaded = loadSave(fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...save, match }) }));
    expect(loaded.match).toBeNull();
    expect(loaded.profile.stats.wins).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('[save]');
  });

  it.each([
    ['матч не объект', 'oops'],
    ['нет сторон в состоянии', { state: {}, botSeed: 1, mode: 'free', playerDeck: {}, opponentDeck: {} }],
    ['нет колод', { state: { sides: { A: {}, B: {} } }, botSeed: 1, mode: 'free' }],
    ['неизвестный режим', { state: { sides: { A: {}, B: {} } }, botSeed: 1, mode: 'arena', playerDeck: { heroes: [], cards: [] }, opponentDeck: { heroes: [], cards: [] } }],
  ])('битый матч (%s) отбрасывается с предупреждением, профиль остаётся', (_name, match) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const save = defaultSave();
    save.profile.stats.wins = 4;
    const storage = fakeStorage({ [SAVE_KEY]: JSON.stringify({ ...save, match }) });
    const loaded = loadSave(storage);
    expect(loaded.match).toBeNull();
    expect(loaded.profile.stats.wins).toBe(4);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('[save]');
  });
});
