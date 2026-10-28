import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_IDS } from '../../engine';
import type { Deck, MatchState, Slot } from '../../engine';
import { SPEED_FACTOR } from '../../game/playback/timings';
import { defaultSave } from '../../game/save/defaults';
import { emptyDraft } from '../../game/session';
import { fmt, ru } from '../../i18n/ru';
import { hydrate, useStore } from '../../store';
import { chipLabel } from '../../ui/HeroCard';
import { Battle } from './Battle';

// Активные A: tali, fenna, nerisa; активные B: aurora, justina, nokta.
const deckA: Deck = { heroes: ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], starting: [3, 1, 2], cards: CARD_IDS.slice(0, 12) };
const deckB: Deck = { heroes: ['aurora', 'justina', 'nokta', 'kira', 'mira', 'selena'], starting: [0, 1, 2], cards: CARD_IDS.slice(0, 12) };

const SLOTS: Slot[] = [0, 1, 2];

/** Реальный матч с атаками A по B0, B1, B2; `tweak` правит состояние до подтверждения. */
function setup(tweak?: (s: MatchState) => void) {
  useStore.getState().startMatch(deckA, { opponentDeck: deckB, seed: 11, mode: 'free' });
  const session = useStore.getState().session!;
  const state = structuredClone(session.state);
  state.sides.A.hand = [];
  tweak?.(state);
  useStore.setState({ session: { ...session, state }, draft: emptyDraft(state) });
  for (const slot of SLOTS) useStore.getState().setAction(slot, { type: 'basic', target: { side: 'B', slot } });
  render(<Battle />);
  act(() => { useStore.getState().confirm(); });
}

const hero = (side: 'A' | 'B', slot: number) => screen.getByTestId(`hero-${side}-${slot}`);
const st = () => useStore.getState();

beforeEach(() => {
  hydrate(defaultSave());
  window.location.hash = '#/battle';
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe('экран боя: проигрывание', () => {
  it('после confirm фаза playback, первый бит показывает чипы противника', () => {
    setup();
    expect(st().phase).toBe('playback');
    expect(screen.queryByTestId('confirm')).toBeNull();
    expect(screen.getByTestId('playback-board')).toBeInTheDocument();
    const first = st().beats[0]!;
    expect(first.kind).toBe('reveal');
    const reveal = first.events.find(e => e.type === 'reveal');
    if (reveal?.type !== 'reveal') throw new Error('no reveal');
    let shown = 0;
    reveal.commands.B.actions.forEach((a, i) => {
      const label = chipLabel(a);
      if (label) {
        expect(hero('B', i)).toHaveTextContent(label);
        shown++;
      }
    });
    expect(shown).toBeGreaterThan(0);
  });

  it('таймер на durationMs бита переходит к следующему биту', () => {
    setup();
    const d = st().beats[0]!.durationMs;
    expect(d).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(d - 1); });
    expect(st().beatIndex).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(st().beatIndex).toBe(1);
  });

  it('на быстрой скорости бит короче в SPEED_FACTOR.fast раз', () => {
    useStore.getState().setSpeed('fast');
    setup();
    const d = st().beats[0]!.durationMs * SPEED_FACTOR.fast;
    act(() => { vi.advanceTimersByTime(d - 1); });
    expect(st().beatIndex).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(st().beatIndex).toBe(1);
  });

  it('тап по полю продвигает бит немедленно', () => {
    setup();
    fireEvent.click(screen.getByTestId('playback-board'));
    expect(st().beatIndex).toBe(1);
  });

  it('«Пропустить» ведёт к планированию следующего раунда с hp из движка', () => {
    setup();
    fireEvent.click(screen.getByTestId('skip'));
    expect(st().phase).toBe('planning');
    expect(screen.getByText(fmt(ru.battle.round, { n: 2, max: 10 }))).toBeInTheDocument();
    expect(screen.getByTestId('confirm')).toBeDisabled();
    const state = st().session!.state;
    for (const side of ['A', 'B'] as const) {
      for (const slot of SLOTS) {
        const h = state.sides[side].active[slot]!;
        expect(hero(side, slot)).toHaveTextContent(`${h.hp}/${h.maxHp}`);
      }
    }
  });

  it('при matchEnd матч завершается и открывается #/result', () => {
    setup((s) => {
      for (const h of s.sides.B.active) { h.hp = 1; h.shield = 0; }
      for (const h of s.sides.B.reserve) h.hp = 0;
    });
    const beats = st().beats;
    expect(beats.at(-1)!.kind).toBe('end');
    for (let i = 0; i < beats.length + 1 && st().phase === 'playback'; i++) {
      act(() => { vi.advanceTimersByTime(2000); });
    }
    expect(st().phase).toBe('finished');
    expect(st().session!.state.result?.winner).toBe('A');
    expect(window.location.hash).toBe('#/result');
  });

  it('журнал из шапки показывает строку «R1 Moon=new» и закрывается', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: ru.battle.log }));
    const drawer = screen.getByTestId('log-drawer');
    expect(within(drawer).getByText('R1 Moon=new')).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: ru.battle.close }));
    expect(screen.queryByTestId('log-drawer')).toBeNull();
    expect(st().sheet).toBeNull();
  });

  it('журнал доступен и в планировании', () => {
    setup();
    fireEvent.click(screen.getByTestId('skip'));
    fireEvent.click(screen.getByRole('button', { name: ru.battle.log }));
    expect(within(screen.getByTestId('log-drawer')).getByText('R2 Moon=' + st().session!.state.moon)).toBeInTheDocument();
  });
});
