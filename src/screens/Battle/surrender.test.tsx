import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { HERO_IDS } from '../../engine';
import { buildPreset } from '../../game/decks/presets';
import { defaultSave } from '../../game/save/defaults';
import { opponentDeckFor } from '../../game/session';
import { ru } from '../../i18n/ru';
import { hydrate, useStore } from '../../store';

const st = () => useStore.getState();
const deck = buildPreset('balanced', [...HERO_IDS]);

beforeEach(() => {
  hydrate(defaultSave());
  st().startMatch(deck, { opponentDeck: opponentDeckFor(3), seed: 3, mode: 'free' });
  window.location.hash = '#/battle';
});

describe('экран боя: «Назад» и сдача', () => {
  it('«Назад» спрашивает подтверждение; «Да» сдаёт матч и ведёт на результат с поражением', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: ru.battle.back }));
    expect(screen.getByText(ru.battle.surrenderConfirm)).toBeInTheDocument();
    expect(window.location.hash).toBe('#/battle');
    fireEvent.click(screen.getByRole('button', { name: ru.battle.yes }));
    expect(window.location.hash).toBe('#/result');
    expect(st().session!.surrendered).toBe(true);
    expect(await screen.findByTestId('result')).toHaveTextContent(ru.result.loss);
    expect(st().stats).toEqual({ wins: 0, losses: 1, draws: 0 });
    expect(screen.getByTestId('result-reason')).toHaveTextContent(ru.result.surrender);
  });

  it('«Нет» закрывает подтверждение, матч продолжается', () => {
    render(<App />);
    const session = st().session;
    fireEvent.click(screen.getByRole('button', { name: ru.battle.back }));
    fireEvent.click(screen.getByRole('button', { name: ru.battle.no }));
    expect(screen.queryByText(ru.battle.surrenderConfirm)).toBeNull();
    expect(st().session).toBe(session);
    expect(window.location.hash).toBe('#/battle');
    expect(st().stats.losses).toBe(0);
  });

  it('в обучении «Назад» ведёт в меню без сдачи', () => {
    hydrate(defaultSave());
    window.location.hash = '#/tutorial/1';
    render(<App />);
    const session = st().session!;
    expect(session.mode).toBe('tutorial');
    fireEvent.click(screen.getByRole('button', { name: ru.battle.back }));
    expect(window.location.hash).toBe('#/');
    expect(st().session).toBe(session);
    expect(st().session!.state.result).toBeNull();
  });
});
