import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { HEROES, HERO_IDS } from '../engine';
import type { EngineEvent, SideCommands } from '../engine';
import { buildPreset } from '../game/decks/presets';
import { decodeChallenge, encodeChallenge } from '../game/links/codec';
import { defaultSave, type SaveV1 } from '../game/save/defaults';
import { fmt, ru } from '../i18n/ru';
import { setPlatformForTests } from '../platform';
import { createWebPlatform } from '../platform/web';
import { hydrate, toSave, useStore } from '../store';
import { Challenge } from './Challenge';
import { Result } from './Result';

const st = () => useStore.getState();

const SENDER_DECK = buildPreset('attack', [...HERO_IDS]);
const SEED = 123456789;
const NAME = 'Алексей';
const CODE = encodeChallenge({ v: 1, deck: SENDER_DECK, seed: SEED, name: NAME });
/** Колода отправителя так, как её видит получатель (стартовая тройка в начале). */
const GHOST = decodeChallenge(CODE)!.deck;

const accept = () => fireEvent.click(screen.getByTestId('accept'));

/** Подтверждает первый раунд базовыми атаками и возвращает команды противника из события `reveal`. */
function firstRoundBotCommands(): SideCommands {
  for (const slot of [0, 1, 2] as const) st().setAction(slot, { type: 'basic', target: { side: 'B', slot } });
  act(() => { st().confirm(); });
  const reveal = st().lastEvents.find(
    (e): e is Extract<EngineEvent, { type: 'reveal' }> => e.type === 'reveal' && e.round === 1,
  );
  expect(reveal).toBeDefined();
  return reveal!.commands.B;
}

/** Завершает текущий матч победой игрока. */
function finishCurrent() {
  const session = st().session!;
  const state = structuredClone(session.state);
  state.result = { winner: 'A', reason: 'wipe' };
  useStore.setState({ session: { ...session, state }, phase: 'finished' });
}

beforeEach(() => {
  hydrate(defaultSave());
  window.location.hash = `#/c/${CODE}`;
});

afterEach(() => {
  setPlatformForTests(createWebPlatform(window));
});

describe('экран вызова', () => {
  it('валидный код: заголовок с именем и шесть героинь отправителя', () => {
    render(<Challenge code={CODE} />);
    expect(screen.getByRole('heading')).toHaveTextContent(fmt(ru.challenge.title, { name: NAME }));
    const starting = within(screen.getByTestId('challenge-starting')).getAllByRole('img');
    const reserve = within(screen.getByTestId('challenge-reserve')).getAllByRole('img');
    expect(starting.map((el) => el.getAttribute('aria-label')))
      .toEqual(GHOST.heroes.slice(0, 3).map((h) => HEROES[h].name));
    expect(reserve.map((el) => el.getAttribute('aria-label')))
      .toEqual(GHOST.heroes.slice(3).map((h) => HEROES[h].name));
    expect(screen.getByRole('button', { name: ru.challenge.accept })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ru.challenge.menu })).toBeInTheDocument();
  });

  it('битый код: сообщение об ошибке и только «В меню»', () => {
    render(<Challenge code="garbage!!" />);
    expect(screen.getByText(ru.challenge.invalid)).toBeInTheDocument();
    expect(screen.queryByTestId('accept')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ru.challenge.menu }));
    expect(window.location.hash).toBe('#/');
  });

  it('«Назад» платформы ведёт в меню', () => {
    render(<Challenge code={CODE} />);
    const back = st().backHandler;
    expect(back).not.toBeNull();
    act(() => back!());
    expect(window.location.hash).toBe('#/');
  });

  it('«Принять вызов» стартует матч против колоды и seed отправителя и ведёт в бой', () => {
    const deck = buildPreset('defense', [...HERO_IDS]);
    st().upsertDeck({ id: 'd1', name: 'Моя', deck });
    st().setActiveDeck('d1');
    render(<Challenge code={CODE} />);
    accept();
    const s = st().session!;
    expect(s.playerDeck).toEqual(deck);
    expect(s.opponentDeck).toEqual(GHOST);
    expect(s.botSeed).toBe(SEED);
    expect(s.mode).toBe('free');
    expect(s.challenge).toEqual({ name: NAME, code: CODE });
    expect(st().phase).toBe('planning');
    expect(window.location.hash).toBe('#/battle');
  });

  it('без активной колоды играет временной, не сохраняя её и не открывая героинь', () => {
    const unlocked = st().unlocked;
    render(<Challenge code={CODE} />);
    accept();
    expect(st().session!.playerDeck).toEqual(buildPreset('balanced', [...HERO_IDS]));
    expect(st().decks).toEqual([]);
    expect(st().activeDeckId).toBeNull();
    expect(st().unlocked).toEqual(unlocked);
  });

  it('два принятия одного кода дают одинаковые команды призрака в первом раунде', () => {
    const first = render(<Challenge code={CODE} />);
    accept();
    const a = firstRoundBotCommands();
    first.unmount();
    hydrate(defaultSave());
    render(<Challenge code={CODE} />);
    accept();
    const b = firstRoundBotCommands();
    expect(b).toEqual(a);
  });
});

