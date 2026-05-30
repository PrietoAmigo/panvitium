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

const DESIGN_ILLUSTRATED = ['imp', 'upir', 'harpy', 'fama', 'nightmare', 'behemoth'];

describe('buildGoetia view-model adapter (W2)', () => {
  it('reports the real invoking power', () => {
    const state = richState();
    const view = buildGoetia(state);
    expect(view.power).toBe(currentInvokingPower(state));
    expect(view.power).toBeGreaterThan(0);
  });

  it('surfaces visible invocations as presentation rows', () => {
    const view = buildGoetia(richState());
    expect(view.entries.length).toBeGreaterThanOrEqual(6);
  });

  it('maps every row from real data with the gate/unlocked invariant', () => {
    const view = buildGoetia(richState());
    for (const e of view.entries) {
      // Name always comes from the canonical strings table, never fabricated.
      expect(e.name).toBe(strings.invocations.names[e.id]);
      // Unlocked → no Seal shown; locked → the Seal carries the real requirement.
      if (e.unlocked) expect(e.gate).toBeNull();
      else expect(typeof e.gate).toBe('string');
      // Illustrated entries use the design art; the rest fall back to the Ars Goetia plate.
      if (DESIGN_ILLUSTRATED.includes(e.id)) expect(e.img).toContain('/invocations/');
      else expect(e.img).toContain('ars_goetia.png');
      // A real active count is always present for the "N bound" hint.
      expect(typeof view.counts[e.id]).toBe('number');
    }
  });

  it('reflects an active invocation in the bound counts', () => {
    const base = richState();
    const state = {
      ...base,
      lifetime: { ...base.lifetime, invocations: { ...base.lifetime.invocations, imp: 2 } },
    };
    const view = buildGoetia(state);
    expect(view.counts.imp).toBe(2);
  });
});
