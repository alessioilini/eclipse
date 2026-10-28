import type { CardId, Deck, SlotRef } from '../../../engine';

/** Карты колод обучения: в боях 1–3 противник карт не играет, игроку нужна «Полевая аптечка». */
export const TUTORIAL_CARDS: CardId[] = [
  'fieldKit', 'fieldKit', 'lunarDash', 'lunarDash', 'wardCircle', 'wardCircle',
  'unseal', 'unseal', 'lunarSpark', 'lunarSpark', 'warCry', 'warCry',
];

/** Состав игрока во всех трёх боях: Айра, Фенна, Нериса активны; Юстина, Тали, Зефира в резерве. */
export const PLAYER_DECK: Deck = {
  heroes: ['aira', 'fenna', 'nerisa', 'justina', 'tali', 'zefira'],
  starting: [0, 1, 2],
  cards: TUTORIAL_CARDS,
};

export const A = (slot: 0 | 1 | 2): SlotRef => ({ side: 'A', slot });
export const B = (slot: 0 | 1 | 2): SlotRef => ({ side: 'B', slot });