describe('результат матча-вызова', () => {
  it('toSave → hydrate сохраняет вызов, результат показывает имя', () => {
    render(<Challenge code={CODE} />).unmount();
    st().startMatch(GHOST, { opponentDeck: GHOST, seed: SEED, mode: 'free', challenge: { name: NAME, code: CODE } });
    finishCurrent();
    const save = JSON.parse(JSON.stringify(toSave(st()))) as SaveV1;
    expect(save.match?.challenge).toEqual({ name: NAME, code: CODE });
    hydrate(defaultSave());
    hydrate(save);
    expect(st().session!.challenge).toEqual({ name: NAME, code: CODE });
    render(<Result />);
    expect(screen.getByText(fmt(ru.challenge.resultVs, { name: NAME }))).toBeInTheDocument();
  });

  it('«Ещё раз» повторяет тот же вызов с тем же seed', () => {
    render(<Challenge code={CODE} />);
    accept();
    const before = st().session!;
    finishCurrent();
    window.location.hash = '#/result';
    render(<Result now={() => 777} />);
    fireEvent.click(screen.getByRole('button', { name: ru.result.again }));
    const s = st().session!;
    expect(s.botSeed).toBe(SEED);
    expect(s.opponentDeck).toEqual(GHOST);
    expect(s.playerDeck).toEqual(before.playerDeck);
    expect(s.challenge).toEqual({ name: NAME, code: CODE });
    expect(s.state.result).toBeNull();
    expect(window.location.hash).toBe('#/battle');
  });

  it('кнопка «Ответный вызов» есть и активна', () => {
    render(<Challenge code={CODE} />).unmount();
    st().startMatch(GHOST, { opponentDeck: GHOST, seed: SEED, mode: 'free', challenge: { name: NAME, code: CODE } });
    finishCurrent();
    render(<Result />);
    const counter = screen.getByRole('button', { name: ru.challenge.counter });
    expect(counter).toBeEnabled();
    expect(counter).not.toHaveAttribute('title');
  });

  it('в обычном матче нет ни подзаголовка вызова, ни «Ответного вызова»', () => {
    st().startMatch(GHOST, { opponentDeck: GHOST, seed: SEED, mode: 'free' });
    finishCurrent();
    render(<Result />);
    expect(st().session!.challenge).toBeUndefined();
    expect(screen.queryByText(fmt(ru.challenge.resultVs, { name: NAME }))).toBeNull();
    expect(screen.queryByRole('button', { name: ru.challenge.counter })).toBeNull();
  });
});

describe('startParam при запуске', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  it('код вызова в startParam ведёт на #/c/<код> и показывает вызов', async () => {
    window.location.hash = '';
    setPlatformForTests({ ...createWebPlatform(window), startParam: CODE });
    render(<App />);
    expect(window.location.hash).toBe(`#/c/${CODE}`);
    expect(await screen.findByTestId('accept')).toBeInTheDocument();
  });

  it('мусорный startParam ведёт на экран «ссылка повреждена»', async () => {
    window.location.hash = '';
    setPlatformForTests({ ...createWebPlatform(window), startParam: 'garbage!!' });
    render(<App />);
    expect(window.location.hash).toBe('#/c/garbage!!');
    expect(await screen.findByText(ru.challenge.invalid)).toBeInTheDocument();
  });

  it('пустой startParam оставляет меню', () => {
    window.location.hash = '';
    setPlatformForTests({ ...createWebPlatform(window), startParam: '' });
    render(<App />);
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('button', { name: ru.menu.play })).toBeInTheDocument();
  });

  it('повторный запуск в той же сессии (перезагрузка) с тем же параметром не уводит на вызов', async () => {
    window.location.hash = '';
    setPlatformForTests({ ...createWebPlatform(window), startParam: CODE });
    const first = render(<App />);
    expect(window.location.hash).toBe(`#/c/${CODE}`);
    await screen.findByTestId('accept');
    first.unmount();

    window.location.hash = '#/decks';
    render(<App />);
    expect(window.location.hash).toBe('#/decks');
  });
});
