/**
 * Acolyte system tests (02 §10). Pins:
 *   - maxAcolytes follows the ×1.5 effective-maxInfluence threshold series (Acolytes sheet):
 *     0 at base, first acolyte at 110, then 165 / 248 / 371 / …
 *   - autoRecruitAcolytes appends idle acolytes up to the target, never removes
 *   - assignAcolyteToAction takes the LOWEST-id idle acolyte and starts its timer
 *   - unassignAcolyteFromAction takes the HIGHEST-id assigned (LIFO)
 *   - assignedCount accurately reflects current assignments
 *   - tick advances acolyte timers and resolves their action at acolyte efficiency
 *   - a non-toggle delegated task runs ONCE, then the acolyte retires to idle (no looping)
 *   - acolyte work does NOT occupy the player's actionQueue
 *   - Indagatio at 33% takes ~3× the player duration (1800/0.33 ≈ 5454 s)
 *   - Suasio/Decimatio are delegatable; Emptio is not. Delegated cycles are FREE (no resource cost)
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
  investMercatus,
  startAction,
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
  const thresholds = [110, 165, 248, 371]; // Acolytes sheet ×1.5 series (1..4 acolytes)
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

  it('unlocks the Nth acolyte at the Nth ×1.5 threshold (110 / 165 / 248 / 371)', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 110))).toBe(1);
    expect(maxAcolytes(withMaxInfluence(fresh(), 165))).toBe(2);
    expect(maxAcolytes(withMaxInfluence(fresh(), 248))).toBe(3);
    expect(maxAcolytes(withMaxInfluence(fresh(), 371))).toBe(4);
  });

  it('does not advance until the next threshold is reached', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 109))).toBe(0);
    expect(maxAcolytes(withMaxInfluence(fresh(), 164))).toBe(1);
    expect(maxAcolytes(withMaxInfluence(fresh(), 370))).toBe(3);
  });

  it('keeps climbing past the visual cap (5th at 5663)', () => {
    expect(maxAcolytes(withMaxInfluence(fresh(), 557))).toBe(5); // round(371.25 × 1.5) = 557
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

  it('recruits the first acolyte once influence reaches the first threshold (110)', () => {
    const s = autoRecruitAcolytes(withMaxInfluence(fresh(), 110));
    expect(s.lifetime.acolytes).toHaveLength(1);
    expect(s.lifetime.acolytes[0]!.assignedAction).toBeNull();
    expect(s.lifetime.acolytes[0]!.remainingSeconds).toBeNull();
  });

  it('appends one more when maxInfluence crosses the next threshold (110 → 165)', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 110)); // 1 acolyte
    s = withMaxInfluence(s, 165);
    s = autoRecruitAcolytes(s);
    expect(s.lifetime.acolytes).toHaveLength(2);
    expect(s.lifetime.acolytes[1]!.id).toBe(2); // sequential ids
  });

  it('does nothing when the count already meets the target', () => {
    const s = autoRecruitAcolytes(withMaxInfluence(fresh(), 110));
    const same = autoRecruitAcolytes(s);
    expect(same).toBe(s); // reference equality — no churn
  });

  it('never removes existing acolytes when maxInfluence drops', () => {
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 248)); // 3 acolytes
    s = withMaxInfluence(s, 50); // back below the first threshold
    const after = autoRecruitAcolytes(s);
    expect(after.lifetime.acolytes).toHaveLength(3); // no demotion
  });
});

describe('isDelegatable (toggle Sin-level gate)', () => {
  it('Indagatio is always delegatable; the Opera rites gate on their toggle Sin level', () => {
    expect(isDelegatable(fresh(), 'indagatio')).toBe(true);
    // Suggestion / Caedes toggle at Luxuria / Ira 1.
    expect(isDelegatable(fresh(), 'suggestion')).toBe(false);
    expect(isDelegatable(setSin(fresh(), 'luxuria', 1), 'suggestion')).toBe(true);
    expect(isDelegatable(fresh(), 'caedes')).toBe(false);
    expect(isDelegatable(setSin(fresh(), 'ira', 1), 'caedes')).toBe(true);
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
    // Player still able to start their own rite (caedes here just because it costs gold).
    s = { ...s, lifetime: { ...s.lifetime, gold: bn(500) } };
    const playerStart = startAction(s, 'caedes');
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

describe('advanceAcolytes — Indagatio (looping, one acolyte)', () => {
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

  it('resolves the action once the timer hits 0, then loops into the next cycle', () => {
    let s = recruited();
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const dur = s.lifetime.acolytes[0]!.remainingSeconds!;
    // Advance just past one full cycle — it resolves once and immediately starts the next.
    const after = advanceAcolytes(s, dur + 1, makeRng(0));
    expect(after.events).toHaveLength(1);
    expect(after.events[0]!.actionId).toBe('indagatio');
    const a = after.state.lifetime.acolytes[0]!;
    expect(a.assignedAction).toBe('indagatio'); // still assigned — delegation loops
    // Mid-flight on the next cycle: a fresh timer counting down, not idle.
    expect(a.remainingSeconds).not.toBeNull();
    expect(a.remainingSeconds!).toBeCloseTo(dur - 1, 3);
  });

  it('catches up multiple cycles across a large delta (no retire)', () => {
    let s = recruited();
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const dur = s.lifetime.acolytes[0]!.remainingSeconds!;
    // Three full cycles' worth of time resolves three tasks — the channel loops.
    const after = advanceAcolytes(s, dur * 3 + 1, makeRng(0));
    expect(after.events).toHaveLength(3);
    expect(after.events.every((e) => e.actionId === 'indagatio')).toBe(true);
    const a = after.state.lifetime.acolytes[0]!;
    expect(a.assignedAction).toBe('indagatio'); // still delegated
    expect(a.remainingSeconds).not.toBeNull();
  });
});

describe('tick — acolyte system end-to-end', () => {
  it('a fresh base-influence game recruits no acolyte on tick', () => {
    const after = tick(fresh(), 0.1).state;
    expect(after.lifetime.acolytes).toHaveLength(0);
  });

  it('auto-recruits the first acolyte on tick once influence reaches the first threshold', () => {
    const s = withMaxInfluence(fresh(), 110);
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
    let s = autoRecruitAcolytes(withMaxInfluence(fresh(), 248)); // 3 acolytes
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    const { state: after } = commitKatabasis(s);
    expect(after.lifetime.acolytes).toHaveLength(0);
    // maxInfluence reset to BASE (100), still below the first threshold → no acolyte yet.
    expect(tick(after, 0.1).state.lifetime.acolytes).toHaveLength(0);
    // Regrow influence past the first threshold and the next tick re-seeds one.
    const ticked = tick(withMaxInfluence(after, 110), 0.1).state;
    expect(ticked.lifetime.acolytes).toHaveLength(1);
    expect(ticked.lifetime.acolytes[0]!.assignedAction).toBeNull();
  });
});

describe('Modifiers — acolyteEfficiencyMul defaults to 0.33', () => {
  it('is exposed on the bundle and used by acolyte cycle duration', () => {
    expect(computeModifiers(fresh()).acolyteEfficiencyMul).toBeCloseTo(0.33, 6);
  });
});

// Smoke: Mercatus deepening and acolytes don't trip over each other (separate channels).
describe('mercatus + acolytes — investing never touches the player slot', () => {
  it('an invest and an acolyte assignment coexist with no shared queue', () => {
    let s = recruited();
    s = {
      ...s,
      devotion: { ...s.devotion, gula: bn(180) },
      lifetime: { ...s.lifetime, gold: bn(2000) },
    };
    const invested = investMercatus(s, 'gula');
    if (!invested.ok) throw new Error('invest failed');
    s = invested.state;
    const r = assignAcolyteToAction(s, 'indagatio');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    expect(s.lifetime.mercatusDepths.gula).toBe(1);
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
    // recruited() leaves Ira at 0, so Caedes (toggle Ira 1) cannot be delegated yet.
    const r = assignAcolyteToAction(withGold(recruited(), 1000), 'caedes');
    expect(r.ok).toBe(false);
  });

  it('assigning Decimatio starts the first cycle for free (no gold spent)', () => {
    const s = withGold(delegatable(), 1000);
    const r = assignAcolyteToAction(s, 'caedes');
    if (!r.ok) throw new Error('assign caedes failed');
    expect(r.state.lifetime.gold.toNumber()).toBe(1000); // free — nothing paid at assign
    expect(r.state.lifetime.acolytes[0]!.assignedAction).toBe('caedes');
    expect(r.state.lifetime.acolytes[0]!.remainingSeconds).toBe(ACTIONS.caedes!.baseTimeSeconds);
  });

  it('assigning Suasio starts the first cycle for free (no influence spent)', () => {
    const s = withInfluence(delegatable(), 100);
    const r = assignAcolyteToAction(s, 'suggestion');
    if (!r.ok) throw new Error('assign suasio failed');
    expect(r.state.lifetime.influence.toNumber()).toBe(100); // free — nothing paid at assign
    expect(r.state.lifetime.acolytes[0]!.remainingSeconds).toBe(
      ACTIONS.suggestion!.baseTimeSeconds,
    );
  });

  it('a delegated Decimatio resolves a cycle for free and stays assigned to loop', () => {
    let s = withReprobates(withGold(delegatable(), 1000), 100);
    const cycle = ACTIONS.caedes!.baseTimeSeconds; // cost-outcome duration is the base time
    const r = assignAcolyteToAction(s, 'caedes');
    if (!r.ok) throw new Error('assign');
    s = r.state;
    expect(s.lifetime.gold.toNumber()).toBe(1000); // nothing paid at assign
    // Exactly one cycle's worth of time: resolve once and loop straight into the next.
    const adv = advanceAcolytes(s, cycle, makeRng(11));
    expect(adv.events).toHaveLength(1);
    expect(adv.events[0]!.actionId).toBe('caedes');
    expect(adv.state.lifetime.gold.toNumber()).toBe(1000); // free — gold untouched
    expect(adv.state.lifetime.reprobates).toBeLessThanOrEqual(100); // Caedes never adds
    expect(adv.state.lifetime.acolytes[0]!.assignedAction).toBe('caedes'); // still delegated — loops
    expect(adv.state.lifetime.actionQueue).toHaveLength(0); // delegated channel, not the player slot

    // Another full cycle resolves again, still free — the loop continues.
    const adv2 = advanceAcolytes(adv.state, cycle, makeRng(13));
    expect(adv2.events).toHaveLength(1);
    expect(adv2.state.lifetime.gold.toNumber()).toBe(1000); // still free
    expect(adv2.state.lifetime.acolytes[0]!.assignedAction).toBe('caedes');
  });

  it('an acolyte assigned while broke still works — delegated actions cost nothing', () => {
    let s = withReprobates(withGold(delegatable(), 0), 100);
    const r = assignAcolyteToAction(s, 'caedes');
    if (!r.ok) throw new Error('assign should succeed even while broke');
    s = r.state;
    expect(s.lifetime.acolytes[0]!.assignedAction).toBe('caedes');
    // The first cycle started immediately — never stalled on the empty treasury.
    expect(s.lifetime.acolytes[0]!.remainingSeconds).toBe(ACTIONS.caedes!.baseTimeSeconds);
    expect(s.lifetime.gold.toNumber()).toBe(0);
    // A broke acolyte resolves its cycle for free.
    const adv = advanceAcolytes(s, ACTIONS.caedes!.baseTimeSeconds, makeRng(12));
    expect(adv.events).toHaveLength(1);
    expect(adv.state.lifetime.gold.toNumber()).toBe(0); // nothing spent
    expect(adv.state.lifetime.acolytes[0]!.assignedAction).toBe('caedes'); // still delegated — loops
  });

  it('a broke Decimatio acolyte does not occupy the player action slot', () => {
    const s = withGold(delegatable(), 0);
    const r = assignAcolyteToAction(s, 'caedes');
    if (!r.ok) throw new Error('assign');
    expect(r.state.lifetime.actionQueue).toHaveLength(0);
  });
});
