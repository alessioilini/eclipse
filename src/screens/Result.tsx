import { useEffect, useMemo } from 'react';
import { keyMoment } from '../game/keyMoment';
import { opponentDeckFor } from '../game/session';
import { fmt, ru } from '../i18n/ru';
import { getPlatform } from '../platform';
import { navigate } from '../router';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import styles from './Result.module.css';
import { useAppBack } from './useAppBack';

/** Матчи, за итог которых уже была вибрация: перемонтирование экрана её не повторяет. */
const buzzed = new WeakSet<object>();

type Props = {
  /** Источник seed для «Ещё раз»; в тестах подменяется. */
  now?: () => number;
};

export function Result({ now = Date.now }: Props) {
  const session = useStore((s) => s.session);
  const allEvents = useStore((s) => s.allEvents);
  const startMatch = useStore((s) => s.startMatch);
  const clearMatch = useStore((s) => s.clearMatch);
  const recordMatchResult = useStore((s) => s.recordMatchResult);
  const tutorialStep = useStore((s) => s.tutorialStep);

  const state = session?.state ?? null;
  const result = state?.result ?? null;

  // Идемпотентность держит стор (resultRecordedFor): повторные рендеры и перемонтирование не удваивают счётчик.
  // Бои обучения стор не засчитывает; их награды выдаёт экран обучения до перехода сюда.
  useEffect(() => {
    recordMatchResult();
  }, [session, recordMatchResult]);

  const moment = useMemo(
    () => (state && result ? keyMoment(allEvents, state, 'A') : null),
    [allEvents, state, result],
  );

  // Вибрация итога (спека §3) — один раз на завершённый матч.
  useEffect(() => {
    if (!state || !result || buzzed.has(state)) return;
    buzzed.add(state);
    getPlatform().haptic(result.winner === 'A' ? 'success' : 'error');
  }, [state, result]);

  const toMenu = () => {
    clearMatch();
    navigate({ name: 'menu' });
  };
  // Кнопка «Назад» платформы — как «В меню».
  useAppBack(toMenu);

  if (!session || !state || !result || !moment) {
    return (
      <main className={styles.screen} data-testid="result">
        <Button variant="primary" onClick={toMenu}>{ru.result.menu}</Button>
      </main>
    );
  }

  const title = result.winner === 'A' ? ru.result.win : result.winner === 'B' ? ru.result.loss : ru.result.draw;
  const reason = session.surrendered
    ? ru.result.surrender
    : result.reason !== 'wipe' ? fmt(ru.result.byRounds, { n: state.round }) : null;

  const again = () => {
    if (session.mode === 'tutorial' && session.tutorialId !== undefined) {
      // «Ещё раз» в обучении — тот же бой сценария заново.
      clearMatch();
      navigate({ name: 'tutorial', id: session.tutorialId });
      return;
    }
    // seed матча — uint32 (Date.now() не помещается в генератор без потерь, I5).
    const seed = now() >>> 0;
    startMatch(session.playerDeck, { opponentDeck: opponentDeckFor(seed), seed, mode: 'free' });
    navigate({ name: 'battle' });
  };

  // После боя обучения — переход к следующему, пока обучение не пройдено.
  const next = session.mode === 'tutorial' && tutorialStep < 3
    ? () => {
      clearMatch();
      navigate({ name: 'tutorial', id: (tutorialStep + 1) as 1 | 2 | 3 });
    }
    : null;

  return (
    <main className={styles.screen} data-testid="result">
      <h1 className={cx(styles.title, result.winner === 'B' && styles.lost)}>{title}</h1>
      {reason && <p className={styles.reason} data-testid="result-reason">{reason}</p>}
      <p className={styles.rounds}>{fmt(ru.result.rounds, { n: state.round })}</p>
      <p className={styles.moment} data-testid="key-moment">{moment.text}</p>
      <div className={styles.actions}>
        {next && <Button variant="primary" size="lg" onClick={next}>{ru.tutorial.next}</Button>}
        <Button variant={next ? 'secondary' : 'primary'} size={next ? 'md' : 'lg'} onClick={again}>
          {ru.result.again}
        </Button>
        <Button variant="secondary" onClick={toMenu}>{ru.result.menu}</Button>
      </div>
    </main>
  );
}
