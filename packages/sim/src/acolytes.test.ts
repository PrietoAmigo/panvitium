/**
 * Acolyte system tests (02 §10). Pins:
 *   - maxAcolytes is log10-scaled on effective maxInfluence: 1 at base, +1 per 10×
 *   - autoRecruitAcolytes appends idle acolytes up to the target, never removes
 *   - assignAcolyteToAction takes the LOWEST-id idle acolyte and starts its timer
 *   - unassignAcolyteFromAction takes the HIGHEST-id assigned (LIFO)
 *   - assignedCount accurately reflects current assignments
 *   - tick advances acolyte timers and resolves their action at acolyte efficiency
 *   - assignments LOOP — the acolyte restarts its action on completion
 *   - acolyte work does NOT occupy the player's actionQueue
 *   - Indagatio at 33% takes ~3× the player duration (1800/0.33 ≈ 5454 s)
 *   - Suasio/Decimatio/Emptio are NOT delegatable in this slice
 *   - Acolytes reset to empty on Katabasis
 *   - acolyteEfficiencyMul defaults to 0.33
 */
import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  advanceAcolytes,
  assignAcolyteToAction,
  assignedCount,
  autoRecruitAcolytes,
  bn,
  commitKatabasis,
  computeModifiers,
  createInitialState,
  isDelegatable,
  makeRng,
  maxAcolytes,
  startAction,
  startBuild,
  tick,
  unassignAcolyteFromAction,
  type GameState,
} from './index.js';

function fresh(seed = 'acolyte', t = 0): GameState {
  return createInitialState(seed, t);
}

function withMaxInfluence(s: GameState, v: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, maxInfluence: bn(v) } };
}

describe('maxAcolytes', () => {
  it('is 1 at base maxInfluence (100)', () => {
    expect(maxAcolytes(fresh())).toBe(1);
  });

  it('is 2 at 10× base (1000)', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 1000))).toBe(2);
  });

  it('is 3 at 100× base (10000)', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 10_000))).toBe(3);
  });

  it('is 4 at 1000× base (100000)', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 100_000))).toBe(4);
  });

  it('never drops below 1 — even pathologically low maxInfluence still gives 1', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 1))).toBe(1);
    expect(maxAcolytes(withMaxInfluence(fresh(), 0))).toBe(1);
  });
});

describe('autoRecruitAcolytes', () => {
  it('brings a fresh lifetime up to 1 acolyte', () => {
    const s = autoRecruitAcolytes(fresh());
    expect(s.lifetime.acolytes).toHaveLength(1);
    expect(s.lifetime.acolytes[0]!.assignedAction).toBeNull();
    expect(s.lifetime.acolytes[0]!.remainingSeconds).toBeNull();
  });

  it('appends one more when maxInfluence crosses 1000', () => {
    let s = autoRecruitAcolytes(fresh()); // 1 acolyte
    s = withMaxInfluence(s, 1000);
    s = autoRecruitAcolytes(s);
    expect(s.lifetime.acolytes).toHaveLength(2);
    expect(s.lifetime.acolytes[1]!.id).toBe(2); // sequential ids
  });

  it('does nothing when the count already meets the target', () => {
    const s = autoRecruitAcolytes(fresh());
    const same = autoRecruitAcolytes(s);
    expect(same).toBe(s); // reference equality — no churn
  });

  it('never removes existing acolytes when maxInfluence drops', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 1000)); // 2 acolytes
    s = withMaxInfluence(s, 50); // back below base
    const after = autoRecruitAcolytes(s);
    expect(after.lifetime.acolytes).toHaveLength(2); // no demotion
  });
});

describe('isDelegatable (slice scope)', () => {
  it('Indagatio is delegatable in this slice', () => {
    expect(isDelegatable('indagatio')).toBe(true);
  });

  it('Suasio/Decimatio/Emptio are NOT delegatable yet', () => {
    expect(isDelegatable('suggestion')).toBe(false);
    expect(isDelegatable('caedis')).toBe(false);
    expect(isDelegatable('emptio')).toBe(false);
  });
});

