import type { CardId, Deck, PublicState, Side, SideCommands, Slot, SlotRef } from '../../engine';

/** Спека §5.2: что ждёт шаг сценария — действие слота, карту из руки или подтверждение. */
export type Requirement =
  | { slot: Slot; action: 'basic' | 'skill' | 'ultimate'; target?: SlotRef }
  | { slot: Slot; action: 'swap'; reserveIndex: Slot }
  | { card: CardId; target?: SlotRef }
  | 'confirm';

/** Спека §5.2: на какой элемент интерфейса указывает текст шага. */
export type UiAnchor =
  | { kind: 'hero'; ref: SlotRef }
  | { kind: 'reserve'; side: Side; index: Slot }
  | { kind: 'card'; handIndex: number }
  | { kind: 'confirm' }
  | { kind: 'moon' }
  | { kind: 'energy' };

/** Спека §5.2: шаг сценария; `round` — раунд матча, в планировании которого шаг становится текущим. */
export type TutorialStep =
  | { round: number; say: string; anchor?: UiAnchor }
  | { round: number; require: Requirement; say: string; anchor: UiAnchor }
  | { round: number; afterPlayback: true; say: string };

export type HiddenElement = 'reserve' | 'cards' | 'ultimate' | 'swap' | 'log';

/** Спека §5.2: сценарий боя обучения — данные, противник детерминирован. */
export type TutorialScript = {
  id: 1 | 2 | 3;
  title: string;
  decks: { A: Deck; B: Deck };
  seed: number;
  enemy: (round: number, view: PublicState) => SideCommands;
  steps: TutorialStep[];
  hidden: HiddenElement[];
  /**
   * Сверх спеки §5.2: стартовое HP героинь противника в порядке `decks.B.heroes`. Шесть героинь с
   * полным HP не убить за 6 раундов одними атаками, поэтому противницы обучения выходят ранеными.
   */
  enemyHp?: number[];
};
