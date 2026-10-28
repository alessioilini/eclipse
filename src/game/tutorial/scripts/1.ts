import { ru } from '../../../i18n/ru';
import { spreadBasics } from '../enemy';
import type { TutorialScript } from '../types';
import { A, B, PLAYER_DECK, TUTORIAL_CARDS } from './common';

const say = ru.tutorial.scripts[1].steps;

/** Бой 1 «Первый удар»: атака, умение, выбор цели, подтверждение, чтение HP (спека §5.1). */
export const script1: TutorialScript = {
  id: 1,
  title: ru.tutorial.scripts[1].title,
  decks: {
    A: PLAYER_DECK,
    B: { heroes: ['aurora', 'mira', 'selena', 'liraya', 'nokta', 'kira'], starting: [0, 1, 2], cards: TUTORIAL_CARDS },
  },
  enemyHp: [12, 8, 8, 5, 5, 5],
  seed: 101,
  enemy: (_round, view) => spreadBasics(view),
  steps: [
    { round: 1, say: say[0] },
    { round: 1, require: { slot: 0, action: 'basic', target: B(0) }, say: say[1], anchor: { kind: 'hero', ref: A(0) } },
    { round: 1, say: say[2], anchor: { kind: 'energy' } },
    { round: 1, require: { slot: 1, action: 'skill', target: A(2) }, say: say[3], anchor: { kind: 'hero', ref: A(1) } },
    { round: 1, require: { slot: 2, action: 'basic' }, say: say[4], anchor: { kind: 'hero', ref: A(2) } },
    { round: 1, require: 'confirm', say: say[5], anchor: { kind: 'confirm' } },
    { round: 1, afterPlayback: true, say: say[6] },
  ],
  hidden: ['reserve', 'cards', 'ultimate', 'swap', 'log'],
};
