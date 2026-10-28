import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_IDS, HEROES } from '../../engine';
import { ECLIPSE_ROUND } from '../../engine/damage';
import type { CardId, Deck, HeroAction, MatchState, SlotRef } from '../../engine';
import { defaultSave } from '../../game/save/defaults';
import { emptyDraft } from '../../game/session';
import { fmt, ru } from '../../i18n/ru';
import { hydrate, useStore } from '../../store';
import { chipLabel } from '../../ui/HeroCard';
import { Battle } from './Battle';

// Активные A: tali (маг, скилл 1⚡ по врагу), fenna (поддержка), nerisa (страж); резерв: aira, zefira, liraya.
const deckA: Deck = { heroes: ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], starting: [3, 1, 2], cards: CARD_IDS.slice(0, 12) };
// Активные B: aurora, justina, nokta.
const deckB: Deck = { heroes: ['aurora', 'justina', 'nokta', 'kira', 'mira', 'selena'], starting: [0, 1, 2], cards: CARD_IDS.slice(0, 12) };

const B = (slot: 0 | 1 | 2): SlotRef => ({ side: 'B', slot });
const A = (slot: 0 | 1 | 2): SlotRef => ({ side: 'A', slot });

/** Реальный матч; рука A заменяется на `hand`, `tweak` правит состояние до рендера. */
function setup(hand: CardId[] = ['cover', 'lunarDash'], tweak?: (s: MatchState) => void) {
  useStore.getState().startMatch(deckA, { opponentDeck: deckB, seed: 11, mode: 'free' });
  const session = useStore.getState().session!;
  const state = structuredClone(session.state);
  state.sides.A.hand = [...hand];
  tweak?.(state);
  useStore.setState({ session: { ...session, state }, draft: emptyDraft(state) });
  const user = userEvent.setup();
  render(<Battle />);
  return user;
}

const hero = (side: 'A' | 'B', slot: number) => screen.getByTestId(`hero-${side}-${slot}`);
const pressed = (el: HTMLElement) => el.getAttribute('aria-pressed') === 'true';
const chip = (a: HeroAction) => chipLabel(a)!;

beforeEach(() => { hydrate(defaultSave()); });
afterEach(() => { vi.useRealTimers(); });

