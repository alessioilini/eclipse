import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { MAX_ROUNDS } from '../../engine';
import { fmt, ru } from '../../i18n/ru';
import { navigate } from '../../router';
import { useStore } from '../../store';
import { useAppBack } from '../useAppBack';
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
  const body = useRef<HTMLDivElement>(null);
  // Подтверждение сдачи модально: поле под ним инертно (клавиатура, вспомогательные технологии, тапы).
  useEffect(() => {
    body.current?.toggleAttribute('inert', asking);
  }, [asking]);
  const toMenu = () => navigate({ name: 'menu' });

  // Завершённый матч (в т.ч. восстановленный после перезагрузки) живёт на экране результата: итог уже
  // записан стором в момент завершения.
  useEffect(() => {
    if (session && phase === 'finished') navigate({ name: 'result' });
  }, [session, phase]);

  // «Назад» (спека §2): свободный матч — сдача с подтверждением; бой обучения просто откладывается
  // (продолжится из меню); завершённый матч уже ждёт на экране результата.
  const back = () => {
    if (!session || session.mode === 'tutorial') toMenu();
    else if (phase === 'finished') navigate({ name: 'result' });
    else setAsking(true);
  };
  // Кнопка «Назад» платформы — тот же обработчик; во время проигрывания она, как и шапка, ничего не делает.
  useAppBack(() => {
    if (phase !== 'playback') back();
  });
  const swallow = (e: SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
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
        {/* Во время проигрывания раунд уже разрешён: уйти или сдаться можно только после него (I2). */}
        <Button variant="ghost" onClick={back} disabled={phase === 'playback'}>
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
        {hidden.includes('log') || phase === 'playback' ? (
          <span />
        ) : (
          <Button variant="ghost" onClick={() => openSheet({ kind: 'log' })}>
            {ru.battle.log}
          </Button>
        )}
      </header>
      {asking && (
        <div className={styles.modalRoot}>
          <div className={styles.backdrop} data-testid="surrender-backdrop" />
          <div className={styles.surrender} role="alertdialog" aria-modal="true" aria-label={ru.battle.surrenderConfirm}>
            <span className={styles.surrenderText}>{ru.battle.surrenderConfirm}</span>
            <Button variant="danger" onClick={giveUp}>{ru.battle.yes}</Button>
            <Button variant="secondary" onClick={() => setAsking(false)}>{ru.battle.no}</Button>
          </div>
        </div>
      )}
      <div
        ref={body}
        className={styles.body}
        aria-hidden={asking || undefined}
        style={asking ? { pointerEvents: 'none' } : undefined}
        // Там, где `inert` не поддержан, события поля перехватываются до карточек.
        onClickCapture={asking ? swallow : undefined}
        onPointerDownCapture={asking ? swallow : undefined}
        data-testid="battle-body"
      >
        {phase === 'planning' && <Planning session={session} />}
        {phase === 'playback' && <Playback session={session} />}
      </div>
      {sheet?.kind === 'log' && <LogDrawer session={session} />}
    </main>
  );
}
