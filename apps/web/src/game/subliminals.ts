/**
 * The subliminal plates (presentation only; nothing here touches the sim, the RNG or the save). A
 * plate flashes over the whole screen for a fraction of a second, through the degradation pass like
 * the rooms. Two kinds:
 *   - Fausto's plates mark the moment the player EARNS one of his letters: the tick its requirement
 *     is met (the sim's `emailsTriggered`), not its later arrival in the inbox. "Take this with you"
 *     (fausto-4) has no plate, so the fourth plate belongs to Fausto #5.
 *   - The random plates surface on their own during play, about once every six minutes on average.
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
  'subl15_envy',
  'subl16_guilt',
  'subl17_resentment',
  'subl18_obsession',
  'subl19_betrayal',
  'sublcode_1',
  'sublcode_2',
].map((name) => `${BASE}/${name}.png`);

/** How long a plate holds on screen: a handful of frames, too brief to study. */
export const SUBLIMINAL_MS = 120;

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

/**
 * Pick a random plate from a uniform `roll` in [0, 1), never `previous` again straight away (so the
 * same plate cannot flash twice in a row).
 */
export function pickRandomSubliminal(roll: number, previous: string | null): string {
  const pool = RANDOM_SUBLIMINALS.filter((src) => src !== previous);
  const i = Math.min(pool.length - 1, Math.floor(Math.max(0, roll) * pool.length));
  return pool[i]!;
}
