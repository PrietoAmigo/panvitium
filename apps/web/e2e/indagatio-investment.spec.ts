import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the Indagatio investment on the Orbis Tenebrarum Search: Invest / Divest set the
 * DEFAULT percentage of gold every Search pours into itself (+2 / −1 points), the Investment meter
 * reads that percentage then, in parentheses, the gold it amounts to right now, the Gold meter sits
 * between it and the Duration meter, and a Cast spends the share. The seeded save is a v12 one that
 * still carries the retired gold stake, so the load also exercises the v12 → v13 refund.
 */

/** A minimal valid v12 save: 9,000 gold held plus a retired 1,000 g stake, stamped to "now". */
function seededSave(): string {
  const now = Date.now();
  const zero = '0';
  const devotion = {
    gula: zero,
    luxuria: zero,
    avaritia: zero,
    tristitia: zero,
    ira: zero,
    acedia: zero,
    vanagloria: zero,
    superbia: zero,
  };
  return JSON.stringify({
    schemaVersion: 12,
    saveVersion: 1,
    lastTickAt: now,
    deviceId: 'e2e-indagatio-investment',
    state: {
      souls: zero,
      devotion,
      sigilBindings: {},
      lifetime: {
        gold: '9000',
        influence: zero,
        maxInfluence: '100',
        reprobates: 0,
        acolytes: [],
        invocations: {},
        maleficia: [],
        emptioList: [],
        indagatioInvestment: '1000',
        activeToggles: [],
        actionQueue: [],
      },
      rngState: 1,
      lastTickAt: now,
      startedAt: now,
    },
  });
}

async function openIndagatio(page: Page): Promise<void> {
  await page.addInitScript((save: string) => {
    localStorage.setItem('panvitium:save', save);
  }, seededSave());
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole('button', { name: 'To the Studio' }).click();
  await page.getByRole('button', { name: 'PC', exact: true }).click();
  await page.getByRole('button', { name: 'Indagatio' }).click();
}

/** Read the row's numbers in one pass so the live gold cannot tick between the reads. */
async function readRow(page: Page): Promise<{ pct: string; investGold: number; gold: number }> {
  return page.locator('.orbis-cast-row').evaluate((row) => {
    const text = (sel: string): string => row.querySelector(sel)?.textContent?.trim() ?? '';
    const num = (s: string): number => Number(s.replace(/[(),]/g, ''));
    return {
      pct: text('.orbis-invest-pct'),
      investGold: num(text('.orbis-invest-gold')),
      gold: num(text('.orbis-gold-value')),
    };
  });
}

test('Invest / Divest set the default percentage and a Cast spends that share', async ({
  page,
}) => {
  await openIndagatio(page);

  const row = page.locator('.orbis-cast-row');
  await expect(row.locator('.orbis-meter-label')).toHaveText(['Investment', 'Gold', 'Duration']);
  const pct = row.locator('.orbis-invest-pct');

  // The retired 1,000 g stake was refunded into gold by the migration (9,000 held + 1,000), and
  // nothing is invested yet. Gold accrues live, so it only grows from here.
  await expect(pct).toHaveText('0%');
  await expect(row.locator('.orbis-invest-gold')).toHaveText('(0)');
  expect((await readRow(page)).gold).toBeGreaterThanOrEqual(10_000);
  await expect(row.getByRole('button', { name: 'Divest' })).toBeDisabled();

  // Each Invest adds 2 points; each Divest takes 1 off.
  const invest = row.getByRole('button', { name: 'Invest' });
  await invest.click();
  await invest.click();
  await invest.click();
  await expect(pct).toHaveText('6%');
  await row.getByRole('button', { name: 'Divest' }).click();
  await expect(pct).toHaveText('5%');

  // The parenthetical is that share of the gold held right now; setting it moved no gold.
  const before = await readRow(page);
  expect(before.gold).toBeGreaterThanOrEqual(10_000);
  expect(before.investGold).toBe(Math.floor(before.gold * 0.05));

  // Casting spends the share; the percentage stands, so the parenthetical follows the smaller
  // treasury (a few seconds of income may land in between, hence the tolerance).
  await row.getByRole('button', { name: 'Cast the Search' }).click();
  await expect(row.locator('.orbis-meter-label').last()).toHaveText('Time left');
  const after = await readRow(page);
  expect(after.pct).toBe('5%');
  expect(after.gold).toBeGreaterThanOrEqual(before.gold - before.investGold);
  expect(after.gold).toBeLessThan(before.gold - before.investGold + 50);
  expect(after.investGold).toBe(Math.floor(after.gold * 0.05));
});
