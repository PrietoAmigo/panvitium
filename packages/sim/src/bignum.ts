/**
 * BigNum — thin wrapper around break_infinity.js (ADR-005).
 *
 * All unbounded gameplay resource values (souls, gold, influence, Devotion totals,
 * sigil-bound counts, intermediate scaling factors) flow through this module so the
 * rest of the codebase doesn't read `a.add(b).mul(c)` everywhere, and so serialization
 * lives in one place.
 *
 * Naturally-bounded integer counts (reprobate counts by subtype, acolytes, invocation
 * counts) stay as plain `number` and do NOT use this module.
 */
import Decimal from 'break_infinity.js';

/** A big number. Alias of break_infinity's Decimal so callers needn't import it directly. */
export type BigNum = Decimal;

/** Acceptable inputs when constructing a BigNum. */
export type BigNumInput = BigNum | number | string;

/** Construct a BigNum from a number, string, or existing BigNum. */
export function bn(value: BigNumInput): BigNum {
  return new Decimal(value);
}

export const ZERO: BigNum = new Decimal(0);
export const ONE: BigNum = new Decimal(1);

// --- arithmetic -------------------------------------------------------------

export function add(a: BigNumInput, b: BigNumInput): BigNum {
  return new Decimal(a).add(b);
}

export function sub(a: BigNumInput, b: BigNumInput): BigNum {
  return new Decimal(a).sub(b);
}

export function mul(a: BigNumInput, b: BigNumInput): BigNum {
  return new Decimal(a).mul(b);
}

export function div(a: BigNumInput, b: BigNumInput): BigNum {
  return new Decimal(a).div(b);
}

export function pow(a: BigNumInput, exponent: BigNumInput): BigNum {
  return new Decimal(a).pow(new Decimal(exponent));
}

/** Floor toward negative infinity. Resources are natural numbers (02 §1); floor at resolution. */
export function floor(a: BigNumInput): BigNum {
  return new Decimal(a).floor();
}

export function max(a: BigNumInput, b: BigNumInput): BigNum {
  return Decimal.max(new Decimal(a), new Decimal(b));
}

export function min(a: BigNumInput, b: BigNumInput): BigNum {
  return Decimal.min(new Decimal(a), new Decimal(b));
}

/** Clamp `value` into the inclusive range [`lo`, `hi`]. */
export function clamp(value: BigNumInput, lo: BigNumInput, hi: BigNumInput): BigNum {
  return max(lo, min(hi, value));
}

// --- comparison -------------------------------------------------------------

export function gt(a: BigNumInput, b: BigNumInput): boolean {
  return new Decimal(a).gt(b);
}

export function gte(a: BigNumInput, b: BigNumInput): boolean {
  return new Decimal(a).gte(b);
}

export function lt(a: BigNumInput, b: BigNumInput): boolean {
  return new Decimal(a).lt(b);
}

export function lte(a: BigNumInput, b: BigNumInput): boolean {
  return new Decimal(a).lte(b);
}

export function eq(a: BigNumInput, b: BigNumInput): boolean {
  return new Decimal(a).eq(b);
}

export function isZero(a: BigNumInput): boolean {
  return new Decimal(a).eq(ZERO);
}

// --- serialization ----------------------------------------------------------

/**
 * Serialize a BigNum to a compact string. break_infinity's own string form round-trips
 * exactly through `new Decimal(str)`, including values far beyond Number.MAX_SAFE_INTEGER.
 */
export function serializeBigNum(value: BigNum): string {
  return value.toString();
}

/** Reconstruct a BigNum from its serialized string form. */
export function deserializeBigNum(value: string): BigNum {
  return new Decimal(value);
}
