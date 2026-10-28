import { ru } from './i18n/ru';
import { useRoute } from './router';
import { Battle } from './screens/Battle/Battle';
import { DeckBuilder } from './screens/DeckBuilder';
import { Decks } from './screens/Decks';
import { Menu } from './screens/Menu';
import { Result } from './screens/Result';

export function App() {
  const route = useRoute();
  return (
    <div className="app">
      {route.name === 'menu' ? (
        <Menu />
      ) : route.name === 'battle' ? (
        <Battle />
      ) : route.name === 'result' ? (
        <Result />
      ) : route.name === 'decks' ? (
        <Decks />
      ) : route.name === 'deck' ? (
        <DeckBuilder key={route.id} id={route.id} />
      ) : (
        <p style={{ padding: 'var(--sp-24)' }}>{ru.common.soon}</p>
      )}
    </div>
  );
}
