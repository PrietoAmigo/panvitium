import { test, expect, type Page } from '@playwright/test';

/**
 * The end of the game (Claude Design "Semet ending" handoff). Once Semet is named, the altar raises
 * the golden seal of Semet in the Katabasis sigil's place, with no STATUS QUO beneath it. Its first
 * press arms it; the second ends the game: a black screen, the gold PANVITIUM wordmark after 1 s,
 * set where the title menu sets it, then after 5 s more the save is wiped and the title menu rises
 * beneath as the black lifts (1.2 s). The seeded save is an old v5 one still burning Panvitium, so
 * the load also exercises the migration chain through v14 → v15 (the retired rite dropped).
 */

/** A v5 save that has named Semet (the Eternal Sin threshold offered) and descended before. */
function semetSave(): string {
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
    deviceId: 'e2e-semet',
    state: {
      souls: '1000',
      devotion,
      eternalDevotion: '8398080000',
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
        activeToggles: ['panvitium'],
        toggleDurations: { panvitium: 12 },
        actionQueue: [],
      },
      rngState: 1,
      lastTickAt: now,
      startedAt: now,
      katabasisCount: 3,
    },
  });
}

async function enterLair(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
}

/** Click the altar low on its hotspot, clear of where the seal will rise. */
async function clickAltar(page: Page): Promise<void> {
  const altar = page.getByRole('button', { name: 'The Altar' });
  const box = await altar.boundingBox();
  if (!box) throw new Error('the altar hotspot has no box');
  await altar.click({ position: { x: box.width / 2, y: box.height - 12 } });
}

test('the seal of Semet ends the game and returns to the title over a fresh save', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript((save: string) => {
    // Seed only the first load: the ending wipes the save without reloading the page.
    if (sessionStorage.getItem('e2e-seeded') === null) {
      sessionStorage.setItem('e2e-seeded', '1');
      localStorage.setItem('panvitium:save', save);
    }
  }, semetSave());
  await enterLair(page);

  await clickAltar(page);
  const seal = page.getByRole('button', { name: 'Press the seal of Semet' });
  await expect(seal).toBeVisible();
  await expect(page.locator('.altar-sigil img[src*="sigils/32.png"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Status Quo' })).toHaveCount(0);

  await seal.click();
  const confirm = page.getByRole('button', { name: 'Confirm — this is the end' });
  await expect(confirm).toBeVisible();
  await confirm.click();

  // The black, then the wordmark; no descent opens.
  const end = page.locator('.panvitium-end');
  await expect(end).toBeVisible();
  await expect(page.locator('.katabasis-flow')).toHaveCount(0);
  const mark = page.locator('.panvitium-end-mark');
  await expect(mark).toHaveClass(/is-shown/, { timeout: 3000 });

  // The title rises beneath, its wordmark exactly where the ending's stands.
  const titleMark = page.locator('.title-menu .title-wordmark');
  await expect(titleMark).toBeVisible({ timeout: 8000 });
  const [a, b] = await Promise.all([mark.boundingBox(), titleMark.boundingBox()]);
  if (!a || !b) throw new Error('a wordmark has no box');
  expect(Math.abs(a.x - b.x)).toBeLessThan(1);
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  expect(Math.abs(a.width - b.width)).toBeLessThan(1);

  await expect(end).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('.title-menu')).toBeVisible();

  // A fresh game: back in the lair, the altar raises the Katabasis sigil again.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
  await clickAltar(page);
  await expect(page.getByRole('button', { name: 'Press the sigil' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Status Quo' })).toBeVisible();
});
