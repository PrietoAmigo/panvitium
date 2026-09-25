/* =============================================================================
   The desk PC's Calculator: the engine
   -----------------------------------------------------------------------------
   Framework-free and DOM-free, so every rule is pinned by a plain unit test. Three layers:

   1. Exact decimals. A value is `m × 10^e` on BigInt, so 0.1 + 0.2 is exactly 0.3 and
      1 ÷ 3 × 3 is exactly 1 on the display (binary floating point gets both wrong). Every
      result keeps PRECISION significant digits, far past the DISPLAY_DIGITS shown, and the
      exponent reaches ±MAX_EXPONENT, so the game's astronomically large numbers still fit.
   2. Expressions. The keypad builds a token list the way the Ubuntu desktop's own calculator
      (GNOME Calculator, basic mode) does: the usual precedence, parentheses closed for you at
      "=", postfix x² and %, prefix √ and unary minus. "a + b%" adds b% of a, as desk
      calculators do.
   3. Input. `calculatorReducer` folds key presses, history recalls, pastes and the memory
      register into the state the component renders. After "=", the answer carries on under an
      operator and yields to a digit.
   ========================================================================== */

// ---------------------------------------------------------------------------------------------
// Exact decimals
// ---------------------------------------------------------------------------------------------

/** An exact decimal `m × 10^e`. Normalized: `m` has no trailing zeros; zero is `{ m: 0n, e: 0 }`. */
export interface Dec {
  readonly m: bigint;
  readonly e: number;
}

/** Significant digits every result keeps: far past the display, so rounding never surfaces. */
export const PRECISION = 40;
/** Significant digits the display shows (a double's worth, as desktop calculators show). */
export const DISPLAY_DIGITS = 16;
/** The largest decimal exponent a value may reach before it overflows; smaller ones flush to 0. */
export const MAX_EXPONENT = 1e15;

export const ZERO: Dec = { m: 0n, e: 0 };

/** Why an evaluation failed. The component maps each to its message in `strings.calculator`. */
export type CalcErrorCode = 'divideByZero' | 'negativeRoot' | 'overflow' | 'malformed';

class CalcError extends Error {
  readonly code: CalcErrorCode;
  constructor(code: CalcErrorCode) {
    super(code);
    this.code = code;
  }
}

const abs = (m: bigint): bigint => (m < 0n ? -m : m);
const digitCount = (m: bigint): number => abs(m).toString().length;
const pow10 = (n: number): bigint => 10n ** BigInt(n);
/** The decimal exponent of the leading digit (the order of magnitude) of a non-zero value. */
const magnitude = (d: Dec): number => d.e + digitCount(d.m) - 1;

/** `m × 10^e`, normalized. */
function dec(m: bigint, e: number): Dec {
  if (m === 0n) return ZERO;
  let mm = m;
  let ee = e;
  while (mm % 10n === 0n) {
    mm /= 10n;
    ee += 1;
  }
  return { m: mm, e: ee };
}

/** Enforce the exponent range: too large overflows, too small flushes to zero. */
function inRange(d: Dec): Dec {
  if (d.m === 0n) return d;
  const mag = magnitude(d);
  if (mag > MAX_EXPONENT) throw new CalcError('overflow');
  return mag < -MAX_EXPONENT ? ZERO : d;
}

/** Round to `digits` significant digits: half to even inside the engine, half up for display. */
function roundTo(d: Dec, digits: number, halfUp: boolean): Dec {
  const drop = digitCount(d.m) - digits;
  if (drop <= 0) return d;
  const unit = pow10(drop);
  const a = abs(d.m);
  let q = a / unit;
  const r = a % unit;
  const half = unit / 2n;
  if (r > half || (r === half && (halfUp || q % 2n === 1n))) q += 1n;
  return dec(d.m < 0n ? -q : q, d.e + drop);
}

const fit = (d: Dec): Dec => inRange(roundTo(d, PRECISION, false));

export function neg(a: Dec): Dec {
  return a.m === 0n ? a : { m: -a.m, e: a.e };
}

export function add(a: Dec, b: Dec): Dec {
  if (a.m === 0n) return b;
  if (b.m === 0n) return a;
  // A term entirely below the other's last kept digit cannot move the rounded sum (and aligning
  // 1e900 with 1 digit by digit would build a 900-digit integer for nothing).
  const gap = magnitude(a) - magnitude(b);
  if (gap > PRECISION + 2) return a;
  if (gap < -(PRECISION + 2)) return b;
  const e = Math.min(a.e, b.e);
  return fit(dec(a.m * pow10(a.e - e) + b.m * pow10(b.e - e), e));
}

