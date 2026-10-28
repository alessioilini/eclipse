import { create } from 'zustand';
import { ENGINE_VERSION } from '../engine';
import { truncateName } from '../game/links/codec';
import type { SaveV1 } from '../game/save/defaults';
import { writeSave } from '../game/save/storage';
import { emptyDraft, isFinished } from '../game/session';
import type { MatchSession } from '../game/session';
import { createRunner } from '../game/tutorial/runner';
import { SCRIPTS } from '../game/tutorial/scripts';
import type { TutorialScript } from '../game/tutorial/types';
import { createDecksSlice, type DecksSlice } from './decks';
import { createMatchSlice, noMatch, type MatchSlice } from './match';
import { createProfileSlice, type ProfileSlice } from './profile';
import { createSettingsSlice, type SettingsSlice } from './settings';
import { createUiSlice, type UiSlice } from './ui';

export type { ProfileSlice } from './profile';
export type { DecksSlice, SavedDeck } from './decks';
export type { SettingsSlice, Speed } from './settings';
export type { MatchSlice, MatchPhase } from './match';
export type { UiSlice, Sheet, Notice } from './ui';

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
 * Шаг сценария после восстановления: черновик не сохраняется, поэтому шаг внутри раунда откатывается к
 * первому шагу этого раунда, не являющемуся текстом после проигрывания; ещё не закрытый текст после
 * проигрывания прошлого раунда (он раньше) остаётся.
 */
export function restoredStep(script: TutorialScript, round: number, saved: number): number {
  const first = script.steps.findIndex(step => step.round === round && !('afterPlayback' in step));
  return first >= 0 && saved > first ? first : saved;
}

/** Имя из сохранения: migrate проверяет форму поверхностно, поэтому нестроковое или пустое имя — null. */
function savedName(raw: unknown): string | null {
  const name = typeof raw === 'string' ? truncateName(raw.trim()) : '';
  return name === '' ? null : name;
}

/**
 * Загружает сохранение в стор и возвращает новое состояние. Матч восстанавливается в планирование
 * текущего раунда: в сохранении всегда состояние после `startRound` (или завершённый матч).
 */
export function hydrate(save: SaveV1): StoreState {
  const m = save.match;
  // U17: функции не сохраняются — сценарного противника и исполнителя восстанавливаем по tutorialId.
  const script = m?.mode === 'tutorial' && m.tutorialId !== undefined ? SCRIPTS[m.tutorialId] : null;
  const session: MatchSession | null = m
    ? {
      state: m.state, botSeed: m.botSeed, mode: m.mode,
      ...(m.tutorialId !== undefined ? { tutorialId: m.tutorialId } : {}),
      playerDeck: m.playerDeck, opponentDeck: m.opponentDeck,
      ...(script ? { enemy: script.enemy } : {}),
      ...(m.challenge ? { challenge: m.challenge } : {}),
    }
    : null;
  // Матч восстанавливается в планировании текущего раунда с пустым черновиком: исполнитель на том же
  // раунде, а шаг откатывается к началу раунда (требования уже пройденных шагов черновик больше не держит).
  const tutorial = script && m
    ? { ...createRunner(script), stepIndex: restoredStep(script, m.state.round, m.tutorialStepIndex ?? 0), round: m.state.round }
    : null;
  useStore.setState({
    unlocked: save.profile.unlocked,
    tutorialStep: save.profile.tutorialStep,
    stats: save.profile.stats,
    name: savedName(save.profile.name),
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
        tutorialStepIndex: tutorial ? tutorial.stepIndex : m?.tutorialStepIndex ?? null,
        tutorial,
      }
      : {}),
    selectedSlot: null,
    sheet: null,
    notice: null,
  });
  return useStore.getState();
}

/** Снимок для сохранения: без битов, черновика, фазы и интерфейса. */
export function toSave(state: StoreState): SaveV1 {
  const s = state.session;
  return {
    version: 1,
    profile: {
      unlocked: state.unlocked, tutorialStep: state.tutorialStep, stats: state.stats,
      ...(state.name !== null ? { name: state.name } : {}),
    },
    decks: state.decks,
    activeDeckId: state.activeDeckId,
    settings: { speed: state.speed, sound: state.sound },
    match: s
      ? {
        state: s.state, botSeed: s.botSeed, mode: s.mode,
        ...(s.tutorialId !== undefined ? { tutorialId: s.tutorialId } : {}),
        ...(state.tutorialStepIndex !== null ? { tutorialStepIndex: state.tutorialStepIndex } : {}),
        playerDeck: s.playerDeck, opponentDeck: s.opponentDeck,
        ...(s.challenge ? { challenge: s.challenge } : {}),
        engineVersion: ENGINE_VERSION,
      }
      : null,
  };
}

type SaveStorage = Parameters<typeof writeSave>[1];

/** Поля, изменение которых (по ссылке) требует записи сохранения. */
function persisted(s: StoreState): unknown[] {
  return [
    s.unlocked, s.tutorialStep, s.stats, s.name, s.decks, s.activeDeckId, s.speed, s.sound,
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
