import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the reworked Depraedatio panel (Depraedatio gold rework): the Thesaurus tab's
 * deposit and two-step withdraw, signing a Syngrapha on the contract tree, and Panvitium as the
 * Suasio scroll's sealed fourth rite (ADR-031). A seeded save (a purse of gold) is written to
 * localStorage before load; since the gating rebalance none of the three flows needs Avaritia.
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

test('deposits into the hoard and withdraws with the two-step confirm', async ({ page }) => {
  await openDepraedatio(page);

  // The Thesaurus tab is the default: the loan book is open from the start with its debtors.
  await expect(page.getByRole('tab', { name: 'Thesaurus' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.dep-grimoire')).toContainText('debtors');

  // Deposit 500: the hoard readout picks it up.
  await page.getByLabel('Deposit amount').fill('500');
  await page.getByRole('button', { name: 'Deposit', exact: true }).click();
  await expect(page.locator('[aria-label="The hoard"]')).toContainText('500');

  // Withdraw 100: the confirm states the recovery and the forfeit before executing.
  await page.getByLabel('Withdraw amount').fill('100');
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.locator('.dep-grimoire')).toContainText(
    'The counting house releases little of what it has tasted.',
  );
  await page.getByRole('button', { name: 'Confirm Withdraw' }).click();
  // The full 100 left the vault (500 → 400); only the recovery fraction returned to gold.
  await expect(page.locator('[aria-label="The hoard"]')).toContainText('400');
});

test('signs a Syngrapha with the two-step confirm (the fee is burned)', async ({ page }) => {
  await openDepraedatio(page);
  await page.getByRole('tab', { name: 'Syngraphae' }).click();

  // The three branch columns render with the named contracts.
  const grimoire = page.locator('.dep-grimoire');
  await expect(grimoire).toContainText('Usura');
  await expect(grimoire).toContainText('Custodia');
  await expect(grimoire).toContainText('Anatocismus');
  await expect(grimoire).toContainText('Peculium');

  // Sign Usura I (ungated since the rebalance, fee 500): two-step confirm, then Signed.
  await page.getByRole('button', { name: 'Sign Usura I' }).click();
  await page.getByRole('button', { name: 'Confirm Sign Usura I' }).click();
  await expect(grimoire).toContainText('Signed');
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
