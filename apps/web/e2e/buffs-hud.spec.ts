import { test, expect, type Page } from '@playwright/test';

/**
 * E2E coverage for the temporary-buffs HUD (Claude Design, "Temporary buffs HUD" handoff, board 2a).
 * A seeded save carries two consumables mid-buff and one answered call. In the Studio their rings
 * stand in the left column between the Influence and Desidia vessels (maleficia first, each soonest
 * to expire first), the call's two effects on one ring; hovering a ring opens its details card and
 * leaving closes it; a ring leaves on the tick its buff runs out. The column hides in the Altar room
 * and steps aside over the Loculi with the Desidia vessel.
 */

/** A minimal valid v9 save, stamped to "now", with two maleficia buffs and one call's buffs live. */
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
  const socialPlatform = { remainingSeconds: 3100, durationSec: 3600, sourceId: 'social-platform' };
  return JSON.stringify({
    schemaVersion: 9,
    saveVersion: 1,
    lastTickAt: now,
    deviceId: 'e2e-buffs',
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
        emptioList: [],
        activeToggles: [],
        actionQueue: [],
        // Crossroads Dirt runs out a few seconds into play; Defixio holds.
        maleficiaBuffs: { defixio: 1100, crossroads_dirt: 12 },
        callBuffs: [
          { field: 'influenceRegenRate', factor: 2, ...socialPlatform },
          { field: 'reprobateGenMul', factor: 0.5, ...socialPlatform },
        ],
      },
      rngState: 1,
      lastTickAt: now,
      startedAt: now,
    },
  });
}

async function enterLair(page: Page): Promise<void> {
  await page.addInitScript((save: string) => {
    localStorage.setItem('panvitium:save', save);
  }, seededSave());
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
}

test('stands a ring per live buff between the vessels, with its card on hover', async ({
  page,
}) => {
  await enterLair(page);
  await page.getByRole('button', { name: 'To the Studio' }).click();

  const hud = page.getByRole('group', { name: 'Temporary buffs' });
  await expect(hud).toBeVisible();
  const rings = hud.getByRole('button');
  await expect(rings).toHaveCount(3);
  await expect(rings.nth(0)).toHaveAccessibleName(/^Crossroads Dirt, −15% Indagatio time, \d+s/);
  await expect(rings.nth(1)).toHaveAccessibleName('Defixio, +50% suicide rate, 18m remaining');
  await expect(rings.nth(2)).toHaveAccessibleName(
    'Social Platform, Influence regeneration doubles, Reprobate generation halves, 51m remaining',
  );

  // The column sits under the Influence vessel and over the Desidia label, lined up with it.
  const vessel = await page.locator('.ig-hud-vessel').boundingBox();
  const desidia = await page.locator('.desidia-hud-label').boundingBox();
  const first = await rings.nth(0).boundingBox();
  const last = await hud.locator('.buffs-hud-tile').nth(2).boundingBox();
  if (!vessel || !desidia || !first || !last) throw new Error('the HUD is not laid out');
  expect(first.y).toBeGreaterThanOrEqual(vessel.y + vessel.height);
  expect(last.y + last.height).toBeLessThanOrEqual(desidia.y);
  expect(Math.abs(first.x - desidia.x)).toBeLessThan(1);

  // Nothing shows by default; a hover opens the ring's card, and leaving it closes the card.
  const card = page.locator('.buffs-hud-card');
  await expect(card).toHaveCount(0);
  await rings.nth(2).hover();
  await expect(card).toContainText('Social Platform');
  await expect(card).toContainText('Call · Mai');
  await expect(card).toContainText('Influence regeneration doubles');
  await expect(card).toContainText('Reprobate generation halves');
  await expect(card).toContainText(/51m \d+s remaining/);
  await page.mouse.move(700, 400);
  await expect(card).toHaveCount(0);

  // Crossroads Dirt runs out mid-play: its ring leaves, the others stay.
  await expect(rings).toHaveCount(2, { timeout: 20_000 });
  await expect(rings.nth(0)).toHaveAccessibleName(/^Defixio/);
});

test('hides in the Altar room and steps aside over the Loculi', async ({ page }) => {
  await enterLair(page);
  const hud = page.getByRole('group', { name: 'Temporary buffs' });
  // The game opens in the Altar room, where no HUD rides.
  await expect(page.getByRole('group', { name: 'The Altar Room' })).toBeVisible();
  await expect(hud).toHaveCount(0);

  await page.getByRole('button', { name: 'To the Invocation Room' }).click();
  await expect(hud).toBeVisible();

  await page.getByRole('button', { name: 'Loculi' }).click();
  await expect(page.getByRole('dialog', { name: 'Loculi' })).toBeVisible();
  await expect(hud).toHaveCount(0);
  await expect(page.locator('.desidia-hud')).toHaveCount(0);
});