export function sub(a: Dec, b: Dec): Dec {
  return add(a, neg(b));
}

export function mul(a: Dec, b: Dec): Dec {
  if (a.m === 0n || b.m === 0n) return ZERO;
  return fit(dec(a.m * b.m, a.e + b.e));
}

export function div(a: Dec, b: Dec): Dec {
  if (b.m === 0n) throw new CalcError('divideByZero');
  if (a.m === 0n) return ZERO;
  const an = abs(a.m);
  const bn = abs(b.m);
  // Scale the dividend so the integer quotient carries two digits past PRECISION.
  const shift = Math.max(0, PRECISION + 2 + digitCount(bn) - digitCount(an));
  const scaled = an * pow10(shift);
  // A trailing sticky digit marks an inexact quotient, so it never rounds as an exact tie.
  const q = (scaled / bn) * 10n + (scaled % bn === 0n ? 0n : 1n);
  const negative = a.m < 0n !== b.m < 0n;
  return fit(dec(negative ? -q : q, a.e - b.e - shift - 1));
}

/** ⌊√n⌋ by Newton's method, which falls monotonically onto it from an over-estimate. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

export function sqrt(a: Dec): Dec {
  if (a.m < 0n) throw new CalcError('negativeRoot');
  if (a.m === 0n) return ZERO;
  // √(m × 10^e) = √m × 10^(e/2): make e even, then scale m by an even power of ten so the
  // integer root carries two digits past PRECISION (plus a sticky digit, as in `div`).
  const odd = a.e % 2 !== 0;
  const m = odd ? a.m * 10n : a.m;
  const e = odd ? a.e - 1 : a.e;
  const k = Math.max(0, Math.ceil((2 * (PRECISION + 2) - digitCount(m)) / 2));
  const scaled = m * pow10(2 * k);
  const s = isqrt(scaled);
  return fit(dec(s * 10n + (s * s === scaled ? 0n : 1n), e / 2 - k - 1));
}

/** x% as a value: x ÷ 100, exactly. */
export function percent(a: Dec): Dec {
  return a.m === 0n ? a : inRange({ m: a.m, e: a.e - 2 });
}

/** A typed literal: digits, an optional fraction, an optional exponent ("1.5e30", "2e-7"). */
const LITERAL = /^(\d+)(?:\.(\d*))?(?:e(-?)(\d*))?$/;

/**
 * A literal as typed, as a value. An exponent still being typed ("1e", "1e-") counts as none, so a
 * half-typed number reads as its mantissa rather than failing.
 */
export function parseLiteral(text: string): Dec {
  const match = LITERAL.exec(text);
  if (!match) throw new CalcError('malformed');
  const [, int = '', frac = '', sign = '', exp = ''] = match;
  const shift = (sign === '-' ? -Number(exp) : Number(exp)) || 0;
  return fit(dec(BigInt(int + frac), shift - frac.length));
}

/** The real minus sign (U+2212) the display uses, as elsewhere in the game's readouts. */
const MINUS = '\u2212';

const group = (int: string): string => int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function spell(d: Dec, grouped: boolean, minus: string): string {
  const r = roundTo(d, DISPLAY_DIGITS, true);
  if (r.m === 0n) return '0';
  const sign = r.m < 0n ? minus : '';
  const s = abs(r.m).toString();
  const mag = r.e + s.length - 1;
  // Past what the display can spell digit by digit: "e" notation, as the game's own readouts.
  if (mag >= DISPLAY_DIGITS || mag < -6) {
    const mantissa = s.length > 1 ? `${s.charAt(0)}.${s.slice(1)}` : s;
    return `${sign}${mantissa}e${mag < 0 ? minus : ''}${Math.abs(mag)}`;
  }
  const point = s.length + r.e; // digits before the decimal point
  let int: string;
  let frac: string;
  if (r.e >= 0) {
    int = s + '0'.repeat(r.e);
    frac = '';
  } else if (point > 0) {
    int = s.slice(0, point);
    frac = s.slice(point);
  } else {
    int = '0';
    frac = '0'.repeat(-point) + s;
  }
  return sign + (grouped ? group(int) : int) + (frac ? `.${frac}` : '');
}

