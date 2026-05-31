import { test, expect } from '@playwright/test';

/**
 * Smoke coverage for the current web shell (ADR-012): the lair loads with its HUD, the three rooms
 * navigate by their doors, a diegetic panel opens and closes, the tick loop visibly advances, and
 * state survives a reload via localStorage (ADR-006). The full-Katabasis / cloud-sync roundtrips
 * named in ADR-012 land here once those systems are wired.
 */

test('loads the lair with the resource HUD', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hud-title')).toHaveText('Panvitium');
  await expect(page.getByText('Souls', { exact: true })).toBeVisible();
  await expect(page.getByText('Gold', { exact: true })).toBeVisible();
  await expect(page.getByText('Influence', { exact: true })).toBeVisible();
  // The game opens in the Altar room.
  await expect(page.locator('.room-name')).toHaveText('The Altar Room');
});

test('navigates between the three rooms by their doors', async ({ page }) => {
  await page.goto('/');
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

test('opens and closes a diegetic panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'The Altar' }).click();

  const dialog = page.getByRole('dialog', { name: 'The Altar' });
  await expect(dialog).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});

test('opens the Maleficia cabinet without crashing (no render loop)', async ({ page }) => {
  await page.goto('/');
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
  const vigil = page.locator('.vigil');
  await expect(vigil).toContainText('vigil kept');

  const before = await vigil.textContent();
  await page.waitForTimeout(2500);
  const after = await vigil.textContent();
  expect(after).not.toBe(before);
});

test('persists state across a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hud-title')).toHaveText('Panvitium');

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
  expect(blob.schemaVersion).toBe(1);
  expect(blob.saveVersion as number).toBeGreaterThanOrEqual(1);

  const deviceIdAfter = await page.evaluate(() => localStorage.getItem('panvitium:deviceId'));
  expect(deviceIdAfter).toBe(deviceIdBefore);

  await expect(page.locator('.hud-title')).toHaveText('Panvitium');
});
