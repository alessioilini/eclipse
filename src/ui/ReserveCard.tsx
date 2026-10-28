import { HEROES } from '../engine/data/heroes';
import type { Side, Slot } from '../engine/types';
import type { ViewHero } from '../game/playback/types';
import { HeroArt } from './HeroArt';
import styles from './ReserveCard.module.css';
import { cx } from './cx';

export type ReserveCardProps = {
  hero: ViewHero;
  side: Side;
  index: Slot;
  /** Подсвечена как легальный выбор (замена, «Экстренная замена»). */
  highlighted?: boolean;
  dimmed?: boolean;
  onTap?: () => void;
};

export function ReserveCard({ hero, side, index, highlighted, dimmed, onTap }: ReserveCardProps) {
  return (
    <button
      type="button"
      data-testid={`reserve-${side}-${index}`}
      className={cx(styles.card, highlighted && 'selected', dimmed && 'dimmed', !hero.alive && 'dead')}
      aria-pressed={highlighted ?? undefined}
      onClick={onTap}
    >
      <HeroArt heroId={hero.heroId} size="sm" />
      <span className={styles.name}>{HEROES[hero.heroId].name}</span>
    </button>
  );
}
