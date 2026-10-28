import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { CARD_IDS, HEROES, HERO_IDS } from '../engine';
import type { Deck, EngineEvent, MatchState, Slot } from '../engine';
import { buildPreset } from '../game/decks/presets';
import { defaultSave } from '../game/save/defaults';
import { emptyDraft, opponentDeckFor } from '../game/session';
import { ru } from '../i18n/ru';
import { setPlatformForTests } from '../platform';
import { createWebPlatform } from '../platform/web';
import type { Platform } from '../platform';
import { hydrate, useStore } from '../store';
import { Battle } from './Battle/Battle';
import { beatHaptic } from './Battle/BeatEffects';
import { Result } from './Result';

const st = () => useStore.getState();

/** Подделка платформы Telegram: все члены — шпионы; `back()` — обработчик, показанный последним. */
function fakeTelegram() {
  let shown: (() => void) | null = null;
  const p = {
    kind: 'telegram' as const,
    ready: vi.fn(),
    user: null,
    startParam: null,
    backButton: {
      show: vi.fn((fn: () => void) => { shown = fn; }),
      hide: vi.fn(() => { shown = null; }),
    },
    haptic: vi.fn(),
    share: vi.fn(async () => 'telegram' as const),
    cloud: null,
    setClosingConfirmation: vi.fn(),
  } satisfies Platform;
  return { p, back: () => shown };
}

let tg: ReturnType<typeof fakeTelegram>;

beforeEach(() => {
  hydrate(defaultSave());
  tg = fakeTelegram();
  setPlatformForTests(tg.p);
});
afterEach(() => {
  vi.useRealTimers();
  setPlatformForTests(createWebPlatform(window));
});

const press = () => {
  const handler = tg.back();
  if (!handler) throw new Error('кнопка «Назад» скрыта');
  act(() => handler());
};

