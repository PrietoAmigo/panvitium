import { describe, it, expect } from 'vitest';
import { createInitialState, currentInvokingPower, MALEFICIA } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { buildGoetia } from './invocations.js';

// Equip the full maleficia catalog so every invocation clears its visibility threshold, letting the
// adapter's mapping be exercised across the whole roster (locked + unlocked, illustrated + not).
function richState() {
  const s = createInitialState('goetia-test', 0);
  return { ...s, lifetime: { ...s.lifetime, maleficia: Object.keys(MALEFICIA) } };
}

describe('buildGoetia view-model adapter', () => {
  it('reports the real invoking power, pre-formatted as a string', () => {
    const state = richState();
    const view = buildGoetia(state);
    expect(view.invokingPower).toBe(String(currentInvokingPower(state)));
  });

  it('surfaces visible invocations as grimoire entries', () => {
    const view = buildGoetia(richState());
    expect(view.entries.length).toBeGreaterThanOrEqual(6);
  });

  it('maps every row from real data with the gate/unlocked invariant', () => {
    const view = buildGoetia(richState());
    for (const e of view.entries) {
      // Name always comes from the canonical strings table, never fabricated.
      expect(e.name).toBe(strings.invocations.names[e.id]);
      // Unlocked → no gate shown (omitted); locked → the gate carries the real requirement.
      if (e.unlocked) expect(e.gate).toBeUndefined();
      else expect(typeof e.gate).toBe('string');
      // Every seal points its book drawing at the dedicated folder, keyed by id; a missing
      // drawing 404s at runtime and the book falls back to a text plate (handled in the component).
      expect(e.illus).toBe(`/assets/panvitium/invocations-ars-goetia/${e.id}.png`);
    }
  });

  it('a fresh roster shows nothing bound', () => {
    for (const e of buildGoetia(richState()).entries) {
      expect(e.active).toBe(0);
      expect(e.bound).toBeUndefined();
      expect(e.atCap).toBe(false);
    }
  });

  it('reports the cap, affordability, and a single bound badge (no copy count)', () => {
    const base = richState();
    // Stack a stackable invocation and bind a singleton apex (set directly on state).
    const s = {
      ...base,
      lifetime: { ...base.lifetime, invocations: { fama: 2, midas: 1 } },
    };
    const view = buildGoetia(s);

    const fama = view.entries.find((e) => e.id === 'fama')!;
    expect(fama.active).toBe(2);
    expect(fama.atCap).toBe(false); // stackable — never caps
    // Stacked copies are never advertised: a stackable invocation reads as a single 'bound' badge.
    expect(fama.bound).toBe(strings.invocations.active); // 'bound' — no copy count for stacked copies

    const midas = view.entries.find((e) => e.id === 'midas')!;
    expect(midas.active).toBe(1);
    expect(midas.atCap).toBe(true); // apex, maxActive 1
    expect(midas.bound).toBe(strings.invocations.active); // 'bound' — no ×1 for a singleton
    expect(midas.affordable).toBe(true); // free apex is always affordable
  });
});

describe('buildGoetia effect lines (sim-derived, not stale static copy)', () => {
  const effectOf = (id: string): string => {
    const e = buildGoetia(richState()).entries.find((x) => x.id === id);
    return e?.effect ?? '';
  };

  it('never emits a broken \\u escape (the old menus.data.ts copy rendered literal \\u00D7)', () => {
    for (const e of buildGoetia(richState()).entries) {
      expect(e.effect ?? '').not.toMatch(/\\u[0-9A-Fa-f]{4}/);
    }
  });

  it('Harpy reads as its Pogrom runner (#8), not the stale "Suasio"', () => {
    const eff = effectOf('harpy');
    expect(eff).toMatch(/Pogrom/i);
    expect(eff).not.toMatch(/Suasio/i);
  });

  it('Behemoth reads as a Stellar-chance boost, not the stale "reprobate generation"', () => {
    const eff = effectOf('behemoth');
    expect(eff.toLowerCase()).toContain('stellar');
    expect(eff.toLowerCase()).not.toContain('reprobate generation');
  });

  it('runner invocations (Lamia, Imp) describe an action + cadence, not a passive blurb', () => {
    expect(effectOf('lamia')).toMatch(/Logismoi/i);
    expect(effectOf('lamia')).toContain('every');
    expect(effectOf('imp')).toMatch(/Caedes/i);
    expect(effectOf('imp')).toContain('every');
  });

  it('Fama shows a live percentage, not a hardcoded "+50%"', () => {
    const eff = effectOf('fama');
    expect(eff).toMatch(/%/);
    expect(eff).not.toContain('50%');
  });
});
