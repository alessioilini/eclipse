import { useEffect } from 'react';
import { ru } from './i18n/ru';
import { navigate, toHash, useRoute } from './router';
import { Battle } from './screens/Battle/Battle';
import { Crashed } from './screens/Crashed';
import { DeckBuilder } from './screens/DeckBuilder';
import { Decks } from './screens/Decks';
import { HeroDetail } from './screens/HeroDetail';
import { Heroes } from './screens/Heroes';
import { Menu } from './screens/Menu';
import { Result } from './screens/Result';
import { Tutorial } from './screens/Tutorial';
import { useStore } from './store';
import { ErrorBoundary } from './ui/ErrorBoundary';

export function App() {
  const route = useRoute();
  // Бой обучения живёт только на #/tutorial/:id (оверлей, награды); #/battle с ним перенаправляется туда.
  const tutorialId = useStore((s) => (s.session?.mode === 'tutorial' ? s.session.tutorialId ?? null : null));
  const redirect = route.name === 'battle' ? tutorialId : null;
  useEffect(() => {
    if (redirect !== null) navigate({ name: 'tutorial', id: redirect });
  }, [redirect]);
  return (
    <div className="app">
      <ErrorBoundary resetKey={toHash(route)} fallback={(reset) => <Crashed onDone={reset} />}>
        {route.name === 'menu' ? (
          <Menu />
        ) : route.name === 'tutorial' ? (
          <Tutorial key={route.id} id={route.id} />
        ) : route.name === 'battle' ? (
          redirect === null && <Battle />
        ) : route.name === 'result' ? (
          <Result />
        ) : route.name === 'decks' ? (
          <Decks />
        ) : route.name === 'deck' ? (
          <DeckBuilder key={route.id} id={route.id} />
        ) : route.name === 'heroes' ? (
          <Heroes />
        ) : route.name === 'hero' ? (
          <HeroDetail key={route.id} id={route.id} />
        ) : (
          <p style={{ padding: 'var(--sp-24)' }}>{ru.common.soon}</p>
        )}
      </ErrorBoundary>
    </div>
  );
}
