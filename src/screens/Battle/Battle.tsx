import { useState } from 'react';
import { MAX_ROUNDS } from '../../game/session';
import { fmt, ru } from '../../i18n/ru';
import { navigate } from '../../router';
import { useStore } from '../../store';
import { useHidden } from './tutorialHooks';
import { Button } from '../../ui/Button';
import styles from './Battle.module.css';
import { LogDrawer } from './LogDrawer';
import { Planning } from './Planning';
import { Playback } from './Playback';

export function Battle() {
  const session = useStore((s) => s.session);
  const phase = useStore((s) => s.phase);
  const openSheet = useStore((s) => s.openSheet);
  const sheet = useStore((s) => s.sheet);
  const before = useStore((s) => s.viewBeforePlayback);
  const surrender = useStore((s) => s.surrender);
  const hidden = useHidden();
  const [asking, setAsking] = useState(false);
  const toMenu = () => navigate({ name: 'menu' });

  // «Назад» (спека §2): свободный матч — сдача с подтверждением; бой обучения просто откладывается
  // (продолжится из меню); завершённый матч уже ждёт на экране результата.
  const back = () => {
    if (!session || session.mode === 'tutorial') toMenu();
    else if (phase === 'finished') navigate({ name: 'result' });
    else setAsking(true);
  };
  const giveUp = () => {
    setAsking(false);
    surrender();
    navigate({ name: 'result' });
  };

  if (!session) {
    return (
      <main className={styles.screen}>
        <p className={styles.empty}>{ru.battle.noMatch}</p>
        <Button variant="secondary" onClick={toMenu}>
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
          <span className={styles.round}>
            {fmt(ru.battle.round, {
              // Во время проигрывания движок уже в следующем раунде; шапка показывает проигрываемый.
              n: phase === 'playback' && before ? before.round : session.state.round,
              max: MAX_ROUNDS,
            })}
          </span>
        </span>
        {hidden.includes('log') ? (
          <span />
        ) : (
          <Button variant="ghost" onClick={() => openSheet({ kind: 'log' })}>
            {ru.battle.log}
          </Button>
        )}
      </header>
      {asking && (
        <div className={styles.surrender} role="alertdialog" aria-label={ru.battle.surrenderConfirm}>
          <span className={styles.surrenderText}>{ru.battle.surrenderConfirm}</span>
          <Button variant="danger" onClick={giveUp}>{ru.battle.yes}</Button>
          <Button variant="secondary" onClick={() => setAsking(false)}>{ru.battle.no}</Button>
        </div>
      )}
      {phase === 'planning' && <Planning session={session} />}
      {phase === 'playback' && <Playback session={session} />}
      {phase === 'finished' && <p className={styles.empty}>{ru.common.soon}</p>}
      {sheet?.kind === 'log' && <LogDrawer session={session} />}
    </main>
  );
}
