import { ru } from '../../../i18n/ru';
import { spreadBasics } from '../enemy';
import type { TutorialScript } from '../types';
import { A, PLAYER_DECK, TUTORIAL_CARDS } from './common';

const say = ru.tutorial.scripts[3].steps;

/** Бой 3 «Полный состав»: замена и резерв, Luna и ульта, Кровавая Луна (спека §5.1). Ничего не скрыто. */
export const script3: TutorialScript = {
  id: 3,
  title: ru.tutorial.scripts[3].title,
  decks: {
    A: PLAYER_DECK,
    B: { heroes: ['liraya', 'kira', 'selena', 'aurora', 'nokta', 'mira'], starting: [0, 1, 2], cards: TUTORIAL_CARDS },
  },
  enemyHp: [12, 10, 10, 8, 8, 8],
  seed: 303,
  enemy: (_round, view) => spreadBasics(view),
  steps: [
    { round: 1, say: say[0], anchor: { kind: 'reserve', side: 'A', index: 0 } },
    { round: 1, require: { slot: 1, action: 'swap', reserveIndex: 0 }, say: say[1], anchor: { kind: 'hero', ref: A(1) } },
    { round: 1, say: say[2] },
    { round: 1, afterPlayback: true, say: say[3] },
    { round: 2, say: say[4], anchor: { kind: 'energy' } },
    { round: 2, require: { slot: 0, action: 'ultimate' }, say: say[5], anchor: { kind: 'hero', ref: A(0) } },
    { round: 2, say: say[6] },
    { round: 3, say: say[7], anchor: { kind: 'moon' } },
  ],
  hidden: [],
};
