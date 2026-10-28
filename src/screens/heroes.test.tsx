import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { HEROES, HERO_IDS } from '../engine';
import { ULTIMATE_ENERGY_COST } from '../engine/validate';
import { buildPreset } from '../game/decks/presets';
import { defaultSave } from '../game/save/defaults';
import { fmt, ru } from '../i18n/ru';
import { hydrate, useStore } from '../store';
import { HeroDetail } from './HeroDetail';
import { Heroes } from './Heroes';

const st = () => useStore.getState();

beforeEach(() => {
  hydrate(defaultSave());
  window.location.hash = '#/heroes';
});

describe('сетка героинь', () => {
  it('показывает 12 плиток; при 4 открытых у 8 класс locked и подпись «Закрыта»', () => {
    render(<Heroes />);
    const tiles = HERO_IDS.map((id) => screen.getByTestId(`hero-tile-${id}`));
    expect(tiles).toHaveLength(12);
    const locked = tiles.filter((t) => t.classList.contains('locked'));
    expect(locked).toHaveLength(8);
    for (const t of locked) expect(within(t).getByText(ru.heroes.locked)).toBeInTheDocument();
    expect(screen.getAllByText(ru.heroes.locked)).toHaveLength(8);
  });

  it('фильтр «Огонь» оставляет 2 плитки, повторный тап снимает его', () => {
    render(<Heroes />);
    fireEvent.click(screen.getByRole('button', { name: ru.elements.fire }));
    expect(screen.getAllByTestId(/^hero-tile-/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: ru.elements.fire }));
    expect(screen.getAllByTestId(/^hero-tile-/)).toHaveLength(12);
  });

  it('фильтры стихии и роли складываются, второй выбор в группе заменяет первый', () => {
    render(<Heroes />);
    fireEvent.click(screen.getByRole('button', { name: ru.elements.fire }));
    fireEvent.click(screen.getByRole('button', { name: ru.roles.mage }));
    expect(screen.getAllByTestId(/^hero-tile-/)).toHaveLength(1);
    expect(screen.getByTestId('hero-tile-aira')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: ru.elements.water }));
    expect(screen.getByRole('button', { name: ru.elements.fire })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByTestId(/^hero-tile-/)).toHaveLength(1);
    expect(screen.getByTestId('hero-tile-tali')).toBeInTheDocument();
  });

  it('тап по закрытой плитке ничего не делает', () => {
    render(<Heroes />);
    fireEvent.click(screen.getByTestId('hero-tile-tali'));
    expect(window.location.hash).toBe('#/heroes');
  });

  it('тап по открытой плитке ведёт на экран героини', () => {
    render(<Heroes />);
    fireEvent.click(screen.getByTestId('hero-tile-aira'));
    expect(window.location.hash).toBe('#/heroes/aira');
  });

  it('«Назад» ведёт в меню', () => {
    render(<Heroes />);
    fireEvent.click(screen.getByRole('button', { name: ru.common.back }));
    expect(window.location.hash).toBe('#/');
  });
});

