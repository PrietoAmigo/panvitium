import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the Loculi "Reliquary" (Claude Design, "Loculi Reliquary" handoff): with a few
 * relics owned, the rarest stands on stage with its effect as a headline number, the rest stand in
 * a procession ordered anathema → common, the ← → keys and the procession browse, and Esc closes.
 * The Desidia vessel steps aside while it is open (it would cover the ‹ arrow and the first relics).
 * A seeded save (owned maleficia) is written to localStorage before load.
 */

/** A minimal valid v5 save owning four distinct relics (two Black Candles), stamped to "now". */
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
    schemaVersion: 5,
    saveVersion: 1,
    lastTickAt: now,
    deviceId: 'e2e-loculi',
    state: {
      souls: zero,
      devotion,
      sigilBindings: {},
      lifetime: {
        gold: '100',
        influence: zero,
        maxInfluence: '100',
        reprobates: 40,
        acolytes: [],
        invocations: {},
        maleficia: [
          'witch_bottle',
          'spear_of_longinus',
          'codex_gigas',
          'black_candles',
          'black_candles',
        ],
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

async function openLoculi(page: Page): Promise<void> {
  await page.addInitScript((save: string) => {
    localStorage.setItem('panvitium:save', save);
  }, seededSave());
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole('button', { name: 'To the Invocation Room' }).click();
  await page.getByRole('button', { name: 'Loculi' }).click();
}

test('stands the rarest relic on stage and browses the procession', async ({ page }) => {
  await openLoculi(page);
  const loculi = page.getByRole('dialog', { name: 'Loculi' });
  await expect(loculi).toBeVisible();
  const staged = loculi.getByRole('heading', { level: 2 });

  // The anathema relic takes the stage, its effect set as the headline number.
  await expect(staged).toHaveText('Spear of Longinus');
  await expect(loculi).toContainText('+200%');
  await expect(loculi).toContainText('I · IV');

  // The procession: one relic per owned id, anathema → common, stacks carrying their count.
  const procession = loculi.locator('button.reliquary-proc');
  await expect(procession).toHaveCount(4);
  await expect(procession.first()).toHaveAttribute('aria-label', 'Spear of Longinus');
  await expect(procession.last()).toHaveAttribute('aria-label', 'Witch Bottle');

  await page.keyboard.press('ArrowRight');
  await expect(staged).toHaveText('Codex Gigas');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(staged).toHaveText('Witch Bottle');

  await loculi.getByRole('button', { name: 'Black Candles ×2' }).click();
  await expect(staged).toHaveText('Black Candles ×2');

  await page.keyboard.press('Escape');
  await expect(loculi).toBeHidden();
});

test('the Desidia vessel steps aside while the Loculi is open', async ({ page }) => {
  await openLoculi(page);
  const loculi = page.getByRole('dialog', { name: 'Loculi' });
  await expect(loculi).toBeVisible();
  await expect(page.locator('.desidia-hud')).toHaveCount(0);
  await expect(page.locator('.ig-hud')).toBeVisible();
  await loculi.getByRole('button', { name: 'Close' }).click();
  await expect(loculi).toBeHidden();
  await expect(page.locator('.desidia-hud')).toHaveCount(1);
});
