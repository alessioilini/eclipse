import { useState } from 'react';
import type { CSSProperties } from 'react';
import { BASE } from '../config';
import { HEROES } from '../engine';
import type { HeroId } from '../engine';
import styles from './HeroArt.module.css';
import { cx } from './cx';

export type HeroArtKind = 'portrait' | 'full';
export type HeroArtSize = 'sm' | 'md' | 'lg' | 'xl';

/** Rendered widths in px, mirroring `--art-sm/md/lg/xl` in `styles/tokens.css`: the `sizes` hint for `srcSet`. */
const WIDTH_PX: Record<HeroArtSize, number> = { sm: 32, md: 48, lg: 96, xl: 160 };

/** WebP widths packed by `scripts/art-pack.ts` (spec §7); the first one is the plain `src`. */
const WIDTHS: Record<HeroArtKind, readonly [number, number]> = { portrait: [128, 512], full: [512, 1024] };

const artUrl = (id: HeroId, kind: HeroArtKind, width: number) => `${BASE}art/${id}-${kind}-${width}.webp`;

type Props = { heroId: HeroId; kind?: HeroArtKind; size: HeroArtSize };

/**
 * Heroine art (spec §7): a WebP portrait (circle) or full-body art (2:3, element gradient at the bottom).
 * Until the art is generated, or if it fails to load, falls back to the element-coloured circle with the initial.
 */
export function HeroArt({ heroId, kind = 'portrait', size }: Props) {
  // A new heroine or kind is a new image: the key drops the previous load error.
  return <Art key={`${heroId}-${kind}`} heroId={heroId} kind={kind} size={size} />;
}

function Art({ heroId, kind, size }: Required<Props>) {
  const [failed, setFailed] = useState(false);
  const hero = HEROES[heroId];
  const style = { '--art-color': `var(--el-${hero.element})` } as CSSProperties;
  const [small, large] = WIDTHS[kind];
  return (
    <span
      role="img"
      aria-label={hero.name}
      className={cx(styles.art, styles[size], kind === 'full' && styles.full, !failed && styles.withImage)}
      style={style}
    >
      {failed ? (
        <span aria-hidden="true">{hero.name.charAt(0)}</span>
      ) : (
        <img
          className={styles.img}
          src={artUrl(heroId, kind, small)}
          srcSet={`${artUrl(heroId, kind, small)} ${small}w, ${artUrl(heroId, kind, large)} ${large}w`}
          sizes={`${WIDTH_PX[size]}px`}
          loading="lazy"
          decoding="async"
          alt=""
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
