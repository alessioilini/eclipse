import type { StateCreator } from 'zustand';
import type { CardPlay, Deck, EngineEvent, HeroAction, Slot } from '../engine';
import type { Beat } from '../game/playback/toBeats';
import { toBeats } from '../game/playback/toBeats';
import {
  confirmRound, emptyDraft, isFinished, newMatch, surrender as surrenderSession,
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
  /** События последнего подтверждённого раунда (вместе с началом следующего). */
  lastEvents: EngineEvent[];
  /** Все события матча с начала (для журнала). */
  allEvents: EngineEvent[];
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
  MatchSlice, 'session' | 'draft' | 'phase' | 'beats' | 'beatIndex' | 'lastEvents' | 'allEvents' | 'tutorialStepIndex'
> => ({
  session: null, draft: blankDraft(), phase: 'planning', beats: [], beatIndex: 0, lastEvents: [], allEvents: [],
  tutorialStepIndex: null,
});

function requireSession(session: MatchSession | null): MatchSession {
  if (!session) throw new Error('no match');
  return session;
}

export const createMatchSlice: StateCreator<StoreState, [], [], MatchSlice> = (set, get) => ({
  ...noMatch(),
  startMatch(playerDeck, opts) {
    const session = newMatch(playerDeck, opts);
    set({ ...noMatch(), session, draft: emptyDraft(session.state) });
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
    const { session: current, draft, allEvents } = get();
    const { session, events } = confirmRound(requireSession(current), draft);
    set({
      session, lastEvents: events, allEvents: [...allEvents, ...events],
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
    const { session } = get();
    if (!session) return;
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
