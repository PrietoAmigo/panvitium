import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * E2E coverage for the desk PC's Calculator: it launches from the PC's file manager, computes from
 * its keypad (with the running result and the history tape) and from the keyboard (exact decimals,
 * the error line, Escape), and keeps the sum in progress when the player steps back to Files.
 */

async function openCalculator(page: Page): Promise<Locator> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole('button', { name: 'To the Studio' }).click();
  await page.getByRole('button', { name: 'PC', exact: true }).click();
  await page.getByRole('button', { name: 'Calculator' }).click();
  const calc = page.getByRole('group', { name: 'Calculator', exact: true });
  await expect(calc).toBeVisible();
  return calc;
}

test('computes from the keypad, with the running result and the tape', async ({ page }) => {
  const calc = await openCalculator(page);
  const key = (name: string): Locator => calc.getByRole('button', { name, exact: true });
  for (const k of ['1', '2', 'Add', '7', 'Multiply', '3']) await key(k).click();
  await expect(calc.locator('.calc-line')).toHaveText('12 + 7 × 3');
  await expect(calc.locator('.calc-sub')).toHaveText('= 33');

  await key('Equals').click();
  await expect(calc.locator('.calc-line')).toHaveText('33');
  await expect(calc.locator('.calc-context')).toHaveText('12 + 7 × 3 =');
  await expect(calc.getByRole('button', { name: '12 + 7 × 3 = 33' })).toBeVisible();
});

test('takes the keyboard, with exact decimals and a readable error', async ({ page }) => {
  const calc = await openCalculator(page);
  const line = calc.locator('.calc-line');
  await page.keyboard.type('0.1+0.2');
  await page.keyboard.press('Enter');
  await expect(line).toHaveText('0.3');

  await page.keyboard.type('5/0');
  await page.keyboard.press('Enter');
  await expect(calc.getByRole('alert')).toHaveText('Division by zero is undefined');
  await page.keyboard.press('Escape');
  await expect(line).toHaveText('0');
});

test('keeps the sum in progress when the player steps back to Files', async ({ page }) => {
  const calc = await openCalculator(page);
  await page.keyboard.type('6*7');
  await page.getByRole('button', { name: '‹ Files' }).click();
  await page.getByRole('button', { name: 'Calculator' }).click();
  await expect(calc.locator('.calc-line')).toHaveText('6 × 7');
});
