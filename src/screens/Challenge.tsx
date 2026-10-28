import { useMemo } from 'react';
import { HEROES, HERO_IDS } from '../engine';
import type { HeroId } from '../engine';
import { buildPreset } from '../game/decks/presets';
import { decodeChallenge } from '../game/links/codec';
import { fmt, ru } from '../i18n/ru';
import { navigate } from '../router';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { HeroArt } from '../ui/HeroArt';
import styles from './Challenge.module.css';
import { useAppBack } from './useAppBack';

function HeroRow({ heroes, size, testId }: { heroes: HeroId[]; size: 'md' | 'lg'; testId: string }) {
  return (
    <ul className={styles.row} data-testid={testId}>
      {heroes.map((id) => (
        <li key={id} className={styles.hero}>
          <HeroArt heroId={id} size={size} />
          <span className={styles.name}>{HEROES[id].name}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Спека §4.3: экран вызова по ссылке `#/c/<код>`. Шесть героинь отправителя (стартовая тройка крупнее);
 * «Принять вызов» запускает свободный матч против бота с колодой и seed отправителя («призрак»).
 */
export function Challenge({ code }: { code: string }) {
  const challenge = useMemo(() => decodeChallenge(code), [code]);
  const toMenu = () => navigate({ name: 'menu' });
  useAppBack(toMenu);

  if (!challenge) {
    return (
      <main className={styles.screen} data-testid="challenge">
        <p className={styles.invalid}>{ru.challenge.invalid}</p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={toMenu}>{ru.challenge.menu}</Button>
        </div>
      </main>
    );
  }

  const accept = () => {
    const s = useStore.getState();
    const active = s.decks.find((d) => d.id === s.activeDeckId);
    // Без активной колоды — временная; в список колод не пишется, героини не открываются.
    const playerDeck = active?.deck ?? buildPreset('balanced', HERO_IDS);
    s.startMatch(playerDeck, {
      opponentDeck: challenge.deck, seed: challenge.seed, mode: 'free', challenge: { name: challenge.name, code },
    });
    navigate({ name: 'battle' });
  };

  const { heroes } = challenge.deck;
  return (
    <main className={styles.screen} data-testid="challenge">
      <h1 className={styles.title}>{fmt(ru.challenge.title, { name: challenge.name })}</h1>
      <HeroRow heroes={heroes.slice(0, 3)} size="lg" testId="challenge-starting" />
      <HeroRow heroes={heroes.slice(3)} size="md" testId="challenge-reserve" />
      <div className={styles.actions}>
        <Button variant="primary" size="lg" onClick={accept} testId="accept">{ru.challenge.accept}</Button>
        <Button variant="secondary" onClick={toMenu}>{ru.challenge.menu}</Button>
      </div>
    </main>
  );
}
