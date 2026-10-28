import type { StateCreator } from 'zustand';
import type { CardPlay, Deck, EngineEvent, HeroAction, MatchState, Slot } from '../engine';
import type { Beat } from '../game/playback/toBeats';
import { toBeats } from '../game/playback/toBeats';
import type { ViewState } from '../game/playback/types';
import { viewFromPublic } from '../game/playback/viewReducer';
import {
  confirmRound, emptyDraft, isFinished, openMatch, playerView, surrender as surrenderSession,
} from '../game/session';
import type { Draft, MatchSession, NewMatchOpts } from '../game/session';
import { allowed, onConfirm, onDraftChange, onPlaybackDone } from '../game/tutorial/runner';
import type { AllowSet, RunnerState } from '../game/tutorial/runner';
import type { HiddenElement } from '../game/tutorial/types';
import type { StoreState } from './index';

export type MatchPhase = 'planning' | 'playback' | 'finished';

export type MatchSlice = {
  session: MatchSession | null;
  draft: Draft;
  phase: MatchPhase;
  beats: Beat[];
  beatIndex: number;
  /**
   * События последнего раунда для журнала: его начало (roundStart, добор), разрешение после
   * подтверждения и начало следующего. До первого подтверждения — только начало первого раунда.
   */
  lastEvents: EngineEvent[];
  /** Все события матча с начала (для журнала), без повторов. */
  allEvents: EngineEvent[];
  /** Отображение перед проигрыванием: с него экран проигрывания применяет биты. */
  viewBeforePlayback: ViewState | null;
  /** Шаг сценария обучения, сохраняемый вместе с матчем (SaveV1.match.tutorialStepIndex); зеркало `tutorial.stepIndex`. */
  tutorialStepIndex: number | null;
  /** Исполнитель сценария обучения; null в свободном матче. */
  tutorial: RunnerState | null;
  /** Состояние завершённого матча, итог которого уже занесён в статистику (сравнение по ссылке). */
  resultRecordedFor: MatchState | null;
  startMatch(playerDeck: Deck, opts: NewMatchOpts): void;
  /** Ставит исполнителя сценария (null — убрать); `tutorialStepIndex` следует за ним. */
  setTutorialRunner(r: RunnerState | null): void;
  setAction(slot: Slot, action: HeroAction | null): void;
  setCard(play: CardPlay | null): void;
  confirm(): void;
  advanceBeat(): void;
  skipPlayback(): void;
  finishPlayback(): void;
  surrender(): void;
  clearMatch(): void;
  /** Заносит итог завершённого матча в статистику ровно один раз на матч; повторные вызовы ничего не делают. */
  recordMatchResult(): void;
};

export const blankDraft = (): Draft => ({ actions: [null, null, null], card: null });

/** Данные среза без матча. */
export const noMatch = (): Pick<
  MatchSlice,
  'session' | 'draft' | 'phase' | 'beats' | 'beatIndex' | 'lastEvents' | 'allEvents' | 'viewBeforePlayback' | 'tutorialStepIndex'
  | 'resultRecordedFor' | 'tutorial'
> => ({
  session: null, draft: blankDraft(), phase: 'planning', beats: [], beatIndex: 0, lastEvents: [], allEvents: [],
  viewBeforePlayback: null, tutorialStepIndex: null, resultRecordedFor: null, tutorial: null,
});

const runnerFields = (r: RunnerState | null) => ({ tutorial: r, tutorialStepIndex: r ? r.stepIndex : null });

/** Что разрешает обучение в планировании; null — свободный матч (разрешено всё, что легально). */
export function selectAllowed(s: Pick<StoreState, 'tutorial' | 'session'>): AllowSet | null {
  return s.tutorial && s.session ? allowed(s.tutorial, s.session.state) : null;
}

const NONE_HIDDEN: HiddenElement[] = [];

/** Элементы интерфейса, скрытые сценарием обучения; вне обучения — один и тот же пустой массив. */
export function selectHidden(s: Pick<StoreState, 'tutorial'>): HiddenElement[] {
  return s.tutorial?.script.hidden ?? NONE_HIDDEN;
}

function requireSession(session: MatchSession | null): MatchSession {
  if (!session) throw new Error('no match');
  return session;
}

export const createMatchSlice: StateCreator<StoreState, [], [], MatchSlice> = (set, get) => {
  /** Новый черновик; в обучении проверяет требование текущего шага (спека §10.3). */
  const setDraft = (draft: Draft) => {
    const { tutorial, session } = get();
    const next = tutorial && session ? onDraftChange(tutorial, draft, session.state) : tutorial;
    set({ draft, ...(next !== tutorial ? runnerFields(next) : {}) });
  };
  return {
    ...noMatch(),
    startMatch(playerDeck, opts) {
      const { session, events } = openMatch(playerDeck, opts);
      set({
        ...noMatch(), session, draft: emptyDraft(session.state), lastEvents: events, allEvents: events,
        selectedSlot: null, sheet: null,
      });
    },
    setTutorialRunner(r) {
      set(runnerFields(r));
    },
    setAction(slot, action) {
      const { draft } = get();
      const actions = [...draft.actions] as Draft['actions'];
      actions[slot] = action;
      setDraft({ ...draft, actions });
    },
    setCard(play) {
      setDraft({ ...get().draft, card: play });
    },
    confirm() {
      const { session: current, draft, allEvents, lastEvents, phase } = get();
      if (phase !== 'planning') return;
      const before = requireSession(current);
      const viewBeforePlayback = viewFromPublic(playerView(before));
      const { session, events } = confirmRound(before, draft);
      // Начало этого раунда уже в хвосте прошлого журнала: журнал раунда начинается с него.
      const roundStart = lastEvents.filter(e => e.round === before.state.round);
      const { tutorial } = get();
      set({
        session, viewBeforePlayback, lastEvents: [...roundStart, ...events], allEvents: [...allEvents, ...events],
        beats: toBeats(events), beatIndex: 0, phase: 'playback',
        ...(tutorial ? runnerFields(onConfirm(tutorial)) : {}),
      });
    },
    advanceBeat() {
      const { beatIndex, beats } = get();
      if (beatIndex < beats.length) set({ beatIndex: beatIndex + 1 });
    },
    skipPlayback() {
      set({ beatIndex: get().beats.length });
    },
    finishPlayback() {
      const { session, phase, tutorial } = get();
      if (!session || phase !== 'playback') return;
      const runner = tutorial ? runnerFields(onPlaybackDone(tutorial)) : {};
      if (isFinished(session)) set({ phase: 'finished', ...runner });
      else set({ phase: 'planning', draft: emptyDraft(session.state), ...runner });
    },
    surrender() {
      set({ session: surrenderSession(requireSession(get().session)), phase: 'finished' });
    },
    clearMatch() {
      set(noMatch());
    },
    recordMatchResult() {
      const { session, resultRecordedFor, recordResult } = get();
      const result = session?.state.result;
      // Бои обучения в статистику не идут.
      if (!session || !result || session.mode === 'tutorial' || resultRecordedFor === session.state) return;
      set({ resultRecordedFor: session.state });
      recordResult(result.winner === 'A' ? 'win' : result.winner === 'B' ? 'loss' : 'draw');
    },
  };
};
