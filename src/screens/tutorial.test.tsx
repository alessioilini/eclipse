import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchState } from '../engine';
import { defaultSave } from '../game/save/defaults';
import { STARTER_DECK_ID } from '../game/tutorial/rewards';
import { SCRIPTS } from '../game/tutorial/scripts';
import { ru } from '../i18n/ru';
import { hydrate, toSave, useStore } from '../store';
import { Tutorial } from './Tutorial';

const st = () => useStore.getState();
const steps = ru.tutorial.scripts[1].steps;
const hero = (side: 'A' | 'B', slot: number) => screen.getByTestId(`hero-${side}-${slot}`);
const pressed = (el: HTMLElement) => el.getAttribute('aria-pressed') === 'true';

function setup(id: 1 | 2 | 3 = 1) {
  const user = userEvent.setup();
  render(<Tutorial id={id} />);
  return user;
}

/** Завершает текущий матч обучения с заданным победителем, как это делает конец проигрывания. */
function finishWith(winner: 'A' | 'B') {
  const session = st().session!;
  const state: MatchState = structuredClone(session.state);
  state.result = { winner, reason: 'wipe' };
  act(() => { useStore.setState({ session: { ...session, state }, phase: 'finished' }); });
}

beforeEach(() => {
  hydrate(defaultSave());
  window.location.hash = '#/tutorial/1';
});

describe('экран обучения', () => {
  it('начинает бой сценария и показывает текст шага 0; «Дальше» продвигает шаг', async () => {
    const user = setup();
    expect(st().session?.mode).toBe('tutorial');
    expect(st().session?.tutorialId).toBe(1);
    expect(st().tutorialStepIndex).toBe(0);
    expect(screen.getByRole('status')).toHaveTextContent(steps[0]);
    await user.click(screen.getByRole('button', { name: ru.tutorial.next }));
    expect(st().tutorialStepIndex).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent(steps[1]);
    // Шаг с требованием ждёт действия: кнопки «Дальше» нет.
    expect(screen.queryByRole('button', { name: ru.tutorial.next })).toBeNull();
  });

  it('скрывает резерв, руку, ульту, замену и журнал боя 1', async () => {
    const user = setup();
    expect(screen.queryByTestId('reserve-A-0')).toBeNull();
    expect(screen.queryByTestId('card-0')).toBeNull();
    expect(screen.queryByRole('button', { name: ru.battle.log })).toBeNull();
    // Резерв противника виден: оттуда выходят следующие противницы.
    expect(screen.getByTestId('reserve-B-0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: ru.tutorial.next }));
    await user.click(hero('A', 0));
    expect(screen.getByTestId('sheet-item-basic')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-item-ultimate')).toBeNull();
    expect(screen.queryByTestId('sheet-item-swap')).toBeNull();
  });

  it('Review Focus 5: тап по героине вне allowed.slots не открывает лист', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: ru.tutorial.next }));
    await user.click(hero('A', 1));
    await user.click(hero('A', 2));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(st().sheet).toBeNull();
    // Разрешённая героиня открывает лист только с разрешённым действием.
    await user.click(hero('A', 0));
    expect(screen.getByTestId('sheet-item-basic')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-item-skill')).toBeNull();
  });

  it('цели сужены до требуемой; верная цель продвигает шаг', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: ru.tutorial.next }));
    await user.click(hero('A', 0));
    await user.click(screen.getByTestId('sheet-item-basic'));
    expect([0, 1, 2].map(i => pressed(hero('B', i)))).toEqual([true, false, false]);
    await user.click(hero('B', 1));
    expect(st().draft.actions[0]).toBeNull();
    expect(st().tutorialStepIndex).toBe(1);
    await user.click(hero('B', 0));
    expect(st().draft.actions[0]).toEqual({ type: 'basic', target: { side: 'B', slot: 0 } });
    expect(st().tutorialStepIndex).toBe(2);
    expect(screen.getByRole('status')).toHaveTextContent(steps[2]);
  });

  it('«Подтвердить» неактивна, пока шаг не разрешает подтверждение', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: ru.tutorial.next }));
    act(() => {
      st().setAction(0, { type: 'basic', target: { side: 'B', slot: 0 } });
      st().setTutorialRunner({ ...st().tutorial!, stepIndex: 3 });
      st().setAction(1, { type: 'skill', target: { side: 'A', slot: 2 } });
    });
    expect(st().tutorialStepIndex).toBe(4);
    expect(screen.getByTestId('confirm')).toBeDisabled();
    act(() => { st().setAction(2, { type: 'basic', target: { side: 'B', slot: 1 } }); });
    expect(st().tutorialStepIndex).toBe(5);
    expect(screen.getByTestId('confirm')).toBeEnabled();
    await user.click(screen.getByTestId('confirm'));
    expect(st().phase).toBe('playback');
    expect(st().tutorialStepIndex).toBe(6);
  });

  it('победа в бою 1 открывает четырёх героинь и ведёт на результат, без статистики', () => {
    setup();
    finishWith('A');
    expect(st().tutorialStep).toBe(1);
    expect(st().unlocked).toEqual(expect.arrayContaining(['tali', 'zefira', 'nokta', 'mira']));
    expect(window.location.hash).toBe('#/result');
    st().recordMatchResult();
    expect(st().stats).toEqual({ wins: 0, losses: 0, draws: 0 });
  });

  it('победа в бою 3 выдаёт и делает активной колоду «Сбалансированная»', () => {
    window.location.hash = '#/tutorial/3';
    setup(3);
    finishWith('A');
    expect(st().tutorialStep).toBe(3);
    expect(st().unlocked).toEqual(expect.arrayContaining(['liraya', 'aurora', 'kira', 'selena']));
    const deck = st().decks.find(d => d.id === STARTER_DECK_ID);
    expect(deck?.name).toBe(ru.tutorial.starterDeck);
    expect(st().activeDeckId).toBe(STARTER_DECK_ID);
  });

  it('поражение показывает «Ещё раз», который перезапускает тот же сценарий', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: ru.tutorial.next }));
    finishWith('B');
    expect(screen.getByText(ru.tutorial.lost)).toBeInTheDocument();
    expect(st().tutorialStep).toBe(0);
    expect(window.location.hash).toBe('#/tutorial/1');
    await user.click(screen.getByRole('button', { name: ru.tutorial.retry }));
    expect(st().phase).toBe('planning');
    expect(st().session?.state.round).toBe(1);
    expect(st().tutorialStepIndex).toBe(0);
    expect(screen.getByRole('status')).toHaveTextContent(steps[0]);
  });

  it('бой, восстановленный посреди раунда, начинает раунд с его первого шага', () => {
    st().startMatch(SCRIPTS[1].decks.A, {
      opponentDeck: SCRIPTS[1].decks.B, seed: SCRIPTS[1].seed, mode: 'tutorial', tutorialId: 1,
      enemy: SCRIPTS[1].enemy, opponentHp: SCRIPTS[1].enemyHp!,
    });
    st().setTutorialRunner({ script: SCRIPTS[1], stepIndex: 2, round: 1 });
    const save = toSave(st());
    hydrate(defaultSave());
    hydrate(JSON.parse(JSON.stringify(save)));
    const session = st().session;
    setup();
    // Тот же матч, не перезапуск; черновик не сохраняется, поэтому шаг откатан к началу раунда.
    expect(st().session).toBe(session);
    expect(st().tutorialStepIndex).toBe(0);
    expect(screen.getByRole('status')).toHaveTextContent(steps[0]);
  });
});
