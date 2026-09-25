import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * E2E coverage for the Ars Goetia's painted plates (Claude Design, "Invocation Plates" handoff):
 * opening an entry's leaf sets its plate on the right-hand page, the baked 600×800 PNG served from
 * the production build, filling the column's width as a decorative image; each entry shows its own,
 * sealed or not. A seeded save (two relics, invoking power 6, so the whole roster is visible) is
 * written to localStorage before load.
 */

/** A minimal valid v5 save owning the Codex Gigas (4) and a Witch Bottle (2), stamped to "now". */
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
    deviceId: 'e2e-ars-goetia',
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
        maleficia: ['codex_gigas', 'witch_bottle'],
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

async function openArsGoetia(page: Page): Promise<Locator> {
  await page.addInitScript((save: string) => {
    localStorage.setItem('panvitium:save', save);
  }, seededSave());
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole('button', { name: 'To the Invocation Room' }).click();
  await page.getByRole('button', { name: 'Ars Goetia' }).click();
  const book = page.getByRole('dialog', { name: 'Ars Goetia' });
  await expect(book).toBeVisible();
  return book;
}

/** The plate on the open leaf, once its PNG has loaded; returns its natural width. */
async function loadedWidth(plate: Locator): Promise<number> {
  return plate.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0));
}

test("sets an entry's painted plate on the right-hand page", async ({ page }) => {
  const book = await openArsGoetia(page);
  await expect(book.locator('img')).toHaveCount(0); // none on the index

  await book.locator('.gb-entry', { hasText: 'Familiar' }).click();
  const right = book.locator('.gb-page--right');
  const plate = right.locator('img');
  await expect(plate).toBeVisible();
  await expect(plate).toHaveAttribute(
    'src',
    '/assets/panvitium/invocations-ars-goetia/familiar.png',
  );
  await expect(plate).toHaveAttribute('alt', '');
  await expect.poll(() => loadedWidth(plate)).toBe(600);

  // The plate spans the column's width at its 3:4 proportion.
  const column = await right.boundingBox();
  const box = await plate.boundingBox();
  expect(column && box).toBeTruthy();
  expect(Math.abs(box!.width - column!.width)).toBeLessThan(1);
  expect(Math.abs(box!.height - (box!.width * 4) / 3)).toBeLessThan(1);
  expect(box!.height).toBeLessThanOrEqual(column!.height);
});

test('shows each entry its own plate, sealed or not', async ({ page }) => {
  const book = await openArsGoetia(page);
  const plate = book.locator('.gb-page--right img');

  // Aurevora is an apex, sealed on this save (its Sin is at level 0).
  await book.locator('.gb-entry', { hasText: 'Aurevora' }).click();
  await expect(book.getByRole('button', { name: 'Sealed' })).toBeVisible();
  await expect(plate).toHaveAttribute(
    'src',
    '/assets/panvitium/invocations-ars-goetia/aurevora.png',
  );
  await expect.poll(() => loadedWidth(plate)).toBe(600);

  await book.getByRole('button', { name: 'back to index' }).click();
  await book.locator('.gb-entry', { hasText: 'Morpheus' }).click();
  await expect(plate).toHaveAttribute(
    'src',
    '/assets/panvitium/invocations-ars-goetia/morpheus.png',
  );
  await expect.poll(() => loadedWidth(plate)).toBe(600);
});
