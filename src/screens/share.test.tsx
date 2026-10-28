import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HERO_IDS } from '../engine';
import type { Deck } from '../engine';
import { buildPreset } from '../game/decks/presets';
import { decodeChallenge, encodeChallenge } from '../game/links/codec';
import { defaultSave, type SaveV1 } from '../game/save/defaults';
import { SAVE_KEY } from '../game/save/storage';
import { ru } from '../i18n/ru';
import { setPlatformForTests } from '../platform';
import type { Platform, ShareResult } from '../platform';
import { createWebPlatform } from '../platform/web';
import { attachPersistence, hydrate, toSave, useStore } from '../store';
import { Menu } from './Menu';
import { Result } from './Result';

const st = () => useStore.getState();

/** Колода игрока со стартовой тройкой в начале: декодированная колода совпадает с ней как есть. */
const PLAYER: Deck = buildPreset('defense', [...HERO_IDS]);
const ENEMY: Deck = buildPreset('attack', [...HERO_IDS]);
const SENDER = 'Алексей';
const CHALLENGE_CODE = encodeChallenge({ v: 1, deck: ENEMY, seed: 99, name: SENDER });

let share: ReturnType<typeof vi.fn<(text: string, url: string) => Promise<ShareResult>>>;

/** Подменяет платформу: web с шпионом `share`; `user` — пользователь Telegram или null. */
function usePlatform(result: ShareResult = 'clipboard', user: Platform['user'] = null) {
  share = vi.fn<(text: string, url: string) => Promise<ShareResult>>().mockResolvedValue(result);
  setPlatformForTests({ ...createWebPlatform(window), share, user });
}

/** Реальный матч, доведённый до победы игрока. */
function finish(opts: { challenge?: boolean; tutorial?: boolean } = {}) {
  st().startMatch(PLAYER, {
    opponentDeck: ENEMY, seed: 11,
    ...(opts.tutorial ? { mode: 'tutorial' as const, tutorialId: 1 as const } : { mode: 'free' as const }),
    ...(opts.challenge ? { challenge: { name: SENDER, code: CHALLENGE_CODE } } : {}),
  });
  const session = st().session!;
  const state = structuredClone(session.state);
  state.result = { winner: 'A', reason: 'wipe' };
  useStore.setState({ session: { ...session, state }, phase: 'finished' });
}

/** Код вызова из второго аргумента `platform.share` (адрес вида `…#/c/<код>`). */
function sharedCode(): string {
  const url = share.mock.calls[0]![1];
  return url.slice(url.indexOf('#/c/') + 4);
}

function withActiveDeck() {
  st().upsertDeck({ id: 'd1', name: 'Моя', deck: PLAYER });
  st().setActiveDeck('d1');
}

const typeName = (value: string) => fireEvent.change(screen.getByTestId('name-input'), { target: { value } });

beforeEach(() => {
  hydrate(defaultSave());
  window.location.hash = '#/result';
  usePlatform();
});

afterEach(() => {
  setPlatformForTests(createWebPlatform(window));
});

