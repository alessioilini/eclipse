import { HERO_IDS } from '../../engine';
import type { Deck, HeroId } from '../../engine';
import { buildPreset } from '../decks/presets';
import type { SaveV1 } from '../save/defaults';

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

/** Часть профиля, которую меняют награды обучения. */
export type RewardsProfile = {
  tutorialStep: SaveV1['profile']['tutorialStep'];
  unlocked: HeroId[];
  decks: SaveV1['decks'];
  activeDeckId: string | null;
};

/**
 * Награды за победу в бою обучения `id` (спека §5.1): прогресс, новые героини, после третьего боя —
 * первая колода, которая становится активной. Возвращает только изменившиеся поля; повторное
 * применение к уже награждённому профилю даёт пустой патч (идемпотентность).
 */
export function tutorialRewards(p: RewardsProfile, id: 1 | 2 | 3, starterName: string): Partial<RewardsProfile> {
  const patch: Partial<RewardsProfile> = {};
  if (id > p.tutorialStep) patch.tutorialStep = id;
  const added = TUTORIAL_UNLOCKS[id].filter((h, i, all) => !p.unlocked.includes(h) && all.indexOf(h) === i);
  if (added.length > 0) patch.unlocked = [...p.unlocked, ...added];
  if (id === 3 && !p.decks.some((d) => d.id === STARTER_DECK_ID)) {
    patch.decks = [...p.decks, { id: STARTER_DECK_ID, name: starterName, deck: starterDeck() }];
    patch.activeDeckId = STARTER_DECK_ID;
  }
  return patch;
}