describe('кнопка «Назад» платформы', () => {
  it('в конструкторе без изменений показана и ведёт к списку колод', async () => {
    st().unlock([...HERO_IDS]);
    st().upsertDeck({ id: 'd1', name: 'Моя колода', deck: buildPreset('balanced', [...HERO_IDS]) });
    window.location.hash = '#/decks/d1';
    render(<App />);
    await screen.findByRole('textbox'); // конструктор грузится лениво
    expect(tg.p.backButton.show).toHaveBeenCalled();
    press();
    expect(window.location.hash).toBe('#/decks');
  });

  it('в конструкторе с изменениями спрашивает про несохранённые изменения', async () => {
    st().unlock([...HERO_IDS]);
    st().upsertDeck({ id: 'd1', name: 'Моя колода', deck: buildPreset('balanced', [...HERO_IDS]) });
    window.location.hash = '#/decks/d1';
    render(<App />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Другое' } });
    press();
    expect(screen.getByText(ru.decks.discard)).toBeInTheDocument();
    expect(window.location.hash).toBe('#/decks/d1');
  });

  it('на списке колод ведёт в меню, а в меню скрыта', async () => {
    window.location.hash = '#/decks';
    render(<App />);
    await screen.findByText(ru.decks.needSix);
    press();
    expect(window.location.hash).toBe('#/');
    await screen.findByRole('button', { name: ru.menu.play });
    expect(tg.back()).toBeNull();
    expect(tg.p.backButton.hide).toHaveBeenCalled();
  });

  it('в меню при запуске не показывается', async () => {
    window.location.hash = '#/';
    render(<App />);
    await screen.findByRole('button', { name: ru.menu.play });
    expect(tg.p.backButton.show).not.toHaveBeenCalled();
    expect(tg.p.backButton.hide).toHaveBeenCalled();
  });

  it('на списке героинь ведёт в меню, в карточке героини — к списку', async () => {
    st().unlock([...HERO_IDS]);
    window.location.hash = '#/heroes';
    render(<App />);
    await screen.findByText(HEROES.aira.name);
    press();
    expect(window.location.hash).toBe('#/');
    act(() => { window.location.hash = '#/heroes/aira'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await screen.findByText(`${ru.heroes.hp} ${HEROES.aira.hp}`);
    press();
    expect(window.location.hash).toBe('#/heroes');
  });

  it('в свободном бою открывает подтверждение сдачи', async () => {
    st().startMatch(buildPreset('balanced', [...HERO_IDS]), { opponentDeck: opponentDeckFor(3), seed: 3, mode: 'free' });
    window.location.hash = '#/battle';
    render(<App />);
    await screen.findByTestId('battle');
    press();
    expect(screen.getByText(ru.battle.surrenderConfirm)).toBeInTheDocument();
    expect(window.location.hash).toBe('#/battle');
  });

  it('в обучении ведёт в меню без сдачи', async () => {
    window.location.hash = '#/tutorial/1';
    render(<App />);
    await screen.findByTestId('battle');
    const session = st().session;
    press();
    expect(window.location.hash).toBe('#/');
    expect(st().session).toBe(session);
  });

  it('на результате ведёт в меню', async () => {
    window.location.hash = '#/result';
    render(<App />);
    await screen.findByTestId('result');
    press();
    expect(window.location.hash).toBe('#/');
  });
});

describe('подтверждение закрытия', () => {
  it('включено в бою и выключено в меню', async () => {
    st().startMatch(buildPreset('balanced', [...HERO_IDS]), { opponentDeck: opponentDeckFor(3), seed: 3, mode: 'free' });
    window.location.hash = '#/battle';
    render(<App />);
    await screen.findByTestId('battle');
    expect(tg.p.setClosingConfirmation).toHaveBeenLastCalledWith(true);
    act(() => { window.location.hash = '#/'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await screen.findByRole('button', { name: ru.menu.play });
    expect(tg.p.setClosingConfirmation).toHaveBeenLastCalledWith(false);
  });
});

// Активные A: tali, fenna, nerisa; активные B: aurora, justina, nokta.
const deckA: Deck = { heroes: ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'], starting: [3, 1, 2], cards: CARD_IDS.slice(0, 12) };
const deckB: Deck = { heroes: ['aurora', 'justina', 'nokta', 'kira', 'mira', 'selena'], starting: [0, 1, 2], cards: CARD_IDS.slice(0, 12) };

describe('вибрация', () => {
  it('лёгкая на бите с уроном — по одному разу на бит', () => {
    vi.useFakeTimers();
    window.location.hash = '#/battle';
    st().startMatch(deckA, { opponentDeck: deckB, seed: 11, mode: 'free' });
    const session = st().session!;
    const state: MatchState = structuredClone(session.state);
    state.sides.A.hand = [];
    useStore.setState({ session: { ...session, state }, draft: emptyDraft(state) });
    for (const slot of [0, 1, 2] as Slot[]) st().setAction(slot, { type: 'basic', target: { side: 'B', slot } });
    render(<Battle />);
    act(() => { st().confirm(); });
    const beats = st().beats;
    const first = beats.findIndex((b) => beatHaptic(b.events) === 'light');
    expect(first).toBeGreaterThan(0);
    expect(tg.p.haptic).not.toHaveBeenCalled();
    while (st().beatIndex < first) {
      act(() => { vi.advanceTimersByTime(beats[st().beatIndex]!.durationMs * 10); });
    }
    expect(tg.p.haptic).toHaveBeenCalledTimes(1);
    expect(tg.p.haptic).toHaveBeenCalledWith('light');
  });

  it('урон — лёгкая, смерть — средняя, прочее — ничего', () => {
    const ref = { side: 'B' as const, slot: 0 as Slot };
    const burn = { type: 'burn', target: ref, stacks: 1, dmg: 2, hp: 5 } as EngineEvent;
    const death = { type: 'death', side: 'B', slot: 0, heroId: 'aurora' } as EngineEvent;
    const heal = { type: 'heal', source: ref, target: ref, amount: 2, healed: 2, hp: 7 } as EngineEvent;
    expect(beatHaptic([burn])).toBe('light');
    expect(beatHaptic([burn, death])).toBe('medium');
    expect(beatHaptic([heal])).toBeNull();
  });

  it('результат: победа — success один раз, поражение — error', () => {
    st().startMatch(deckA, { opponentDeck: deckB, seed: 11, mode: 'free' });
    const finish = (winner: 'A' | 'B') => {
      const session = st().session!;
      const state = structuredClone(session.state);
      state.result = { winner, reason: 'wipe' };
      useStore.setState({ session: { ...session, state }, phase: 'finished' });
    };
    window.location.hash = '#/result';
    finish('A');
    const { rerender, unmount } = render(<Result />);
    rerender(<Result />);
    expect(tg.p.haptic).toHaveBeenCalledTimes(1);
    expect(tg.p.haptic).toHaveBeenCalledWith('success');
    unmount();
    render(<Result />);
    expect(tg.p.haptic).toHaveBeenCalledTimes(1);
    act(() => finish('B'));
    expect(tg.p.haptic).toHaveBeenLastCalledWith('error');
  });
});
