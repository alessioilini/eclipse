import { ru } from './i18n/ru';
import { navigate, useRoute } from './router';
import { Battle } from './screens/Battle/Battle';
import { Menu } from './screens/Menu';
import { useStore } from './store';
import { Button } from './ui/Button';

/** Заглушка экрана результата: Task 11 заменит её настоящим экраном. */
function ResultPlaceholder() {
  const result = useStore((s) => s.session?.state.result ?? null);
  const clearMatch = useStore((s) => s.clearMatch);
  const text = !result
    ? ru.common.soon
    : result.winner === 'A' ? ru.result.win : result.winner === 'B' ? ru.result.loss : ru.result.draw;
  return (
    <div data-testid="result-placeholder" style={{ padding: 'var(--sp-24)' }}>
      <p>{text}</p>
      <Button
        variant="primary"
        onClick={() => {
          clearMatch();
          navigate({ name: 'menu' });
        }}
      >
        {ru.result.menu}
      </Button>
    </div>
  );
}

export function App() {
  const route = useRoute();
  return (
    <div className="app">
      {route.name === 'menu' ? (
        <Menu />
      ) : route.name === 'battle' ? (
        <Battle />
      ) : route.name === 'result' ? (
        <ResultPlaceholder />
      ) : (
        <p style={{ padding: 'var(--sp-24)' }}>{ru.common.soon}</p>
      )}
    </div>
  );
}
