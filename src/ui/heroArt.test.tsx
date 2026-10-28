import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HEROES } from '../engine';
import { HeroArt } from './HeroArt';

const BASE = import.meta.env.BASE_URL;

function imgOf(container: HTMLElement): HTMLImageElement {
  const img = container.querySelector('img');
  if (!img) throw new Error('нет <img>');
  return img;
}

describe('HeroArt: картинки', () => {
  it('портрет по умолчанию: путь от BASE_URL, srcSet 128w и 512w, ленивая загрузка', () => {
    const { container } = render(<HeroArt heroId="aira" size="md" />);
    const img = imgOf(container);
    const src = img.getAttribute('src')!;
    expect(src.startsWith(BASE)).toBe(true);
    expect(src).toBe(`${BASE}art/aira-portrait-128.webp`);
    const srcSet = img.getAttribute('srcset')!;
    expect(srcSet).toContain(`${BASE}art/aira-portrait-128.webp 128w`);
    expect(srcSet).toContain(`${BASE}art/aira-portrait-512.webp 512w`);
    expect(img.getAttribute('sizes')).toBe('48px');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    // Доступное имя несёт контейнер, сама картинка декоративная.
    expect(img.getAttribute('alt')).toBe('');
    expect(screen.getByRole('img', { name: HEROES.aira.name })).toContainElement(img);
  });

  it('арт в рост: путь от BASE_URL, srcSet 512w и 1024w', () => {
    const { container } = render(<HeroArt heroId="nerisa" kind="full" size="lg" />);
    const img = imgOf(container);
    const src = img.getAttribute('src')!;
    expect(src.startsWith(BASE)).toBe(true);
    expect(src).toBe(`${BASE}art/nerisa-full-512.webp`);
    const srcSet = img.getAttribute('srcset')!;
    expect(srcSet).toContain(`${BASE}art/nerisa-full-512.webp 512w`);
    expect(srcSet).toContain(`${BASE}art/nerisa-full-1024.webp 1024w`);
    expect(img.getAttribute('sizes')).toBe('96px');
  });

  it.each(['portrait', 'full'] as const)('%s: после ошибки загрузки — инициал вместо картинки', (kind) => {
    const { container } = render(<HeroArt heroId="kira" kind={kind} size="sm" />);
    const art = screen.getByRole('img', { name: HEROES.kira.name });
    expect(art).not.toHaveTextContent(HEROES.kira.name[0]!);
    fireEvent.error(imgOf(container));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: HEROES.kira.name })).toHaveTextContent(HEROES.kira.name[0]!);
  });

  it('состояние ошибки у каждого экземпляра своё', () => {
    const { container } = render(
      <>
        <HeroArt heroId="aira" size="sm" />
        <HeroArt heroId="fenna" size="sm" />
      </>,
    );
    const [first] = Array.from(container.querySelectorAll('img'));
    fireEvent.error(first!);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: HEROES.aira.name })).toHaveTextContent(HEROES.aira.name[0]!);
  });
});
