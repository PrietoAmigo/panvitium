import { describe, it, expect } from 'vitest';
import { COMPOSITUM_IDS, compositumById } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { compositumCostLine, compositumOutcomesLine } from './compositumText.js';

describe('compositum text', () => {
  it('every toggle gets a labelled cost line and a non-empty outcomes line', () => {
    // outrage-cycle / vegas / crusade lost their only subtype/conversion effect and await the VC
    // rework (Slice 3); of these only outrage-cycle has no income, so its outcomes line is empty.
    const effectlessStubs = new Set(['outrage-cycle']);
    for (const id of COMPOSITUM_IDS) {
      const def = compositumById(id)!;
      const cost = compositumCostLine(def);
      const out = compositumOutcomesLine(def);
      expect(cost.startsWith(`${strings.compositum.cost}:`)).toBe(true);
      expect(out.startsWith(`${strings.compositum.outcomes}:`)).toBe(true);
      if (!effectlessStubs.has(id)) {
        expect(out).not.toBe(`${strings.compositum.outcomes}: ${strings.compositum.noOutcome}`);
      }
    }
  });

  it('states the upkeep, including the free toggles', () => {
    expect(compositumCostLine(compositumById('bacchanal')!)).toBe(
      `${strings.compositum.cost}: 100 ${strings.resources.gold}/s \u00B7 10 ${strings.resources.influence}/s`,
    );
    // No-babies Movement has no upkeep.
    expect(compositumCostLine(compositumById('no-babies-movement')!)).toBe(
      `${strings.compositum.cost}: ${strings.compositum.noCost}`,
    );
    // Panvitium's upkeep ramps with time.
    expect(compositumCostLine(compositumById('panvitium')!)).toContain(strings.compositum.rising);
  });

  it('spells out the specific outcomes with numbers', () => {
    // Income-only ceremony (conversion removed with subtypes).
    expect(compositumOutcomesLine(compositumById('loan-shark-op')!)).toBe(
      `${strings.compositum.outcomes}: +100 ${strings.resources.gold}/s`,
    );
    // The effectless Slice-3 stub reads as "no outcome".
    expect(compositumOutcomesLine(compositumById('outrage-cycle')!)).toBe(
      `${strings.compositum.outcomes}: ${strings.compositum.noOutcome}`,
    );
    // Population-proportional breeding as a percent.
    expect(compositumOutcomesLine(compositumById('bacchanal')!)).toContain('10%');
    // Percentage cull.
    expect(compositumOutcomesLine(compositumById('enraging-broadcast')!)).toContain(
      `${strings.compositum.culls} 0.1% ${strings.compositum.ofAll}`,
    );
    // Offline-gain ceremony.
    expect(compositumOutcomesLine(compositumById('dolce-far-niente')!)).toContain(
      `+1% ${strings.compositum.offlineGain}`,
    );
  });
});
