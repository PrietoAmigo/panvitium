/**
 * Acolyte system tests (02 §10). Pins:
 *   - maxAcolytes is log10-scaled on effective maxInfluence: 1 at base, +1 per 10×
 *   - autoRecruitAcolytes appends idle acolytes up to the target, never removes
 *   - assignAcolyteToAction takes the LOWEST-id idle acolyte and starts its timer
 *   - unassignAcolyteFromAction takes the HIGHEST-id assigned (LIFO)
 *   - assignedCount accurately reflects current assignments
 *   - tick advances acolyte timers and resolves their action at acolyte efficiency
 *   - a non-toggle delegated task runs ONCE, then the acolyte retires to idle (no looping)
 *   - acolyte work does NOT occupy the player's actionQueue
 *   - Indagatio at 33% takes ~3× the player duration (1800/0.33 ≈ 5454 s)
 *   - Suasio/Decimatio are delegatable (cost-outcome, pay per cycle); Emptio is not
 *   - Acolytes reset to empty on Katabasis
 *   - acolyteEfficiencyMul defaults to 0.33
 */
import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  actionCycleCost,
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
  it('Indagatio, Suasio and Decimatio are delegatable', () => {
    expect(isDelegatable('indagatio')).toBe(true);
    expect(isDelegatable('suggestion')).toBe(true);
    expect(isDelegatable('caedis')).toBe(true);
  });

  it('Emptio is NOT delegatable (needs a per-target maleficium)', () => {
    expect(isDelegatable('emptio')).toBe(false);
  });
});