/** A value as the display shows it: DISPLAY_DIGITS significant digits, grouped, then "e". */
export function formatValue(d: Dec): string {
  return spell(d, true, MINUS);
}

/** A value as plain text for the clipboard (and for editing): no grouping, an ASCII minus. */
export function plainValue(d: Dec): string {
  return spell(d, false, '-');
}

// ---------------------------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------------------------

export type BinaryOp = 'add' | 'subtract' | 'multiply' | 'divide';

/** One unit of the expression the keypad builds. */
export type Token =
  /** A literal as typed, digit by digit (see LITERAL). */
  | { readonly kind: 'num'; readonly text: string }
  /** An exact value placed whole: the last answer, the memory, a history entry. */
  | { readonly kind: 'val'; readonly value: Dec }
  | { readonly kind: 'op'; readonly op: BinaryOp }
  | { readonly kind: 'open' }
  | { readonly kind: 'close' }
  | { readonly kind: 'sqrt' }
  | { readonly kind: 'square' }
  | { readonly kind: 'percent' };

const OPEN: Token = { kind: 'open' };
const CLOSE: Token = { kind: 'close' };
const SQRT: Token = { kind: 'sqrt' };
const SQUARE: Token = { kind: 'square' };
const PERCENT: Token = { kind: 'percent' };
const num = (text: string): Token => ({ kind: 'num', text });
const val = (value: Dec): Token => ({ kind: 'val', value });
const op = (o: BinaryOp): Token => ({ kind: 'op', op: o });

const OP_GLYPH: Readonly<Record<BinaryOp, string>> = {
  add: '+',
  subtract: MINUS,
  multiply: '×',
  divide: '÷',
};

/** Whether a token closes an operand, so an operator or a postfix may follow it. */
function endsOperand(t: Token | undefined): boolean {
  return (
    t !== undefined &&
    (t.kind === 'num' ||
      t.kind === 'val' ||
      t.kind === 'close' ||
      t.kind === 'square' ||
      t.kind === 'percent')
  );
}

/** Whether the token at `i` is a minus that negates (it opens an operand) rather than subtracts. */
function isUnaryMinus(tokens: readonly Token[], i: number): boolean {
  const t = tokens[i];
  return t?.kind === 'op' && t.op === 'subtract' && !endsOperand(tokens[i - 1]);
}

/** Parentheses opened and not yet closed. */
export function openCount(tokens: readonly Token[]): number {
  let depth = 0;
  for (const t of tokens) {
    if (t.kind === 'open') depth += 1;
    else if (t.kind === 'close') depth -= 1;
  }
  return Math.max(0, depth);
}

/** Whether the expression does anything beyond stating a (possibly negated) number. */
function hasOperation(tokens: readonly Token[]): boolean {
  return tokens.some((t, i) => t.kind !== 'num' && t.kind !== 'val' && !isUnaryMinus(tokens, i));
}

/** A literal as the display shows it: the integer part grouped, the rest as typed. */
function formatLiteral(text: string): string {
  const [mantissa = '', exponent] = text.split('e');
  const [int = '', frac] = mantissa.split('.');
  let out = group(int);
  if (frac !== undefined) out += `.${frac}`;
  if (exponent !== undefined) out += `e${exponent.replace('-', MINUS)}`;
  return out;
}

/** The expression as the display shows it, e.g. "12 + 7 × (3 − 1)". */
export function renderExpression(tokens: readonly Token[]): string {
  let out = '';
  tokens.forEach((t, i) => {
    if (t.kind === 'num') out += formatLiteral(t.text);
    else if (t.kind === 'val') out += formatValue(t.value);
    else if (t.kind === 'op') out += isUnaryMinus(tokens, i) ? MINUS : ` ${OP_GLYPH[t.op]} `;
    else if (t.kind === 'open') out += '(';
    else if (t.kind === 'close') out += ')';
    else if (t.kind === 'sqrt') out += '√';
    else if (t.kind === 'square') out += '²';
    else out += '%';
  });
  return out.trim();
}

