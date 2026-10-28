import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { createRng } from './engine';
import { randomDeck } from './engine/sim';
import { defaultSave, type SaveV1 } from './game/save/defaults';
import { createRunner } from './game/tutorial/runner';
import { SCRIPTS } from './game/tutorial/scripts';
import { ru } from './i18n/ru';
import { hydrate, toSave, useStore } from './store';

const st = () => useStore.getState();

/** Проводит последний раунд матча через стор (раунд 10, резерв противника погиб) — победа A — и возвращает сохранение. */
function finishByConfirm(): SaveV1 {
  const session = st().session!;
  const state = structuredClone(session.state);
  state.round = 10;
  for (const h of state.sides.B.reserve) h.hp = 0;
  useStore.setState({ session: { ...session, state } });
  for (const slot of [0, 1, 2] as const) st().setAction(slot, { type: 'basic', target: { side: 'B', slot } });
  st().confirm();
  expect(st().session!.state.result?.winner).toBe('A');
  return JSON.parse(JSON.stringify(toSave(st()))) as SaveV1;
}

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

  it('восстановленный завершённый свободный матч на #/battle ведёт на #/result, статистика не меняется', async () => {
    hydrate(defaultSave());
    st().startMatch(randomDeck(createRng(1)), { opponentDeck: randomDeck(createRng(2)), seed: 1, mode: 'free' });
    const save = finishByConfirm();
    // Перезагрузка посреди проигрывания: экран результата ещё не открывался.
    expect(save.profile.stats).toEqual({ wins: 1, losses: 0, draws: 0 });
    hydrate(defaultSave());
    hydrate(save);
    window.location.hash = '#/battle';
    render(<App />);
    expect(await screen.findByTestId('result')).toHaveTextContent(ru.result.win);
    expect(window.location.hash).toBe('#/result');
    expect(st().stats).toEqual({ wins: 1, losses: 0, draws: 0 });
  });

  it('восстановленная победа в бою обучения 1 на #/tutorial/1 ведёт на #/result, открыто 8 героинь', async () => {
    hydrate(defaultSave());
    const script = SCRIPTS[1];
    st().startMatch(script.decks.A, {
      opponentDeck: script.decks.B, seed: script.seed, mode: 'tutorial', tutorialId: 1, enemy: script.enemy,
      ...(script.enemyHp ? { opponentHp: script.enemyHp } : {}),
    });
    st().setTutorialRunner(createRunner(script));
    const save = finishByConfirm();
    hydrate(defaultSave());
    hydrate(save);
    const session = st().session;
    window.location.hash = '#/tutorial/1';
    render(<App />);
    expect(await screen.findByTestId('result')).toHaveTextContent(ru.result.win);
    expect(window.location.hash).toBe('#/result');
    // Тот же завершённый бой, не перезапуск; награды выданы при подтверждении и сохранены.
    expect(st().session).toBe(session);
    expect(st().unlocked).toHaveLength(8);
    expect(st().tutorialStep).toBe(1);
  });
});
