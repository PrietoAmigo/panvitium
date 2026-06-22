import { describe, it, expect } from 'vitest';
import { createInitialState } from '@panvitium/sim';
import { buildOracle } from './oracle.js';

const fresh = () => createInitialState('oracle-vm-test', 0);

describe('buildOracle view-model (5.1)', () => {
  it('returns undefined for a non-oracular maleficium', () => {
    expect(buildOracle(fresh(), 'ars_serpens')).toBeUndefined();
  });

  it('Hollow Effigy reveals Suasio with its three actions', () => {
    const r = buildOracle(fresh(), 'hollow_effigy')!;
    expect(r).toHaveLength(1);
    expect(r[0]!.category).toBe('suasio');
    expect(r[0]!.actions.map((a) => a.action)).toEqual(['suggestion', 'logismoi', 'imperium']);
  });

  it('The Dadu reveals Decimatio', () => {
    const r = buildOracle(fresh(), 'the_dadu')!;
    expect(r[0]!.category).toBe('decimatio');
    expect(r[0]!.actions.map((a) => a.action)).toEqual(['caedes', 'pogrom', 'purgatio']);
  });

  it('Crossroads Dirt reveals Emptio and Crow Feather reveals Indagatio (per the catalog)', () => {
    expect(buildOracle(fresh(), 'crossroads_dirt')![0]!.category).toBe('emptio');
    expect(buildOracle(fresh(), 'crow_feather')![0]!.category).toBe('indagatio');
  });

  it('the Obsidian Mirror reveals all four categories', () => {
    const r = buildOracle(fresh(), 'obsidian_mirror')!;
    expect(r.map((g) => g.category)).toEqual(['suasio', 'decimatio', 'indagatio', 'emptio']);
  });

  it('each action distribution has seven tiers summing to ~1', () => {
    const r = buildOracle(fresh(), 'obsidian_mirror')!;
    for (const g of r) {
      for (const a of g.actions) {
        expect(a.tiers).toHaveLength(7);
        expect(a.tiers.reduce((acc, t) => acc + t.pct, 0)).toBeCloseTo(1, 6);
      }
    }
  });
});
