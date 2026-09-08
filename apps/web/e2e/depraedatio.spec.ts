import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the redesigned Depraedatio panel, the "Counting House" private-bank account
 * (Claude Design): the Portfolio screen's Reserve Account deposit + two-step withdraw, signing a
 * contract on the Contracts screen, and Panvitium as the Suasio scroll's sealed fourth rite
 * (ADR-031). A seeded save (a purse of gold) is written to localStorage before load; since the
 * gating rebalance none of the Faeneratio flows needs Avaritia.
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

  // Portfolio is the default view: the account surfaces mount with the loan book's debtor figure.
  await expect(page.locator('.ch-navbtn--active')).toContainText('Portfolio');
  await expect(page.locator('.ch-loanbook')).toContainText('Active debtors');

  // Deposit 500: the reserve balance readout picks it up.
  await page.getByLabel('Deposit to reserve').fill('500');
  await page.getByRole('button', { name: 'Deposit', exact: true }).click();
  await expect(page.locator('.ch-balance-value')).toContainText('500');

  // Withdraw 100: the confirm panel states the recovery + forfeit before executing.
  await page.getByLabel('Withdraw from reserve').fill('100');
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.locator('.ch-confirm')).toContainText('forfeited to the counting house');
  await page.getByRole('button', { name: 'Confirm withdrawal' }).click();
  // The full 100 left the reserve (500 -> 400); only the recovery fraction returned to cash.
  await expect(page.locator('.ch-balance-value')).toContainText('400');
});

test('signs a contract with the two-step confirm (the fee is burned)', async ({ page }) => {
  await openDepraedatio(page);
  await page.getByRole('button', { name: 'Contracts' }).click();

  // The three branch columns render with the banking names + the named contracts.
  const branches = page.locator('.ch-branches');
  await expect(branches).toContainText('Yield');
  await expect(branches).toContainText('Custody');
  await expect(branches).toContainText('Compounding');
  await expect(branches).toContainText('Retained Floor');

  // Sign Yield I (ungated since the rebalance, fee 500, affordable with 10,000 gold): two-step
  // confirm, then the node reads Signed.
  await page.getByRole('button', { name: 'Sign Yield I' }).click();
  await page.getByRole('button', { name: 'Confirm Yield I' }).click();
  await expect(branches).toContainText('Signed');
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
