import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * E2E coverage for the Magna Goetia's entry leaves, set in quarters: the painted plate (Claude
 * Design, "Invocation Plates" handoff) in the top half of the right-hand page, the baked 600×800 PNG
 * served from the production build at the full height of that half as a decorative image, each entry
 * its own, sealed or not; the stats in the top half of the left page; the lore below both, filling
 * the left page's half before running on into the right's; Summon / Dispel in the bottom-right
 * corner. Every leaf is measured so nothing is clipped. A seeded save (two relics, invoking power 6,
 * so the whole roster is visible) is written to localStorage before load.
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
    deviceId: 'e2e-magna-goetia',
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

async function openMagnaGoetia(page: Page): Promise<Locator> {
  await page.addInitScript((save: string) => {
    localStorage.setItem('panvitium:save', save);
  }, seededSave());
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole('button', { name: 'To the Invocation Room' }).click();
  await page.getByRole('button', { name: 'Magna Goetia' }).click();
  const book = page.getByRole('dialog', { name: 'Magna Goetia' });
  await expect(book).toBeVisible();
  return book;
}

/** The plate on the open leaf, once its PNG has loaded; returns its natural width. */
async function loadedWidth(plate: Locator): Promise<number> {
  return plate.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0));
}

test("sets an entry's painted plate in the top half of the right-hand page", async ({ page }) => {
  const book = await openMagnaGoetia(page);
  await expect(book.locator('img')).toHaveCount(0); // none on the index

  await book.locator('.gb-entry', { hasText: 'Familiar' }).click();
  const right = book.locator('.gb-page--right');
  const plate = right.locator('img');
  await expect(plate).toBeVisible();
  await expect(plate).toHaveAttribute(
    'src',
    '/assets/panvitium/invocations-magna-goetia/familiar.png',
  );
  await expect(plate).toHaveAttribute('alt', '');
  await expect.poll(() => loadedWidth(plate)).toBe(600);

  // The plate fills the half's height at its 3:4 proportion, inside the column, above the lore.
  const half = await right.boundingBox();
  const box = await plate.boundingBox();
  const lore = await book.locator('.gb-lore').boundingBox();
  expect(half && box && lore).toBeTruthy();
  expect(Math.abs(box!.height - half!.height)).toBeLessThan(1);
  expect(Math.abs(box!.width - (box!.height * 3) / 4)).toBeLessThan(1);
  expect(box!.x).toBeGreaterThanOrEqual(half!.x - 0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(half!.x + half!.width + 0.5);
  expect(half!.y + half!.height).toBeLessThanOrEqual(lore!.y);
});

test('fits every leaf: stats, lore and actions, nothing clipped', async ({ page }) => {
  const book = await openMagnaGoetia(page);
  await page.evaluate(() => document.fonts.ready);
  const names = await book.locator('.gb-entry .gb-name').allTextContents();
  expect(names).toHaveLength(25);
  for (const name of names) {
    await book.locator('.gb-entry', { hasText: name }).click();
    const m = await book.evaluate((el) => {
      const rect = (sel: string): DOMRect => el.querySelector(sel)!.getBoundingClientRect();
      const stats = el.querySelector('.gb-stats')!;
      const lore = el.querySelector('.gb-lore')!;
      // Where the lore's text actually lands: its line boxes, by page.
      const range = document.createRange();
      range.selectNodeContents(lore);
      const lines = Array.from(range.getClientRects());
      const right = rect('.gb-page--right');
      return {
        statsClipped: stats.scrollHeight - stats.clientHeight,
        loreOverflow: lore.scrollWidth - lore.clientWidth,
        leftBottom: rect('.gb-page--left').bottom,
        loreTop: rect('.gb-lore').top,
        loreBottom: rect('.gb-lore').bottom,
        textBottom: Math.max(...lines.map((r) => r.bottom)),
        textRight: Math.max(...lines.map((r) => r.right)),
        rightPage: { left: right.left, right: right.right },
        actions: rect('.gb-actions'),
      };
    });
    // The stats show whole (a 1px rounding allowance); the lore stays within its two columns.
    expect(m.statsClipped, name).toBeLessThanOrEqual(1);
    expect(m.loreOverflow, name).toBeLessThanOrEqual(0);
    expect(m.textRight, name).toBeLessThanOrEqual(m.rightPage.right + 1);
    // Top half, then the lore, then the actions under it, right-aligned with the right-hand page.
    expect(m.loreTop, name).toBeGreaterThanOrEqual(m.leftBottom);
    expect(m.textBottom, name).toBeLessThanOrEqual(m.loreBottom + 1);
    expect(m.actions.top, name).toBeGreaterThanOrEqual(m.loreBottom);
    expect(Math.abs(m.actions.right - m.rightPage.right), name).toBeLessThan(1);
    await book.getByRole('button', { name: 'back to index' }).click();
  }
});

test('runs long lore on from the left page into the right', async ({ page }) => {
  const book = await openMagnaGoetia(page);
  await book.locator('.gb-entry', { hasText: 'Erinyes' }).click();
  const pages = await book.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el.querySelector('.gb-lore')!);
    const left = el.querySelector('.gb-page--left')!.getBoundingClientRect();
    const right = el.querySelector('.gb-page--right')!.getBoundingClientRect();
    const lines = Array.from(range.getClientRects());
    return {
      onLeft: lines.some((r) => r.left >= left.left - 1 && r.right <= left.right + 1),
      onRight: lines.some((r) => r.left >= right.left - 1 && r.right <= right.right + 1),
    };
  });
  expect(pages).toEqual({ onLeft: true, onRight: true });
});

test('shows each entry its own plate, sealed or not', async ({ page }) => {
  const book = await openMagnaGoetia(page);
  const plate = book.locator('.gb-page--right img');

  // Aurevora is an apex, sealed on this save (its Sin is at level 0).
  await book.locator('.gb-entry', { hasText: 'Aurevora' }).click();
  await expect(book.getByRole('button', { name: 'Sealed' })).toBeVisible();
  await expect(plate).toHaveAttribute(
    'src',
    '/assets/panvitium/invocations-magna-goetia/aurevora.png',
  );
  await expect.poll(() => loadedWidth(plate)).toBe(600);

  await book.getByRole('button', { name: 'back to index' }).click();
  await book.locator('.gb-entry', { hasText: 'Morpheus' }).click();
  await expect(plate).toHaveAttribute(
    'src',
    '/assets/panvitium/invocations-magna-goetia/morpheus.png',
  );
  await expect.poll(() => loadedWidth(plate)).toBe(600);
});
