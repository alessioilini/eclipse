import { useMemo } from 'react';
import { formatLog } from '../../engine';
import type { MatchSession } from '../../game/session';
import { ru } from '../../i18n/ru';
import { useStore } from '../../store';
import { Button } from '../../ui/Button';
import styles from './Battle.module.css';

/** Журнал последнего раунда (`formatLog`) построчно в прокручиваемой панели; открывается из шапки. */
export function LogDrawer({ session }: { session: MatchSession }) {
  const lastEvents = useStore((s) => s.lastEvents);
  const closeSheet = useStore((s) => s.closeSheet);
  const lines = useMemo(
    () => (lastEvents.length > 0 ? formatLog(lastEvents, session.state).split('\n') : []),
    [lastEvents, session.state],
  );
  return (
    <div className={styles.sheetRoot}>
      <div className={styles.backdrop} onClick={closeSheet} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={ru.battle.log} data-testid="log-drawer">
        <h2 className={styles.sheetTitle}>{ru.battle.log}</h2>
        <div className={styles.logBody}>
          {lines.length === 0 && <p className={styles.muted}>{ru.battle.logEmpty}</p>}
          {lines.map((line, i) => (
            <div key={i} className={styles.logLine}>
              {line}
            </div>
          ))}
        </div>
        <Button variant="secondary" onClick={closeSheet}>
          {ru.battle.close}
        </Button>
      </div>
    </div>
  );
}
