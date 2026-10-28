import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARDS } from '../engine/data/cards';
import { HEROES } from '../engine/data/heroes';
import type { ViewHero } from '../game/playback/types';
import { ru } from '../i18n/ru';
import { ActionSheet } from './ActionSheet';
import { Button } from './Button';
import { CardView } from './CardView';
import { FloatingNumber } from './FloatingNumber';
import { Hand } from './Hand';
import { HeroArt } from './HeroArt';
import { HeroCard } from './HeroCard';
import { MoonWidget } from './MoonWidget';
import { Overlay } from './Overlay';
import { ResourceBar } from './ResourceBar';
import { ReserveCard } from './ReserveCard';
import { StatusIcon } from './StatusIcon';

const fenna: ViewHero = { heroId: 'fenna', hp: 24, maxHp: 24, shield: 0, statuses: [], alive: true };

describe('Button', () => {
  it('зовёт onClick, а в состоянии disabled — нет', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button variant="primary" onClick={onClick}>{ru.battle.confirm}</Button>);
    await userEvent.click(screen.getByRole('button', { name: ru.battle.confirm }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button variant="primary" disabled onClick={onClick}>{ru.battle.confirm}</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('HeroArt', () => {
  it('рисует круг с инициалом и подписью имени', () => {
    render(<HeroArt heroId="aira" size="lg" />);
    const art = screen.getByRole('img', { name: HEROES.aira.name });
    expect(art).toHaveTextContent(HEROES.aira.name[0]!);
  });
});

describe('StatusIcon', () => {
  it('показывает короткий код, стаки больше одного и название в title', () => {
    const { rerender } = render(<StatusIcon status={{ id: 'burn', value: 2, stacks: 3, expiresAtRound: null }} />);
    const icon = screen.getByTitle(ru.statuses.burn.name);
    expect(icon).toHaveTextContent(ru.statuses.burn.short);
    expect(icon.querySelector('sup')).toHaveTextContent('3');
    rerender(<StatusIcon status={{ id: 'burn', value: 2, stacks: 1, expiresAtRound: null }} />);
    expect(screen.getByTitle(ru.statuses.burn.name).querySelector('sup')).toBeNull();
  });
});

describe('HeroCard', () => {
  it('показывает имя и HP 24/24', () => {
    render(<HeroCard hero={fenna} side="A" slot={0} />);
    const card = screen.getByTestId('hero-A-0');
    expect(card).toHaveTextContent(HEROES.fenna.name);
    expect(card).toHaveTextContent('24/24');
    expect(card).not.toHaveClass('dead');
  });

  it('павшая героиня получает класс dead', () => {
    render(<HeroCard hero={{ ...fenna, hp: 0, alive: false }} side="B" slot={2} />);
    expect(screen.getByTestId('hero-B-2')).toHaveClass('dead');
  });

  it('показывает щит, статусы и чип действия с целью', () => {
    const hero: ViewHero = {
      ...fenna, hp: 12, shield: 5,
      statuses: [{ id: 'burn', value: 2, stacks: 2, expiresAtRound: null }],
    };
    const { rerender } = render(
      <HeroCard hero={hero} side="A" slot={1} selected chip={{ type: 'skill', target: { side: 'B', slot: 1 } }} />,
    );
    const card = screen.getByTestId('hero-A-1');
    expect(card).toHaveClass('selected');
    expect(card).toHaveTextContent('12/24');
    expect(within(card).getByTestId('shield')).toHaveTextContent('5');
    expect(within(card).getByTitle(ru.statuses.burn.name)).toBeInTheDocument();
    expect(within(card).getByText(`${ru.battle.actions.skill} → B2`)).toBeInTheDocument();
    rerender(<HeroCard hero={hero} side="A" slot={1} dimmed chip={{ type: 'swap', reserveIndex: 0 }} />);
    expect(card).toHaveClass('dimmed');
    expect(within(card).getByText(`${ru.battle.actions.swap} → R1`)).toBeInTheDocument();
  });

  describe('нажатия', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('короткий тап зовёт onTap', () => {
      const onTap = vi.fn();
      const onLongPress = vi.fn();
      render(<HeroCard hero={fenna} side="A" slot={0} onTap={onTap} onLongPress={onLongPress} />);
      const card = screen.getByTestId('hero-A-0');
      fireEvent.pointerDown(card);
      fireEvent.pointerUp(card);
      fireEvent.click(card);
      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onLongPress).not.toHaveBeenCalled();
    });

    it('удержание 500 мс зовёт onLongPress и не зовёт onTap', () => {
      vi.useFakeTimers();
      const onTap = vi.fn();
      const onLongPress = vi.fn();
      render(<HeroCard hero={fenna} side="B" slot={0} onTap={onTap} onLongPress={onLongPress} />);
      const card = screen.getByTestId('hero-B-0');
      fireEvent.pointerDown(card);
      act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(onLongPress).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      fireEvent.pointerUp(card);
      fireEvent.click(card);
      expect(onLongPress).toHaveBeenCalledTimes(1);
      expect(onTap).not.toHaveBeenCalled();
      fireEvent.pointerDown(card);
      fireEvent.pointerUp(card);
      fireEvent.click(card);
      expect(onTap).toHaveBeenCalledTimes(1);
    });
  });
});

describe('ReserveCard', () => {
  it('показывает имя, класс dead и зовёт onTap', async () => {
    const onTap = vi.fn();
    const { rerender } = render(<ReserveCard hero={fenna} side="A" index={1} onTap={onTap} />);
    const card = screen.getByTestId('reserve-A-1');
    expect(card).toHaveTextContent(HEROES.fenna.name);
    expect(card).not.toHaveClass('dead');
    await userEvent.click(card);
    expect(onTap).toHaveBeenCalledTimes(1);
    rerender(<ReserveCard hero={{ ...fenna, hp: 0, alive: false }} side="A" index={1} onTap={onTap} />);
    expect(card).toHaveClass('dead');
  });
});

describe('MoonWidget', () => {
  it('подпись и эффект меняются с фазой', () => {
    const { rerender } = render(<MoonWidget phase="new" eclipse={false} bloodMoon={false} />);
    const moon = screen.getByTestId('moon');
    expect(moon).toHaveTextContent(ru.moon.new.name);
    expect(moon).toHaveTextContent(ru.moon.new.effect);
    rerender(<MoonWidget phase="full" eclipse={false} bloodMoon={false} />);
    expect(moon).toHaveTextContent(ru.moon.full.name);
    expect(moon).toHaveTextContent(ru.moon.full.effect);
    expect(moon).not.toHaveTextContent(ru.moon.new.name);
    expect(moon.querySelector('svg')).toHaveAttribute('data-phase', 'full');
  });

  it('показывает метки затмения и Кровавой Луны', () => {
    const { rerender } = render(<MoonWidget phase="waning" eclipse={false} bloodMoon={false} />);
    expect(screen.queryByText(ru.battle.eclipse)).toBeNull();
    expect(screen.queryByText(ru.battle.bloodMoon)).toBeNull();
    rerender(<MoonWidget phase="waning" eclipse bloodMoon />);
    expect(screen.getByText(ru.battle.eclipse)).toBeInTheDocument();
    expect(screen.getByText(ru.battle.bloodMoon)).toBeInTheDocument();
  });
});

describe('ResourceBar', () => {
  it('считает точки энергии и полумесяцы Luna', () => {
    render(<ResourceBar energy={3} energyMax={5} spent={1} luna={2} />);
    const bar = screen.getByTestId('energy');
    expect(bar.querySelectorAll('[data-dot="filled"]')).toHaveLength(2);
    expect(bar.querySelectorAll('[data-dot="spent"]')).toHaveLength(1);
    expect(bar.querySelectorAll('[data-dot="empty"]')).toHaveLength(2);
    expect(bar.querySelectorAll('[data-luna="on"]')).toHaveLength(2);
    expect(bar.querySelectorAll('[data-luna="off"]')).toHaveLength(3);
  });

  it('подсвечивает перерасход энергии', () => {
    render(<ResourceBar energy={2} energyMax={5} spent={3} luna={0} />);
    const bar = screen.getByTestId('energy');
    expect(bar).toHaveClass('over');
    expect(bar.querySelectorAll('[data-dot="filled"]')).toHaveLength(0);
    expect(bar.querySelectorAll('[data-dot="spent"]')).toHaveLength(2);
  });
});

describe('CardView', () => {
  it('показывает имя, цену, тайминг и текст карты', () => {
    render(<CardView cardId="fieldKit" cost={1} />);
    const card = screen.getByRole('button');
    expect(card).toHaveTextContent(CARDS.fieldKit.name);
    expect(card).toHaveTextContent(ru.cardTiming.standard);
    expect(card).toHaveTextContent(CARDS.fieldKit.text);
    expect(within(card).getByTestId('cost')).toHaveTextContent('1');
  });

  it('заблокированная карта показывает причину и не зовёт onTap', async () => {
    const onTap = vi.fn();
    render(<CardView cardId="lunarDash" cost={2} disabled blockedReason="energy" onTap={onTap} />);
    const card = screen.getByRole('button');
    expect(card).toHaveTextContent(ru.blocked.energy);
    expect(card).toHaveClass('disabled');
    await userEvent.click(card);
    expect(onTap).not.toHaveBeenCalled();
  });
});

describe('Hand', () => {
  it('помечает выбранную карту и передаёт индекс тапа', async () => {
    const onTap = vi.fn();
    render(
      <Hand
        cards={['lunarDash', 'fieldKit', 'cover']}
        selectedIndex={1}
        costs={[1, 1, 2]}
        onTap={onTap}
        blocked={[undefined, undefined, 'energy']}
      />,
    );
    expect(screen.getByTestId('card-1')).toHaveClass('selected');
    expect(screen.getByTestId('card-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('card-0')).not.toHaveClass('selected');
    expect(within(screen.getByTestId('card-2')).getByTestId('cost')).toHaveTextContent('2');
    expect(screen.getByTestId('card-2')).toHaveTextContent(ru.blocked.energy);
    await userEvent.click(screen.getByTestId('card-0'));
    expect(onTap).toHaveBeenCalledWith(0);
    await userEvent.click(screen.getByTestId('card-2'));
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});

describe('ActionSheet', () => {
  const items = [
    { key: 'basic', label: ru.battle.actions.basic },
    { key: 'skill', label: ru.battle.actions.skill, detail: '2', disabled: true, reason: ru.blocked.freeze },
  ];

  it('недоступный пункт показывает причину и не зовёт onPick', async () => {
    const onPick = vi.fn();
    render(<ActionSheet items={items} onPick={onPick} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const skill = screen.getByTestId('sheet-item-skill');
    expect(skill).toHaveTextContent(ru.blocked.freeze);
    await userEvent.click(skill);
    expect(onPick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('sheet-item-basic'));
    expect(onPick).toHaveBeenCalledWith('basic');
  });

  it('тап по фону зовёт onClose', async () => {
    const onClose = vi.fn();
    const onPick = vi.fn();
    render(<ActionSheet items={items} onPick={onPick} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('FloatingNumber', () => {
  it('ставит знак по виду числа', () => {
    const { rerender } = render(<FloatingNumber value={5} kind="damage" />);
    expect(screen.getByText('−5')).toBeInTheDocument();
    rerender(<FloatingNumber value={3} kind="heal" />);
    expect(screen.getByText('+3')).toBeInTheDocument();
    rerender(<FloatingNumber value={4} kind="shield" />);
    expect(screen.getByText('+4')).toBeInTheDocument();
  });
});

describe('Overlay', () => {
  it('показывает текст и кнопку «Дальше»', async () => {
    const onNext = vi.fn();
    render(
      <Overlay text={ru.battle.confirm} anchorRect={{ top: 10, left: 20, width: 100, height: 50 }} onNext={onNext} />,
    );
    expect(screen.getByText(ru.battle.confirm)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: ru.tutorial.next }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
