import type { Deck, HeroId, MatchState } from '../../engine';

export type SaveV1 = {
  version: 1;
  profile: {
    unlocked: HeroId[]; tutorialStep: 0 | 1 | 2 | 3; stats: { wins: number; losses: number; draws: number };
    /** Имя игрока для вызовов (спека §5); необязательное поле без смены версии. */
    name?: string;
  };
  decks: { id: string; name: string; deck: Deck }[];
  activeDeckId: string | null;
  settings: { speed: 'normal' | 'fast'; sound: boolean };
  match: null | {
    state: MatchState; botSeed: number; mode: 'free' | 'tutorial'; tutorialId?: 1 | 2 | 3; tutorialStepIndex?: number;
    playerDeck: Deck; opponentDeck: Deck;
    /** Матч-вызов (спека §4.3); необязательное поле без смены версии. */
    challenge?: { name: string; code: string };
    /** `ENGINE_VERSION` движка, записавшего матч; матч другой версии при загрузке отбрасывается. */
    engineVersion: number;
  };
};

export function defaultSave(): SaveV1 {
  return {
    version: 1,
    profile: {
      unlocked: ['aira', 'fenna', 'nerisa', 'justina'],
      tutorialStep: 0,
      stats: { wins: 0, losses: 0, draws: 0 },
    },
    decks: [],
    activeDeckId: null,
    settings: { speed: 'normal', sound: true },
    match: null,
  };
}
