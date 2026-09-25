import { test, expect, type Page } from '@playwright/test';

/**
 * The altar sigil (Claude Design "Altar sigil" handoff): clicking the altar raises the Katabasis
 * sigil over the Altar Room, with STATUS QUO beneath it; the room stays. The seal is painted into
 * the room's degradation canvas, so the pixelation reaches it like the rest of the frame. Its first
 * press arms it, the second falls into the descent; STATUS QUO opens the Ledger, whose way back
 * returns to the room; left alone for 4 s, the sigil fades away.
 */

/** Dismiss the launch title menu and wait out the entry transition (see smoke.spec.ts). */
async function enterLair(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.title-menu')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.entry-fade')).toHaveCount(0, { timeout: 15_000 });
}

/** Click the altar low on its hotspot, clear of where the sigil will rise. */
async function clickAltar(page: Page): Promise<void> {
  const altar = page.getByRole('button', { name: 'The Altar' });
  const box = await altar.boundingBox();
  if (!box) throw new Error('the altar hotspot has no box');
  await altar.click({ position: { x: box.width / 2, y: box.height - 12 } });
}

/** Cream-bright pixels (the seal's strokes) in the canvas around the stage's centre. */
async function brightAtCentre(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.scene-canvas');
    const px = canvas?.getContext('2d')?.getImageData(520, 240, 240, 240).data;
    if (!px) return -1;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i]! > 200 && px[i + 1]! > 170 && px[i + 2]! > 150) n++;
    }
    return n;
  });
}

test('the altar raises its sigil over the room, painted into the degraded canvas', async ({
  page,
}) => {
  await enterLair(page);
  const before = await brightAtCentre(page);
  await clickAltar(page);
  await expect(page.getByRole('button', { name: 'Press the sigil' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Status Quo' })).toBeVisible();
  // The room is not replaced: no full-screen flow opens.
  await expect(page.getByRole('group', { name: 'The Altar Room', exact: true })).toBeVisible();
  await expect(page.locator('.katabasis-flow')).toHaveCount(0);
  // No crisp seal image sits over the room: the seal is drawn inside the canvas, through the pass.
  await expect(page.locator('img[src*="seal-panvitium"]')).toHaveCount(0);
  // …and its strokes light the canvas there (~7k bright pixels over a ~1k floor, measured).
  await expect.poll(() => brightAtCentre(page), { timeout: 5_000 }).toBeGreaterThan(before + 2000);
});

test('arms on the first press, then falls into the descent among the Princes', async ({ page }) => {
  await enterLair(page);
  await clickAltar(page);
  await page.getByRole('button', { name: 'Press the sigil' }).click();
  await expect(page.getByRole('button', { name: 'Status Quo' })).toHaveCount(0);
  await page.getByRole('button', { name: /Confirm the descent/ }).click();
  await expect(page.locator('.transit-word')).toHaveText('Katabasis');
  await expect(page.locator('.statue')).toHaveCount(8, { timeout: 10_000 });
});

test('STATUS QUO opens the Ledger, whose way back returns to the room', async ({ page }) => {
  await enterLair(page);
  await clickAltar(page);
  await page.getByRole('button', { name: 'Status Quo' }).click();
  await expect(page.getByRole('heading', { name: 'The Ledger' })).toBeVisible();
  await page.getByRole('button', { name: /Return to the altar/ }).click();
  await expect(page.locator('.katabasis-flow')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'The Altar Room', exact: true })).toBeVisible();
  await expect(page.locator('.altar-sigil')).toHaveCount(0);
});

test('left alone, the sigil fades away; a door puts it away at once', async ({ page }) => {
  await enterLair(page);
  await clickAltar(page);
  await expect(page.locator('.altar-sigil')).toHaveCount(1);
  await expect(page.locator('.altar-sigil')).toHaveCount(0, { timeout: 8_000 }); // 4 s + 0.5 s fade
  await clickAltar(page);
  await page.getByRole('button', { name: 'To the Studio' }).click();
  await expect(page.locator('.altar-sigil')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'The Studio', exact: true })).toBeVisible();
});
