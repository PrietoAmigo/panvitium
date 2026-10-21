/**
 * The subliminal plates (presentation only; nothing here touches the sim, the RNG or the save). A
 * plate flashes over the whole screen for a fraction of a second, through the degradation pass like
 * the rooms. Two kinds:
 *   - Fausto's plates mark the moment the player EARNS one of his letters: the tick its requirement
 *     is met (the sim's `emailsTriggered`), not its later arrival in the inbox. "Take this with you"
 *     (fausto-4) has no plate, so the fourth plate belongs to Fausto #5.
 *   - The random plates surface on their own during play, about once every six minutes on average.
 *     Two of them, the code plates (982, then 079: the rectory number, Clare Ashby's last days), are
 *     in the draw only from Father Stahl's first letter until the player dials that number, and then
 *     each is ten times likelier than any other plate.
 */
import { ASSET_BASE } from '../menus/degrade.data.js';

const BASE = `${ASSET_BASE}/subliminals`;

/** Fausto's plates, keyed by the email whose requirement summons them. */
export const FAUSTO_SUBLIMINALS: Readonly<Record<string, string>> = {
  'fausto-1': `${BASE}/fausto1.png`,
  'fausto-2': `${BASE}/fausto2.png`,
  'fausto-3': `${BASE}/fausto3.png`,
  'fausto-5': `${BASE}/fausto4.png`,
};

/** The plates that surface at random during play. */
export const RANDOM_SUBLIMINALS: readonly string[] = [
  'subl1_flesh',
  'subl2_darkness',
  'subl3_hopeless',
  'subl4_humiliation',
  'subl5_decay',
  'subl6_fear',
  'subl7_gula1',
  'subl8_gula2',
  'subl9_avaritia',
  'subl10_lust',
  'subl11_anger',
  'subl12_desidia',
  'subl13_vanagloria',
  'subl14_superbia',
  'sublcode_1',
  'sublcode_2',
].map((name) => `${BASE}/${name}.png`);

/** The two code plates among the random ones: the halves of the rectory number, 982 then 079. */
export const CODE_SUBLIMINALS: readonly string[] = ['sublcode_1', 'sublcode_2'].map(
  (name) => `${BASE}/${name}.png`,
);

/** Whether `src` is one of the two code plates. */
export function isCodeSubliminal(src: string): boolean {
  return CODE_SUBLIMINALS.includes(src);
}

/**
 * Whether the code plates may surface: from Father Stahl's first letter (`fr-stahl-1` received)
 * until the player has dialled the number they spell (the rectory call, `the-rectory`, placed).
 * Both records are permanent, so the window opens and closes once per game.
 */
export function codePlatesShown(
  receivedEmailIds: ReadonlySet<string>,
  placedCallIds: ReadonlySet<string>,
): boolean {
  return receivedEmailIds.has('fr-stahl-1') && !placedCallIds.has('the-rectory');
}

/** How long an ordinary random plate holds on screen: a handful of frames, too brief to study. */
export const SUBLIMINAL_MS = 100;

/** How long a code plate or one of Fausto's holds: a little longer, so it can just be caught. */
export const SUBLIMINAL_LONG_MS = 160;

/** Whether `src` is one of Fausto's plates. */
export function isFaustoSubliminal(src: string): boolean {
  return Object.values(FAUSTO_SUBLIMINALS).includes(src);
}

/** How long the plate `src` holds on screen: the code plates and Fausto's 160 ms, the rest 100 ms. */
export function subliminalHoldMs(src: string): number {
  return isCodeSubliminal(src) || isFaustoSubliminal(src) ? SUBLIMINAL_LONG_MS : SUBLIMINAL_MS;
}

/** Random plates arrive as a Poisson process averaging one every six minutes of play. */
export const SUBLIMINAL_MEAN_GAP_MS = 6 * 60 * 1000;

/** The plates for the emails earned this tick, in the order they were earned. */
export function faustoSubliminals(triggeredEmailIds: readonly string[]): string[] {
  return triggeredEmailIds.flatMap((id) => {
    const src = FAUSTO_SUBLIMINALS[id];
    return src === undefined ? [] : [src];
  });
}

/**
 * The chance a random plate surfaces within `elapsedMs` of play: exact geometric integration
 * (1 − e^(−Δt/T)), so the long-run rate holds whatever the check cadence (the call-in convention).
 */
export function subliminalChance(elapsedMs: number): number {
  return 1 - Math.exp(-Math.max(0, elapsedMs) / SUBLIMINAL_MEAN_GAP_MS);
}

/** How much likelier each code plate is to be drawn than any other plate, while it is in the draw. */
export const CODE_SUBLIMINAL_WEIGHT = 10;

/**
 * Pick a random plate from a uniform `roll` in [0, 1), never `previous` again straight away (so the
 * same plate cannot flash twice in a row). The code plates are in the pool only `withCodes`, each
 * weighted `CODE_SUBLIMINAL_WEIGHT` against 1 for every other plate.
 */
export function pickRandomSubliminal(
  roll: number,
  previous: string | null,
  withCodes: boolean,
): string {
  const pool = RANDOM_SUBLIMINALS.filter(
    (src) => src !== previous && (withCodes || !isCodeSubliminal(src)),
  );
  const weight = (src: string): number => (isCodeSubliminal(src) ? CODE_SUBLIMINAL_WEIGHT : 1);
  let r = Math.max(0, roll) * pool.reduce((sum, src) => sum + weight(src), 0);
  for (const src of pool) {
    r -= weight(src);
    if (r < 0) return src;
  }
  return pool[pool.length - 1]!;
}
