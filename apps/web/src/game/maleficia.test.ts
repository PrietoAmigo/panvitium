import { describe, it, expect } from 'vitest';
import { createInitialState } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
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

describe('buildCabinet — single-use affordance (5.1)', () => {
  function withLifetime(ids: string[], patch: Record<string, unknown>) {
    const s = createInitialState('use-test', 0);
    return { ...s, lifetime: { ...s.lifetime, maleficia: ids, ...patch } };
  }

  it('ordinary maleficia carry no use affordance', () => {
    const [item] = buildCabinet(owning(['ars_serpens']));
    expect(item!.use).toBeUndefined();
  });

  it('Hand of Glory is usable, with no status when the buff is dormant', () => {
    const [item] = buildCabinet(owning(['hand_of_glory']));
    expect(item!.use).toBeDefined();
    expect(item!.use!.enabled).toBe(true);
    expect(item!.use!.status).toBeUndefined();
    expect(item!.use!.label).toBe(strings.maleficia.use);
  });

  it('Hand of Glory shows remaining buff time while active (and stays usable to extend it)', () => {
    const [item] = buildCabinet(withLifetime(['hand_of_glory'], { handOfGloryRemaining: 125 }));
    expect(item!.use!.enabled).toBe(true);
    expect(item!.use!.status).toContain('2m');
    expect(item!.use!.status).toContain(strings.maleficia.handOfGloryLeft);
  });

  it('Defixio is usable when no curse runs', () => {
    const [item] = buildCabinet(owning(['defixio']));
    expect(item!.use!.enabled).toBe(true);
    expect(item!.use!.status).toBeUndefined();
  });

  it('Defixio is disabled while a curse is at work, naming the cursed subtype', () => {
    const [item] = buildCabinet(
      withLifetime(['defixio'], { defixio: { target: 'glutton', elapsed: 5 } }),
    );
    expect(item!.use!.enabled).toBe(false);
    expect(item!.use!.status).toBe(`${strings.maleficia.defixioOn} ${strings.subtypes.glutton}`);
  });

  it('Defixio shows the rolling status before the target is chosen', () => {
    const [item] = buildCabinet(
      withLifetime(['defixio'], { defixio: { target: null, elapsed: 0 } }),
    );
    expect(item!.use!.enabled).toBe(false);
    expect(item!.use!.status).toBe(strings.maleficia.defixioRolling);
  });
});
