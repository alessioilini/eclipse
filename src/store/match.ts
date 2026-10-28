import type { StateCreator } from 'zustand';
import type { CardPlay, Deck, EngineEvent, HeroAction, Slot } from '../engine';
import type { Beat } from '../game/playback/toBeats';
import { toBeats } from '../game/playback/toBeats';
import type { ViewState } from '../game/playback/types';
import { viewFromPublic } from '../game/playback/viewReducer';
import {
  confirmRound, emptyDraft, isFinished, openMatch, playerView, surrender as surrenderSession,
} from '../game/session';
import type { Draft, MatchSession, NewMatchOpts } from '../game/session';
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
  /** Шаг сценария обучения, сохраняемый вместе с матчем (SaveV1.match.tutorialStepIndex). */
  tutorialStepIndex: number | null;
  startMatch(playerDeck: Deck, opts: NewMatchOpts): void;
  setAction(slot: Slot, action: HeroAction | null): void;
  setCard(play: CardPlay | null): void;
  confirm(): void;
  advanceBeat(): void;
  skipPlayback(): void;
  finishPlayback(): void;
  surrender(): void;
  clearMatch(): void;
};

export const blankDraft = (): Draft => ({ actions: [null, null, null], card: null });

/** Данные среза без матча. */
export const noMatch = (): Pick<
  MatchSlice,
  'session' | 'draft' | 'phase' | 'beats' | 'beatIndex' | 'lastEvents' | 'allEvents' | 'viewBeforePlayback' | 'tutorialStepIndex'
> => ({
  session: null, draft: blankDraft(), phase: 'planning', beats: [], beatIndex: 0, lastEvents: [], allEvents: [],
  viewBeforePlayback: null, tutorialStepIndex: null,
});

function requireSession(session: MatchSession | null): MatchSession {
  if (!session) throw new Error('no match');
  return session;
}

export const createMatchSlice: StateCreator<StoreState, [], [], MatchSlice> = (set, get) => ({
  ...noMatch(),
  startMatch(playerDeck, opts) {
    const { session, events } = openMatch(playerDeck, opts);
    set({
      ...noMatch(), session, draft: emptyDraft(session.state), lastEvents: events, allEvents: events,
      selectedSlot: null, sheet: null,
    });
  },
  setAction(slot, action) {
    const { draft } = get();
    const actions = [...draft.actions] as Draft['actions'];
    actions[slot] = action;
    set({ draft: { ...draft, actions } });
  },
  setCard(play) {
    set({ draft: { ...get().draft, card: play } });
  },
  confirm() {
    const { session: current, draft, allEvents, lastEvents, phase } = get();
    if (phase !== 'planning') return;
    const before = requireSession(current);
    const viewBeforePlayback = viewFromPublic(playerView(before));
    const { session, events } = confirmRound(before, draft);
    // Начало этого раунда уже в хвосте прошлого журнала: журнал раунда начинается с него.
    const roundStart = lastEvents.filter(e => e.round === before.state.round);
    set({
      session, viewBeforePlayback, lastEvents: [...roundStart, ...events], allEvents: [...allEvents, ...events],
      beats: toBeats(events), beatIndex: 0, phase: 'playback',
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
    const { session, phase } = get();
    if (!session || phase !== 'playback') return;
    if (isFinished(session)) set({ phase: 'finished' });
    else set({ phase: 'planning', draft: emptyDraft(session.state) });
  },
  surrender() {
    set({ session: surrenderSession(requireSession(get().session)), phase: 'finished' });
  },
  clearMatch() {
    set(noMatch());
  },
});
