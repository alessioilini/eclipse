import { BUFF_IDS, type Status } from '../engine';
import { ru } from '../i18n/ru';
import styles from './StatusIcon.module.css';
import { cx } from './cx';

function isBuff(status: Status): boolean {
  if (status.id === 'spd' || status.id === 'atk') return status.value > 0;
  return BUFF_IDS.includes(status.id);
}

export function StatusIcon({ status }: { status: Status }) {
  const text = ru.statuses[status.id];
  return (
    <span className={cx(styles.icon, isBuff(status) ? styles.buff : styles.debuff)} title={text.name}>
      {text.short}
      {status.stacks > 1 && <sup className={styles.stacks}>{status.stacks}</sup>}
    </span>
  );
}
