import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CARDS, HEROES, HERO_IDS } from '../engine';
import type { Deck } from '../engine';
import { buildPreset } from '../game/decks/presets';
import { defaultSave } from '../game/save/defaults';
import { fmt, ru } from '../i18n/ru';
import { hydrate, useStore } from '../store';
import { DeckBuilder } from './DeckBuilder';
import { Decks } from './Decks';

const st = () => useStore.getState();

function unlockAll() {
  st().unlock([...HERO_IDS]);
}

/** Колода в сторе: сбалансированный пресет из всех 12 героинь. */
function seedDeck(id = 'd1', name = 'Моя колода', deck: Deck = buildPreset('balanced', [...HERO_IDS])) {
  st().upsertDeck({ id, name, deck });
  return deck;
}

beforeEach(() => {
  hydrate(defaultSave());
  window.location.hash = '#/decks';
});

describe('список колод', () => {
  it('меньше шести открытых: кнопки скрыты, подсказка про обучение', () => {
    render(<Decks />);
    expect(screen.getByText(ru.decks.needSix)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ru.decks.new })).toBeNull();
    expect(screen.queryByRole('button', { name: ru.decks.autoBuild })).toBeNull();
  });

  it('«Новая колода» создаёт «Колода N» из сбалансированного пресета и открывает конструктор', () => {
    unlockAll();
    seedDeck();
    render(<Decks />);
    fireEvent.click(screen.getByRole('button', { name: ru.decks.new }));
    const created = st().decks[1]!;
    expect(created.name).toBe(fmt(ru.decks.defaultName, { n: 2 }));
    expect(created.deck).toEqual(buildPreset('balanced', st().unlocked));
    expect(window.location.hash).toBe(`#/decks/${encodeURIComponent(created.id)}`);
  });

  it('«Собрать за меня → Защита» при 12 открытых даёт колоду с двумя стражами и ведёт в конструктор', () => {
    unlockAll();
    render(<Decks />);
    fireEvent.click(screen.getByRole('button', { name: ru.decks.autoBuild }));
    fireEvent.click(screen.getByTestId('sheet-item-defense'));
    expect(st().decks).toHaveLength(1);
    const created = st().decks[0]!;
    expect(created.name).toBe(ru.decks.archetypes.defense);
    expect(created.deck.heroes.filter((h) => HEROES[h].role === 'guardian')).toHaveLength(2);
    expect(window.location.hash).toBe(`#/decks/${encodeURIComponent(created.id)}`);
  });

  it('тап по строке делает колоду активной', () => {
    unlockAll();
    seedDeck('d1', 'Первая');
    seedDeck('d2', 'Вторая');
    render(<Decks />);
    fireEvent.click(screen.getByRole('button', { name: /Вторая/ }));
    expect(st().activeDeckId).toBe('d2');
    expect(screen.getByTestId('deck-row-d2')).toHaveTextContent(ru.decks.active);
  });

  it('«Изменить» открывает конструктор', () => {
    seedDeck('d1');
    render(<Decks />);
    fireEvent.click(within(screen.getByTestId('deck-row-d1')).getByRole('button', { name: ru.decks.edit }));
    expect(window.location.hash).toBe('#/decks/d1');
  });

  it('удаление требует подтверждения', () => {
    seedDeck('d1');
    render(<Decks />);
    const row = () => screen.getByTestId('deck-row-d1');
    fireEvent.click(within(row()).getByRole('button', { name: ru.decks.delete }));
    expect(st().decks).toHaveLength(1);
    expect(row()).toHaveTextContent(ru.decks.confirmDelete);
    fireEvent.click(within(row()).getByRole('button', { name: ru.decks.no }));
    expect(st().decks).toHaveLength(1);
    fireEvent.click(within(row()).getByRole('button', { name: ru.decks.delete }));
    fireEvent.click(within(row()).getByRole('button', { name: ru.decks.yes }));
    expect(st().decks).toHaveLength(0);
  });
});

