import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HERO_IDS } from '../engine';
import { App } from '../App';
import { buildPreset } from '../game/decks/presets';
import { defaultSave } from '../game/save/defaults';
import { opponentDeckFor } from '../game/session';
import { createRunner } from '../game/tutorial/runner';
import { SCRIPTS } from '../game/tutorial/scripts';
import { fmt, ru } from '../i18n/ru';
import { hydrate, useStore } from '../store';
import { Menu } from './Menu';

const st = () => useStore.getState();
const deck = buildPreset('balanced', [...HERO_IDS]);

function withDeck() {
  st().upsertDeck({ id: 'd1', name: 'Моя', deck });
  st().setActiveDeck('d1');
}

const play = () => fireEvent.click(screen.getByRole('button', { name: ru.menu.play }));

beforeEach(() => {
  hydrate(defaultSave());
  window.location.hash = '#/';
});

describe('главное меню', () => {
  it('в простое подгружает чанк боя и отменяет подгрузку при уходе', () => {
    const ric = vi.fn(() => 7);
    const cancel = vi.fn();
    vi.stubGlobal('requestIdleCallback', ric);
    vi.stubGlobal('cancelIdleCallback', cancel);
    try {
      const { unmount } = render(<Menu />);
      expect(ric).toHaveBeenCalledTimes(1);
      unmount();
      expect(cancel).toHaveBeenCalledWith(7);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('при tutorialStep 0 «Играть» ведёт в первый бой обучения', () => {
    render(<Menu />);
    play();
    expect(window.location.hash).toBe('#/tutorial/1');
    expect(st().session).toBeNull();
  });

  it('при tutorialStep 1 «Играть» ведёт во второй бой обучения', () => {
    st().completeTutorial(1);
    render(<Menu />);
    play();
    expect(window.location.hash).toBe('#/tutorial/2');
  });

  it('при tutorialStep 3 с активной колодой «Играть» стартует свободный матч и ведёт в бой', () => {
    st().completeTutorial(3);
    withDeck();
    render(<Menu now={() => 4242} />);
    play();
    const s = st().session!;
    expect(s.mode).toBe('free');
    expect(s.playerDeck).toEqual(deck);
    expect(s.botSeed).toBe(4242);
    expect(s.opponentDeck).toEqual(opponentDeckFor(4242));
    expect(st().phase).toBe('planning');
    expect(window.location.hash).toBe('#/battle');
  });

  it('seed свободного матча из Date.now() приводится к uint32', () => {
    st().completeTutorial(3);
    withDeck();
    const big = 1_761_652_800_123;
    render(<Menu now={() => big} />);
    play();
    expect(st().session!.botSeed).toBe(big >>> 0);
    expect(st().session!.state.seed).toBe(big >>> 0);
  });

  it('при tutorialStep 3 без колоды «Играть» ведёт в колоды с подсказкой', async () => {
    st().completeTutorial(3);
    render(<App />);
    play();
    expect(window.location.hash).toBe('#/decks');
    expect(st().session).toBeNull();
    expect(await screen.findByText(ru.menu.needDeck)).toBeInTheDocument();
  });

  it('подсказка о колоде исчезает после ухода с экрана колод', async () => {
    st().completeTutorial(3);
    render(<App />);
    play();
    fireEvent.click(await screen.findByRole('button', { name: ru.common.back }));
    expect(await screen.findByRole('button', { name: ru.menu.decks })).toBeInTheDocument();
    expect(st().notice).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ru.menu.decks }));
    expect(await screen.findByRole('heading', { name: ru.decks.title })).toBeInTheDocument();
    expect(screen.queryByText(ru.menu.needDeck)).toBeNull();
  });

  it('оставшийся завершённый матч очищается перед стартом нового', () => {
    st().completeTutorial(3);
    withDeck();
    st().startMatch(deck, { opponentDeck: opponentDeckFor(1), seed: 1, mode: 'free' });
    st().surrender();
    const old = st().session;
    render(<Menu now={() => 9} />);
    play();
    expect(st().session).not.toBe(old);
    expect(st().session!.state.result).toBeNull();
    expect(st().session!.botSeed).toBe(9);
    expect(window.location.hash).toBe('#/battle');
  });

  it('оставшийся завершённый матч очищается и при переходе в обучение', () => {
    st().startMatch(deck, { opponentDeck: opponentDeckFor(1), seed: 1, mode: 'free' });
    st().surrender();
    render(<Menu />);
    play();
    expect(st().session).toBeNull();
    expect(window.location.hash).toBe('#/tutorial/1');
  });

  it('незавершённый свободный матч продолжается', () => {
    st().completeTutorial(3);
    withDeck();
    st().startMatch(deck, { opponentDeck: opponentDeckFor(1), seed: 1, mode: 'free' });
    const session = st().session;
    render(<Menu now={() => 9} />);
    play();
    expect(st().session).toBe(session);
    expect(window.location.hash).toBe('#/battle');
  });

  it('незавершённый бой обучения продолжается на своём экране', () => {
    const script = SCRIPTS[2];
    st().startMatch(script.decks.A, {
      opponentDeck: script.decks.B, seed: script.seed, mode: 'tutorial', tutorialId: 2, enemy: script.enemy,
    });
    st().setTutorialRunner(createRunner(script));
    const session = st().session;
    render(<Menu />);
    play();
    expect(st().session).toBe(session);
    expect(window.location.hash).toBe('#/tutorial/2');
  });

  it('«Обучение» ведёт в следующий бой обучения, после всех трёх — в третий', () => {
    st().completeTutorial(1);
    const { unmount } = render(<Menu />);
    fireEvent.click(screen.getByRole('button', { name: ru.menu.tutorial }));
    expect(window.location.hash).toBe('#/tutorial/2');
    unmount();
    st().completeTutorial(3);
    render(<Menu />);
    fireEvent.click(screen.getByRole('button', { name: ru.menu.tutorial }));
    expect(window.location.hash).toBe('#/tutorial/3');
  });

  it('показывает счётчик побед и Луну', () => {
    useStore.setState({ stats: { wins: 5, losses: 2, draws: 0 } });
    render(<Menu />);
    expect(screen.getByTestId('wins')).toHaveTextContent(fmt(ru.menu.wins, { n: 5 }));
    expect(screen.getByTestId('moon')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: ru.common.title })).toBeInTheDocument();
  });
});