describe('экран героини', () => {
  it('показывает характеристики, пассивку, умение и ульту', () => {
    render(<HeroDetail id="aira" />);
    const h = HEROES.aira;
    expect(screen.getByRole('heading', { name: h.name })).toBeInTheDocument();
    expect(screen.getByText(`${ru.heroes.hp} ${h.hp}`)).toBeInTheDocument();
    expect(screen.getByText(`${ru.heroes.atk} ${h.atk}`)).toBeInTheDocument();
    expect(screen.getByText(`${ru.heroes.spd} ${h.spd}`)).toBeInTheDocument();
    expect(screen.getByText(h.passive.name)).toBeInTheDocument();
    expect(screen.getByText(h.passive.text)).toBeInTheDocument();
    expect(screen.getByText(h.skill.name)).toBeInTheDocument();
    expect(screen.getByText(fmt(ru.heroes.skillCost, { n: h.skill.cost }))).toBeInTheDocument();
    expect(screen.getByText(ru.abilities.aira.skill)).toBeInTheDocument();
    expect(screen.getByText(h.ultimate.name)).toBeInTheDocument();
    expect(screen.getByText(fmt(ru.heroes.ultCost, { energy: ULTIMATE_ENERGY_COST }))).toBeInTheDocument();
    expect(screen.getByText(ru.abilities.aira.ultimate)).toBeInTheDocument();
  });

  it('стоимость умения берётся из данных: 1⚡ и 2⚡', () => {
    const { unmount } = render(<HeroDetail id="fenna" />);
    expect(screen.getByText('1⚡')).toBeInTheDocument();
    unmount();
    render(<HeroDetail id="aira" />);
    expect(screen.getByText('2⚡')).toBeInTheDocument();
  });

  it('у каждой героини есть тексты умения и ульты', () => {
    for (const id of HERO_IDS) {
      expect(ru.abilities[id].skill.length).toBeGreaterThan(0);
      expect(ru.abilities[id].ultimate.length).toBeGreaterThan(0);
    }
  });

  it('«В колоду» недоступна без активной колоды', () => {
    render(<HeroDetail id="aira" />);
    expect(screen.getByTestId('to-deck')).toBeDisabled();
    expect(screen.getByText(ru.heroes.noDeck)).toBeInTheDocument();
  });

  it('«В колоду» недоступна, если она уже в активной колоде', () => {
    st().unlock([...HERO_IDS]);
    const deck = buildPreset('balanced', [...HERO_IDS]);
    st().upsertDeck({ id: 'd1', name: 'Д', deck });
    st().setActiveDeck('d1');
    render(<HeroDetail id={deck.heroes[0]!} />);
    expect(screen.getByTestId('to-deck')).toBeDisabled();
    expect(screen.getByText(ru.heroes.inDeck)).toBeInTheDocument();
  });

  it('«В колоду» заменяет последний слот резерва и ведёт в конструктор', () => {
    st().unlock([...HERO_IDS]);
    const deck = buildPreset('balanced', [...HERO_IDS]);
    const newcomer = HERO_IDS.find((h) => !deck.heroes.includes(h))!;
    st().upsertDeck({ id: 'd1', name: 'Д', deck });
    st().setActiveDeck('d1');
    render(<HeroDetail id={newcomer} />);
    const btn = screen.getByTestId('to-deck');
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    const saved = st().decks[0]!.deck;
    expect(saved.heroes[5]).toBe(newcomer);
    expect(saved.heroes.slice(0, 5)).toEqual(deck.heroes.slice(0, 5));
    expect(saved.cards).toEqual(deck.cards);
    expect(saved.starting).toEqual(deck.starting);
    expect(deck.heroes).not.toContain(newcomer);
    expect(window.location.hash).toBe('#/decks/d1');
    expect(screen.getByText(ru.heroes.added)).toBeInTheDocument();
  });

  it('закрытая героиня: только «Закрыта» и «Назад»', () => {
    render(<HeroDetail id="tali" />);
    expect(screen.getByText(ru.heroes.locked)).toBeInTheDocument();
    expect(screen.queryByTestId('to-deck')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: ru.common.back }));
    expect(window.location.hash).toBe('#/heroes');
  });

  it('неизвестный id: «Скоро» и только «Назад»', () => {
    // @ts-expect-error неизвестный id приходит из адресной строки
    render(<HeroDetail id="nobody" />);
    expect(screen.getByText(ru.common.soon)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: ru.common.back })).toBeInTheDocument();
    expect(screen.queryByTestId('to-deck')).toBeNull();
  });

  it('«Назад» на открытой героине ведёт к сетке', () => {
    render(<HeroDetail id="aira" />);
    fireEvent.click(screen.getByRole('button', { name: ru.common.back }));
    expect(window.location.hash).toBe('#/heroes');
  });
});
