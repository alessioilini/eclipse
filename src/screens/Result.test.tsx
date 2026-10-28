import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CARD_IDS } from '../engine';
import type { Deck, MatchState } from '../engine';
import { defaultSave } from '../game/save/defaults';
import { fmt, ru } from '../i18n/ru';
import { hydrate, useStore } from '../store';
import { Result } from './Result';

const deckA: Deck = { heroes: ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], starting: [3, 1, 2], cards: CARD_IDS.slice(0, 12) };
const deckB: Deck = { heroes: ['aurora', 'justina', 'nokta', 'kira', 'mira', 'selena'], starting: [0, 1, 2], cards: CARD_IDS.slice(0, 12) };

const st = () => useStore.getState();

/** Реальный матч, доведённый до `finished` с заданным итогом. */
function finish(result: NonNullable<MatchState['result']>, round?: number) {
  st().startMatch(deckA, { opponentDeck: deckB, seed: 11, mode: 'free' });
  const session = st().session!;
  const state = structuredClone(session.state);
  state.result = result;
  if (round !== undefined) state.round = round;
  useStore.setState({ session: { ...session, state }, phase: 'finished' });
}

beforeEach(() => {
  hydrate(defaultSave());
  window.location.hash = '#/result';
});

describe('экран результата', () => {
  it('при победе показывает «Победа» и ключевой момент', () => {
    finish({ winner: 'A', reason: 'wipe' }, 5);
    render(<Result />);
    expect(screen.getByRole('heading')).toHaveTextContent(ru.result.win);
    expect(screen.getByTestId('key-moment')).toHaveTextContent(fmt(ru.keyMoment.rounds, { n: 5 }));
  });

  it('при поражении и ничьей заголовки соответствуют', () => {
    finish({ winner: 'B', reason: 'wipe' });
    const { unmount } = render(<Result />);
    expect(screen.getByRole('heading')).toHaveTextContent(ru.result.loss);
    unmount();
    finish({ winner: 'draw', reason: 'draw' });
    render(<Result />);
    expect(screen.getByRole('heading')).toHaveTextContent(ru.result.draw);
  });

  it('по лимиту раундов показывает причину', () => {
    finish({ winner: 'A', reason: 'hpPct' }, 10);
    render(<Result />);
    expect(screen.getByTestId('result-reason')).toHaveTextContent(fmt(ru.result.byRounds, { n: 10 }));
  });

  it('после сдачи показывает «сдались»', () => {
    st().startMatch(deckA, { opponentDeck: deckB, seed: 11, mode: 'free' });
    act(() => { st().surrender(); });
    render(<Result />);
    expect(screen.getByTestId('result-reason')).toHaveTextContent(ru.result.surrender);
    expect(screen.getByRole('heading')).toHaveTextContent(ru.result.loss);
  });

  it('recordResult срабатывает один раз, даже если отрисовать дважды и перемонтировать', () => {
    finish({ winner: 'A', reason: 'wipe' });
    const first = render(<Result />);
    render(<Result />);
    first.unmount();
    render(<Result />);
    expect(st().stats).toEqual({ wins: 1, losses: 0, draws: 0 });
  });

  it('новый матч снова засчитывается', () => {
    finish({ winner: 'A', reason: 'wipe' });
    const { unmount } = render(<Result />);
    unmount();
    finish({ winner: 'B', reason: 'wipe' });
    render(<Result />);
    expect(st().stats).toEqual({ wins: 1, losses: 1, draws: 0 });
  });

  it('«Ещё раз» запускает новый матч той же колодой с другим seed и ведёт в бой', () => {
    finish({ winner: 'A', reason: 'wipe' });
    render(<Result now={() => 777} />);
    fireEvent.click(screen.getByRole('button', { name: ru.result.again }));
    const s = st().session!;
    expect(s.playerDeck).toEqual(deckA);
    expect(s.botSeed).toBe(777);
    expect(s.state.seed).not.toBe(11);
    expect(s.state.result).toBeNull();
    expect(st().phase).toBe('planning');
    expect(window.location.hash).toBe('#/battle');
  });

  it('«Ещё раз» после боя обучения ведёт в тот же бой обучения', () => {
    st().startMatch(deckA, { opponentDeck: deckB, seed: 11, mode: 'tutorial', tutorialId: 2 });
    const session = st().session!;
    const state = structuredClone(session.state);
    state.result = { winner: 'A', reason: 'wipe' };
    useStore.setState({ session: { ...session, state }, phase: 'finished' });
    render(<Result />);
    fireEvent.click(screen.getByRole('button', { name: ru.result.again }));
    expect(st().session).toBeNull();
    expect(window.location.hash).toBe('#/tutorial/2');
  });

  it('«В меню» очищает матч и ведёт в меню', () => {
    finish({ winner: 'A', reason: 'wipe' });
    render(<Result />);
    fireEvent.click(screen.getByRole('button', { name: ru.result.menu }));
    expect(st().session).toBeNull();
    expect(window.location.hash).toBe('#/');
  });

  it('без матча показывает только «В меню» и ничего не засчитывает', () => {
    render(<Result />);
    expect(screen.getByRole('button', { name: ru.result.menu })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ru.result.again })).toBeNull();
    expect(st().stats).toEqual({ wins: 0, losses: 0, draws: 0 });
  });

  it('матч не завершён: только «В меню»', () => {
    st().startMatch(deckA, { opponentDeck: deckB, seed: 11, mode: 'free' });
    render(<Result />);
    expect(screen.queryByRole('button', { name: ru.result.again })).toBeNull();
    expect(screen.getByRole('button', { name: ru.result.menu })).toBeInTheDocument();
    expect(st().stats.wins + st().stats.losses + st().stats.draws).toBe(0);
  });
});
