import { HEROES } from '../engine/data/heroes';
import type { Side, Slot } from '../engine/types';
import type { ViewHero } from '../game/playback/types';
import { HeroArt } from './HeroArt';
import styles from './ReserveCard.module.css';
import { cx } from './cx';

export type ReserveCardProps = { hero: ViewHero; side: Side; index: Slot; onTap?: () => void };

export function ReserveCard({ hero, side, index, onTap }: ReserveCardProps) {
  return (
    <button
      type="button"
      data-testid={`reserve-${side}-${index}`}
      className={cx(styles.card, !hero.alive && 'dead')}
      onClick={onTap}
    >
      <HeroArt heroId={hero.heroId} size="sm" />
      <span className={styles.name}>{HEROES[hero.heroId].name}</span>
    </button>
  );
}
