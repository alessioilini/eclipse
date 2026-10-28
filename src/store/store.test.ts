import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../engine';
import type { HeroAction, Slot } from '../engine';
import { randomDeck } from '../engine/sim';
import { defaultSave, type SaveV1 } from '../game/save/defaults';
import { SAVE_KEY } from '../game/save/storage';
import { formatLog } from '../engine/log';
import { viewFromPublic } from '../game/playback/viewReducer';
import { newMatch, playerView } from '../game/session';
import { attachPersistence, hydrate, toSave, useStore } from './index';

type FakeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function fakeStorage(initial: Record<string, string> = {}): FakeStorage & { setItem: ReturnType<typeof vi.fn> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: vi.fn((k: string, v: string) => { map.set(k, v); }),
    removeItem: (k) => { map.delete(k); },
  };
}

const basicOn = (slot: Slot): HeroAction => ({ type: 'basic', target: { side: 'B', slot } });
const playerDeck = () => randomDeck(createRng(5));
const opts = () => ({ opponentDeck: randomDeck(createRng(105)), seed: 5, mode: 'free' as const });

function fillDraft(): void {
  const s = useStore.getState();
  s.setAction(0, basicOn(0));
  s.setAction(1, basicOn(1));
  s.setAction(2, basicOn(2));
}

let detach: (() => void) | null = null;

beforeEach(() => { hydrate(defaultSave()); });
afterEach(() => { detach?.(); detach = null; vi.restoreAllMocks(); });

describe('профиль', () => {
  it('hydrate(defaultSave()) открывает четырёх героинь', () => {
    const s = hydrate(defaultSave());
    expect(s.unlocked).toEqual(['aira', 'fenna', 'nerisa', 'justina']);
    expect(s.tutorialStep).toBe(0);
    expect(s.session).toBeNull();
  });

  it('unlock не создаёт дубликатов', () => {
    useStore.getState().unlock(['aira', 'tali', 'tali']);
    expect(useStore.getState().unlocked).toEqual(['aira', 'fenna', 'nerisa', 'justina', 'tali']);
  });

  it('recordResult увеличивает нужный счётчик', () => {
    useStore.getState().recordResult('win');
    useStore.getState().recordResult('draw');
    expect(useStore.getState().stats).toEqual({ wins: 1, losses: 0, draws: 1 });
  });

  it('completeTutorial не откатывает шаг назад', () => {
    useStore.getState().completeTutorial(2);
    useStore.getState().completeTutorial(1);
    expect(useStore.getState().tutorialStep).toBe(2);
  });
});

describe('колоды', () => {
  it('upsertDeck заменяет по id и добавляет новую', () => {
    const s = useStore.getState();
    s.upsertDeck({ id: 'd1', name: 'Первая', deck: playerDeck() });
    s.upsertDeck({ id: 'd2', name: 'Вторая', deck: playerDeck() });
    s.upsertDeck({ id: 'd1', name: 'Переименована', deck: playerDeck() });
    expect(useStore.getState().decks.map(d => [d.id, d.name])).toEqual([['d1', 'Переименована'], ['d2', 'Вторая']]);
  });

  it('deleteDeck сбрасывает активную колоду, если удалена она', () => {
    const s = useStore.getState();
    s.upsertDeck({ id: 'd1', name: 'Первая', deck: playerDeck() });
    s.setActiveDeck('d1');
    s.deleteDeck('d1');
    expect(useStore.getState().decks).toEqual([]);
    expect(useStore.getState().activeDeckId).toBeNull();
  });
});