/** A literal's dangling exponent ("1e", "1e-") dropped, once the number is plainly finished. */
function settle(tokens: readonly Token[]): Token[] {
  const last = tokens.at(-1);
  if (last?.kind !== 'num' || !/e-?$/.test(last.text)) return [...tokens];
  return [...tokens.slice(0, -1), num(last.text.replace(/e-?$/, ''))];
}

/** Every open parenthesis closed, as "=" reads the expression. */
function closeAll(tokens: readonly Token[]): Token[] {
  if (!endsOperand(tokens.at(-1))) return [...tokens];
  return [...tokens, ...Array.from({ length: openCount(tokens) }, () => CLOSE)];
}

/** The outcome of evaluating an expression. */
export type Evaluation =
  | { readonly ok: true; readonly value: Dec }
  | { readonly ok: false; readonly error: CalcErrorCode };

/** An operand, with whether its outermost operation is a percent (for "a + b%"). */
interface Operand {
  readonly value: Dec;
  readonly pct: boolean;
}

/**
 * Recursive descent, loosest first:
 *   sum     := product (("+" | "−") product)*      "a ± b%" means a ± (b% of a)
 *   product := unary (("×" | "÷") unary)*
 *   unary   := "−" unary | "√" unary | postfix       so −2² = −4 and √9% = √0.09
 *   postfix := primary ("²" | "%")*
 *   primary := number | "(" sum ")"                 a ")" still missing at the end is implied
 */
function parse(tokens: readonly Token[]): Dec {
  let i = 0;

  /** The binary operator at the cursor, if it is `a` or `b`. */
  function opAt(a: BinaryOp, b: BinaryOp): BinaryOp | null {
    const t = tokens[i];
    return t?.kind === 'op' && (t.op === a || t.op === b) ? t.op : null;
  }

  function sum(): Dec {
    let left = product().value;
    for (let o = opAt('add', 'subtract'); o !== null; o = opAt('add', 'subtract')) {
      i += 1;
      const right = product();
      const term = right.pct ? mul(left, right.value) : right.value;
      left = o === 'add' ? add(left, term) : sub(left, term);
    }
    return left;
  }

  function product(): Operand {
    let left = unary();
    for (let o = opAt('multiply', 'divide'); o !== null; o = opAt('multiply', 'divide')) {
      i += 1;
      const right = unary().value;
      const value = o === 'multiply' ? mul(left.value, right) : div(left.value, right);
      left = { value, pct: false };
    }
    return left;
  }

  function unary(): Operand {
    const t = tokens[i];
    if (t?.kind === 'op' && t.op === 'subtract') {
      i += 1;
      const o = unary();
      return { value: neg(o.value), pct: o.pct };
    }
    if (t?.kind === 'sqrt') {
      i += 1;
      return { value: sqrt(unary().value), pct: false };
    }
    return postfix();
  }

  function postfix(): Operand {
    let o: Operand = { value: primary(), pct: false };
    for (let t = tokens[i]; t?.kind === 'square' || t?.kind === 'percent'; t = tokens[i]) {
      i += 1;
      o =
        t.kind === 'square'
          ? { value: mul(o.value, o.value), pct: false }
          : { value: percent(o.value), pct: true };
    }
    return o;
  }

  function primary(): Dec {
    const t = tokens[i];
    i += 1;
    if (t?.kind === 'num') return parseLiteral(t.text);
    if (t?.kind === 'val') return t.value;
    if (t?.kind === 'open') {
      const inner = sum();
      if (tokens[i]?.kind === 'close') i += 1;
      else if (i < tokens.length) throw new CalcError('malformed');
      return inner;
    }
    throw new CalcError('malformed');
  }

  const value = sum();
  if (i < tokens.length) throw new CalcError('malformed');
  return value;
}

