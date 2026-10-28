import { MAX_ROUNDS } from '../../game/session';
import { fmt, ru } from '../../i18n/ru';
import { navigate } from '../../router';
import { useStore } from '../../store';
import { Button } from '../../ui/Button';
import styles from './Battle.module.css';
import { Planning } from './Planning';

/** Заглушка проигрывания: Task 10 заменит её анимацией битов. */
function PlaybackPlaceholder() {
  const skipPlayback = useStore((s) => s.skipPlayback);
  const finishPlayback = useStore((s) => s.finishPlayback);
  return (
    <div className={styles.placeholder} data-testid="playback-placeholder">
      <Button
        variant="primary"
        size="lg"
        onClick={() => {
          skipPlayback();
          finishPlayback();
        }}
      >
        {ru.battle.next}
      </Button>
    </div>
  );
}

export function Battle() {
  const session = useStore((s) => s.session);
  const phase = useStore((s) => s.phase);
  const openSheet = useStore((s) => s.openSheet);
  const back = () => navigate({ name: 'menu' });

  if (!session) {
    return (
      <main className={styles.screen}>
        <p className={styles.empty}>{ru.battle.noMatch}</p>
        <Button variant="secondary" onClick={back}>
          {ru.battle.back}
        </Button>
      </main>
    );
  }

  return (
    <main className={styles.screen} data-testid="battle">
      <header className={styles.header}>
        <Button variant="ghost" onClick={back}>
          {ru.battle.back}
        </Button>
        <span className={styles.title}>
          <span className={styles.opponent}>{ru.battle.opponent}</span>
          <span className={styles.round}>{fmt(ru.battle.round, { n: session.state.round, max: MAX_ROUNDS })}</span>
        </span>
        <Button variant="ghost" onClick={() => openSheet({ kind: 'log' })}>
          {ru.battle.log}
        </Button>
      </header>
      {phase === 'planning' && <Planning session={session} />}
      {phase === 'playback' && <PlaybackPlaceholder />}
      {phase === 'finished' && <p className={styles.empty}>{ru.common.soon}</p>}
    </main>
  );
}
