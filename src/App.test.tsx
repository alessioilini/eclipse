import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { createRng } from './engine';
import { randomDeck } from './engine/sim';
import { defaultSave } from './game/save/defaults';
import { ru } from './i18n/ru';
import { hydrate, useStore } from './store';

describe('App', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('показывает меню с четырьмя кнопками и счётчиком побед', () => {
    render(<App />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByTestId('wins')).toHaveTextContent('0');
  });

  it('кнопка «Героини» переключает на заглушку экрана', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: ru.menu.heroes }));
    expect(window.location.hash).toBe('#/heroes');
    expect(await screen.findByText(ru.common.soon)).toBeInTheDocument();
  });

  it('экран результата показывает исход и «В меню» сбрасывает матч', async () => {
    hydrate(defaultSave());
    useStore.getState().startMatch(randomDeck(createRng(1)), { opponentDeck: randomDeck(createRng(2)), seed: 1, mode: 'free' });
    useStore.getState().surrender();
    window.location.hash = '#/result';
    render(<App />);
    const placeholder = screen.getByTestId('result');
    expect(placeholder).toHaveTextContent(ru.result.loss);
    await userEvent.click(screen.getByRole('button', { name: ru.result.menu }));
    expect(useStore.getState().session).toBeNull();
    expect(window.location.hash).toBe('#/');
  });
});
