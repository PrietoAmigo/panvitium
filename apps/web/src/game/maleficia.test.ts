import { describe, it, expect } from 'vitest';
import { createInitialState, MALEFICIA } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { parseEffect } from '../menus/relics.js';
import { buildCabinet, maleficiumView, splitDescription } from './maleficia.js';

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

  it('links design art + effect for ids that differ in spelling from the sim catalog', () => {
    // Regression: design entries were keyed 30_pieces / black_candle / longinus / solomon_ring,
    // which never matched the sim ids — so the cabinet showed no specimen art or effect line.
    const cases: Array<[string, string]> = [
      ['thirty_pieces_of_silver', '30_pieces.png'],
      ['black_candles', 'black_candle.png'],
      ['spear_of_longinus', 'longinus.png'],
      ['solomons_ring', 'solomon_ring.png'],
    ];
    for (const [id, file] of cases) {
      const [item] = buildCabinet(owning([id]));
      expect(item, id).toBeDefined();
      expect(item!.img, id).toContain(file);
      expect(item!.effect.length, id).toBeGreaterThan(0);
    }
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
    const [item] = buildCabinet(
      withLifetime(['hand_of_glory'], { maleficiaBuffs: { hand_of_glory: 125 } }),
    );
    expect(item!.use!.enabled).toBe(true);
    expect(item!.use!.status).toContain('2m');
    expect(item!.use!.status).toContain(strings.maleficia.buffRemaining);
  });

  it('Defixio is usable with no status when its buff is dormant', () => {
    const [item] = buildCabinet(owning(['defixio']));
    expect(item!.use!.enabled).toBe(true);
    expect(item!.use!.status).toBeUndefined();
  });

  it('Defixio stays usable while its buff runs, showing the remaining time', () => {
    const [item] = buildCabinet(withLifetime(['defixio'], { maleficiaBuffs: { defixio: 125 } }));
    expect(item!.use!.enabled).toBe(true);
    expect(item!.use!.status).toContain('2m');
    expect(item!.use!.status).toContain(strings.maleficia.buffRemaining);
  });
});

describe('splitDescription — flavour and effect from the sim copy', () => {
  it('splits the trailing effect clause off the flavour', () => {
    expect(splitDescription('Something agreed to stay inside. For now. +10% gold gain.')).toEqual({
      desc: 'Something agreed to stay inside. For now.',
      effect: '+10% gold gain.',
    });
  });

  it('keeps the "Single-use:" marker with the effect', () => {
    expect(
      splitDescription(
        'Cut from a hanged man at the crossroads; it opens what should stay shut. Single-use: +33% reprobate generation for an hour.',
      ),
    ).toEqual({
      desc: 'Cut from a hanged man at the crossroads; it opens what should stay shut.',
      effect: 'Single-use: +33% reprobate generation for an hour.',
    });
  });

  it('takes a negative magnitude as the effect', () => {
    expect(splitDescription('The basin he washed his hands in. -50% Desidia drain rate.')).toEqual({
      desc: 'The basin he washed his hands in.',
      effect: '-50% Desidia drain rate.',
    });
  });

  it('leaves a description with no signed effect clause as all flavour', () => {
    expect(splitDescription('Seventy-two kings, and a ring. 72 of them.')).toEqual({
      desc: 'Seventy-two kings, and a ring. 72 of them.',
      effect: '',
    });
  });
});

describe('maleficiumView — one relic by id (the Unveiling)', () => {
  it('carries the design art and copy for an illustrated relic, with no stack count or rite', () => {
    const view = maleficiumView('defixio');
    expect(view).toMatchObject({ id: 'defixio', name: 'Defixio', rarity: 'profane' });
    expect(view!.img).toContain('defixio.png');
    expect(view!.effect).toBe('Single-use: +50% suicide rate for an hour.');
    expect(view!.use).toBeUndefined();
  });

  it('splits the sim description for a relic the design did not illustrate', () => {
    const view = maleficiumView('dybbuk_box');
    expect(view).toMatchObject({
      name: 'Dybbuk Box',
      img: '',
      desc: 'Something agreed to stay inside. For now.',
      effect: '+10% gold gain.',
    });
  });

  it('is undefined for an id absent from the catalog', () => {
    expect(maleficiumView('not_a_real_maleficium')).toBeUndefined();
  });

  it('gives every catalog relic an effect line that leads with a headline number', () => {
    for (const id of Object.keys(MALEFICIA)) {
      const view = maleficiumView(id);
      expect(view?.effect, id).toBeTruthy();
      expect(parseEffect(view!.effect).headline, id).not.toBe('');
      expect(view!.desc, id).not.toContain(view!.effect);
    }
  });

  it('feeds the cabinet the same split copy (with the stack count on the name)', () => {
    const [item] = buildCabinet(owning(['galdrabok', 'galdrabok']));
    expect(item).toMatchObject({
      name: 'Galdrabók ×2',
      desc: 'A book of staves bound in hide, each page a small undoing.',
      effect: '+12.5% murder rate.',
    });
  });
});
