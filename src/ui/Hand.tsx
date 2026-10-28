import { CARDS } from '../engine/data/cards';
import type { CardId } from '../engine/types';
import type { BlockReason } from '../i18n/ru';
import { CardView } from './CardView';
import styles from './Hand.module.css';

export type HandProps = {
  cards: CardId[];
  selectedIndex: number | null;
  costs: number[];
  onTap: (index: number) => void;
  blocked?: (BlockReason | undefined)[];
};

export function Hand({ cards, selectedIndex, costs, onTap, blocked }: HandProps) {
  return (
    <div className={styles.hand}>
      {cards.map((cardId, i) => {
        const reason = blocked?.[i];
        return (
          <CardView
            key={i}
            testId={`card-${i}`}
            cardId={cardId}
            cost={costs[i] ?? CARDS[cardId].cost}
            selected={i === selectedIndex}
            disabled={reason !== undefined}
            blockedReason={reason}
            onTap={() => onTap(i)}
          />
        );
      })}
    </div>
  );
}
