import { ru } from '../../../i18n/ru';
import { spreadBasics } from '../enemy';
import type { TutorialScript } from '../types';
import { A, PLAYER_DECK, TUTORIAL_CARDS } from './common';

const say = ru.tutorial.scripts[2].steps;

/** Индекс «Полевой аптечки» в руке первого раунда при `seed` ниже (проверяется тестом). */
const FIELD_KIT_INDEX = 2;

/** Бой 2 «Луна и карты»: карта из руки, тайминг, фаза Луны (спека §5.1). Резерв скрыт. */
export const script2: TutorialScript = {
  id: 2,
  title: ru.tutorial.scripts[2].title,
  decks: {
    A: PLAYER_DECK,
    B: { heroes: ['mira', 'nokta', 'selena', 'aurora', 'liraya', 'kira'], starting: [0, 1, 2], cards: TUTORIAL_CARDS },
  },
  enemyHp: [10, 8, 8, 5, 5, 5],
  seed: 202,
  enemy: (_round, view) => spreadBasics(view),
  steps: [
    { round: 1, say: say[0], anchor: { kind: 'card', handIndex: FIELD_KIT_INDEX } },
    {
      round: 1, require: { card: 'fieldKit', target: A(2) }, say: say[1],
      anchor: { kind: 'card', handIndex: FIELD_KIT_INDEX },
    },
    { round: 1, say: say[2], anchor: { kind: 'energy' } },
    { round: 1, say: say[3] },
    { round: 2, say: say[4], anchor: { kind: 'moon' } },
  ],
  hidden: ['reserve', 'ultimate', 'swap'],
};
