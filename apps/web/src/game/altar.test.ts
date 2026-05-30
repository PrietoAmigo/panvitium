import { describe, it, expect } from 'vitest';
import { createInitialState, bn, sinLevel } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { formatBigNum } from './format.js';
import { buildAltar } from './altar.js';

describe('buildAltar view-model (W3)', () => {
  it('lists all eight Princes from the strings table, level 0 at a fresh game', () => {
    const { sins } = buildAltar(createInitialState('altar-test', 0));
    expect(sins).toHaveLength(8);
    for (const row of sins) {
      const info = Object.values(strings.sins).find((i) => i.latin === row.latin);
      expect(info).toBeDefined();
      expect(row.prince).toBe(info!.prince);
      expect(row.english).toBe(info!.english);
      expect(row.level).toBe(0);
    }
  });

  it('maps a Prince level through the real sinLevel curve', () => {
    const s = createInitialState('altar-test', 0);
    const devotion = bn(180 * 180); // ~level 2 (sinLevel = floor(log_180(devotion)))
    const state = { ...s, devotion: { ...s.devotion, superbia: devotion } };
    const pride = buildAltar(state).sins.find((r) => r.latin === 'Superbia');
    expect(pride?.level).toBe(sinLevel(devotion));
    expect(pride?.level).toBeGreaterThanOrEqual(1);
    expect(pride?.devotion).toBe(formatBigNum(devotion));
  });

  it('surfaces bound sigils, named from the catalog', () => {
    const s = createInitialState('altar-test', 0);
    const state = { ...s, sigilBindings: { 68: bn(10) } }; // Belial #68 (wired)
    const { boundSigils } = buildAltar(state);
    expect(boundSigils).toHaveLength(1);
    expect(boundSigils[0]?.id).toBe(68);
    expect(boundSigils[0]?.name).toBe('Belial');
    expect(boundSigils[0]?.bound).toBe(formatBigNum(bn(10)));
  });

  it('shows no bound sigils on a fresh game', () => {
    expect(buildAltar(createInitialState('altar-test', 0)).boundSigils).toHaveLength(0);
  });
});
