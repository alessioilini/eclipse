import { MAX_LUNA } from '../engine';
import { ru } from '../i18n/ru';
import styles from './ResourceBar.module.css';
import { cx } from './cx';

export type ResourceBarProps = { energy: number; energyMax: number; spent: number; luna: number };

type Dot = 'filled' | 'spent' | 'empty';

export function ResourceBar({ energy, energyMax, spent, luna }: ResourceBarProps) {
  const left = energy - spent;
  const dots: Dot[] = Array.from({ length: energyMax }, (_, i) =>
    i < left ? 'filled' : i < energy ? 'spent' : 'empty',
  );
  const over = spent > energy;
  return (
    <div className={cx(styles.bar, over && 'over')} data-testid="energy">
      <div
        className={styles.group}
        role="meter"
        aria-label={ru.battle.energy}
        aria-valuemin={0}
        aria-valuemax={energyMax}
        aria-valuenow={Math.max(0, left)}
      >
        {dots.map((d, i) => (
          <span key={i} data-dot={d} className={cx(styles.dot, styles[d])} />
        ))}
      </div>
      <div
        className={styles.group}
        role="meter"
        aria-label={ru.battle.luna}
        aria-valuemin={0}
        aria-valuemax={MAX_LUNA}
        aria-valuenow={luna}
      >
        {Array.from({ length: MAX_LUNA }, (_, i) => (
          <span key={i} data-luna={i < luna ? 'on' : 'off'} className={cx(styles.luna, i < luna && styles.on)}>
            ☾
          </span>
        ))}
      </div>
    </div>
  );
}