/** Evaluate an expression; open parentheses are closed and a half-typed exponent is dropped. */
export function evaluate(tokens: readonly Token[]): Evaluation {
  try {
    return { ok: true, value: parse(settle(tokens)) };
  } catch (err) {
    if (err instanceof CalcError) return { ok: false, error: err.code };
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** A keypad key (and what the keyboard and a paste map onto). */
export type CalcKey =
  | Digit
  | 'point'
  | 'exp'
  | BinaryOp
  | 'open'
  | 'close'
  | 'square'
  | 'sqrt'
  | 'percent'
  | 'negate'
  | 'backspace'
  | 'clear'
  | 'equals'
  | 'mc'
  | 'mr'
  | 'mplus'
  | 'mminus';

/** A past calculation on the tape. */
export interface HistoryEntry {
  readonly id: number;
  /** The expression as evaluated (its parentheses closed), for display. */
  readonly expression: string;
  readonly value: Dec;
}

export interface CalculatorState {
  /** The expression being built; after "=", the answer alone (see `fresh`). */
  readonly tokens: readonly Token[];
  /** Set by "=" (or a recalled calculation): a digit starts afresh, an operator carries on. */
  readonly fresh: boolean;
  /** The expression a fresh answer came from, shown above it. Empty while typing. */
  readonly context: string;
  /** Why the last evaluation failed, shown until the next key. The expression stays to be fixed. */
  readonly error: CalcErrorCode | null;
  /** The memory register (MC · MR · M+ · M−); null once cleared. */
  readonly memory: Dec | null;
  /** Past calculations, newest first. */
  readonly history: readonly HistoryEntry[];
  /** The id the next history entry takes (stable list keys). */
  readonly nextId: number;
}

/** The longest tape kept; older calculations fall off the end. */
export const MAX_HISTORY = 100;
/** Digits a typed mantissa may hold (all of them count: the engine keeps PRECISION). */
export const MAX_DIGITS = PRECISION;
/** Digits a typed exponent may hold. */
export const MAX_EXPONENT_DIGITS = 9;

export const INITIAL_CALCULATOR: CalculatorState = {
  tokens: [],
  fresh: false,
  context: '',
  error: null,
  memory: null,
  history: [],
  nextId: 1,
};

export type CalculatorAction =
  | { readonly type: 'key'; readonly key: CalcKey }
  /** Put a history entry's value to use (see `recall`). */
  | { readonly type: 'recall'; readonly id: number }
  | { readonly type: 'paste'; readonly text: string }
  | { readonly type: 'clearHistory' };

/** A new expression: typing leaves any answer and its context behind. */
function edit(s: CalculatorState, tokens: readonly Token[]): CalculatorState {
  return { ...s, tokens, fresh: false, context: '' };
}

/** An operand about to start: after a finished one, an implied "×" joins them ("2(3)"). */
function joined(tokens: readonly Token[]): Token[] {
  return endsOperand(tokens.at(-1)) ? [...tokens, op('multiply')] : [...tokens];
}

/** A value spelled out as the literal the display shows, so it can be edited digit by digit. */
function literalTokens(v: Dec): Token[] {
  const text = plainValue(v);
  return text.startsWith('-') ? [op('subtract'), num(text.slice(1))] : [num(text)];
}

/** The token list with a trailing whole value spelled out as its literal (see `literalTokens`). */
function spelledOut(tokens: readonly Token[]): Token[] {
  const last = tokens.at(-1);
  return last?.kind === 'val'
    ? [...tokens.slice(0, -1), ...literalTokens(last.value)]
    : [...tokens];
}

/**
 * Where the operand at the end of `tokens` begins: back past its postfixes, over a whole
 * parenthesis group, then its √ prefixes (not a unary minus, which sits outside it). -1 when the
 * tokens do not end in an operand.
 */
function operandStart(tokens: readonly Token[]): number {
  let i = tokens.length - 1;
  while (tokens[i]?.kind === 'square' || tokens[i]?.kind === 'percent') i -= 1;
  const t = tokens[i];
  if (t?.kind === 'close') {
    // Walk left to the "(" that this ")" closes.
    let depth = 0;
    for (; i >= 0; i -= 1) {
      const k = tokens[i]?.kind;
      if (k === 'close') depth += 1;
      if (k === 'open') depth -= 1;
      if (depth === 0) break;
    }
    if (i < 0) return -1;
  } else if (t?.kind !== 'num' && t?.kind !== 'val') {
    return -1;
  }
  while (tokens[i - 1]?.kind === 'sqrt') i -= 1;
  return i;
}

function appendDigit(text: string, d: Digit): string | null {
  const e = text.indexOf('e');
  if (e >= 0) {
    const exponent = text.slice(e + 1).replace('-', '');
    if (exponent === '0') return text.slice(0, -1) + d; // no leading zero in an exponent
    return exponent.length >= MAX_EXPONENT_DIGITS ? null : text + d;
  }
  if (text === '0') return d;
  return text.replace('.', '').length >= MAX_DIGITS ? null : text + d;
}

function typeDigit(s: CalculatorState, d: Digit): CalculatorState {
  if (s.fresh) return edit(s, [num(d)]);
  const last = s.tokens.at(-1);
  if (last?.kind === 'num') {
    const text = appendDigit(last.text, d);
    return text === null ? s : edit(s, [...s.tokens.slice(0, -1), num(text)]);
  }
  // A digit after a whole value (a recalled memory, say) replaces it, as a new entry would.
  if (last?.kind === 'val') return edit(s, [...s.tokens.slice(0, -1), num(d)]);
  return edit(s, [...joined(s.tokens), num(d)]);
}

function typePoint(s: CalculatorState): CalculatorState {
  if (s.fresh) return edit(s, [num('0.')]);
  const last = s.tokens.at(-1);
  if (last?.kind === 'num') {
    return /[.e]/.test(last.text) ? s : edit(s, [...s.tokens.slice(0, -1), num(`${last.text}.`)]);
  }
  if (last?.kind === 'val') return edit(s, [...s.tokens.slice(0, -1), num('0.')]);
  return edit(s, [...joined(s.tokens), num('0.')]);
}

/** EXP: "× 10 to the…" on the number just typed (or the answer), or a bare "1e" to begin one. */
function typeExp(s: CalculatorState): CalculatorState {
  const tokens = spelledOut(s.tokens);
  const last = tokens.at(-1);
  if (last?.kind === 'num') {
    if (last.text.includes('e')) return s;
    return edit(s, [...tokens.slice(0, -1), num(`${last.text.replace(/\.$/, '')}e`)]);
  }
  return edit(s, [...joined(tokens), num('1e')]);
}

function typeOperator(s: CalculatorState, o: BinaryOp): CalculatorState {
  const last = s.tokens.at(-1);
  // Mid-exponent, "−" and "+" sign the exponent ("1e−7"); "×" and "÷" finish the number.
  if (last?.kind === 'num' && /e-?$/.test(last.text) && (o === 'add' || o === 'subtract')) {
    const signed = last.text.endsWith('-');
    if (o === 'add' ? !signed : signed) return s;
    const text = o === 'add' ? last.text.slice(0, -1) : `${last.text}-`;
    return edit(s, [...s.tokens.slice(0, -1), num(text)]);
  }
  const tokens = settle(s.tokens);
  const end = tokens.at(-1);
  if (o === 'subtract') {
    if (end?.kind === 'op' && end.op === 'subtract') return s;
    // After "+", a minus reads as subtraction; anywhere an operand is due, it negates what follows.
    if (end?.kind === 'op' && end.op === 'add') return edit(s, [...tokens.slice(0, -1), op(o)]);
    return edit(s, [...tokens, op(o)]);
  }
  // "+", "×", "÷" replace a trailing operator (and a pending minus) rather than stack on it.
  while (tokens.at(-1)?.kind === 'op') tokens.pop();
  if (tokens.length === 0) return edit(s, [num('0'), op(o)]);
  if (!endsOperand(tokens.at(-1))) return s;
  return edit(s, [...tokens, op(o)]);
}

function typeOpen(s: CalculatorState): CalculatorState {
  if (s.fresh) return edit(s, [OPEN]);
  return edit(s, [...joined(settle(s.tokens)), OPEN]);
}

function typeClose(s: CalculatorState): CalculatorState {
  const tokens = settle(s.tokens);
  if (s.fresh || openCount(tokens) === 0 || !endsOperand(tokens.at(-1))) return s;
  return edit(s, [...tokens, CLOSE]);
}

/** x² and %: postfixes on the operand just finished (or on the answer). */
function typePostfix(s: CalculatorState, kind: 'square' | 'percent'): CalculatorState {
  const tokens = settle(s.tokens);
  const last = tokens.at(-1);
  if (!endsOperand(last) || (kind === 'percent' && last?.kind === 'percent')) return s;
  return edit(s, [...tokens, kind === 'square' ? SQUARE : PERCENT]);
}

/** √ takes the operand just finished (or the answer); where one is still due, it prefixes it. */
function typeRoot(s: CalculatorState): CalculatorState {
  const tokens = settle(s.tokens);
  const start = operandStart(tokens);
  if (start < 0) return edit(s, [...tokens, SQRT]);
  return edit(s, [...tokens.slice(0, start), SQRT, ...tokens.slice(start)]);
}

/** ± flips the sign of the operand just finished; where one is still due, it toggles its minus. */
function negate(s: CalculatorState): CalculatorState {
  const answer = s.fresh ? s.tokens[0] : undefined;
  if (answer?.kind === 'val') return { ...s, tokens: [val(neg(answer.value))], context: '' };
  const tokens = settle(s.tokens);
  const start = operandStart(tokens);
  if (start < 0) {
    return isUnaryMinus(tokens, tokens.length - 1)
      ? edit(s, tokens.slice(0, -1))
      : edit(s, [...tokens, op('subtract')]);
  }
  if (isUnaryMinus(tokens, start - 1)) {
    return edit(s, [...tokens.slice(0, start - 1), ...tokens.slice(start)]);
  }
  return edit(s, [...tokens.slice(0, start), op('subtract'), ...tokens.slice(start)]);
}

/** ⌫ removes the last character; an answer or a recalled value is first spelled out to edit. */
function backspace(s: CalculatorState): CalculatorState {
  const tokens = spelledOut(s.tokens);
  const last = tokens.at(-1);
  if (last === undefined) return s;
  if (last.kind === 'num' && last.text.length > 1) {
    return edit(s, [...tokens.slice(0, -1), num(last.text.slice(0, -1))]);
  }
  return edit(s, tokens.slice(0, -1));
}

function equals(s: CalculatorState): CalculatorState {
  if (s.fresh || s.tokens.length === 0) return s;
  const tokens = closeAll(settle(s.tokens));
  const result = evaluate(tokens);
  if (!result.ok) return { ...s, error: result.error };
  // A bare number (or its negation) evaluates to itself: no tape entry, nothing to show above it.
  const worked = hasOperation(tokens);
  const expression = worked ? renderExpression(tokens) : '';
  const entry: HistoryEntry[] = worked ? [{ id: s.nextId, expression, value: result.value }] : [];
  return {
    ...s,
    tokens: [val(result.value)],
    fresh: true,
    context: expression,
    history: [...entry, ...s.history].slice(0, MAX_HISTORY),
    nextId: s.nextId + entry.length,
  };
}

/** A whole value (the memory, a history entry) placed where the next operand goes. */
function insertValue(s: CalculatorState, v: Dec): CalculatorState {
  if (s.fresh) return edit(s, [val(v)]);
  const last = s.tokens.at(-1);
  if (last?.kind === 'num' || last?.kind === 'val') {
    return edit(s, [...s.tokens.slice(0, -1), val(v)]);
  }
  return edit(s, [...joined(settle(s.tokens)), val(v)]);
}

/** M+ / M−: the current expression's value into the memory register. */
function memoryAdd(s: CalculatorState, o: 'add' | 'subtract'): CalculatorState {
  const current: Evaluation =
    s.tokens.length === 0 ? { ok: true, value: ZERO } : evaluate(s.tokens);
  if (!current.ok) return { ...s, error: current.error };
  try {
    const base = s.memory ?? ZERO;
    return { ...s, memory: o === 'add' ? add(base, current.value) : sub(base, current.value) };
  } catch (err) {
    if (err instanceof CalcError) return { ...s, error: err.code };
    throw err;
  }
}

/** Apply one key. Any key first dismisses a standing error; the expression is kept to be fixed. */
export function press(state: CalculatorState, key: CalcKey): CalculatorState {
  const s = state.error === null ? state : { ...state, error: null };
  switch (key) {
    case 'point':
      return typePoint(s);
    case 'exp':
      return typeExp(s);
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
      return typeOperator(s, key);
    case 'open':
      return typeOpen(s);
    case 'close':
      return typeClose(s);
    case 'square':
    case 'percent':
      return typePostfix(s, key);
    case 'sqrt':
      return typeRoot(s);
    case 'negate':
      return negate(s);
    case 'backspace':
      return backspace(s);
    case 'clear':
      return { ...s, tokens: [], fresh: false, context: '' };
    case 'equals':
      return equals(s);
    case 'mc':
      return { ...s, memory: null };
    case 'mr':
      return s.memory === null ? s : insertValue(s, s.memory);
    case 'mplus':
      return memoryAdd(s, 'add');
    case 'mminus':
      return memoryAdd(s, 'subtract');
    default:
      return typeDigit(s, key);
  }
}

/**
 * A history entry put to use. With nothing typed (or an answer showing), the calculation comes
 * back whole: its answer, with its expression above it. Mid-expression, its value is inserted
 * where the next operand goes.
 */
export function recall(state: CalculatorState, id: number): CalculatorState {
  const entry = state.history.find((h) => h.id === id);
  if (!entry) return state;
  const s = { ...state, error: null };
  if (s.fresh || s.tokens.length === 0) {
    return { ...s, tokens: [val(entry.value)], fresh: true, context: entry.expression };
  }
  return insertValue(s, entry.value);
}

/** Pasted characters (beyond the keyboard's): the display's own glyphs read back. */
const PASTE_KEYS: ReadonlyMap<string, CalcKey> = new Map<string, CalcKey>([
  ['.', 'point'],
  ['+', 'add'],
  ['-', 'subtract'],
  [MINUS, 'subtract'],
  ['*', 'multiply'],
  ['x', 'multiply'],
  ['X', 'multiply'],
  ['×', 'multiply'],
  ['/', 'divide'],
  ['÷', 'divide'],
  ['(', 'open'],
  [')', 'close'],
  ['%', 'percent'],
  ['²', 'square'],
  ['√', 'sqrt'],
  ['e', 'exp'],
  ['E', 'exp'],
]);

/**
 * Pasted text as key presses: whitespace and digit-group commas are skipped, a trailing "=" is not
 * pressed. Text with anything a calculator cannot read ("12.5M") pastes nothing at all, rather than
 * the part of it that happens to be digits.
 */
export function keysFromText(text: string): CalcKey[] | null {
  const keys: CalcKey[] = [];
  for (const ch of text.replace(/[\s,]/g, '').replace(/=+$/, '')) {
    const key = /^\d$/.test(ch) ? (ch as Digit) : PASTE_KEYS.get(ch);
    if (key === undefined) return null;
    keys.push(key);
  }
  return keys.length > 0 ? keys : null;
}

export function calculatorReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  switch (action.type) {
    case 'key':
      return press(state, action.key);
    case 'recall':
      return recall(state, action.id);
    case 'paste': {
      const keys = keysFromText(action.text);
      return keys === null ? state : keys.reduce(press, state);
    }
    case 'clearHistory':
      return { ...state, history: [] };
  }
}

/** Keyboard keys (`KeyboardEvent.key`), with Windows Calculator's shortcuts for √, x² and ±. */
const KEYBOARD: ReadonlyMap<string, CalcKey> = new Map<string, CalcKey>([
  ['.', 'point'],
  [',', 'point'], // the numeric keypad's decimal key on a comma-decimal layout
  ['+', 'add'],
  ['-', 'subtract'],
  ['*', 'multiply'],
  ['x', 'multiply'],
  ['X', 'multiply'],
  ['/', 'divide'],
  ['(', 'open'],
  [')', 'close'],
  ['%', 'percent'],
  ['@', 'sqrt'],
  ['q', 'square'],
  ['Q', 'square'],
  ['e', 'exp'],
  ['E', 'exp'],
  ['F9', 'negate'],
  ['Enter', 'equals'],
  ['=', 'equals'],
  ['Backspace', 'backspace'],
  ['Escape', 'clear'],
  ['Delete', 'clear'],
]);

/** The keypad key a keyboard key presses, if any. */
export function keyFromKeyboard(key: string): CalcKey | null {
  if (/^\d$/.test(key)) return key as Digit;
  return KEYBOARD.get(key) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------------------------

/** The display's main line: the expression being typed, or the answer after "=". */
export function mainLine(s: CalculatorState): string {
  return s.tokens.length === 0 ? '0' : renderExpression(s.tokens);
}

/**
 * The live result under an expression still being typed, once it does something and reads
 * cleanly (a trailing operator or a division by zero simply shows none until "=").
 */
export function preview(s: CalculatorState): Dec | null {
  if (s.fresh || s.error !== null || !hasOperation(s.tokens)) return null;
  const r = evaluate(s.tokens);
  return r.ok ? r.value : null;
}

/** What Copy puts on the clipboard: the answer as plain digits, or the expression as shown. */
export function copyText(s: CalculatorState): string {
  const answer = s.fresh ? s.tokens[0] : undefined;
  if (answer?.kind === 'val') return plainValue(answer.value);
  return mainLine(s);
}
