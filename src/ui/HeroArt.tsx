import type { CSSProperties } from 'react';
import { HEROES } from '../engine/data/heroes';
import type { HeroId } from '../engine/types';
import styles from './HeroArt.module.css';
import { cx } from './cx';

/** Placeholder art (spec §9): an element-coloured circle with the heroine's initial. */
export function HeroArt({ heroId, size }: { heroId: HeroId; size: 'sm' | 'md' | 'lg' }) {
  const hero = HEROES[heroId];
  const style = { '--art-color': `var(--el-${hero.element})` } as CSSProperties;
  return (
    <span role="img" aria-label={hero.name} className={cx(styles.art, styles[size])} style={style}>
      <span aria-hidden="true">{hero.name.charAt(0)}</span>
    </span>
  );
}