describe('assignAcolyteToAction', () => {
  it('refuses non-delegatable actions', () => {
    const s = autoRecruitAcolytes(fresh());
    const r = assignAcolyteToAction(s, 'emptio');
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

describe('advanceAcolytes — Indagatio (one-shot, one acolyte)', () => {
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

  it('resolves the action once the timer hits 0, then retires the acolyte to idle', () => {
    let s = autoRecruitAcolytes(fresh());
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const dur = s.lifetime.acolytes[0]!.remainingSeconds!;
    // Advance well past one full cycle — a non-toggle task runs ONCE, it does not loop.
    const after = advanceAcolytes(s, dur + 10, makeRng(0));
    expect(after.events).toHaveLength(1);
    expect(after.events[0]!.actionId).toBe('indagatio');
    const a = after.state.lifetime.acolytes[0]!;
    expect(a.assignedAction).toBeNull(); // retired back to idle
    expect(a.remainingSeconds).toBeNull();
  });

  it('does a single task even across a large delta, then retires (no looping)', () => {
    let s = autoRecruitAcolytes(fresh());
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const dur = s.lifetime.acolytes[0]!.remainingSeconds!;
    // Three cycles' worth of time would once have produced three events; one-shot yields exactly one.
    const after = advanceAcolytes(s, dur * 3 + 5, makeRng(0));
    expect(after.events).toHaveLength(1);
    expect(after.events[0]!.actionId).toBe('indagatio');
    const a = after.state.lifetime.acolytes[0]!;
    expect(a.assignedAction).toBeNull();
    expect(a.remainingSeconds).toBeNull();
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
      lifetime: { ...s.lifetime, gold: bn(2000) },
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

function withGold(s: GameState, v: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, gold: bn(v) } };
}
function withInfluence(s: GameState, v: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, influence: bn(v) } };
}
function withReprobates(s: GameState, n: number): GameState {
  return {
    ...s,
    lifetime: { ...s.lifetime, reprobates: { ...s.lifetime.reprobates, reprobate: n } },
  };
}

describe('cost-outcome delegation (Suasio / Decimatio)', () => {
  it('assigning Decimatio pays the first cycle up front', () => {
    const eff = computeModifiers(fresh()).acolyteEfficiencyMul;
    const cost = actionCycleCost('caedis', eff).gold;
    const s = withGold(autoRecruitAcolytes(fresh()), 1000);
    const r = assignAcolyteToAction(s, 'caedis');
    if (!r.ok) throw new Error('assign caedis failed');
    expect(r.state.lifetime.gold.toNumber()).toBe(1000 - cost);
    expect(r.state.lifetime.acolytes[0]!.assignedAction).toBe('caedis');
    expect(r.state.lifetime.acolytes[0]!.remainingSeconds).toBe(ACTIONS.caedis!.baseTimeSeconds);
  });

  it('assigning Suasio pays influence up front', () => {
    const eff = computeModifiers(fresh()).acolyteEfficiencyMul;
    const cost = actionCycleCost('suggestion', eff).influence;
    const s = withInfluence(autoRecruitAcolytes(fresh()), 100);
    const r = assignAcolyteToAction(s, 'suggestion');
    if (!r.ok) throw new Error('assign suasio failed');
    expect(r.state.lifetime.influence.toNumber()).toBe(100 - cost);
    expect(r.state.lifetime.acolytes[0]!.remainingSeconds).toBe(
      ACTIONS.suggestion!.baseTimeSeconds,
    );
  });

  it('a delegated Decimatio pays at assign, runs ONE task, then retires the acolyte', () => {
    const eff = computeModifiers(fresh()).acolyteEfficiencyMul;
    const cost = actionCycleCost('caedis', eff).gold;
    let s = withReprobates(withGold(autoRecruitAcolytes(fresh()), 1000), 100);
    const r = assignAcolyteToAction(s, 'caedis'); // pays cycle 1 up front
    if (!r.ok) throw new Error('assign');
    s = r.state;
    expect(s.lifetime.gold.toNumber()).toBe(1000 - cost); // first (and only) cycle paid at assign
    // Past one full cycle: the acolyte resolves its single task and retires — no second payment.
    const adv = advanceAcolytes(s, 20, makeRng(11));
    expect(adv.events).toHaveLength(1);
    expect(adv.events[0]!.actionId).toBe('caedis');
    expect(adv.state.lifetime.gold.toNumber()).toBe(1000 - cost); // not charged again (one-shot)
    expect(adv.state.lifetime.reprobates.reprobate).toBeLessThanOrEqual(100); // Caedis never adds
    expect(adv.state.lifetime.acolytes[0]!.assignedAction).toBeNull(); // retired to idle
    expect(adv.state.lifetime.actionQueue).toHaveLength(0);
  });

  it('an acolyte assigned while broke is stalled, then runs once funded and retires', () => {
    let s = withReprobates(withGold(autoRecruitAcolytes(fresh()), 0), 100);
    const r = assignAcolyteToAction(s, 'caedis');
    if (!r.ok) throw new Error('assign should still succeed (stalled)');
    s = r.state;
    expect(s.lifetime.acolytes[0]!.assignedAction).toBe('caedis');
    expect(s.lifetime.acolytes[0]!.remainingSeconds).toBeNull(); // stalled — nothing paid
    expect(s.lifetime.gold.toNumber()).toBe(0);
    // A stalled acolyte does nothing on a tick while still broke.
    const idle = advanceAcolytes(s, 10, makeRng(12));
    expect(idle.events).toHaveLength(0);
    expect(idle.state.lifetime.gold.toNumber()).toBe(0);
    expect(idle.state.lifetime.acolytes[0]!.assignedAction).toBe('caedis'); // still waiting

    const cost = actionCycleCost('caedis', computeModifiers(s).acolyteEfficiencyMul).gold;
    s = withGold(idle.state, 500);
    const adv = advanceAcolytes(s, 10, makeRng(12));
    expect(adv.events).toHaveLength(1);
    // The cycle was paid (gold dropped by at least the cost); any extra is a tier outcome.
    expect(500 - adv.state.lifetime.gold.toNumber()).toBeGreaterThanOrEqual(cost);
    expect(adv.state.lifetime.acolytes[0]!.assignedAction).toBeNull(); // retired after the task
  });

  it('a stalled Decimatio acolyte does not occupy the player action slot', () => {
    const s = withGold(autoRecruitAcolytes(fresh()), 0);
    const r = assignAcolyteToAction(s, 'caedis');
    if (!r.ok) throw new Error('assign');
    expect(r.state.lifetime.actionQueue).toHaveLength(0);
  });
});
