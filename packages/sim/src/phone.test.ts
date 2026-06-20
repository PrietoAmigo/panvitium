/**
 * Smartphone dialer code-resolver tests (design handoff: "The Smartphone — Dialer & Code Input").
 * Pins the sim-owned classification the UI renders: recognized boon / info codes resolve with their
 * code id, anything else is an `error`, whitespace is trimmed, and the catalog stays well-formed.
 * Effects are a deferred hook (the call engine), so this only covers the kind/identity contract.
 */
import { describe, it, expect } from 'vitest';
import { dialCode, PHONE_CODES, type DialKind } from './phone.js';

describe('smartphone dialer codes', () => {
  it('resolves a recognized boon code, carrying its id', () => {
    expect(dialCode('*#1450#')).toEqual({ kind: 'boon', code: '*#1450#' });
  });

  it('resolves the IMEI Easter egg as an info readout', () => {
    expect(dialCode('*#06#')).toEqual({ kind: 'info', code: '*#06#' });
  });

  it('rejects an unknown code as an error with no id', () => {
    expect(dialCode('*#9999#')).toEqual({ kind: 'error' });
  });

  it('treats empty / whitespace input as an error', () => {
    expect(dialCode('')).toEqual({ kind: 'error' });
    expect(dialCode('   ')).toEqual({ kind: 'error' });
  });

  it('trims surrounding whitespace before matching', () => {
    expect(dialCode('  *#06#  ')).toEqual({ kind: 'info', code: '*#06#' });
  });

  it('exposes only valid kinds in the catalog', () => {
    const kinds: DialKind[] = ['boon', 'info', 'error'];
    for (const k of Object.values(PHONE_CODES)) {
      expect(kinds).toContain(k);
      expect(k).not.toBe('error'); // `error` is the absence of a code, never a table entry
    }
  });
});
