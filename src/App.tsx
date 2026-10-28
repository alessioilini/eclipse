import { Suspense, lazy, useEffect } from 'react';
import { ru } from './i18n/ru';
import { getPlatform, takeStartParam } from './platform';
import { navigate, toHash, useRoute } from './router';
import { Crashed } from './screens/Crashed';
import { Decks } from './screens/Decks';
import { Menu } from './screens/Menu';
import { useStore } from './store';
import { ErrorBoundary } from './ui/ErrorBoundary';

// Меню и список колод — в основном чанке (первый экран); остальные экраны грузятся по маршруту:
// бой с framer-motion и проигрыванием не задерживает первую отрисовку меню (критерий 6 спеки).
const Battle = lazy(() => import('./screens/Battle/Battle').then((m) => ({ default: m.Battle })));
const Tutorial = lazy(() => import('./screens/Tutorial').then((m) => ({ default: m.Tutorial })));
const DeckBuilder = lazy(() => import('./screens/DeckBuilder').then((m) => ({ default: m.DeckBuilder })));
const Heroes = lazy(() => import('./screens/Heroes').then((m) => ({ default: m.Heroes })));
const HeroDetail = lazy(() => import('./screens/HeroDetail').then((m) => ({ default: m.HeroDetail })));
const Result = lazy(() => import('./screens/Result').then((m) => ({ default: m.Result })));
const Challenge = lazy(() => import('./screens/Challenge').then((m) => ({ default: m.Challenge })));

export function App() {
  const route = useRoute();
  // Запуск по ссылке-вызову в Telegram (`startapp=<код>`): один раз за сессию вкладки ведём на #/c/<код>
  // (спека §4.2); перезагрузка посреди боя туда не возвращает. Негодный код покажет экран «ссылка повреждена».
  useEffect(() => {
    const code = takeStartParam(getPlatform());
    if (code !== null) navigate({ name: 'challenge', code });
  }, []);
  // Бой обучения живёт только на #/tutorial/:id (оверлей, награды); #/battle с ним перенаправляется туда.
  const tutorialId = useStore((s) => (s.session?.mode === 'tutorial' ? s.session.tutorialId ?? null : null));
  const redirect = route.name === 'battle' ? tutorialId : null;
  useEffect(() => {
    if (redirect !== null) navigate({ name: 'tutorial', id: redirect });
  }, [redirect]);
  // Кнопка «Назад» платформы следует за обработчиком текущего экрана (спека §3); в меню его нет.
  const backHandler = useStore((s) => s.backHandler);
  useEffect(() => {
    const platform = getPlatform();
    if (backHandler) platform.backButton.show(backHandler);
    else platform.backButton.hide();
  }, [backHandler]);
  // Во время боя (свободного и обучения) закрытие мини-приложения требует подтверждения.
  const inBattle = route.name === 'battle' || route.name === 'tutorial';
  useEffect(() => {
    getPlatform().setClosingConfirmation(inBattle);
  }, [inBattle]);
  return (
    <div className="app">
      <ErrorBoundary resetKey={toHash(route)} fallback={(reset) => <Crashed onDone={reset} />}>
        <Suspense fallback={<div className="app" />}>
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
          ) : route.name === 'challenge' ? (
            <Challenge key={route.code} code={route.code} />
          ) : (
            <p style={{ padding: 'var(--sp-24)' }}>{ru.common.soon}</p>
          )}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
