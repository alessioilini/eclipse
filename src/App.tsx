import { ru } from './i18n/ru';
import { useRoute } from './router';
import { Battle } from './screens/Battle/Battle';
import { Menu } from './screens/Menu';

export function App() {
  const route = useRoute();
  return (
    <div className="app">
      {route.name === 'menu' ? (
        <Menu />
      ) : route.name === 'battle' ? (
        <Battle />
      ) : (
        <p style={{ padding: 'var(--sp-24)' }}>{ru.common.soon}</p>
      )}
    </div>
  );
}
