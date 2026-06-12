import { describe, it, expect } from 'vitest';
import { COMPOSITUM_IDS, compositumById } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { compositumCostLine, compositumOutcomesLine } from './compositumText.js';

describe('compositum text', () => {
  it('every toggle gets a labelled cost line and a non-empty outcomes line', () => {
    // ADR-027: the canonical nine all carry real effects — no stubs, no empty outcome lines.
    for (const id of COMPOSITUM_IDS) {
      const def = compositumById(id)!;
      const cost = compositumCostLine(def);
      const out = compositumOutcomesLine(def);
      expect(cost.startsWith(`${strings.compositum.cost}:`)).toBe(true);
      expect(out.startsWith(`${strings.compositum.outcomes}:`)).toBe(true);
      expect(out).not.toBe(`${strings.compositum.outcomes}: ${strings.compositum.noOutcome}`);
    }
  });

  it('states the upkeep, including the free toggles', () => {
    expect(compositumCostLine(compositumById('bacchanal')!)).toBe(
      `${strings.compositum.cost}: 100 ${strings.resources.gold}/s \u00B7 10 ${strings.resources.influence}/s`,
    );
    // Dolce Far Niente has no upkeep.
    expect(compositumCostLine(compositumById('dolce-far-niente')!)).toBe(
      `${strings.compositum.cost}: ${strings.compositum.noCost}`,
    );
    // Vegas states its percentage upkeep (ADR-027).
    expect(compositumCostLine(compositumById('vegas')!)).toBe(
      `${strings.compositum.cost}: 50% ${strings.compositum.ofGoldGain}`,
    );
    // Panvitium's upkeep ramps with time.
    expect(compositumCostLine(compositumById('panvitium')!)).toContain(strings.compositum.rising);
  });

  it('spells out the specific outcomes with numbers', () => {
    // Income-only ceremony.
    expect(compositumOutcomesLine(compositumById('charity')!)).toBe(
      `${strings.compositum.outcomes}: +200 ${strings.resources.gold}/s`,
    );
    // Rate boosts as percents (ADR-027).
    expect(compositumOutcomesLine(compositumById('bacchanal')!)).toContain(
      `+10% ${strings.compositum.toBreeding}`,
    );
    expect(compositumOutcomesLine(compositumById('doom-gathering')!)).toContain(
      `+10% ${strings.compositum.toDespair}`,
    );
    expect(compositumOutcomesLine(compositumById('enraging-broadcast')!)).toContain(
      `+10% ${strings.compositum.toKnives}`,
    );
    // Percentage conversions (Vegas → influence, Crusade → gold).
    expect(compositumOutcomesLine(compositumById('vegas')!)).toContain(
      `+1% ${strings.compositum.ofGoldGain} \u2192 ${strings.resources.influence}/s`,
    );
    expect(compositumOutcomesLine(compositumById('crusade')!)).toContain(
      `+1000% ${strings.compositum.ofInfluenceGain} \u2192 ${strings.resources.gold}/s`,
    );
    // Offline-gain ceremony.
    expect(compositumOutcomesLine(compositumById('dolce-far-niente')!)).toContain(
      `+1% ${strings.compositum.offlineGain}`,
    );
  });
});