describe('конструктор колоды', () => {
  beforeEach(() => {
    unlockAll();
  });

  const saveButton = () => screen.getByTestId('save-deck');

  it('неизвестная колода возвращает к списку', () => {
    window.location.hash = '#/decks/nope';
    render(<DeckBuilder id="nope" />);
    expect(window.location.hash).toBe('#/decks');
  });

  it('третья копия карты недоступна в списке выбора', () => {
    const deck = seedDeck();
    // В сбалансированной колоде по одной копии; добавим вторую копию первой карты в слот 1.
    const card = deck.cards[0]!;
    render(<DeckBuilder id="d1" />);
    fireEvent.click(screen.getByTestId('card-slot-1'));
    fireEvent.click(screen.getByTestId(`pick-card-${card}`));
    expect(screen.getByTestId('card-slot-1')).toHaveTextContent(CARDS[card].name);
    expect(saveButton()).toBeEnabled();
    fireEvent.click(screen.getByTestId('card-slot-2'));
    expect(screen.getByTestId(`pick-card-${card}`)).toBeDisabled();
    expect(screen.getByTestId(`pick-card-${card}`)).toHaveTextContent(fmt(ru.decks.copies, { n: 2, max: 2 }));
  });

  it('третья копия карты показывает ошибку и блокирует «Сохранить»', () => {
    const deck = buildPreset('balanced', [...HERO_IDS]);
    const card = deck.cards[0]!;
    seedDeck('d1', 'Плохая', { ...deck, cards: [card, card, card, ...deck.cards.slice(3)] });
    render(<DeckBuilder id="d1" />);
    expect(screen.getByTestId('deck-errors')).toHaveTextContent(fmt(ru.deckErrors.copies, { name: CARDS[card].name }));
    expect(saveButton()).toBeDisabled();
  });

  it('стрелка вверх переносит героиню из резерва в стартовую тройку', () => {
    const deck = seedDeck();
    render(<DeckBuilder id="d1" />);
    const reserveFirst = deck.heroes[3]!;
    const startingLast = deck.heroes[2]!;
    expect(screen.getByTestId('hero-slot-2')).toHaveTextContent(ru.decks.starting);
    expect(screen.getByTestId('hero-slot-3')).toHaveTextContent(ru.decks.reserve);
    fireEvent.click(screen.getByTestId('hero-up-3'));
    expect(screen.getByTestId('hero-slot-2')).toHaveTextContent(HEROES[reserveFirst].name);
    expect(screen.getByTestId('hero-slot-3')).toHaveTextContent(HEROES[startingLast].name);
    fireEvent.click(saveButton());
    const saved = st().decks[0]!.deck;
    expect(saved.starting.map((i) => saved.heroes[i])).toEqual([deck.heroes[0], deck.heroes[1], reserveFirst]);
  });

  it('выбор героини: в списке только открытые и не взятые, с фильтром по роли', () => {
    hydrate(defaultSave());
    st().unlock(['tali', 'zefira', 'liraya', 'aurora', 'kira']);
    // Открыты 9: aira fenna nerisa justina tali zefira liraya aurora kira.
    const deck = buildPreset('balanced', st().unlocked);
    seedDeck('d1', 'Моя', deck);
    render(<DeckBuilder id="d1" />);
    fireEvent.click(screen.getByTestId('hero-slot-0'));
    const free = st().unlocked.filter((h) => !deck.heroes.includes(h));
    for (const h of free) expect(screen.getByTestId(`pick-hero-${h}`)).toBeInTheDocument();
    for (const h of deck.heroes) expect(screen.queryByTestId(`pick-hero-${h}`)).toBeNull();
    expect(screen.queryByTestId('pick-hero-nokta')).toBeNull();
    const guardian = free.find((h) => HEROES[h].role === 'guardian');
    fireEvent.click(screen.getByRole('button', { name: ru.roles.guardian }));
    for (const h of free) {
      if (HEROES[h].role === 'guardian') expect(screen.getByTestId(`pick-hero-${h}`)).toBeInTheDocument();
      else expect(screen.queryByTestId(`pick-hero-${h}`)).toBeNull();
    }
    if (guardian) {
      fireEvent.click(screen.getByTestId(`pick-hero-${guardian}`));
      expect(screen.getByTestId('hero-slot-0')).toHaveTextContent(HEROES[guardian].name);
    }
  });

  it('сохранение обновляет стор', () => {
    seedDeck();
    render(<DeckBuilder id="d1" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('maxLength', '20');
    fireEvent.change(input, { target: { value: 'Новое имя' } });
    expect(st().decks[0]!.name).toBe('Моя колода');
    fireEvent.click(saveButton());
    expect(st().decks[0]!.name).toBe('Новое имя');
  });

  it('пустое имя блокирует «Сохранить»', () => {
    seedDeck();
    render(<DeckBuilder id="d1" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect(saveButton()).toBeDisabled();
  });

  it('сводка считает Reaction и карты Луны', () => {
    seedDeck('d1', 'Контроль', buildPreset('control', [...HERO_IDS]));
    render(<DeckBuilder id="d1" />);
    // Контроль: moonTurn, moonReverse, eclipse — три карты Луны; Reaction нет.
    expect(screen.getByTestId('summary-moon')).toHaveTextContent('3');
    expect(screen.getByTestId('summary-reaction')).toHaveTextContent('0');
  });

  it('«Назад» с изменениями спрашивает подтверждение и не сохраняет', () => {
    seedDeck();
    window.location.hash = '#/decks/d1';
    render(<DeckBuilder id="d1" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Другое' } });
    fireEvent.click(screen.getByRole('button', { name: ru.common.back }));
    expect(screen.getByText(ru.decks.discard)).toBeInTheDocument();
    expect(window.location.hash).toBe('#/decks/d1');
    fireEvent.click(screen.getByRole('button', { name: ru.decks.yes }));
    expect(window.location.hash).toBe('#/decks');
    expect(st().decks[0]!.name).toBe('Моя колода');
  });

  it('«Назад» без изменений сразу ведёт к списку', () => {
    seedDeck();
    window.location.hash = '#/decks/d1';
    render(<DeckBuilder id="d1" />);
    fireEvent.click(screen.getByRole('button', { name: ru.common.back }));
    expect(window.location.hash).toBe('#/decks');
  });
});