describe('assignAcolyteToAction', () => {
  it('refuses non-delegatable actions', () => {
    const s = autoRecruitAcolytes(fresh());
    const r = assignAcolyteToAction(s, 'caedis');
    expect(r.ok).toBe(false);
  });

  it('refuses when no idle acolyte is available', () => {
    const s = assignAcolyteToAction(autoRecruitAcolytes(fresh()), 'indagatio');
    if (!s.ok) throw new Error('expected first assign to succeed');
    const r = assignAcolyteToAction(s.state, 'indagatio');
    expect(r.ok).toBe(false);
  });

  it('assigns the LOWEST-id idle acolyte and starts the timer at baseTime / acolyteEff', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 10_000)); // 3 acolytes
    const r1 = assignAcolyteToAction(s, 'indagatio');
    if (!r1.ok) throw new Error('first assign failed');
    s = r1.state;
    // Indagatio baseTime is 1800; acolyte efficiency baseline 0.33 → ~5454 s.
    const indDur = ACTIONS.indagatio!.baseTimeSeconds;
    const eff = computeModifiers(s).acolyteEfficiencyMul;
    const expected = Math.max(1, indDur / eff);
    expect(s.lifetime.acolytes[0]!.assignedAction).toBe('indagatio');
    expect(s.lifetime.acolytes[0]!.remainingSeconds).toBeCloseTo(expected, 3);
    expect(s.lifetime.acolytes[1]!.assignedAction).toBeNull();
    // Player slot stays free; this is the whole point of delegation.
    expect(s.lifetime.actionQueue).toHaveLength(0);
  });

  it('a delegated acolyte does NOT block the player from running an action', () => {
    let s = autoRecruitAcolytes(fresh());
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign failed');
    s = r.state;
    // Player still able to start their own rite (caedis here just because it costs gold).
    s = { ...s, lifetime: { ...s.lifetime, gold: bn(500) } };
    const playerStart = startAction(s, 'caedis');
    expect(playerStart.ok).toBe(true);
    if (!playerStart.ok) return;
    expect(playerStart.state.lifetime.actionQueue).toHaveLength(1);
    // Acolyte still working on its own channel.
    expect(playerStart.state.lifetime.acolytes[0]!.assignedAction).toBe('indagatio');
  });
});

describe('unassignAcolyteFromAction', () => {
  it('removes the LIFO acolyte (highest-id-assigned-to-this-action)', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 10_000)); // 3 acolytes
    const r1 = assignAcolyteToAction(s, 'indagatio');
    if (!r1.ok) throw new Error('first assign');
    s = r1.state;
    const r2 = assignAcolyteToAction(s, 'indagatio');
    if (!r2.ok) throw new Error('second assign');
    s = r2.state;

    expect(s.lifetime.acolytes[0]!.assignedAction).toBe('indagatio');
    expect(s.lifetime.acolytes[1]!.assignedAction).toBe('indagatio');

    const un = unassignAcolyteFromAction(s, 'indagatio');
    if (!un.ok) throw new Error('unassign failed');
    expect(un.state.lifetime.acolytes[0]!.assignedAction).toBe('indagatio'); // first stays
    expect(un.state.lifetime.acolytes[1]!.assignedAction).toBeNull(); // second leaves
    expect(un.state.lifetime.acolytes[1]!.remainingSeconds).toBeNull();
  });

  it('refuses when nothing is assigned to the action', () => {
    const s = autoRecruitAcolytes(fresh());
    const r = unassignAcolyteFromAction(s, 'indagatio');
    expect(r.ok).toBe(false);
  });
});

describe('assignedCount', () => {
  it('counts acolytes assigned to a given action across the lifetime', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 10_000)); // 3 acolytes
    expect(assignedCount(s, 'indagatio')).toBe(0);
    const r1 = assignAcolyteToAction(s, 'indagatio');
    if (!r1.ok) throw new Error('a1');
    s = r1.state;
    const r2 = assignAcolyteToAction(s, 'indagatio');
    if (!r2.ok) throw new Error('a2');
    s = r2.state;
    expect(assignedCount(s, 'indagatio')).toBe(2);
  });
});

