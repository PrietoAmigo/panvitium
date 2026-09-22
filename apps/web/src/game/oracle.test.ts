import { describe, it, expect } from 'vitest';
import { createInitialState } from '@panvitium/sim';
import { buildOracle } from './oracle.js';

const fresh = () => createInitialState('oracle-vm-test', 0);

describe('buildOracle view-model', () => {
  it('returns undefined for a non-oracular maleficium', () => {
    expect(buildOracle(fresh(), 'ars_serpens')).toBeUndefined();
  });

  it('reveals nothing for the former reveal items (all repurposed in the maleficia rework)', () => {
    // The Dadu, Hollow Effigy, Crossroads Dirt, Crow Feather and the Obsidian Mirror now carry
    // concrete enhancers, so no maleficium surfaces an odds reveal any more.
    for (const id of [
      'the_dadu',
      'hollow_effigy',
      'crossroads_dirt',
      'crow_feather',
      'obsidian_mirror',
    ]) {
      expect(buildOracle(fresh(), id), id).toBeUndefined();
    }
  });
});
