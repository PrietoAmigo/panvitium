import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the Unveiling (the pop-up that plays when Emptio brings a maleficium home) and
 * its Settings switch. A seeded save holds an Emptio five seconds from done, on an RNG seed that
 * brings the Witch Bottle home (the sim is deterministic, ADR-011). By default the pop-up plays and
 * lingers for its 3 s hold (twice the handoff's 1.5 s) plus the 0.3 s fade. With "Show the
 * Unveiling" unticked in Settings (opened from the title menu), the relic reaches the Loculi with no
 * pop-up, and the choice survives a reload. A MutationObserver installed before the app loads times
 * the pop-up's stay in the DOM.
 */

/** A minimal valid v5 save, stamped to "now", with an Emptio for a Witch Bottle nearly done. */
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
    deviceId: 'e2e-unveiling',
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
        maleficia: [],
        emptioList: ['witch_bottle'],
        activeToggles: [],
        actionQueue: [{ actionId: 'emptio', remainingSeconds: 5, target: 'witch_bottle' }],
      },
      rngState: 1,
      lastTickAt: now,
      startedAt: now,
    },
  });
}

interface UnveilTimes {
  added?: number;
  removed?: number;
}

/** Seed the save and record when the first Unveiling mounts and unmounts, then load the game. */
async function load(page: Page): Promise<void> {
  await page.addInitScript((save: string) => {
    localStorage.setItem('panvitium:save', save);
    const times: UnveilTimes = {};
    (window as unknown as { unveilTimes: UnveilTimes }).unveilTimes = times;
    new MutationObserver(() => {
      const shown = document.querySelector('.unveiling') !== null;
      if (shown && times.added === undefined) times.added = performance.now();
      if (!shown && times.added !== undefined && times.removed === undefined) {
        times.removed = performance.now();
      }
    }).observe(document, { childList: true, subtree: true });
  }, seededSave());
  await page.goto('/');
}

const unveilTimes = (page: Page): Promise<UnveilTimes> =>
  page.evaluate(() => (window as unknown as { unveilTimes: UnveilTimes }).unveilTimes);

async function enterLair(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
}

/** The title menu's Settings entry (the gear shares the name, so scope to the menu). */
async function openSettingsFromTitle(page: Page): Promise<void> {
  await page
    .getByRole('dialog', { name: 'Panvitium' })
    .getByRole('button', { name: 'Settings' })
    .click();
}

test('plays the Unveiling when Emptio brings a relic home, and lets it linger', async ({
  page,
}) => {
  await load(page);
  await enterLair(page);

  const unveiling = page.locator('.unveiling');
  await expect(unveiling).toBeVisible({ timeout: 15_000 });
  await expect(unveiling).toContainText('Maleficium obtained');
  await expect(unveiling.getByRole('heading', { name: 'Witch Bottle' })).toBeVisible();

  await expect(unveiling).toHaveCount(0, { timeout: 10_000 });
  const { added, removed } = await unveilTimes(page);
  if (added === undefined || removed === undefined) throw new Error('the Unveiling was not timed');
  // At least the 3 s hold (the 0.3 s fade comes on top; the old hold and fade took 1.8 s in all).
  // A loaded browser only ever runs timers late, so the slack goes above.
  expect(removed - added).toBeGreaterThanOrEqual(3_000);
  expect(removed - added).toBeLessThan(6_000);
});

test('with the switch off, the relic arrives quietly, and the choice survives a reload', async ({
  page,
}) => {
  await load(page);
  await openSettingsFromTitle(page);
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const toggle = settings.getByRole('checkbox', { name: 'Show the Unveiling' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await settings.getByRole('button', { name: 'Close' }).click();
  await enterLair(page);

  // The purchase completes and the relic stands in the Loculi, with no pop-up on the way.
  await page.getByRole('button', { name: 'To the Invocation Room' }).click();
  await page.getByRole('button', { name: 'Loculi' }).click();
  const loculi = page.getByRole('dialog', { name: 'Loculi' });
  await expect(loculi.getByRole('heading', { level: 2 })).toHaveText('Witch Bottle', {
    timeout: 15_000,
  });
  expect((await unveilTimes(page)).added).toBeUndefined();
  await expect(page.locator('.unveiling')).toHaveCount(0);

  // The switch is a device preference, not part of the save: a reload keeps it off.
  await page.reload();
  await openSettingsFromTitle(page);
  await expect(
    page.getByRole('dialog', { name: 'Settings' }).getByRole('checkbox', {
      name: 'Show the Unveiling',
    }),
  ).not.toBeChecked();
});
