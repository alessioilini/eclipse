import { useId } from 'react';
import type { MoonPhase } from '../engine';
import { ru } from '../i18n/ru';
import styles from './MoonWidget.module.css';

const SIZE = 64;
const R = 28;
const C = SIZE / 2;

/** Lit part of the disc as a mask rectangle: [x, width] in viewBox units. */
const LIT: Record<MoonPhase, [number, number]> = {
  new: [C, 0],
  waxing: [C, C],
  full: [0, SIZE],
  waning: [0, C],
};

export type MoonWidgetProps = { phase: MoonPhase; eclipse: boolean; bloodMoon: boolean };

export function MoonWidget({ phase, eclipse, bloodMoon }: MoonWidgetProps) {
  const maskId = `moon-${useId().replace(/:/g, '')}`;
  const [x, width] = LIT[phase];
  const text = ru.moon[phase];
  return (
    <div className={styles.widget} data-testid="moon">
      <svg
        className={styles.svg}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        data-phase={phase}
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            <rect className={styles.lit} x={x} y={0} width={width} height={SIZE} fill="white" />
          </mask>
        </defs>
        <circle className={styles.dark} cx={C} cy={C} r={R} />
        <circle className={styles.light} cx={C} cy={C} r={R} mask={`url(#${maskId})`} />
      </svg>
      <div className={styles.name}>{text.name}</div>
      <div className={styles.effect}>{text.effect}</div>
      {(eclipse || bloodMoon) && (
        <div className={styles.tags}>
          {eclipse && <span className={styles.eclipse}>{ru.battle.eclipse}</span>}
          {bloodMoon && <span className={styles.blood}>{ru.battle.bloodMoon}</span>}
        </div>
      )}
    </div>
  );
}