describe('экран боя: планирование', () => {
  it('тап по своей героине открывает лист с Атакой, Скиллом и недоступной Ультой', async () => {
    const user = setup();
    expect(useStore.getState().session!.state.sides.A.luna).toBeLessThan(3);
    await user.click(hero('A', 0));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByTestId('sheet-item-basic')).toHaveTextContent(ru.battle.actions.basic);
    const skill = within(sheet).getByTestId('sheet-item-skill');
    expect(skill).toHaveTextContent(ru.battle.actions.skill);
    expect(skill).toHaveTextContent(fmt(ru.battle.costEnergy, { n: HEROES.tali.skill.cost }));
    expect(skill).toBeEnabled();
    const ult = within(sheet).getByTestId('sheet-item-ultimate');
    expect(ult).toBeDisabled();
    expect(ult).toHaveTextContent(ru.blocked.luna);
    expect(within(sheet).getByTestId('sheet-item-swap')).toBeEnabled();
    expect(pressed(hero('A', 0))).toBe(true);
  });

  it('«Атака» подсвечивает только живых героинь противника', async () => {
    const user = setup(undefined, s => { s.sides.B.active[1].hp = 0; });
    await user.click(hero('A', 0));
    await user.click(screen.getByTestId('sheet-item-basic'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useStore.getState().sheet).toEqual({ kind: 'targets', slot: 0, action: 'basic' });
    expect([0, 1, 2].map(i => pressed(hero('B', i)))).toEqual([true, false, true]);
    expect([0, 1, 2].map(i => pressed(hero('A', i)))).toEqual([false, false, false]);
  });

  it('тап по hero-B-2 ставит чип и закрывает лист', async () => {
    const user = setup();
    await user.click(hero('A', 0));
    await user.click(screen.getByTestId('sheet-item-basic'));
    await user.click(hero('B', 2));
    const action: HeroAction = { type: 'basic', target: B(2) };
    expect(useStore.getState().draft.actions[0]).toEqual(action);
    expect(useStore.getState().sheet).toBeNull();
    expect(hero('A', 0)).toHaveTextContent(chip(action));
    expect(screen.queryByTestId('target-hint')).toBeNull();
  });

  it('скилл тратит энергию в счётчике', async () => {
    const user = setup();
    const meter = () => screen.getByRole('meter', { name: ru.battle.energy });
    expect(meter()).toHaveAttribute('aria-valuenow', '4');
    await user.click(hero('A', 0));
    await user.click(screen.getByTestId('sheet-item-skill'));
    await user.click(hero('B', 1));
    expect(meter()).toHaveAttribute('aria-valuenow', String(4 - HEROES.tali.skill.cost));
  });

  it('«Подтвердить» неактивна, пока не выбраны три действия; затем раунд проигрывается', async () => {
    const user = setup();
    const confirm = () => screen.getByTestId('confirm');
    expect(confirm()).toBeDisabled();
    for (const slot of [0, 1, 2] as const) {
      expect(confirm()).toBeDisabled();
      await user.click(hero('A', slot));
      await user.click(screen.getByTestId('sheet-item-basic'));
      await user.click(hero('B', slot));
    }
    expect(confirm()).toBeEnabled();
    expect(screen.getByText(fmt(ru.battle.round, { n: 1, max: 10 }))).toBeInTheDocument();
    await user.click(confirm());
    expect(useStore.getState().phase).toBe('playback');
    const placeholder = screen.getByTestId('playback-placeholder');
    await user.click(within(placeholder).getByRole('button', { name: ru.battle.next }));
    expect(useStore.getState().phase).toBe('planning');
    expect(screen.getByText(fmt(ru.battle.round, { n: 2, max: 10 }))).toBeInTheDocument();
    expect(screen.getByTestId('confirm')).toBeDisabled();
  });

  it('«Прикрытие» просит вторую цель и принимает только стража', async () => {
    const user = setup(['cover', 'lunarDash']);
    await user.click(screen.getByTestId('card-0'));
    expect(useStore.getState().sheet).toEqual({ kind: 'card', handIndex: 0, step: 'target' });
    expect([0, 1, 2].map(i => pressed(hero('A', i)))).toEqual([true, true, true]);
    await user.click(hero('A', 0));
    expect(useStore.getState().sheet).toEqual({ kind: 'card', handIndex: 0, step: 'secondary', target: A(0) });
    // Страж среди активных только nerisa (A2).
    expect([0, 1, 2].map(i => pressed(hero('A', i)))).toEqual([false, false, true]);
    await user.click(hero('A', 1));
    expect(useStore.getState().draft.card).toBeNull();
    expect(useStore.getState().sheet).toMatchObject({ kind: 'card', step: 'secondary' });
    await user.click(hero('A', 2));
    expect(useStore.getState().draft.card).toEqual({ handIndex: 0, target: A(0), secondary: A(2) });
    expect(useStore.getState().sheet).toBeNull();
    expect(pressed(screen.getByTestId('card-0'))).toBe(true);
    // Повторный тап снимает карту.
    await user.click(screen.getByTestId('card-0'));
    expect(useStore.getState().draft.card).toBeNull();
  });

  it('«Прикрытие» без живого стража нельзя выбрать', async () => {
    const user = setup(['cover', 'lunarDash'], s => { s.sides.A.active[2].hp = 0; });
    const card = screen.getByTestId('card-0');
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(card).toHaveTextContent(ru.battle.noTarget);
    await user.click(card);
    expect(useStore.getState().sheet).toBeNull();
    expect(useStore.getState().draft.card).toBeNull();
    expect(screen.queryByTestId('target-hint')).toBeNull();
  });

  it('индикатор затмения появляется с раунда ECLIPSE_ROUND движка', () => {
    setup(undefined, s => { s.round = ECLIPSE_ROUND - 1; });
    expect(screen.queryByText(ru.battle.eclipse)).toBeNull();
  });

  it('на раунде ECLIPSE_ROUND луна показывает затмение', () => {
    setup(undefined, s => { s.round = ECLIPSE_ROUND; });
    expect(screen.getByText(ru.battle.eclipse)).toBeInTheDocument();
    expect(screen.getByText(fmt(ru.battle.round, { n: ECLIPSE_ROUND, max: 10 }))).toBeInTheDocument();
  });

  it('Review Focus 3: «Замена» после чипа «Скилл → B2» снимает старый чип и показывает резерв', async () => {
    const user = setup();
    await user.click(hero('A', 0));
    await user.click(screen.getByTestId('sheet-item-skill'));
    await user.click(hero('B', 1));
    const skill: HeroAction = { type: 'skill', target: B(1) };
    expect(hero('A', 0)).toHaveTextContent(chip(skill));

    await user.click(hero('A', 0));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('sheet-item-swap'));
    expect(useStore.getState().draft.actions[0]).toBeNull();
    expect(hero('A', 0)).not.toHaveTextContent(chip(skill));
    expect(useStore.getState().sheet).toEqual({ kind: 'reserve', slot: 0 });
    expect(screen.getByTestId('target-hint')).toHaveTextContent(ru.battle.pickReserve);
    expect([0, 1, 2].map(i => pressed(screen.getByTestId(`reserve-A-${i}`)))).toEqual([true, true, true]);

    await user.click(screen.getByTestId('reserve-A-1'));
    const swap: HeroAction = { type: 'swap', reserveIndex: 1 };
    expect(useStore.getState().draft.actions[0]).toEqual(swap);
    expect(hero('A', 0)).toHaveTextContent(chip(swap));
    expect(useStore.getState().sheet).toBeNull();
  });

  it('показывает руку противника рубашками, без чипов, а долгое нажатие открывает карточку героини', () => {
    vi.useFakeTimers();
    setup();
    const opp = useStore.getState().session!.state.sides.B;
    expect(screen.getByTestId('opp-hand')).toHaveTextContent(String(opp.hand.length));
    expect(screen.getByText(fmt(ru.battle.deck, { n: opp.deck.length }))).toBeInTheDocument();
    fireEvent.pointerDown(hero('B', 1));
    act(() => { vi.advanceTimersByTime(600); });
    expect(useStore.getState().sheet).toEqual({ kind: 'hero', ref: B(1) });
    const panel = screen.getByTestId('hero-sheet');
    expect(panel).toHaveTextContent(HEROES.justina.name);
    expect(panel).toHaveTextContent(HEROES.justina.passive.text);
    expect(panel).toHaveTextContent(HEROES.justina.ultimate.name);
  });
});
