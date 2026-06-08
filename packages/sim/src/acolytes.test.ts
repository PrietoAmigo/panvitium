/**
 * Acolyte system tests (02 §10). Pins:
 *   - maxAcolytes follows the ×2.2 effective-maxInfluence threshold series (Acolytes sheet):
 *     0 at base, first acolyte at 242, then 532 / 1170 / 2574 / …
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
  type Sin,
} from './index.js';

function fresh(seed = 'acolyte', t = 0): GameState {
  return createInitialState(seed, t);
}

function withMaxInfluence(s: GameState, v: number): GameState {
  return { ...s, lifetime: { ...s.lifetime, maxInfluence: bn(v) } };
}

/** Fresh lifetime with max influence raised to unlock exactly `n` acolytes, then auto-recruited. */
function recruited(n = 1): GameState {
  const thresholds = [242, 532, 1170, 2574]; // Acolytes sheet ×2.2 series (1..4 acolytes)
  const infl = thresholds[n - 1] ?? thresholds[thresholds.length - 1]!;
  return autoRecruitAcolytes(withMaxInfluence(fresh(), infl));
}

/** Recruited + the Sin toggle levels (Luxuria 1 / Ira 1) that enable Suasio/Decimatio delegation. */
function delegatable(n = 1): GameState {
  const s = recruited(n);
  return { ...s, devotion: { ...s.devotion, luxuria: bn(180), ira: bn(180) } };
}

/** Set a single Sin to a given level (180^level cumulative Devotion). */
function setSin(s: GameState, sin: Sin, level: number): GameState {
  return { ...s, devotion: { ...s.devotion, [sin]: bn(180 ** level) } };
}

describe('maxAcolytes', () => {
  it('is 0 at base maxInfluence (100) — below the first threshold', () => {
    expect(maxAcolytes(fresh())).toBe(0);
  });

  it('unlocks the Nth acolyte at the Nth ×2.2 threshold (242 / 532 / 1170 / 2574)', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 242))).toBe(1);
    expect(maxAcolytes(withMaxInfluence(fresh(), 532))).toBe(2);
    expect(maxAcolytes(withMaxInfluence(fresh(), 1170))).toBe(3);
    expect(maxAcolytes(withMaxInfluence(fresh(), 2574))).toBe(4);
  });

  it('does not advance until the next threshold is reached', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 241))).toBe(0);
    expect(maxAcolytes(withMaxInfluence(fresh(), 531))).toBe(1);
    expect(maxAcolytes(withMaxInfluence(fresh(), 2573))).toBe(3);
  });

  it('keeps climbing past the visual cap (5th at 5663)', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 5663))).toBe(5); // round(2574 × 2.2)
  });

  it('is 0 below the first threshold — no minimum-of-1 floor anymore', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 1))).toBe(0);
    expect(maxAcolytes(withMaxInfluence(fresh(), 0))).toBe(0);
  });
});

describe('autoRecruitAcolytes', () => {
  it('leaves a fresh base-influence lifetime with 0 acolytes (below the first threshold)', () => {
    const s = autoRecruitAcolytes(fresh());
    expect(s.lifetime.acolytes).toHaveLength(0);
  });

  it('recruits the first acolyte once influence reaches the first threshold (242)', () => {
    const s = autoRecruitAcolytes(withMaxInfluence(fresh(), 242));
    expect(s.lifetime.acolytes).toHaveLength(1);
    expect(s.lifetime.acolytes[0]!.assignedAction).toBeNull();
    expect(s.lifetime.acolytes[0]!.remainingSeconds).toBeNull();
  });

  it('appends one more when maxInfluence crosses the next threshold (242 → 532)', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 242)); // 1 acolyte
    s = withMaxInfluence(s, 532);
    s = autoRecruitAcolytes(s);
    expect(s.lifetime.acolytes).toHaveLength(2);
    expect(s.lifetime.acolytes[1]!.id).toBe(2); // sequential ids
  });

  it('does nothing when the count already meets the target', () => {
    const s = autoRecruitAcolytes(withMaxInfluence(fresh(), 242));
    const same = autoRecruitAcolytes(s);
    expect(same).toBe(s); // reference equality — no churn
  });

  it('never removes existing acolytes when maxInfluence drops', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 1170)); // 3 acolytes
    s = withMaxInfluence(s, 50); // back below the first threshold
    const after = autoRecruitAcolytes(s);
    expect(after.lifetime.acolytes).toHaveLength(3); // no demotion
  });
});

