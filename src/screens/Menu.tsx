import { navigate } from '../router';
import { ru } from '../i18n/ru';

// Stub: Task 8 swaps the plain buttons for src/ui/Button and wires the real wins counter.
export function Menu() {
  return (
    <main style={{ padding: 'var(--sp-24)', display: 'grid', gap: 'var(--sp-12)' }}>
      <h1 style={{ fontSize: 'var(--fs-28)', margin: 0 }}>{ru.common.title}</h1>
      <button style={{ minHeight: 'var(--tap)' }} onClick={() => navigate({ name: 'battle' })}>
        {ru.menu.play}
      </button>
      <button style={{ minHeight: 'var(--tap)' }} onClick={() => navigate({ name: 'heroes' })}>
        {ru.menu.heroes}
      </button>
      <button style={{ minHeight: 'var(--tap)' }} onClick={() => navigate({ name: 'decks' })}>
        {ru.menu.decks}
      </button>
      <button style={{ minHeight: 'var(--tap)' }} onClick={() => navigate({ name: 'tutorial', id: 1 })}>
        {ru.menu.tutorial}
      </button>
      <p style={{ color: 'var(--muted)', margin: 0 }}>
        {ru.menu.wins}: <span data-testid="wins">0</span>
      </p>
    </main>
  );
}
