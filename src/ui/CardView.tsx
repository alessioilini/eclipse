import { CARDS } from '../engine';
import type { CardId } from '../engine';
import { ru, type BlockReason } from '../i18n/ru';
import styles from './CardView.module.css';
import { cx } from './cx';

/** Причина, по которой карту нельзя сыграть: блок движка или отсутствие легальной цели. */
export type CardBlock = BlockReason | 'noTarget';

const blockText = (b: CardBlock): string => (b === 'noTarget' ? ru.battle.noTarget : ru.blocked[b]);

export type CardViewProps = {
  cardId: CardId;
  /** Current cost (may differ from the printed one because of cost modifiers). */
  cost: number;
  selected?: boolean;
  disabled?: boolean;
  blockedReason?: CardBlock;
  onTap?: () => void;
  testId?: string;
};

export function CardView({ cardId, cost, selected, disabled, blockedReason, onTap, testId }: CardViewProps) {
  const card = CARDS[cardId];
  return (
    <button
      type="button"
      data-testid={testId}
      className={cx(styles.card, selected && 'selected', disabled && 'disabled')}
      aria-pressed={selected ?? false}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onTap}
    >
      <span className={styles.head}>
        <span className={styles.name}>{card.name}</span>
        <span className={styles.cost} data-testid="cost">
          {cost}
        </span>
      </span>
      <span className={cx(styles.timing, styles[card.timing])}>{ru.cardTiming[card.timing]}</span>
      <span className={styles.text}>{card.text}</span>
      {disabled && blockedReason && <span className={styles.blocked}>{blockText(blockedReason)}</span>}
    </button>
  );
}
