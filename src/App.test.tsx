import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { createRng } from './engine';
import { randomDeck } from './engine/sim';
import { defaultSave } from './game/save/defaults';
import { createRunner } from './game/tutorial/runner';
import { SCRIPTS } from './game/tutorial/scripts';
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

  it('кнопка «Героини» открывает сетку героинь', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: ru.menu.heroes }));
    expect(window.location.hash).toBe('#/heroes');
    expect(await screen.findByTestId('hero-tile-aira')).toBeInTheDocument();
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

  it('#/battle с боем обучения ведёт на экран обучения', async () => {
    hydrate(defaultSave());
    const script = SCRIPTS[2];
    useStore.getState().startMatch(script.decks.A, {
      opponentDeck: script.decks.B, seed: script.seed, mode: 'tutorial', tutorialId: 2, enemy: script.enemy,
    });
    useStore.getState().setTutorialRunner(createRunner(script));
    const session = useStore.getState().session;
    window.location.hash = '#/battle';
    render(<App />);
    expect(window.location.hash).toBe('#/tutorial/2');
    expect(await screen.findByRole('status')).toHaveTextContent(ru.tutorial.scripts[2].steps[0]);
    expect(useStore.getState().session).toBe(session);
  });
});