describe('isDelegatable (toggle Sin-level gate)', () => {
  it('Indagatio is always delegatable; the Opera rites gate on their toggle Sin level', () => {
    expect(isDelegatable(fresh(), 'indagatio')).toBe(true);
    // Suggestion / Caedis toggle at Luxuria / Ira 1.
    expect(isDelegatable(fresh(), 'suggestion')).toBe(false);
    expect(isDelegatable(setSin(fresh(), 'luxuria', 1), 'suggestion')).toBe(true);
    expect(isDelegatable(fresh(), 'caedis')).toBe(false);
    expect(isDelegatable(setSin(fresh(), 'ira', 1), 'caedis')).toBe(true);
    // The higher rites toggle at 3 / 4.
    expect(isDelegatable(setSin(fresh(), 'luxuria', 2), 'logismoi')).toBe(false);
    expect(isDelegatable(setSin(fresh(), 'luxuria', 3), 'logismoi')).toBe(true);
    expect(isDelegatable(setSin(fresh(), 'ira', 3), 'purgatio')).toBe(false);
    expect(isDelegatable(setSin(fresh(), 'ira', 4), 'purgatio')).toBe(true);
  });

  it('Emptio is NOT delegatable (needs a per-target maleficium)', () => {
    expect(isDelegatable(setSin(fresh(), 'luxuria', 4), 'emptio')).toBe(false);
  });
});

describe('assignAcolyteToAction', () => {
  it('refuses non-delegatable actions', () => {
    const s = recruited();
    const r = assignAcolyteToAction(s, 'emptio');
    expect(r.ok).toBe(false);
  });

  it('refuses when no idle acolyte is available', () => {
    const s = assignAcolyteToAction(recruited(), 'indagatio');
    if (!s.ok) throw new Error('expected first assign to succeed');
    const r = assignAcolyteToAction(s.state, 'indagatio');
    expect(r.ok).toBe(false);
  });

  it('assigns the LOWEST-id idle acolyte and starts the timer at baseTime / acolyteEff', () => {
    let s = recruited(3); // 3 acolytes
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
    let s = recruited();
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
    let s = recruited(3); // 3 acolytes
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
    const s = recruited();
    const r = unassignAcolyteFromAction(s, 'indagatio');
    expect(r.ok).toBe(false);
  });
});

