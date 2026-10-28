import { create } from 'zustand';
import type { SaveV1 } from '../game/save/defaults';
import { writeSave } from '../game/save/storage';
import { emptyDraft, isFinished } from '../game/session';
import { createDecksSlice, type DecksSlice } from './decks';
import { createMatchSlice, noMatch, type MatchSlice } from './match';
import { createProfileSlice, type ProfileSlice } from './profile';
import { createSettingsSlice, type SettingsSlice } from './settings';
import { createUiSlice, type UiSlice } from './ui';

export type { ProfileSlice } from './profile';
export type { DecksSlice, SavedDeck } from './decks';
export type { SettingsSlice, Speed } from './settings';
export type { MatchSlice, MatchPhase } from './match';
export type { UiSlice, Sheet } from './ui';

export type StoreState = ProfileSlice & DecksSlice & SettingsSlice & MatchSlice & UiSlice;

export const useStore = create<StoreState>()((...a) => ({
  ...createProfileSlice(...a),
  ...createDecksSlice(...a),
  ...createSettingsSlice(...a),
  ...createMatchSlice(...a),
  ...createUiSlice(...a),
}));

/** Ванильный доступ для игрового слоя и тестов: `store.getState()`. */
export const store = useStore;

/**
 * Загружает сохранение в стор и возвращает новое состояние. Матч восстанавливается в планирование
 * текущего раунда: в сохранении всегда состояние после `startRound` (или завершённый матч).
 */
export function hydrate(save: SaveV1): StoreState {
  const m = save.match;
  const session = m
    ? {
      state: m.state, botSeed: m.botSeed, mode: m.mode,
      ...(m.tutorialId !== undefined ? { tutorialId: m.tutorialId } : {}),
      playerDeck: m.playerDeck, opponentDeck: m.opponentDeck,
    }
    : null;
  useStore.setState({
    unlocked: save.profile.unlocked,
    tutorialStep: save.profile.tutorialStep,
    stats: save.profile.stats,
    decks: save.decks,
    activeDeckId: save.activeDeckId,
    speed: save.settings.speed,
    sound: save.settings.sound,
    ...noMatch(),
    ...(session
      ? {
        session,
        draft: emptyDraft(session.state),
        phase: isFinished(session) ? 'finished' : 'planning',
        // Завершённый матч уже был засчитан при завершении: после перезагрузки повторно не считаем.
        resultRecordedFor: isFinished(session) ? session.state : null,
        tutorialStepIndex: m?.tutorialStepIndex ?? null,
      }
      : {}),
    selectedSlot: null,
    sheet: null,
  });
  return useStore.getState();
}

/** Снимок для сохранения: без битов, черновика, фазы и интерфейса. */
export function toSave(state: StoreState): SaveV1 {
  const s = state.session;
  return {
    version: 1,
    profile: { unlocked: state.unlocked, tutorialStep: state.tutorialStep, stats: state.stats },
    decks: state.decks,
    activeDeckId: state.activeDeckId,
    settings: { speed: state.speed, sound: state.sound },
    match: s
      ? {
        state: s.state, botSeed: s.botSeed, mode: s.mode,
        ...(s.tutorialId !== undefined ? { tutorialId: s.tutorialId } : {}),
        ...(state.tutorialStepIndex !== null ? { tutorialStepIndex: state.tutorialStepIndex } : {}),
        playerDeck: s.playerDeck, opponentDeck: s.opponentDeck,
      }
      : null,
  };
}

type SaveStorage = Parameters<typeof writeSave>[1];

/** Поля, изменение которых (по ссылке) требует записи сохранения. */
function persisted(s: StoreState): unknown[] {
  return [
    s.unlocked, s.tutorialStep, s.stats, s.decks, s.activeDeckId, s.speed, s.sound,
    s.session?.state ?? null, s.tutorialStepIndex,
  ];
}

/** Подписывает запись сохранения на изменения сохраняемых полей; возвращает отписку. */
export function attachPersistence(storage?: SaveStorage): () => void {
  let prev = persisted(useStore.getState());
  return useStore.subscribe((state) => {
    const next = persisted(state);
    if (next.every((v, i) => Object.is(v, prev[i]))) return;
    prev = next;
    writeSave(toSave(state), storage);
  });
}
