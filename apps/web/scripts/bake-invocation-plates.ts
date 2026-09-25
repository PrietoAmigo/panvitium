// Bakes the Ars Goetia invocation plates (Claude Design, "Invocation Plates" handoff) into the static
// PNGs the grimoire shows:
//
//   pnpm --filter @panvitium/web bake:plates            # every plate
//   pnpm --filter @panvitium/web bake:plates imp fama   # only these
//
// Each plate's SVG comes from src/art (the brush and the gesture tables). Chromium rasterizes it at
// 2× the design box (600 × 800) into public/assets/panvitium/invocations-ars-goetia/<id>.png, and a
// digest of the SVG it baked is recorded in src/art/invocationPlates.baked.json, so a test catches a
// plate that was retuned but not re-baked. Needs Playwright's Chromium (`pnpm --filter
// @panvitium/web e2e:install`), or CHROMIUM_PATH pointing at another Chromium binary.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import type * as Plates from '../src/art/invocationPlates.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(web, 'public/assets/panvitium/invocations-ars-goetia');
const manifestPath = join(web, 'src/art/invocationPlates.baked.json');

// The generator is TypeScript importing with the repo's `.js` specifiers, so Vite loads it.
const vite = await createServer({
  root: web,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true },
});
const plates = (await vite.ssrLoadModule('/src/art/invocationPlates.ts')) as typeof Plates;
await vite.close();

const requested = process.argv.slice(2);
const unknown = requested.filter((id) => !plates.INVOCATION_PLATE_IDS.includes(id));
if (unknown.length > 0) throw new Error(`No plate for: ${unknown.join(', ')}`);
const ids = requested.length > 0 ? requested : plates.INVOCATION_PLATE_IDS;

const manifest: Record<string, string> = JSON.parse(
  await readFile(manifestPath, 'utf8').catch(() => '{}'),
);
await mkdir(outDir, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage({
    viewport: { width: 600, height: 800 },
    deviceScaleFactor: 1,
  });
  for (const id of ids) {
    const svg = plates.invocationPlateSvg(id)!;
    await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`);
    await page.locator('svg').screenshot({ path: join(outDir, `${id}.png`) });
    manifest[id] = createHash('sha256').update(plates.plateFingerprint(svg)).digest('hex');
    console.log(`baked ${id}`);
  }
} finally {
  await browser.close();
}
// Recorded in plate order, formatted as Prettier formats JSON.
const recorded = plates.INVOCATION_PLATE_IDS.filter((id) => manifest[id] !== undefined).map(
  (id) => [id, manifest[id]] as const,
);
await writeFile(manifestPath, `${JSON.stringify(Object.fromEntries(recorded), null, 2)}\n`);
