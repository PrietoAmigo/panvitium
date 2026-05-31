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
      // Illustrated entries carry the design art; the rest omit illus and degrade to a text leaf.
      if (DESIGN_ILLUSTRATED.includes(e.id)) expect(e.illus).toContain('/invocations/');
      else expect(e.illus).toBeUndefined();
    }
  });
});
