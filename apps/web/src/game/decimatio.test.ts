import { describe, it, expect } from 'vitest';
import { createInitialState, type ReprobateSubtype } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { pogromTargets } from './decimatio.js';

function withReprobates(counts: Partial<Record<ReprobateSubtype, number>>) {
  const s = createInitialState('decimatio-test', 0);
  return { ...s, lifetime: { ...s.lifetime, reprobates: { ...s.lifetime.reprobates, ...counts } } };
}

describe('pogromTargets view-model (5.1)', () => {
  it('is empty when no reprobates are present', () => {
    expect(pogromTargets(createInitialState('decimatio-test', 0))).toHaveLength(0);
  });

  it('offers only present subtypes, each with its label and live count', () => {
    const targets = pogromTargets(withReprobates({ glutton: 4, nihilist: 2 }));
    expect(targets.map((t) => t.subtype).sort()).toEqual(['glutton', 'nihilist']);
    const glutton = targets.find((t) => t.subtype === 'glutton');
    expect(glutton).toEqual({ subtype: 'glutton', label: strings.subtypes.glutton, count: 4 });
  });

  it('excludes subtypes at zero count', () => {
    const targets = pogromTargets(withReprobates({ glutton: 0, celebrity: 3 }));
    expect(targets.map((t) => t.subtype)).toEqual(['celebrity']);
  });
});