describe('assignedCount', () => {
  it('counts acolytes assigned to a given action across the lifetime', () => {
    let s = recruited(3); // 3 acolytes
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
    const s = recruited();
    const result = advanceAcolytes(s, 100, makeRng(0));
    expect(result.state).toBe(s);
    expect(result.events).toHaveLength(0);
  });

  it('decrements the timer by deltaSeconds without resolving early', () => {
    let s = recruited();
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const before = s.lifetime.acolytes[0]!.remainingSeconds!;
    const after = advanceAcolytes(s, 100, makeRng(0));
    expect(after.events).toHaveLength(0);
    expect(after.state.lifetime.acolytes[0]!.remainingSeconds).toBeCloseTo(before - 100, 3);
  });

  it('resolves the action once the timer hits 0, then retires the acolyte to idle', () => {
    let s = recruited();
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
    let s = recruited();
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
  it('a fresh base-influence game recruits no acolyte on tick', () => {
    const after = tick(fresh(), 0.1).state;
    expect(after.lifetime.acolytes).toHaveLength(0);
  });

  it('auto-recruits the first acolyte on tick once influence reaches the first threshold', () => {
    const s = withMaxInfluence(fresh(), 242);
    expect(s.lifetime.acolytes).toHaveLength(0);
    const after = tick(s, 0.1).state;
    expect(after.lifetime.acolytes).toHaveLength(1);
  });

  it('a delegated Indagatio runs through tick to produce an outcome event over a long delta', () => {
    let s = recruited();
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
  it('rebirth wipes acolytes; auto-recruit re-seeds once influence is regrown', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 1170)); // 3 acolytes
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const { state: after } = commitKatabasis(s);
    expect(after.lifetime.acolytes).toHaveLength(0);
    // maxInfluence reset to BASE (100), still below the first threshold → no acolyte yet.
    expect(tick(after, 0.1).state.lifetime.acolytes).toHaveLength(0);
    // Regrow influence past the first threshold and the next tick re-seeds one.
    const ticked = tick(withMaxInfluence(after, 242), 0.1).state;
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
    let s = recruited();
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
    lifetime: { ...s.lifetime, reprobates: n },
  };
}

describe('cost-outcome delegation (Suasio / Decimatio)', () => {
  it('refuses to delegate a rite below its toggle Sin level', () => {
    // recruited() leaves Ira at 0, so Caedis (toggle Ira 1) cannot be delegated yet.
    const r = assignAcolyteToAction(withGold(recruited(), 1000), 'caedis');
    expect(r.ok).toBe(false);
  });

  it('assigning Decimatio pays the first cycle up front', () => {
    const s = withGold(delegatable(), 1000);
    const eff = computeModifiers(s).acolyteEfficiencyMul;
    const cost = actionCycleCost('caedis', eff).gold;
    const r = assignAcolyteToAction(s, 'caedis');
    if (!r.ok) throw new Error('assign caedis failed');
    expect(r.state.lifetime.gold.toNumber()).toBe(1000 - cost);
    expect(r.state.lifetime.acolytes[0]!.assignedAction).toBe('caedis');
    expect(r.state.lifetime.acolytes[0]!.remainingSeconds).toBe(ACTIONS.caedis!.baseTimeSeconds);
  });

  it('assigning Suasio pays influence up front', () => {
    const s = withInfluence(delegatable(), 100);
    const eff = computeModifiers(s).acolyteEfficiencyMul;
    const cost = actionCycleCost('suggestion', eff).influence;
    const r = assignAcolyteToAction(s, 'suggestion');
    if (!r.ok) throw new Error('assign suasio failed');
    expect(r.state.lifetime.influence.toNumber()).toBe(100 - cost);
    expect(r.state.lifetime.acolytes[0]!.remainingSeconds).toBe(
      ACTIONS.suggestion!.baseTimeSeconds,
    );
  });

  it('a delegated Decimatio pays at assign, runs ONE task, then retires the acolyte', () => {
    let s = withReprobates(withGold(delegatable(), 1000), 100);
    const eff = computeModifiers(s).acolyteEfficiencyMul;
    const cost = actionCycleCost('caedis', eff).gold;
    const r = assignAcolyteToAction(s, 'caedis'); // pays cycle 1 up front
    if (!r.ok) throw new Error('assign');
    s = r.state;
    expect(s.lifetime.gold.toNumber()).toBe(1000 - cost); // first (and only) cycle paid at assign
    // Past one full cycle: the acolyte resolves its single task and retires — no second payment.
    const adv = advanceAcolytes(s, 20, makeRng(11));
    expect(adv.events).toHaveLength(1);
    expect(adv.events[0]!.actionId).toBe('caedis');
    expect(adv.state.lifetime.gold.toNumber()).toBe(1000 - cost); // not charged again (one-shot)
    expect(adv.state.lifetime.reprobates).toBeLessThanOrEqual(100); // Caedis never adds
    expect(adv.state.lifetime.acolytes[0]!.assignedAction).toBeNull(); // retired to idle
    expect(adv.state.lifetime.actionQueue).toHaveLength(0);
  });

  it('an acolyte assigned while broke is stalled, then runs once funded and retires', () => {
    let s = withReprobates(withGold(delegatable(), 0), 100);
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
    const s = withGold(delegatable(), 0);
    const r = assignAcolyteToAction(s, 'caedis');
    if (!r.ok) throw new Error('assign');
    expect(r.state.lifetime.actionQueue).toHaveLength(0);
  });
});
