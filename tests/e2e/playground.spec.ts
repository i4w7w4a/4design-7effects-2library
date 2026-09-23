import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('каталог показывает эффект и ведёт к его демо и обратно', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Библиотека эффектов' })).toBeVisible();

  const effect = page.getByRole('article', { name: 'Магнитные карточки' });
  await expect(effect).toContainText('Черновик');
  await expect(effect).toContainText('0.1.0');
  await effect.getByRole('link', { name: 'Смотреть эффект' }).click();

  await expect(page).toHaveURL(/\?effect=magnetic-cards$/);
  await expect(page.getByRole('heading', { name: 'Магнитные карточки.' })).toBeVisible();
  await page.getByRole('link', { name: '← Все эффекты', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(effect).toBeVisible();
});

test('каталог подсказывает, как применить выбранный эффект в проекте', async ({ page }) => {
  await page.goto('/');
  const effect = page.getByRole('article', { name: 'Магнитные карточки' });
  await effect.getByText('Как применить').click();
  await expect(effect).toContainText('$4i7-design Примени эффект magnetic-cards');
  await expect(effect).toContainText('Откройте нужный проект в Codex');
  await expect(effect).toContainText('Сохранить пресет');
  await expect(effect).toContainText('последний сохранённый пресет');
  await effect.getByRole('button', { name: 'Скопировать запрос' }).click();
  await expect(effect.getByRole('status')).toHaveText('Скопировано');
});

test('каждая запись каталога открывает живое демо', async ({ page }) => {
  const index = await readFile(resolve(process.cwd(), 'catalog/index.jsonl'), 'utf8');
  const entries = index.trim().split('\n').map((line) => JSON.parse(line) as { demo: string });
  for (const entry of entries) {
    await page.goto(entry.demo);
    await expect(page.locator('#unsupported')).toBeHidden();
    await expect(page.getByRole('main')).toBeVisible();
  }
});

test('сохраняет выбранную силу притяжения в пресет сеанса', async ({ page }) => {
  await page.goto('/?effect=magnetic-cards');
  await expect(page.locator('[data-magnetic-card]').first()).toBeVisible();

  const radius = page.locator('input[name="radius"]');
  await radius.evaluate((input: HTMLInputElement) => {
    input.value = '280';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/presets') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Сохранить пресет' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const saved = await response.json() as { path: string };
  expect(saved.path).toMatch(/^\.local\/sessions\/[a-zA-Z0-9-]+\.json$/);
  const preset = JSON.parse(await readFile(resolve(process.cwd(), saved.path), 'utf8')) as {
    effect: string;
    version: string;
    options: { radius: number };
  };
  expect(preset.effect).toBe('magnetic-cards');
  expect(preset.version).toBe('0.1.0');
  expect(preset.options.radius).toBe(280);
});

test('при reduced motion указатель не сдвигает карточку', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?effect=magnetic-cards');
  const card = page.locator('[data-magnetic-card]').first();
  await expect(page.locator('input[name="radius"]')).toBeVisible();
  const visual = card.locator('[data-magnetic-visual]');
  const cardBox = await card.boundingBox();
  const before = await visual.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(before).not.toBeNull();

  await page.mouse.move(cardBox!.x + cardBox!.width * 0.2, cardBox!.y + cardBox!.height * 0.5);
  await page.waitForTimeout(250);
  const after = await visual.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(0.5);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(0.5);
});

test('после клика мышью карточка продолжает отвечать на движение указателя', async ({ page }) => {
  await page.goto('/?effect=magnetic-cards');
  await expect(page.locator('input[name="radius"]')).toBeVisible();
  const card = page.locator('[data-magnetic-card]').first();
  const visual = card.locator('[data-magnetic-visual]');
  await card.click();
  expect(await card.evaluate((element) => element.matches(':focus-visible'))).toBe(false);
  await expect.poll(() => visual.evaluate((element: HTMLElement) => element.style.transform)).toBe('');

  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.15, box!.y + box!.height * 0.5);
  await expect.poll(() => visual.evaluate((element: HTMLElement) => element.style.transform)).toContain('translate3d(');
});
