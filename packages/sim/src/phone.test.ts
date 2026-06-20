/**
 * Smartphone dialer code-resolver tests (design handoff: "The Smartphone — Dialer & Code Input").
 * Pins the sim-owned classification the UI renders: the recognized `666` joke number answers in the
 * error fashion but carries its id, an unknown number is an `error` with no id, whitespace is
 * trimmed, and the catalog stays well-formed. Real boon/info effects are a deferred hook (the call
 * engine), so this only covers the kind/identity contract.
 */
import { describe, it, expect } from 'vitest';
import { dialCode, PHONE_CODES, type DialKind } from './phone.js';

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
