import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the Depraedatio panel, the "Counting House" private-bank account (Claude
 * Design): the Portfolio screen's Reserve Account deposit + two-step withdraw (the 15% surrender
 * charge), choosing a relationship-tier contract on the Contracts screen, and Panvitium as the Suasio
 * scroll's sealed fourth rite (ADR-031). A seeded save (a purse of gold) is written to localStorage
 * before load (an old v5 save, so the load also exercises the migration chain); none of the
 * Depraedatio flows needs Avaritia.
 */

/** A minimal valid v5 save with 10,000 gold, stamped to "now". */
function seededSave(): string {
  const now = Date.now();
  const zero = '0';
  const devotion = {
    gula: zero,
    luxuria: zero,
    avaritia: zero, // the Faeneratio surfaces carry no Avaritia gate since the rebalance
    tristitia: zero,
    ira: zero,
    acedia: zero,
    vanagloria: zero,
    superbia: zero,
  };
  return JSON.stringify({
    schemaVersion: 5,
    saveVersion: 1,
    lastTickAt: now,
    deviceId: 'e2e-depraedatio',
    state: {
      souls: zero,
      devotion,
      sigilBindings: {},
      lifetime: {
        gold: '10000',
        influence: zero,
        maxInfluence: '100',
        reprobates: 40,
        acolytes: [],
        invocations: {},
        maleficia: [],
        emptioList: [],
        activeToggles: [],
        actionQueue: [],
      },
      rngState: 1,
      lastTickAt: now,
      startedAt: now,
    },
  });
}

async function enterStudio(page: Page): Promise<void> {
  await page.addInitScript((save: string) => {
    localStorage.setItem('panvitium:save', save);
  }, seededSave());
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole('button', { name: 'To the Studio' }).click();
}

async function openDepraedatio(page: Page): Promise<void> {
  await enterStudio(page);
  await page.getByRole('button', { name: 'PC', exact: true }).click();
  await page.getByRole('button', { name: 'Depraedatio' }).click();
}

test('deposits into the reserve and withdraws with the two-step confirm', async ({ page }) => {
  await openDepraedatio(page);

  // Portfolio is the default view: the four KPIs and the realised-income line mount; the loan book
  // and the period selector are gone.
  await expect(page.locator('.ch-navbtn--active')).toContainText('Portfolio');
  await expect(page.locator('.ch-stats .ch-stat')).toHaveCount(4);
  await expect(page.locator('.ch-realised')).toContainText('since account inception');
  await expect(page.locator('.ch-loanbook')).toHaveCount(0);
  await expect(page.locator('.ch-root select')).toHaveCount(0);

  // Deposit 500: the reserve balance readout picks it up.
  await page.getByLabel('Deposit to reserve').fill('500');
  await page.getByRole('button', { name: 'Deposit', exact: true }).click();
  await expect(page.locator('.ch-balance-value')).toContainText('500');

  // Withdraw 100: the confirm panel states the return + forfeit (15% charge) before executing.
  await page.getByLabel('Withdraw from reserve').fill('100');
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.locator('.ch-confirm')).toContainText('Returns 85 gold to cash; 15 forfeited');
  await page.getByRole('button', { name: 'Confirm withdrawal' }).click();
  // The full 100 left the reserve (500 -> 400); only the post-charge 85 returned to cash.
  await expect(page.locator('.ch-balance-value')).toContainText('400');
});

test('chooses a Tier I contract with the two-step confirm (free, one per tier)', async ({
  page,
}) => {
  await openDepraedatio(page);
  // Reach Relationship Tier I: 100 gold in reserve.
  await page.getByLabel('Deposit to reserve').fill('100');
  await page.getByRole('button', { name: 'Deposit', exact: true }).click();
  await page.getByRole('button', { name: 'Contracts' }).click();

  // Three relationship-tier rows of three contracts each.
  await expect(page.locator('.ch-tier')).toHaveCount(3);
  await expect(page.locator('.ch-term')).toHaveCount(9);
  await expect(page.locator('.ch-term--available')).toHaveCount(3);

  // Choose Interest rate: two-step confirm, then it reads Active and the other two foreclose.
  await page.getByRole('button', { name: 'Choose Interest rate' }).click();
  await page.getByRole('button', { name: 'Confirm Interest rate' }).click();
  await expect(page.locator('.ch-term--active')).toContainText('Interest rate');
  await expect(page.locator('.ch-term--foreclosed')).toHaveCount(2);
});

test('the Suasio scroll carries Panvitium as its sealed fourth rite', async ({ page }) => {
  await enterStudio(page);
  await page.getByRole('button', { name: 'The Suasio Scroll' }).click();
  const scroll = page.getByRole('dialog', { name: 'Opus Suasio' });
  await expect(scroll).toBeVisible();
  // Four rows now: the three temptations plus Panvitium, sealed exactly like the other locked
  // rites (redacted Latin + the gate label) until every Sin reaches level III.
  await expect(scroll.locator('.suasio-row')).toHaveCount(4);
  await expect(scroll).toContainText('Requires Every Sin III');
  await expect(scroll).toContainText('Zvorreth Ommurn'); // the redacted seal-name
});
