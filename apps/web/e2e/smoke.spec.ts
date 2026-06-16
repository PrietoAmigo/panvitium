import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke coverage for the current web shell (ADR-012): every launch opens on the title menu; Continue
 * fades into the lair (Altar room). From there the three rooms navigate by their doors, a diegetic
 * overlay (the desk PC) and a framed panel (the Maleficia cabinet) open and close, the tick loop
 * visibly advances (the vigil readout lives in the PC's Analytics program now that the HUD is gone),
 * and state survives a reload via localStorage (ADR-006).
 */

/**
 * Dismiss the launch title menu and wait for the entry transition (fade to black → mount the lair →
 * fade back in) to finish, so the room chrome is interactive and the fade overlay no longer
 * intercepts pointer events.
 */
async function enterLair(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
}

test('loads the lair in the Altar room', async ({ page }) => {
  await page.goto('/');
  // The title menu carries the gold-leaf wordmark and the Continue entry.
  await expect(page.getByRole('dialog', { name: 'Panvitium' })).toBeVisible();
  await enterLair(page);
  // The game opens in the Altar room.
  await expect(page.locator('.room-name')).toHaveText('The Altar Room');
});

test('navigates between the three rooms by their doors', async ({ page }) => {
  await page.goto('/');
  await enterLair(page);
  const roomName = page.locator('.room-name');

  await page.getByRole('button', { name: 'To the Studio' }).click();
  await expect(roomName).toHaveText('The Studio');

  await page.getByRole('button', { name: 'To the Altar' }).click();
  await expect(roomName).toHaveText('The Altar Room');

  await page.getByRole('button', { name: 'To the Invocation Room' }).click();
  await expect(roomName).toHaveText('The Invocation Room');

  await page.getByRole('button', { name: 'To the Altar' }).click();
  await expect(roomName).toHaveText('The Altar Room');
});

test('opens and closes a diegetic overlay (the desk PC)', async ({ page }) => {
  await page.goto('/');
  await enterLair(page);
  await page.getByRole('button', { name: 'To the Studio' }).click();
  await page.getByRole('button', { name: 'PC', exact: true }).click();

  const pc = page.getByRole('dialog', { name: 'The PC' });
  await expect(pc).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(pc).toBeHidden();
});

test('opens the Maleficia cabinet without crashing (no render loop)', async ({ page }) => {
  await page.goto('/');
  await enterLair(page);
  await page.getByRole('button', { name: 'To the Invocation Room' }).click();
  await page.getByRole('button', { name: 'Maleficia Shelf' }).click();
  // If a selector returned a fresh reference, this panel would loop and the app would collapse.
  const cabinet = page.getByRole('dialog', { name: 'The Maleficia Shelf' });
  await expect(cabinet).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(cabinet).toBeHidden();
});

test('keeps vigil — the tick loop advances', async ({ page }) => {
  await page.goto('/');
  await enterLair(page);
  // The vigil readout lives in the PC's Analytics program.
  await page.getByRole('button', { name: 'To the Studio' }).click();
  await page.getByRole('button', { name: 'PC', exact: true }).click();
  await page.getByRole('button', { name: 'Analytics' }).click();

  const vigil = page.locator('.vigil');
  await expect(vigil).toContainText('vigil kept');

  const before = await vigil.textContent();
  await page.waitForTimeout(2500);
  const after = await vigil.textContent();
  expect(after).not.toBe(before);
});

test('persists state across a reload', async ({ page }) => {
  await page.goto('/');
  await enterLair(page);
  await expect(page.locator('.room-name')).toHaveText('The Altar Room');

  const deviceIdBefore = await page.evaluate(() => localStorage.getItem('panvitium:deviceId'));
  expect(deviceIdBefore).toBeTruthy();

  await page.reload();

  // A save is written on unload (or by the 15 s autosave at the latest).
  await page.waitForFunction(() => localStorage.getItem('panvitium:save') !== null, undefined, {
    timeout: 20_000,
  });

  const blob = await page.evaluate(
    () => JSON.parse(localStorage.getItem('panvitium:save') ?? 'null') as Record<string, unknown>,
  );
  // A valid save persisted (don't pin the exact schema version — it advances with each migration).
  expect(blob.schemaVersion as number).toBeGreaterThanOrEqual(1);
  expect(blob.saveVersion as number).toBeGreaterThanOrEqual(1);

  const deviceIdAfter = await page.evaluate(() => localStorage.getItem('panvitium:deviceId'));
  expect(deviceIdAfter).toBe(deviceIdBefore);

  // The reload opens on the title menu again; Continue still boots back into the lair.
  await enterLair(page);
  await expect(page.locator('.room-name')).toHaveText('The Altar Room');
});
