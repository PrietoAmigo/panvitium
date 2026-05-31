import { describe, it, expect } from 'vitest';
import { createInitialState } from '@panvitium/sim';
import { buildCabinet } from './maleficia.js';

function owning(ids: string[]) {
  const s = createInitialState('cabinet-test', 0);
  return { ...s, lifetime: { ...s.lifetime, maleficia: ids } };
}

describe('buildCabinet view-model (W5)', () => {
  it('is empty when nothing is owned', () => {
    expect(buildCabinet(createInitialState('cabinet-test', 0))).toHaveLength(0);
  });

  it('maps an owned maleficium from the catalog, merged with design art', () => {
    const [item] = buildCabinet(owning(['ars_serpens']));
    expect(item).toBeDefined();
    expect(item!.id).toBe('ars_serpens');
    expect(item!.name).toBe('Ars Serpens');
    expect(item!.rarity).toBe('rare');
    expect(item!.img).toContain('ars_serpens.png');
    expect(item!.desc.length).toBeGreaterThan(0);
  });

  it('collapses duplicate stackables into a ×N on the name', () => {
    const items = buildCabinet(owning(['ars_serpens', 'ars_serpens']));
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Ars Serpens ×2');
  });

  it('skips ids absent from the catalog', () => {
    expect(buildCabinet(owning(['not_a_real_maleficium']))).toHaveLength(0);
  });
});
