import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { ru } from './i18n/ru';

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
});