describe('«Поделиться» на экране результата', () => {
  it('отправляет текст с ключевым моментом и ссылкой; код ссылки — колода игрока и его имя', async () => {
    st().setName('Оля');
    finish();
    render(<Result now={() => 2 ** 33 + 5} />);
    const moment = screen.getByTestId('key-moment').textContent!;
    fireEvent.click(screen.getByTestId('share'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const [text, url] = share.mock.calls[0]!;
    expect(text).toContain(moment);
    expect(text).toContain(url);
    expect(text).toContain('Оля');
    const c = decodeChallenge(sharedCode())!;
    expect(c.deck).toEqual(PLAYER);
    expect(c.name).toBe('Оля');
    expect(c.seed).toBe((2 ** 33 + 5) >>> 0);
  });

  it('результат «clipboard» — подсказка «Ссылка скопирована»', async () => {
    st().setName('Оля');
    finish();
    render(<Result />);
    fireEvent.click(screen.getByTestId('share'));
    expect(await screen.findByRole('status')).toHaveTextContent(ru.platform.copied);
  });

  it('результат «none» — подсказка «Не удалось поделиться»', async () => {
    usePlatform('none');
    st().setName('Оля');
    finish();
    render(<Result />);
    fireEvent.click(screen.getByTestId('share'));
    expect(await screen.findByRole('status')).toHaveTextContent(ru.platform.shareFailed);
  });

  it('результат «native» — без подсказки', async () => {
    usePlatform('native');
    st().setName('Оля');
    finish();
    render(<Result />);
    fireEvent.click(screen.getByTestId('share'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByRole('status')).toBeNull();
    expect(st().notice).toBeNull();
  });

  it('в браузере без имени сначала спрашивает имя; после ввода имя в профиле и в коде', async () => {
    finish();
    render(<Result />);
    fireEvent.click(screen.getByTestId('share'));
    expect(screen.getByText(ru.name.title)).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();
    const done = screen.getByTestId('name-done');
    expect(done).toBeDisabled();
    typeName('   ');
    expect(done).toBeDisabled();
    expect(screen.getByTestId('name-input')).toHaveAttribute('maxLength', '16');
    typeName('  Лена ');
    expect(done).toBeEnabled();
    fireEvent.click(done);
    expect(screen.queryByTestId('name-input')).toBeNull();
    expect(st().name).toBe('Лена');
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(decodeChallenge(sharedCode())!.name).toBe('Лена');
    expect(share.mock.calls[0]![0]).toContain('Лена');
  });

  it('второй раз имя уже не спрашивается', async () => {
    st().setName('Лена');
    finish();
    render(<Result />);
    fireEvent.click(screen.getByTestId('share'));
    expect(screen.queryByTestId('name-input')).toBeNull();
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  });

  it('в Telegram имя берётся у пользователя, без диалога и без записи в профиль', async () => {
    usePlatform('telegram', { id: '1', firstName: 'Лена' });
    finish();
    render(<Result />);
    fireEvent.click(screen.getByTestId('share'));
    expect(screen.queryByTestId('name-input')).toBeNull();
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(decodeChallenge(sharedCode())!.name).toBe('Лена');
    expect(st().name).toBeNull();
  });

  it('«Назад» платформы закрывает диалог имени без шаринга, следующее «Назад» — в меню', () => {
    finish();
    render(<Result />);
    fireEvent.click(screen.getByTestId('share'));
    expect(screen.getByTestId('name-input')).toBeInTheDocument();
    act(() => st().backHandler!());
    expect(screen.queryByTestId('name-input')).toBeNull();
    expect(share).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/result');
    act(() => st().backHandler!());
    expect(window.location.hash).toBe('#/');
  });

  it('уход с экрана с открытым диалогом не оставляет устаревший обработчик «Назад»', () => {
    finish();
    const { unmount } = render(<Result />);
    fireEvent.click(screen.getByTestId('share'));
    unmount();
    expect(st().backHandler).toBeNull();
  });

  it('«Поделиться» есть в свободном матче и нет после боя обучения', () => {
    finish();
    const first = render(<Result />);
    expect(screen.getByTestId('share')).toBeEnabled();
    first.unmount();
    finish({ tutorial: true });
    render(<Result />);
    expect(screen.queryByTestId('share')).toBeNull();
    expect(screen.queryByTestId('counter')).toBeNull();
  });
});

describe('«Ответный вызов»', () => {
  it('только в матче-вызове', () => {
    finish();
    const first = render(<Result />);
    expect(screen.queryByTestId('counter')).toBeNull();
    first.unmount();
    finish({ challenge: true });
    render(<Result />);
    const counter = screen.getByTestId('counter');
    expect(counter).toHaveTextContent(ru.challenge.counter);
    expect(counter).toBeEnabled();
    expect(counter).not.toHaveAttribute('title');
  });

  it('шлёт свой вызов: колода игрока из этого матча и его имя', async () => {
    st().setName('Оля');
    finish({ challenge: true });
    render(<Result />);
    fireEvent.click(screen.getByTestId('counter'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const c = decodeChallenge(sharedCode())!;
    expect(c.deck).toEqual(PLAYER);
    expect(c.name).toBe('Оля');
  });
});

describe('«Вызвать друга» в меню', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('отключена без активной колоды', () => {
    render(<Menu />);
    expect(screen.getByTestId('invite')).toBeDisabled();
    expect(screen.getByTestId('invite')).toHaveTextContent(ru.menu.invite);
  });

  it('с активной колодой шлёт вызов без ключевого момента', async () => {
    st().setName('Оля');
    withActiveDeck();
    render(<Menu now={() => 4242} />);
    fireEvent.click(screen.getByTestId('invite'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]![0]).toContain(ru.share.noMoment);
    const c = decodeChallenge(sharedCode())!;
    expect(c.deck).toEqual(PLAYER);
    expect(c.name).toBe('Оля');
    expect(c.seed).toBe(4242);
    expect(await screen.findByRole('status')).toHaveTextContent(ru.platform.copied);
  });

  it('без имени спрашивает его и тоже шлёт', async () => {
    withActiveDeck();
    render(<Menu />);
    fireEvent.click(screen.getByTestId('invite'));
    typeName('Лена');
    fireEvent.click(screen.getByTestId('name-done'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(decodeChallenge(sharedCode())!.name).toBe('Лена');
  });

  it('старая подсказка не переживает переход на другой экран', () => {
    st().setNotice('copied');
    render(<Menu />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(st().notice).toBeNull();
  });
});

describe('имя игрока', () => {
  it('setName обрезает пробелы и длину, пустое игнорирует', () => {
    st().setName('  Оля  ');
    expect(st().name).toBe('Оля');
    st().setName('   ');
    expect(st().name).toBe('Оля');
    st().setName('Александра-Виктория');
    expect(st().name).toBe('Александра-Викто');
  });

  it('переживает toSave → hydrate; без имени поле в сохранении отсутствует', () => {
    expect(toSave(st()).profile).not.toHaveProperty('name');
    st().setName('Лена');
    const save = JSON.parse(JSON.stringify(toSave(st()))) as SaveV1;
    expect(save.profile.name).toBe('Лена');
    hydrate(defaultSave());
    expect(st().name).toBeNull();
    hydrate(save);
    expect(st().name).toBe('Лена');
  });

  it('setName записывается в сохранение', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    };
    const detach = attachPersistence(storage);
    try {
      st().setName('Лена');
      expect(JSON.parse(map.get(SAVE_KEY)!).profile.name).toBe('Лена');
    } finally {
      detach();
    }
  });
});