describe('сохранение стора', () => {
  it('toSave(hydrate(s)) равно s для сохранения с матчем', () => {
    const session = newMatch(playerDeck(), opts());
    const s: SaveV1 = {
      ...defaultSave(),
      decks: [{ id: 'd1', name: 'Первая', deck: playerDeck() }],
      activeDeckId: 'd1',
      settings: { speed: 'fast', sound: false },
      match: {
        state: session.state, botSeed: 5, mode: 'tutorial', tutorialId: 2, tutorialStepIndex: 3,
        playerDeck: session.playerDeck, opponentDeck: session.opponentDeck,
      },
    };
    expect(toSave(hydrate(s))).toEqual(s);
    expect(toSave(hydrate(defaultSave()))).toEqual(defaultSave());
  });

  it('изменение колод вызывает writeSave ровно один раз', () => {
    const storage = fakeStorage();
    detach = attachPersistence(storage);
    useStore.getState().upsertDeck({ id: 'd1', name: 'Первая', deck: playerDeck() });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem(SAVE_KEY) as string).decks[0].id).toBe('d1');
  });

  it('изменения интерфейса и черновика не пишут сохранение', () => {
    const storage = fakeStorage();
    useStore.getState().startMatch(playerDeck(), opts());
    detach = attachPersistence(storage);
    useStore.getState().openSheet({ kind: 'actions', slot: 1 });
    useStore.getState().setAction(0, basicOn(0));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('advanceBeat и skipPlayback не пишут сохранение', () => {
    const storage = fakeStorage();
    useStore.getState().startMatch(playerDeck(), opts());
    fillDraft();
    useStore.getState().confirm();
    detach = attachPersistence(storage);
    useStore.getState().advanceBeat();
    useStore.getState().skipPlayback();
    expect(useStore.getState().beatIndex).toBe(useStore.getState().beats.length);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('после отписки сохранение не пишется', () => {
    const storage = fakeStorage();
    attachPersistence(storage)();
    useStore.getState().setSpeed('fast');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('Review Focus 1: сохранение во время проигрывания восстанавливается в планирование того же раунда', () => {
    const storage = fakeStorage();
    detach = attachPersistence(storage);
    useStore.getState().startMatch(playerDeck(), opts());
    fillDraft();
    useStore.getState().confirm();
    const during = useStore.getState();
    expect(during.phase).toBe('playback');
    expect(during.beatIndex).toBe(0);
    const raw = storage.getItem(SAVE_KEY) as string;
    const saved = JSON.parse(raw) as SaveV1;

    const restored = hydrate(saved);
    expect(restored.phase).toBe('planning');
    expect(restored.session?.state.round).toBe(during.session?.state.round);
    expect(restored.session?.state.round).toBe(2);
    expect(restored.session?.state.awaitingCommands).toBe(true);
    expect(restored.beats).toEqual([]);
    expect(restored.draft.actions).toEqual([null, null, null]);
  });
});

describe('матч в сторе', () => {
  it('startMatch открывает планирование первого раунда', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    const s = useStore.getState();
    expect(s.session?.state.round).toBe(1);
    expect(s.phase).toBe('planning');
    expect(s.draft).toEqual({ actions: [null, null, null], card: null });
    // События начала первого раунда (roundStart, добор) уже в журнале.
    expect(s.lastEvents.length).toBeGreaterThan(0);
    expect(s.lastEvents.every(e => e.round === 1 && e.phase === 'roundStart')).toBe(true);
    expect(s.lastEvents.some(e => e.type === 'roundStart')).toBe(true);
    expect(s.allEvents).toEqual(s.lastEvents);
    expect(s.viewBeforePlayback).toBeNull();
  });

  it('startMatch сбрасывает выбранную героиню и открытый лист', () => {
    useStore.getState().openSheet({ kind: 'actions', slot: 2 });
    expect(useStore.getState().selectedSlot).toBe(2);
    useStore.getState().startMatch(playerDeck(), opts());
    expect(useStore.getState().selectedSlot).toBeNull();
    expect(useStore.getState().sheet).toBeNull();
  });

  it('setAction и setCard меняют черновик', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    useStore.getState().setAction(1, basicOn(2));
    useStore.getState().setCard({ handIndex: 0 });
    expect(useStore.getState().draft).toEqual({ actions: [null, basicOn(2), null], card: { handIndex: 0 } });
    useStore.getState().setAction(1, null);
    useStore.getState().setCard(null);
    expect(useStore.getState().draft).toEqual({ actions: [null, null, null], card: null });
  });

  it('confirm запускает проигрывание, биты листаются и пропускаются', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    fillDraft();
    useStore.getState().confirm();
    let s = useStore.getState();
    expect(s.phase).toBe('playback');
    expect(s.beats.length).toBeGreaterThan(1);
    expect(s.lastEvents.length).toBeGreaterThan(0);
    expect(s.allEvents).toEqual(s.lastEvents);

    s.advanceBeat();
    expect(useStore.getState().beatIndex).toBe(1);
    s.skipPlayback();
    s = useStore.getState();
    expect(s.beatIndex).toBe(s.beats.length);
    s.advanceBeat();
    expect(useStore.getState().beatIndex).toBe(s.beats.length);
  });

  it('confirm с неполным черновиком бросает', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    expect(() => useStore.getState().confirm()).toThrow('draft incomplete');
    expect(useStore.getState().phase).toBe('planning');
  });

  it('finishPlayback возвращает к планированию следующего раунда и копит события', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    fillDraft();
    useStore.getState().confirm();
    const first = useStore.getState().lastEvents;
    useStore.getState().finishPlayback();
    let s = useStore.getState();
    expect(s.phase).toBe('planning');
    expect(s.session?.state.round).toBe(2);
    expect(s.draft.card).toBeNull();
    fillDraft();
    useStore.getState().confirm();
    s = useStore.getState();
    // lastEvents: начало раунда 2 (хвост прошлого журнала) + его разрешение + начало раунда 3.
    const start2 = first.filter(e => e.round === 2);
    expect(start2.length).toBeGreaterThan(0);
    expect(s.lastEvents.slice(0, start2.length)).toEqual(start2);
    expect(s.allEvents).toEqual([...first, ...s.lastEvents.slice(start2.length)]);
  });

  it('журнал последнего раунда начинается со строки «R1 Moon=new»', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    fillDraft();
    useStore.getState().confirm();
    const s = useStore.getState();
    expect(formatLog(s.lastEvents, s.session!.state).split('\n')[0]).toBe('R1 Moon=new');
  });

  it('confirm запоминает отображение до раунда', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    const before = viewFromPublic(playerView(useStore.getState().session!));
    fillDraft();
    useStore.getState().confirm();
    expect(useStore.getState().viewBeforePlayback).toEqual(before);
    expect(useStore.getState().session?.state.round).toBe(2);
  });

  it('confirm вне планирования ничего не делает', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    fillDraft();
    useStore.getState().confirm();
    const during = useStore.getState();
    during.confirm();
    const after = useStore.getState();
    expect(after.session).toBe(during.session);
    expect(after.beats).toBe(during.beats);
    expect(after.allEvents).toBe(during.allEvents);
    expect(after.phase).toBe('playback');
  });

  it('finishPlayback вне проигрывания ничего не делает', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    useStore.getState().setAction(0, basicOn(1));
    const draft = useStore.getState().draft;
    useStore.getState().finishPlayback();
    expect(useStore.getState().phase).toBe('planning');
    expect(useStore.getState().draft).toBe(draft);
  });

  it('surrender завершает матч, finishPlayback после конца даёт finished', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    useStore.getState().surrender();
    let s = useStore.getState();
    expect(s.phase).toBe('finished');
    expect(s.session?.state.result).toEqual({ winner: 'B', reason: 'wipe' });
    s.finishPlayback();
    s = useStore.getState();
    expect(s.phase).toBe('finished');
  });

  it('recordMatchResult засчитывает матч один раз', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    useStore.getState().surrender();
    useStore.getState().recordMatchResult();
    useStore.getState().recordMatchResult();
    expect(useStore.getState().stats).toEqual({ wins: 0, losses: 1, draws: 0 });
  });

  it('восстановленный завершённый матч не засчитывается повторно', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    useStore.getState().surrender();
    useStore.getState().recordMatchResult();
    const saved = toSave(useStore.getState());
    hydrate(saved);
    useStore.getState().recordMatchResult();
    expect(useStore.getState().stats).toEqual({ wins: 0, losses: 1, draws: 0 });
  });

  it('clearMatch сбрасывает матч', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    fillDraft();
    useStore.getState().confirm();
    useStore.getState().clearMatch();
    const s = useStore.getState();
    expect(s.session).toBeNull();
    expect(s.phase).toBe('planning');
    expect(s.draft).toEqual({ actions: [null, null, null], card: null });
    expect(s.beats).toEqual([]);
    expect(s.beatIndex).toBe(0);
    expect(s.lastEvents).toEqual([]);
    expect(s.allEvents).toEqual([]);
    expect(s.viewBeforePlayback).toBeNull();
    expect(toSave(s).match).toBeNull();
  });

  it('hydrate сбрасывает отображение до раунда', () => {
    useStore.getState().startMatch(playerDeck(), opts());
    fillDraft();
    useStore.getState().confirm();
    expect(useStore.getState().viewBeforePlayback).not.toBeNull();
    const restored = hydrate(toSave(useStore.getState()));
    expect(restored.viewBeforePlayback).toBeNull();
    expect(restored.phase).toBe('planning');
  });
});

describe('интерфейс', () => {
  it('openSheet выбирает слот листа, closeSheet закрывает лист', () => {
    useStore.getState().openSheet({ kind: 'targets', slot: 2, action: 'skill' });
    expect(useStore.getState().selectedSlot).toBe(2);
    useStore.getState().openSheet({ kind: 'log' });
    expect(useStore.getState().selectedSlot).toBe(2);
    expect(useStore.getState().sheet).toEqual({ kind: 'log' });
    useStore.getState().closeSheet();
    expect(useStore.getState().sheet).toBeNull();
  });
});
