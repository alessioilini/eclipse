import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HERO_IDS } from '../engine';
import { buildPreset } from '../game/decks/presets';
import { defaultSave } from '../game/save/defaults';
import { opponentDeckFor } from '../game/session';
import { ru } from '../i18n/ru';
import { hydrate, useStore } from '../store';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Crashed } from './Crashed';

let broken = true;
function Boom() {
  if (broken) throw new Error('несовместимое состояние');
  return <p data-testid="ok">ok</p>;
}

function renderBoundary() {
  return render(
    <ErrorBoundary resetKey="#/battle" fallback={(reset) => <Crashed onDone={reset} />}>
      <Boom />
    </ErrorBoundary>,
  );
}

beforeEach(() => {
  broken = true;
  hydrate(defaultSave());
  useStore.getState().startMatch(buildPreset('balanced', [...HERO_IDS]), { opponentDeck: opponentDeckFor(3), seed: 3, mode: 'free' });
  window.location.hash = '#/battle';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('ErrorBoundary вокруг экрана', () => {
  it('ошибка рендера показывает ru.common.crashed с двумя кнопками', () => {
    renderBoundary();
    expect(screen.getByTestId('crashed')).toHaveTextContent(ru.common.crashed);
    expect(screen.getByRole('button', { name: ru.common.resetMatch })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.common.toMenu })).toBeInTheDocument();
  });

  it('«Сбросить матч» убирает матч и ведёт в меню', () => {
    renderBoundary();
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: ru.common.resetMatch }));
    expect(useStore.getState().session).toBeNull();
    expect(window.location.hash).toBe('#/');
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });

  it('«В меню» ведёт в меню, не трогая матч', () => {
    renderBoundary();
    const session = useStore.getState().session;
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: ru.common.toMenu }));
    expect(useStore.getState().session).toBe(session);
    expect(window.location.hash).toBe('#/');
  });

  it('смена resetKey сбрасывает ошибку', () => {
    const { rerender } = renderBoundary();
    expect(screen.getByTestId('crashed')).toBeInTheDocument();
    broken = false;
    rerender(
      <ErrorBoundary resetKey="#/" fallback={(reset) => <Crashed onDone={reset} />}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });
});
