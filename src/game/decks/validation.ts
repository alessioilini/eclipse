import { CARDS, validateDeck } from '../../engine';
import type { CardId, Deck } from '../../engine';
import { fmt, ru } from '../../i18n/ru';

const cardName = (id: string): string => (Object.hasOwn(CARDS, id) ? CARDS[id as CardId].name : id);

/** Русский текст для сообщения `validateDeck` (сопоставление по префиксу). */
function toText(message: string): string {
  const e = ru.deckErrors;
  if (message.startsWith('deck must have exactly 6 heroes')) return e.count6;
  if (message.startsWith('duplicate hero')) return e.duplicateHero;
  if (message.startsWith('starting must be')) return e.starting;
  if (message.startsWith('deck must have exactly 12 cards')) return e.count12;
  if (message.startsWith('more than 2 copies of ')) {
    return fmt(e.copies, { name: cardName(message.slice('more than 2 copies of '.length)) });
  }
  if (message.startsWith('more than 1 copy of legendary ')) {
    return fmt(e.legendaryCopy, { name: cardName(message.slice('more than 1 copy of legendary '.length)) });
  }
  if (message.startsWith('more than 2 legendary')) return e.legendaryCount;
  return e.unknown;
}

/** Ошибки колоды по-русски; пустой массив — колода легальна. */
export function deckIssues(deck: Deck): string[] {
  return validateDeck(deck).map(toText);
}
