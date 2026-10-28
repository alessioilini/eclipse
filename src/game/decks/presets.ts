import { CARD_IDS, CARDS, HEROES, HERO_IDS, validateDeck } from '../../engine';
import type { CardId, Deck, HeroId, Role } from '../../engine';

export type Archetype = 'attack' | 'defense' | 'control' | 'balanced';

export const ARCHETYPE_KEYS: Archetype[] = ['attack', 'defense', 'control', 'balanced'];

/** Спека §6.2: героини по приоритету ролей и 12 карт архетипа. */
export const ARCHETYPES: Record<Archetype, { roles: Role[]; cards: CardId[] }> = {
  attack: {
    roles: ['striker', 'mage', 'striker', 'mage', 'support', 'guardian'],
    cards: [
      'huntersMark', 'huntersMark', 'piercingStrike', 'piercingStrike', 'warCry', 'warCry',
      'lunarDash', 'lunarDash', 'bloodPact', 'ashTrail', 'lunarSpark', 'lunarSpark',
    ],
  },
  defense: {
    roles: ['guardian', 'guardian', 'support', 'support', 'mage', 'striker'],
    cards: [
      'wardCircle', 'wardCircle', 'fieldKit', 'fieldKit', 'healingWave', 'healingWave',
      'cover', 'cover', 'deferredDeath', 'unseal', 'unseal', 'rewriteFate',
    ],
  },
  control: {
    roles: ['mage', 'mage', 'support', 'guardian', 'striker', 'guardian'],
    cards: [
      'breakRhythm', 'breakRhythm', 'swapBan', 'swapBan', 'moonTurn', 'moonReverse',
      'dispel', 'dispel', 'eclipse', 'lunarSpark', 'lunarSpark', 'reserveImpulse',
    ],
  },
  balanced: {
    roles: ['striker', 'mage', 'guardian', 'support', 'mage', 'striker'],
    cards: CARD_IDS.filter((id) => CARDS[id].rarity === 'common'),
  },
};

/**
 * «Собрать за меня»: детерминированно строит колоду архетипа из открытых героинь.
 * Внутри роли — по порядку HERO_IDS; если роли не хватает — следующая свободная открытая любой роли.
 */
export function buildPreset(archetype: Archetype, unlocked: HeroId[]): Deck {
  const open = HERO_IDS.filter((id) => unlocked.includes(id));
  if (open.length < 6) throw new Error('not enough heroes');
  const heroes: HeroId[] = [];
  for (const role of ARCHETYPES[archetype].roles) {
    const pick = open.find((id) => !heroes.includes(id) && HEROES[id].role === role)
      ?? open.find((id) => !heroes.includes(id));
    heroes.push(pick!);
  }
  const deck: Deck = { heroes, starting: [0, 1, 2], cards: [...ARCHETYPES[archetype].cards] };
  const errors = validateDeck(deck);
  if (errors.length > 0) throw new Error('preset invalid: ' + errors.join('; '));
  return deck;
}
