import { useEffect, useRef, type CSSProperties } from 'react';
import { HEROES } from '../engine/data/heroes';
import type { HeroAction, Side, Slot } from '../engine/types';
import type { ViewHero } from '../game/playback/types';
import { fmt, ru } from '../i18n/ru';
import { HeroArt } from './HeroArt';
import styles from './HeroCard.module.css';
import { StatusIcon } from './StatusIcon';
import { cx } from './cx';

const LONG_PRESS_MS = 500;

/** Chip text for a planned action, e.g. «Умение → B2» or «Смена → R1»; `null` for `none`. */
export function chipLabel(action: HeroAction): string | null {
  switch (action.type) {
    case 'none':
      return null;
    case 'swap':
      return `${ru.battle.actions.swap} ${fmt(ru.battle.chipReserve, { n: action.reserveIndex + 1 })}`;
    default: {
      const label = ru.battle.actions[action.type];
      const t = action.target;
      return t ? `${label} ${fmt(ru.battle.chipTarget, { side: t.side, n: t.slot + 1 })}` : label;
    }
  }
}

export type HeroCardProps = {
  hero: ViewHero;
  side: Side;
  slot: Slot;
  selected?: boolean;
  dimmed?: boolean;
  /** Overrides `hero.chip` (the planning screen passes the player's draft action). */
  chip?: HeroAction;
  /** The planned action fizzled: the chip is struck through (round playback). */
  chipStruck?: boolean;
  onTap?: () => void;
  onLongPress?: () => void;
};

export function HeroCard({ hero, side, slot, selected, dimmed, chip, chipStruck, onTap, onLongPress }: HeroCardProps) {
  const def = HEROES[hero.heroId];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const onPointerDown = () => {
    longFired.current = false;
    clear();
    if (!onLongPress) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      longFired.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const onClick = () => {
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    onTap?.();
  };

  const action = chip ?? hero.chip;
  const chipText = action ? chipLabel(action) : null;
  const pct = (n: number) => `${Math.max(0, Math.min(1, hero.maxHp > 0 ? n / hero.maxHp : 0)) * 100}%`;
  const style = { '--el-color': `var(--el-${def.element})` } as CSSProperties;

  return (
    <button
      type="button"
      data-testid={`hero-${side}-${slot}`}
      className={cx(styles.card, selected && 'selected', dimmed && 'dimmed', !hero.alive && 'dead')}
      style={style}
      aria-pressed={selected ?? undefined}
      onPointerDown={onPointerDown}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={onLongPress ? (e) => e.preventDefault() : undefined}
      onClick={onClick}
    >
      <HeroArt heroId={hero.heroId} size="md" />
      <span className={styles.name}>{def.name}</span>
      <span className={styles.bars}>
        <span className={styles.track}>
          <span className={styles.hp} style={{ width: pct(hero.hp) }} />
          {hero.shield > 0 && <span className={styles.shieldBar} style={{ width: pct(hero.shield) }} />}
        </span>
        <span className={styles.numbers}>
          <span>{`${hero.hp}/${hero.maxHp}`}</span>
          {hero.shield > 0 && (
            <span className={styles.shield} data-testid="shield" title={ru.battle.shield}>
              {hero.shield}
            </span>
          )}
        </span>
      </span>
      {hero.statuses.length > 0 && (
        <span className={styles.statuses}>
          {hero.statuses.map((s, i) => (
            <StatusIcon key={`${s.id}-${i}`} status={s} />
          ))}
        </span>
      )}
      {chipText && <span className={cx(styles.chip, chipStruck && 'struck')}>{chipText}</span>}
    </button>
  );
}
