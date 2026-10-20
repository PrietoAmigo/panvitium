import { test, expect, type Page } from '@playwright/test';

/**
 * The altar sigil (Claude Design "Altar sigil" handoff): clicking the altar raises the Katabasis
 * sigil over the Altar Room, with STATUS QUO beneath it; the room stays. The seal is a crisp DOM
 * image over the room's canvas, outside the degradation pass, so no pixelation reaches it; the red
 * light it casts is painted into the canvas, through the pass. Its first press arms it, the second
 * falls into the descent (empty-handed before the playthrough's first descent, the empty-handed
 * warning plays once instead); STATUS QUO opens the Ledger, whose way back returns to the room; left
 * alone for 4 s, the sigil fades away.
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

/** In the canvas around the stage's centre: cream-bright pixels (the seal's strokes) and deep red
 *  ones (its glow). */
async function atCentre(page: Page): Promise<{ cream: number; red: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.scene-canvas');
    const px = canvas?.getContext('2d')?.getImageData(520, 240, 240, 240).data;
    if (!px) return { cream: -1, red: -1 };
    let cream = 0;
    let red = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
      if (r > 200 && g > 170 && b > 150) cream++;
      if (r > 120 && g < 60 && b < 60) red++;
    }
    return { cream, red };
  });
}

test('the altar raises its sigil over the room, crisp, its glow inside the degraded canvas', async ({
  page,
}) => {
  await enterLair(page);
  const before = await atCentre(page);
  await clickAltar(page);
  await expect(page.getByRole('button', { name: 'Press the sigil' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Status Quo' })).toBeVisible();
  // The room is not replaced: no full-screen flow opens.
  await expect(page.getByRole('group', { name: 'The Altar Room', exact: true })).toBeVisible();
  await expect(page.locator('.katabasis-flow')).toHaveCount(0);
  // The seal is a decoded image over the room, at the browser's own resolution…
  const glyph = page.locator('.altar-sigil img[src*="seal-panvitium"]');
  await expect(glyph).toBeVisible();
  await expect
    .poll(() => glyph.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  // …and none of it is drawn into the canvas (its strokes would add ~6k bright pixels there)…
  expect((await atCentre(page)).cream).toBeLessThan(before.cream + 2000);
  // …but its glow is: the canvas centre turns deep red (~1k such pixels before, ~49k after, of
  // 57.6k, measured).
  await expect.poll(async () => (await atCentre(page)).red).toBeGreaterThan(before.red + 20_000);
});

test('arms on the first press; empty-handed, the first commit is stopped, the next descends', async ({
  page,
}) => {
  await enterLair(page);
  await clickAltar(page);
  await page.getByRole('button', { name: 'Press the sigil' }).click();
  await expect(page.getByRole('button', { name: 'Status Quo' })).toHaveCount(0);
  // A fresh game holds no souls: the first commit plays the empty-handed warning instead (once per
  // playthrough). It runs 7.3 s and cannot be skipped, then hands back the Altar Room.
  await page.getByRole('button', { name: /Confirm the descent/ }).click();
  const warning = page.locator('.empty-handed');
  await expect(warning).toHaveText('I should not descend empty-handed.');
  await expect(page.locator('.altar-sigil')).toHaveCount(0);
  await warning.click();
  await expect(warning).toBeVisible();
  await expect(warning).toHaveCount(0, { timeout: 12_000 });
  await expect(page.locator('.katabasis-flow')).toHaveCount(0);
  // The second commit descends, souls or not.
  await clickAltar(page);
  await page.getByRole('button', { name: 'Press the sigil' }).click();
  await page.getByRole('button', { name: /Confirm the descent/ }).click();
  await expect(page.locator('.transit-word')).toHaveText('Katabasis');
  await expect(page.locator('.transit-sub')).toHaveText('exspes in ima');
  // The descent holds 5 s and cannot be skipped: a click on it changes nothing.
  await page.locator('.transit').click();
  await expect(page.locator('.transit')).toBeVisible();
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