describe('advanceAcolytes — Indagatio loop (one acolyte)', () => {
  it('idle acolytes are no-ops', () => {
    const s = autoRecruitAcolytes(fresh());
    const result = advanceAcolytes(s, 100, makeRng(0));
    expect(result.state).toBe(s);
    expect(result.events).toHaveLength(0);
  });

  it('decrements the timer by deltaSeconds without resolving early', () => {
    let s = autoRecruitAcolytes(fresh());
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const before = s.lifetime.acolytes[0]!.remainingSeconds!;
    const after = advanceAcolytes(s, 100, makeRng(0));
    expect(after.events).toHaveLength(0);
    expect(after.state.lifetime.acolytes[0]!.remainingSeconds).toBeCloseTo(before - 100, 3);
  });

  it('resolves the action when the timer hits 0 and immediately restarts the next cycle', () => {
    let s = autoRecruitAcolytes(fresh());
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const dur = s.lifetime.acolytes[0]!.remainingSeconds!;
    // Advance just past one full cycle.
    const after = advanceAcolytes(s, dur + 10, makeRng(0));
    expect(after.events.length).toBeGreaterThanOrEqual(1);
    expect(after.events[0]!.actionId).toBe('indagatio');
    // Timer reset to a fresh cycle minus the leftover delta.
    const a = after.state.lifetime.acolytes[0]!;
    expect(a.assignedAction).toBe('indagatio');
    expect(a.remainingSeconds).not.toBeNull();
    expect(a.remainingSeconds!).toBeCloseTo(dur - 10, 3);
  });

  it('handles offline catch-up — multiple completions within one large delta', () => {
    let s = autoRecruitAcolytes(fresh());
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const dur = s.lifetime.acolytes[0]!.remainingSeconds!;
    // Three cycles worth of time.
    const after = advanceAcolytes(s, dur * 3 + 5, makeRng(0));
    expect(after.events.length).toBe(3);
    for (const e of after.events) expect(e.actionId).toBe('indagatio');
    // Timer reset partway into the fourth cycle.
    const a = after.state.lifetime.acolytes[0]!;
    expect(a.remainingSeconds!).toBeCloseTo(dur - 5, 3);
  });
});

describe('tick — acolyte system end-to-end', () => {
  it('auto-recruits the first acolyte at fresh-game tick', () => {
    const s = fresh();
    expect(s.lifetime.acolytes).toHaveLength(0);
    const after = tick(s, 0.1).state;
    expect(after.lifetime.acolytes).toHaveLength(1);
  });

  it('a delegated Indagatio runs through tick to produce an outcome event over a long delta', () => {
    let s = autoRecruitAcolytes(fresh());
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    // One cycle plus a little — should yield exactly one acolyte event.
    const dur = s.lifetime.acolytes[0]!.remainingSeconds!;
    const result = tick(s, dur + 1);
    expect(result.events.some((e) => e.actionId === 'indagatio')).toBe(true);
  });
});

describe('Katabasis — acolytes reset to empty', () => {
  it('rebirth wipes acolytes; auto-recruit re-seeds on the next tick', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 10_000)); // 3 acolytes
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const { state: after } = commitKatabasis(s);
    expect(after.lifetime.acolytes).toHaveLength(0);
    // Next tick re-recruits because maxInfluence reset to BASE (1 acolyte target).
    const ticked = tick(after, 0.1).state;
    expect(ticked.lifetime.acolytes).toHaveLength(1);
    expect(ticked.lifetime.acolytes[0]!.assignedAction).toBeNull();
  });
});

describe('Modifiers — acolyteEfficiencyMul defaults to 0.33', () => {
  it('is exposed on the bundle and used by acolyte cycle duration', () => {
    expect(computeModifiers(fresh()).acolyteEfficiencyMul).toBeCloseTo(0.33, 6);
  });
});

// Smoke: builds and acolytes don't trip over each other (separate channels).
describe('builds + acolytes — both run in parallel without touching the player slot', () => {
  it('one build and one acolyte work concurrently with no shared queue', () => {
    let s = autoRecruitAcolytes(fresh());
    s = {
      ...s,
      devotion: { ...s.devotion, gula: bn(180) },
      lifetime: { ...s.lifetime, gold: bn(500) },
    };
    const built = startBuild(s, 'gula-mercatura-1');
    if (!built.ok) throw new Error('build failed');
    s = built.state;
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    expect(s.lifetime.buildQueue).toHaveLength(1);
    expect(s.lifetime.acolytes[0]!.assignedAction).toBe('indagatio');
    expect(s.lifetime.actionQueue).toHaveLength(0); // player slot free
  });
});
