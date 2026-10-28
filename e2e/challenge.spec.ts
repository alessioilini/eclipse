import { expect, test } from '@playwright/test';
import { HEROES, HERO_IDS } from '../src/engine';
import type { Deck } from '../src/engine';
import { buildPreset } from '../src/game/decks/presets';
import { encodeChallenge } from '../src/game/links/codec';
import { fmt, ru } from '../src/i18n/ru';

/**
 * Спека §4.2–4.3: ссылка-вызов `#/c/<код>` открывает экран вызова, «Принять вызов» запускает бой
 * против колоды отправителя. Код собирается в тесте тем же кодеком, что и в приложении.
 */

const NAME = 'Лиса';
// Колода «контроль» с нестандартной стартовой тройкой: кодек переносит её в начало колоды.
const deck: Deck = { ...buildPreset('control', HERO_IDS), starting: [2, 0, 4] };
const code = encodeChallenge({ v: 1, deck, seed: 20261028, name: NAME });
const startingNames = deck.starting.map((i) => HEROES[deck.heroes[i]!].name);

test('ссылка-вызов: имя отправителя, принятие и героини соперницы в бою', async ({ page }) => {
  await page.goto(`/#/c/${code}`);
  await expect(page.getByRole('heading', { name: fmt(ru.challenge.title, { name: NAME }) })).toBeVisible();
  const accept = page.getByTestId('accept');
  await expect(accept).toHaveText(ru.challenge.accept);

  await accept.click();
  await expect(page).toHaveURL(/#\/battle$/);
  for (const [slot, name] of startingNames.entries()) {
    await expect(page.getByTestId(`hero-B-${slot}`)).toContainText(name);
  }
});

test('битая ссылка-вызов показывает ошибку и кнопку «В меню»', async ({ page }) => {
  await page.goto('/#/c/AAAA-broken');
  await expect(page.getByText(ru.challenge.invalid)).toBeVisible();
  await expect(page.getByRole('button', { name: ru.challenge.menu })).toBeVisible();
  await expect(page.getByTestId('accept')).toHaveCount(0);
});
