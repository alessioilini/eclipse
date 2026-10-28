import { useEffect } from 'react';
import { isFinished, opponentDeckFor } from '../game/session';
import { fmt, ru } from '../i18n/ru';
import { navigate } from '../router';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { MoonWidget } from '../ui/MoonWidget';
import styles from './Menu.module.css';
import { useShare } from './useShare';

type Props = {
  /** Источник seed свободного матча; в тестах подменяется. */
  now?: () => number;
};

/** Задержка подгрузки чанка боя там, где нет `requestIdleCallback`. */
const WARM_FALLBACK_MS = 2000;

/** Подгружает чанк экрана боя в простое браузера; без `requestIdleCallback` (Safari) — по таймеру. */
function warmBattleChunk(): () => void {
  const load = () => { void import('./Battle/Battle'); };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(load);
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(load, WARM_FALLBACK_MS);
  return () => window.clearTimeout(id);
}

/** Главное меню (спека §2): логотип с Луной, «Играть», входы в разделы, счётчик побед. */
export function Menu({ now = Date.now }: Props) {
  const wins = useStore((s) => s.stats.wins);

  // Пока игрок в меню, в простое подгружаем чанк боя: «Играть» откроет его без ожидания сети.
  useEffect(() => warmBattleChunk(), []);
  const tutorialStep = useStore((s) => s.tutorialStep);
  const activeDeck = useStore((s) => s.decks.find((d) => d.id === s.activeDeckId)?.deck ?? null);
  const sharing = useShare(now);

  const play = () => {
    const s = useStore.getState();
    // Завершённый матч уже засчитан: перед новым его просто убираем.
    if (s.session && isFinished(s.session)) s.clearMatch();
    const session = useStore.getState().session;
    if (session) {
      // Незавершённый матч продолжается: бой обучения — на своём экране, свободный — в бою.
      navigate(session.mode === 'tutorial' && session.tutorialId !== undefined
        ? { name: 'tutorial', id: session.tutorialId }
        : { name: 'battle' });
      return;
    }
    if (s.tutorialStep < 3) {
      navigate({ name: 'tutorial', id: (s.tutorialStep + 1) as 1 | 2 | 3 });
      return;
    }
    const active = s.decks.find((d) => d.id === s.activeDeckId);
    if (!active) {
      s.setNotice('needDeck');
      navigate({ name: 'decks' });
      return;
    }
    // seed матча — uint32 (Date.now() не помещается в генератор без потерь, I5).
    const seed = now() >>> 0;
    s.startMatch(active.deck, { opponentDeck: opponentDeckFor(seed), seed, mode: 'free' });
    navigate({ name: 'battle' });
  };

  // Вызов вне матча: активная колода, вместо ключевого момента — нейтральная фраза.
  const invite = () => {
    if (activeDeck) sharing.start(activeDeck, ru.share.noMoment);
  };

  const tutorial = () => navigate({ name: 'tutorial', id: Math.min(tutorialStep + 1, 3) as 1 | 2 | 3 });

  return (
    <main className={styles.screen}>
      <header className={styles.logo}>
        <MoonWidget phase="full" eclipse={false} bloodMoon={false} />
        <h1 className={styles.title}>{ru.common.title}</h1>
      </header>
      <nav className={styles.buttons}>
        <Button variant="primary" size="lg" onClick={play}>{ru.menu.play}</Button>
        <Button variant="secondary" onClick={() => navigate({ name: 'heroes' })}>{ru.menu.heroes}</Button>
        <Button variant="secondary" onClick={() => navigate({ name: 'decks' })}>{ru.menu.decks}</Button>
        <Button variant="secondary" onClick={tutorial}>{ru.menu.tutorial}</Button>
        <Button variant="secondary" disabled={!activeDeck} onClick={invite} testId="invite">{ru.menu.invite}</Button>
      </nav>
      {sharing.notice && <p className={styles.notice} role="status">{sharing.notice}</p>}
      <p className={styles.wins} data-testid="wins">{fmt(ru.menu.wins, { n: wins })}</p>
      {sharing.prompt}
    </main>
  );
}
