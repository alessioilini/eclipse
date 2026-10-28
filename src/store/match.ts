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
import { tutorialRewards } from '../game/tutorial/rewards';
import type { HiddenElement } from '../game/tutorial/types';
import { ru } from '../i18n/ru';
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
  /**
   * Запасной путь записи итога: обычно итог заносится в том же `set`, что завершает матч (`confirm`,
   * `surrender`), и вызов ничего не делает. Ровно один раз на матч.
   */
  recordMatchResult(): void;
  /** Награды за победу в бою обучения `id` (спека §5.1); повторный вызов ничего не меняет. */
  applyTutorialRewards(id: 1 | 2 | 3): void;
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

const STAT_KEY = { A: 'wins', B: 'losses', draw: 'draws' } as const;

/**
 * Запись итога завершённого матча — часть того же `set`, что его завершает, чтобы итог не терялся при
 * перезагрузке или уходе с экрана до результата: свободный матч — +1 в статистику, победа в бою
 * обучения — его награды. Пусто, если матч не завершён или уже записан (`resultRecordedFor`).
 */
function resultPatch(s: StoreState, session: MatchSession): Partial<StoreState> {
  const result = session.state.result;
  if (!result || s.resultRecordedFor === session.state) return {};
  if (session.mode === 'tutorial') {
    // Бои обучения в статистику не идут.
    const rewards = result.winner === 'A' && session.tutorialId !== undefined
      ? tutorialRewards(s, session.tutorialId, ru.tutorial.starterDeck)
      : {};
    return { resultRecordedFor: session.state, ...rewards };
  }
  const key = STAT_KEY[result.winner];
  return { resultRecordedFor: session.state, stats: { ...s.stats, [key]: s.stats[key] + 1 } };
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
        // Матч завершился этим раундом: итог и награды записываются сразу, до проигрывания (I1).
        ...(isFinished(session) ? resultPatch(get(), session) : {}),
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
      const { session: current, phase } = get();
      // Сдаться можно только в планировании незавершённого матча: иначе сдача перезаписала бы итог
      // уже разрешённого раунда (I2).
      if (!current || isFinished(current) || phase !== 'planning') return;
      const session = surrenderSession(current);
      set({ session, phase: 'finished', ...resultPatch(get(), session) });
    },
    clearMatch() {
      set(noMatch());
    },
    recordMatchResult() {
      const { session } = get();
      if (!session) return;
      const patch = resultPatch(get(), session);
      if (Object.keys(patch).length > 0) set(patch);
    },
    applyTutorialRewards(id) {
      const patch = tutorialRewards(get(), id, ru.tutorial.starterDeck);
      if (Object.keys(patch).length > 0) set(patch);
    },
  };
};
