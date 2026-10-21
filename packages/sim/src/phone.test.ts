/**
 * Smartphone dialer code-resolver tests (design handoff: "The Smartphone — Dialer & Code Input").
 * Pins the sim-owned classification the UI renders: the recognized `666` joke number answers in the
 * error fashion but carries its id, an unknown number is an `error` with no id, whitespace is
 * trimmed, and the catalog stays well-formed. Also pins the outgoing calls (docs/PANVITIUM-CALLS-OUT.md):
 * the hidden rectory number connects once, is recorded as placed (permanent, RNG-free), and rings out
 * unanswered when dialled again.
 */
import { describe, it, expect } from 'vitest';
import {
  CALL_OUTS,
  callPlaced,
  dialCode,
  dialNumber,
  PHONE_CODES,
  placeCall,
  type DialKind,
} from './phone.js';
import { commitKatabasis } from './katabasis.js';
import { createInitialState } from './state.js';

describe('smartphone dialer codes', () => {
  it('resolves the 666 joke number as an error that carries its id', () => {
    expect(dialCode('666')).toEqual({ kind: 'error', code: '666' });
  });

  it('rejects an unknown number as an error with no id', () => {
    expect(dialCode('1234')).toEqual({ kind: 'error' });
  });

  it('treats empty / whitespace input as an error with no id', () => {
    expect(dialCode('')).toEqual({ kind: 'error' });
    expect(dialCode('   ')).toEqual({ kind: 'error' });
  });

  it('trims surrounding whitespace before matching', () => {
    expect(dialCode('  666  ')).toEqual({ kind: 'error', code: '666' });
  });

  it('exposes only valid kinds in the catalog', () => {
    const kinds: DialKind[] = ['boon', 'info', 'error'];
    for (const k of Object.values(PHONE_CODES)) expect(kinds).toContain(k);
  });
});

describe('outgoing calls', () => {
  it('classifies the hidden rectory number (the code plates, 982 then 079) as a call', () => {
    expect(dialCode('982079')).toEqual({ kind: 'call', code: '982079', callId: 'the-rectory' });
    expect(dialCode(' 982079 ')).toEqual({ kind: 'call', code: '982079', callId: 'the-rectory' });
    // The halves in the other order are not the number.
    expect(dialCode('079982')).toEqual({ kind: 'error' });
  });

  it('keeps call-out numbers unique and out of the plain code table', () => {
    const numbers = CALL_OUTS.map((c) => c.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const n of numbers) expect(PHONE_CODES[n]).toBeUndefined();
  });

  it('connects the first time and records the call as placed (pure, RNG-free)', () => {
    const base = createInitialState('seed', 0);
    const { state, outcome } = dialNumber(base, '982079');
    expect(outcome).toEqual({ kind: 'call', code: '982079', callId: 'the-rectory' });
    expect(state.callsPlaced).toEqual(['the-rectory']);
    expect(callPlaced(state, 'the-rectory')).toBe(true);
    expect(base.callsPlaced).toBeUndefined();
    expect(state.rngState).toBe(base.rngState);
  });

  it('rings out unanswered once the one-shot line was placed, leaving the state untouched', () => {
    const placed = dialNumber(createInitialState('seed', 0), '982079').state;
    const again = dialNumber(placed, '982079');
    expect(again.outcome).toEqual({ kind: 'info', code: '982079' });
    expect(again.state).toBe(placed);
  });

  it('leaves the state untouched for a code that is not a call', () => {
    const base = createInitialState('seed', 0);
    expect(dialNumber(base, '666')).toEqual({
      state: base,
      outcome: { kind: 'error', code: '666' },
    });
    expect(dialNumber(base, '1234').state).toBe(base);
  });

  it('placeCall is idempotent and the record survives Katabasis', () => {
    const once = placeCall(createInitialState('seed', 0), 'the-rectory');
    expect(placeCall(once, 'the-rectory')).toBe(once);
    expect(commitKatabasis(once).state.callsPlaced).toEqual(['the-rectory']);
  });
});
