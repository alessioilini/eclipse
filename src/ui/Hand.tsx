import { CARDS } from '../engine';
import type { CardId } from '../engine';
import { CardView, type CardBlock } from './CardView';
import styles from './Hand.module.css';

export type HandProps = {
  cards: CardId[];
  selectedIndex: number | null;
  costs: number[];
  onTap: (index: number) => void;
  blocked?: (CardBlock | undefined)[];
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
