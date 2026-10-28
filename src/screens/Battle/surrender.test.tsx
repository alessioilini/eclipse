import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('под открытым подтверждением поле не нажимается: тап по hero-A-0 не открывает лист', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: ru.battle.back }));
    expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('battle-body')).toHaveAttribute('inert');
    // Даже если событие дойдёт до карточки (jsdom не проверяет перекрытие), поле его не получает.
    await user.click(screen.getByTestId('hero-A-0'));
    expect(st().sheet).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ru.battle.no }));
    expect(screen.getByTestId('battle-body')).not.toHaveAttribute('inert');
    await user.click(screen.getByTestId('hero-A-0'));
    expect(st().sheet).not.toBeNull();
  });

  it('во время проигрывания «Назад» неактивна и журнала нет', () => {
    render(<App />);
    act(() => {
      for (const slot of [0, 1, 2] as const) st().setAction(slot, { type: 'basic', target: { side: 'B', slot } });
      st().confirm();
    });
    expect(st().phase).toBe('playback');
    expect(screen.getByRole('button', { name: ru.battle.back })).toBeDisabled();
    expect(screen.queryByRole('button', { name: ru.battle.log })).toBeNull();
  });
});
