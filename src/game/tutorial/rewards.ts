import { HERO_IDS } from '../../engine';
import type { Deck, HeroId } from '../../engine';
import { buildPreset } from '../decks/presets';

/** Спека §5.1: кого открывает победа в бою обучения. */
export const TUTORIAL_UNLOCKS: Record<1 | 2 | 3, HeroId[]> = {
  1: ['tali', 'zefira', 'nokta', 'mira'],
  2: [],
  3: ['liraya', 'aurora', 'kira', 'selena'],
};

/** Id первой колоды «Сбалансированная», выдаваемой за третий бой. */
export const STARTER_DECK_ID = 'tutorial-balanced';

/** Первая колода: архетип «Баланс» из всех двенадцати героинь. */
export function starterDeck(): Deck {
  return buildPreset('balanced', HERO_IDS);
}
