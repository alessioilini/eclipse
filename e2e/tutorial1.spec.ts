import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ru } from '../src/i18n/ru';

/**
 * Спека §1, критерий 7: первый бой обучения проходится от главного меню до экрана результата.
 * Тест ведёт оверлей подсказок: «Дальше» на текстовых шагах, клики по якорю (`data-anchor`) и цели
 * (`data-anchor-target`) на шагах-требованиях. Раунды без подсказок играются атаками по слабейшей противнице.
 */

const MAX_MOVES = 300;

const overlay = (page: Page) => page.getByTestId('tutorial-overlay');
const byTestId = (page: Page, id: string) => page.locator(`[data-testid="${id}"]`);

/** Ждёт, пока экран придёт в одно из понятных состояний. */
async function settle(page: Page): Promise<void> {
  const any = page.getByTestId('result')
    .or(page.getByTestId('skip'))
    .or(overlay(page))
    .or(page.getByTestId('confirm'));
  await expect(any.first()).toBeVisible();
}

/** Единственный доступный пункт листа действий (обучение оставляет в листе только требуемое действие). */
async function pickOnlyAction(page: Page): Promise<void> {
  const items = page.locator('[data-testid^="sheet-item-"]:not([disabled])');
  await expect(items).toHaveCount(1);
  await items.click();
}

/** Подсвеченная цель с наименьшим HP (подсветка — `aria-pressed="true"`). */
async function weakestTarget(page: Page): Promise<Locator> {
  const id = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="hero-"][aria-pressed="true"]'));
    const hp = (el: HTMLElement) => Number(/(\d+)\/\d+/.exec(el.textContent ?? '')?.[1] ?? Infinity);
    cards.sort((a, b) => hp(a) - hp(b));
    return cards[0]?.dataset.testid ?? null;
  });
  if (!id) throw new Error('нет подсвеченной цели');
  return byTestId(page, id);
}

/** Шаг-требование: героиня-якорь → действие → цель из подсказки (или слабейшая); иначе просто клик по якорю. */
async function followHint(page: Page, anchor: string, target: string | null): Promise<void> {
  await byTestId(page, anchor).click();
  if (anchor.startsWith('hero-A-')) await pickOnlyAction(page);
  if (target) await byTestId(page, target).click();
  else if (await page.getByTestId('target-hint').isVisible()) await (await weakestTarget(page)).click();
}

/** Раунд без подсказок: каждая живая героиня бьёт слабейшую противницу, затем «Подтвердить». */
async function playFreeRound(page: Page): Promise<void> {
  for (const slot of [0, 1, 2]) {
    const hero = byTestId(page, `hero-A-${slot}`);
    if ((await hero.getAttribute('class'))?.split(' ').includes('dead')) continue;
    await hero.click();
    await page.getByTestId('sheet-item-basic').click();
    await (await weakestTarget(page)).click();
  }
  await expect(page.getByTestId('confirm')).toBeEnabled();
  await page.getByTestId('confirm').click();
}

/** Один ход теста; true — бой окончен и открыт экран результата. */
async function move(page: Page): Promise<boolean> {
  await settle(page);
  if (await page.getByTestId('result').isVisible()) return true;
  const skip = page.getByTestId('skip');
  if (await skip.isVisible()) {
    await skip.click();
    return false;
  }
  const hint = overlay(page);
  if (await hint.isVisible()) {
    const next = hint.getByRole('button', { name: ru.tutorial.next });
    if (await next.isVisible()) {
      await next.click();
      return false;
    }
    const anchor = await hint.getAttribute('data-anchor');
    if (!anchor) throw new Error('у подсказки нет якоря');
    await followHint(page, anchor, await hint.getAttribute('data-anchor-target'));
    return false;
  }
  await playFreeRound(page);
  return false;
}

test('первый бой обучения проходится по подсказкам до победы', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: ru.menu.play }).click();
  await expect(page).toHaveURL(/#\/tutorial\/1$/);

  let done = false;
  for (let i = 0; i < MAX_MOVES && !done; i++) done = await move(page);

  expect(done).toBe(true);
  await expect(page).toHaveURL(/#\/result$/);
  await expect(page.getByTestId('result')).toContainText(ru.result.win);
});
