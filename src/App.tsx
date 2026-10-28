import { ru } from './i18n/ru';
import { useRoute } from './router';
import { Battle } from './screens/Battle/Battle';
import { DeckBuilder } from './screens/DeckBuilder';
import { Decks } from './screens/Decks';
import { HeroDetail } from './screens/HeroDetail';
import { Heroes } from './screens/Heroes';
import { Menu } from './screens/Menu';
import { Result } from './screens/Result';
import { Tutorial } from './screens/Tutorial';

export function App() {
  const route = useRoute();
  return (
    <div className="app">
      {route.name === 'menu' ? (
        <Menu />
      ) : route.name === 'tutorial' ? (
        <Tutorial key={route.id} id={route.id} />
      ) : route.name === 'battle' ? (
        <Battle />
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
    </div>
  );
}
