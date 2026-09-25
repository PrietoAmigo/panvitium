/**
 * The desk PC Calculator's engine: exact decimal arithmetic, the expression grammar (precedence,
 * auto-closed parentheses, postfix x² and %, prefix √ and unary minus, "a + b%"), the display's
 * number format, and the keypad's input rules (answers carrying on, the memory register, the
 * history tape, paste and copy).
 *
 * Expected strings carry the display's own glyphs: × ÷ √ ², and the real minus sign (U+2212, not
 * a hyphen).
 */
import { describe, it, expect } from 'vitest';
import {
  DISPLAY_DIGITS,
  INITIAL_CALCULATOR,
  MAX_HISTORY,
  add,
  calculatorReducer,
  copyText,
  div,
  evaluate,
  formatValue,
  keyFromKeyboard,
  keysFromText,
  mainLine,
  mul,
  parseLiteral,
  plainValue,
  press,
  preview,
  recall,
  sqrt,
  sub,
  type CalcKey,
  type CalculatorState,
  type Dec,
} from './calculatorEngine.js';

/** Test shorthands beyond the keyboard's own keys. */
const ALIASES: Readonly<Record<string, CalcKey>> = {
  '±': 'negate',
  '⌫': 'backspace',
  '√': 'sqrt',
  '²': 'square',
  '=': 'equals',
  C: 'clear',
};

/** Type `text` key by key, as the keyboard would (plus the aliases above). */
function typed(text: string, from: CalculatorState = INITIAL_CALCULATOR): CalculatorState {
  let s = from;
  for (const ch of text) {
    const key = ALIASES[ch] ?? keyFromKeyboard(ch);
    if (key === null) throw new Error(`no key for ${ch}`);
    s = press(s, key);
  }
  return s;
}

/** The main line after typing `text`. */
const shown = (text: string): string => mainLine(typed(text));
/** A value from its literal, for arithmetic checks. */
const d = (text: string): Dec => parseLiteral(text);
const show = (v: Dec): string => formatValue(v);

describe('exact decimal arithmetic', () => {
  it('adds and subtracts decimals exactly, where binary floating point cannot', () => {
    expect(show(add(d('0.1'), d('0.2')))).toBe('0.3');
    expect(sub(add(d('0.1'), d('0.2')), d('0.3'))).toEqual({ m: 0n, e: 0 });
    expect(show(mul(d('1.1'), d('1.1')))).toBe('1.21');
    expect(show(sub(d('1'), d('0.9')))).toBe('0.1');
  });

  it('keeps enough precision that a division undone reads whole', () => {
    expect(show(mul(div(d('1'), d('3')), d('3')))).toBe('1');
    expect(show(mul(div(d('2'), d('7')), d('7')))).toBe('2');
    expect(show(mul(sqrt(d('2')), sqrt(d('2'))))).toBe('2');
  });

  it('rounds the display to 16 significant digits, half up', () => {
    expect(show(div(d('2'), d('3')))).toBe('0.6666666666666667');
    expect(show(div(d('1'), d('7')))).toBe('0.1428571428571429');
    expect(show(sqrt(d('2')))).toBe('1.414213562373095');
    expect(DISPLAY_DIGITS).toBe(16);
  });

  it('takes exact square roots, and irrational ones to full display precision', () => {
    expect(show(sqrt(d('16')))).toBe('4');
    expect(show(sqrt(d('0.25')))).toBe('0.5');
    expect(show(sqrt(d('1e-6')))).toBe('0.001');
    expect(show(sqrt(d('10')))).toBe('3.162277660168379');
  });

  it('reaches far past floating point, and overflows only at the exponent cap', () => {
    expect(show(mul(d('1e300'), d('1e300')))).toBe('1e600');
    expect(show(add(d('1e900'), d('1')))).toBe('1e900');
    expect(show(sub(d('1e40'), d('1')))).toBe('1e40');
    expect(evaluate([{ kind: 'val', value: d('1e999999999') }, { kind: 'square' }])).toEqual({
      ok: true,
      value: d('1e1999999998'),
    });
    // Squaring 1e600,000,000,000,000 lands past the 10^15 exponent cap.
    const huge = { m: 1n, e: 6e14 };
    expect(evaluate([{ kind: 'val', value: huge }, { kind: 'square' }])).toEqual({
      ok: false,
      error: 'overflow',
    });
  });
});

describe('the display format', () => {
  it('groups the integer part and keeps a real minus sign', () => {
    expect(show(d('123456.789'))).toBe('123,456.789');
    expect(show(d('1000'))).toBe('1,000');
    expect(show({ m: -1234n, e: 0 })).toBe('−1,234');
    expect(show(d('0'))).toBe('0');
  });

  it('spells out up to 16 integer digits, then switches to "e" notation', () => {
    expect(show(d('9999999999999999'))).toBe('9,999,999,999,999,999');
    expect(show(d('1e15'))).toBe('1,000,000,000,000,000');
    expect(show(d('1e16'))).toBe('1e16');
    expect(show(d('12345678901234567890'))).toBe('1.234567890123457e19');
  });

  it('spells out small numbers down to a millionth, then switches to "e" notation', () => {
    expect(show(d('0.000001'))).toBe('0.000001');
    expect(show(d('0.0000001'))).toBe('1e−7');
    expect(show(d('2.5e-8'))).toBe('2.5e−8');
  });

  it('gives the clipboard plain text: no grouping, an ASCII minus', () => {
    expect(plainValue({ m: -1234567n, e: -2 })).toBe('-12345.67');
    expect(plainValue(d('2.5e-8'))).toBe('2.5e-8');
  });
});

describe('expressions', () => {
  it('multiplies and divides before adding and subtracting, left to right', () => {
    expect(shown('2+3*4=')).toBe('14');
    expect(shown('10-4-3=')).toBe('3');
    expect(shown('100/10/2=')).toBe('5');
    expect(shown('2*3+4*5=')).toBe('26');
  });

  it('honours parentheses and closes any left open at "="', () => {
    expect(shown('(2+3)*4=')).toBe('20');
    expect(shown('((1+2)*(3+4))=')).toBe('21');
    const s = typed('(2+3*(4');
    expect(mainLine(s)).toBe('(2 + 3 × (4');
    const done = press(s, 'equals');
    expect(mainLine(done)).toBe('14');
    expect(done.context).toBe('(2 + 3 × (4))');
  });

  it('binds x² tighter than a minus, and √ to what follows it', () => {
    expect(shown('-3q=')).toBe('−9');
    expect(shown('(-3)q=')).toBe('9');
    expect(shown('@9+7=')).toBe('10');
    expect(shown('@(9+16)=')).toBe('5');
  });

  it('reads a percent alone as hundredths, and "a ± b%" as b% of a', () => {
    expect(shown('10%=')).toBe('0.1');
    expect(shown('200+10%=')).toBe('220');
    expect(shown('200-10%=')).toBe('180');
    expect(shown('200+10%+10%=')).toBe('242');
    expect(shown('50*10%=')).toBe('5');
    expect(shown('50/25%=')).toBe('200');
    expect(shown('200+(10+10)%=')).toBe('240');
  });

  it('reports what went wrong and keeps the expression to fix', () => {
    const zero = typed('5/0=');
    expect(zero.error).toBe('divideByZero');
    expect(mainLine(zero)).toBe('5 ÷ 0');
    expect(typed('(-4)@=').error).toBe('negativeRoot');
    expect(typed('5+=').error).toBe('malformed');
    expect(typed('(=').error).toBe('malformed');
  });

  it('dismisses an error with the next key and carries on from the expression', () => {
    const fixed = typed('⌫2=', typed('5/0='));
    expect(fixed.error).toBeNull();
    expect(mainLine(fixed)).toBe('2.5');
  });
});

describe('typing numbers', () => {
  it('builds literals digit by digit, one decimal point each, no leading zeros', () => {
    expect(shown('0007')).toBe('7');
    expect(shown('1.2.3')).toBe('1.23');
    expect(shown('.5')).toBe('0.5');
    expect(shown('1234567.5')).toBe('1,234,567.5');
  });

  it('enters exponents with EXP: signed, and a dangling one counts as none', () => {
    expect(shown('1.5e30')).toBe('1.5e30');
    expect(shown('1.5e30=')).toBe('1.5e30');
    expect(shown('2e-3=')).toBe('0.002');
    expect(shown('2e-+3=')).toBe('2,000');
    expect(shown('7e=')).toBe('7');
    expect(shown('1e*2=')).toBe('2');
    expect(shown('e3=')).toBe('1,000');
    expect(shown('2(e3)=')).toBe('2,000');
  });

  it('caps a literal at 40 digits and an exponent at 9', () => {
    const forty = '1'.repeat(40);
    expect(mainLine(typed(`${forty}2`)).replace(/,/g, '')).toBe(forty);
    expect(shown('1e1234567890')).toBe('1e123456789');
  });
});

describe('operators', () => {
  it('replaces a trailing operator rather than stacking one', () => {
    expect(shown('5+*')).toBe('5 ×');
    expect(shown('5*-+')).toBe('5 +');
  });

  it('reads a minus where an operand is due as a negation', () => {
    expect(shown('-5')).toBe('−5');
    expect(shown('5*-3=')).toBe('−15');
    expect(shown('5--')).toBe('5 −');
    expect(shown('5+-')).toBe('5 −');
    expect(shown('(-2)')).toBe('(−2)');
  });

  it('starts from 0 when an operator comes first, and ignores one after "("', () => {
    expect(shown('*')).toBe('0 ×');
    expect(shown('(*')).toBe('(');
  });

  it('joins an operand to a finished one with an implied "×"', () => {
    expect(shown('2(3+4)=')).toBe('14');
    expect(shown('(1+2)(3+4)=')).toBe('21');
    expect(shown('(2)3')).toBe('(2) × 3');
    expect(shown('3q2')).toBe('3² × 2');
  });

  it('closes a parenthesis only when one is open and an operand is finished', () => {
    expect(shown(')')).toBe('0');
    expect(shown('(5+)')).toBe('(5 +');
    expect(shown('(5))')).toBe('(5)');
  });

  it('puts √ on the operand just typed, or before the one still to come', () => {
    expect(shown('9@')).toBe('√9');
    expect(shown('5+(3+6)@=')).toBe('8');
    expect(shown('-9@')).toBe('−√9');
    expect(shown('@@16=')).toBe('2');
    expect(shown('2*@')).toBe('2 × √');
  });

  it('flips the sign of the operand just typed with ±, and back', () => {
    expect(shown('5-3±')).toBe('5 − −3');
    expect(shown('5-3±±')).toBe('5 − 3');
    expect(shown('5-3±=')).toBe('8');
    expect(shown('(2+3)±=')).toBe('−5');
    expect(shown('±')).toBe('−');
    expect(shown('±±')).toBe('0');
    expect(shown('5*±3=')).toBe('−15');
  });
});

describe('the answer', () => {
  it('shows the expression above the answer and carries on under an operator', () => {
    const s = typed('12+7=');
    expect(s.fresh).toBe(true);
    expect(s.context).toBe('12 + 7');
    expect(mainLine(s)).toBe('19');
    const more = typed('*2=', s);
    expect(mainLine(more)).toBe('38');
    expect(more.context).toBe('19 × 2');
  });

  it('yields to a digit, a point or a parenthesis, which start afresh', () => {
    const s = typed('12+7=');
    expect(mainLine(typed('5', s))).toBe('5');
    expect(mainLine(typed('.', s))).toBe('0.');
    expect(mainLine(typed('(', s))).toBe('(');
    expect(typed('5', s).context).toBe('');
  });

  it('takes x², %, √ and ± itself', () => {
    const s = typed('12+4=');
    expect(mainLine(typed('q=', s))).toBe('256');
    expect(mainLine(typed('@=', s))).toBe('4');
    expect(mainLine(typed('%=', s))).toBe('0.16');
    const flipped = typed('±', s);
    expect(mainLine(flipped)).toBe('−16');
    expect(flipped.fresh).toBe(true);
  });

  it('carries its full precision into the next calculation', () => {
    const third = typed('1/3=');
    expect(mainLine(third)).toBe('0.3333333333333333');
    expect(mainLine(typed('*3=', third))).toBe('1');
  });

  it('treats a repeated "=" as done, and a bare number as its own answer', () => {
    const s = typed('2+3=');
    expect(typed('=', s)).toBe(s);
    const bare = typed('-7=');
    expect(mainLine(bare)).toBe('−7');
    expect(bare.context).toBe('');
    expect(bare.history).toHaveLength(0);
  });

  it('is edited as text by ⌫, and scaled by EXP', () => {
    expect(shown('12+7=⌫')).toBe('1');
    expect(shown('2-7=⌫')).toBe('−');
    expect(shown('1/3=⌫')).toBe('0.333333333333333');
    expect(shown('1+2=e6=')).toBe('3,000,000');
  });
});

describe('editing', () => {
  it('removes the last character with ⌫, then the whole token', () => {
    expect(shown('123⌫')).toBe('12');
    expect(shown('1.⌫')).toBe('1');
    expect(shown('1e-5⌫⌫')).toBe('1e');
    expect(shown('5+⌫')).toBe('5');
    expect(shown('5⌫')).toBe('0');
    expect(typed('⌫')).toBe(INITIAL_CALCULATOR);
  });

  it('clears the expression and any error with C, keeping memory and history', () => {
    let s = typed('2+2=');
    s = press(s, 'mplus');
    s = typed('5/0=C', s);
    expect(mainLine(s)).toBe('0');
    expect(s.error).toBeNull();
    expect(s.memory).not.toBeNull();
    expect(s.history).toHaveLength(1);
  });
});

describe('the live preview', () => {
  it('shows the running result once the expression does something', () => {
    expect(preview(typed('5'))).toBeNull();
    expect(preview(typed('-5'))).toBeNull();
    expect(show(preview(typed('12+7*3')) ?? d('0'))).toBe('33');
    expect(show(preview(typed('(1+2')) ?? d('0'))).toBe('3');
  });

  it('shows nothing mid-operator, on a failure, or on an answer', () => {
    expect(preview(typed('12+'))).toBeNull();
    expect(preview(typed('5/0'))).toBeNull();
    expect(preview(typed('12+7='))).toBeNull();
  });
});

describe('the memory register', () => {
  it('adds and subtracts the current value, recalls it, and clears it', () => {
    let s = typed('12+8');
    s = press(s, 'mplus'); // 20
    expect(show(s.memory ?? d('0'))).toBe('20');
    s = typed('C5', s);
    s = press(s, 'mminus'); // 15
    expect(show(s.memory ?? d('0'))).toBe('15');
    s = typed('C2*', s);
    s = press(s, 'mr');
    expect(mainLine(typed('=', s))).toBe('30');
    s = press(s, 'mc');
    expect(s.memory).toBeNull();
    expect(press(s, 'mr')).toBe(s);
  });

  it('stores 0 from an empty display and reports a malformed expression', () => {
    expect(press(INITIAL_CALCULATOR, 'mplus').memory).toEqual({ m: 0n, e: 0 });
    const s = press(typed('5+'), 'mplus');
    expect(s.error).toBe('malformed');
    expect(s.memory).toBeNull();
  });

  it('puts a recalled value in place of the operand being typed', () => {
    let s = press(typed('7'), 'mplus');
    s = press(typed('C3+4', s), 'mr');
    expect(mainLine(s)).toBe('3 + 7');
    // A digit then replaces the recalled value, as a fresh entry would.
    expect(mainLine(typed('9', s))).toBe('3 + 9');
    // After a finished operand, an implied "×" joins it.
    expect(mainLine(press(typed('C(2)', s), 'mr'))).toBe('(2) × 7');
  });
});

describe('the history tape', () => {
  it('records each calculation, newest first', () => {
    const s = typed('1+1=2*3=');
    expect(s.history.map((h) => [h.expression, show(h.value)])).toEqual([
      ['2 × 3', '6'],
      ['1 + 1', '2'],
    ]);
    expect(new Set(s.history.map((h) => h.id)).size).toBe(2);
  });

  it(`keeps the last ${MAX_HISTORY} calculations`, () => {
    let s = INITIAL_CALCULATOR;
    for (let i = 0; i < MAX_HISTORY + 5; i += 1) s = typed('C1+1=', s);
    expect(s.history).toHaveLength(MAX_HISTORY);
  });

  it('brings a calculation back whole when nothing is being typed', () => {
    const s = typed('C', typed('12+7=3*3='));
    const first = s.history[1];
    if (!first) throw new Error('no entry');
    const back = recall(s, first.id);
    expect(mainLine(back)).toBe('19');
    expect(back.context).toBe('12 + 7');
    expect(back.fresh).toBe(true);
    expect(mainLine(typed('+1=', back))).toBe('20');
  });

  it('inserts a past answer where the next operand goes, mid-expression', () => {
    const s = typed('12+7=C100-');
    const entry = s.history[0];
    if (!entry) throw new Error('no entry');
    expect(mainLine(recall(s, entry.id))).toBe('100 − 19');
    expect(recall(s, 999)).toBe(s);
  });

  it('empties on request, leaving the calculation on display', () => {
    const s = calculatorReducer(typed('2+2='), { type: 'clearHistory' });
    expect(s.history).toHaveLength(0);
    expect(mainLine(s)).toBe('4');
  });
});

describe('the keyboard', () => {
  it('maps digits, operators and the editing keys', () => {
    expect(keyFromKeyboard('7')).toBe('7');
    expect(keyFromKeyboard('+')).toBe('add');
    expect(keyFromKeyboard('-')).toBe('subtract');
    expect(keyFromKeyboard('*')).toBe('multiply');
    expect(keyFromKeyboard('x')).toBe('multiply');
    expect(keyFromKeyboard('/')).toBe('divide');
    expect(keyFromKeyboard('Enter')).toBe('equals');
    expect(keyFromKeyboard('=')).toBe('equals');
    expect(keyFromKeyboard('Backspace')).toBe('backspace');
    expect(keyFromKeyboard('Escape')).toBe('clear');
    expect(keyFromKeyboard(',')).toBe('point');
  });

  it("takes Windows Calculator's shortcuts for √, x² and ±", () => {
    expect(keyFromKeyboard('@')).toBe('sqrt');
    expect(keyFromKeyboard('q')).toBe('square');
    expect(keyFromKeyboard('F9')).toBe('negate');
  });

  it('ignores everything else', () => {
    for (const key of ['a', 'Shift', 'Tab', ' ', 'ArrowLeft', '^', 'constructor']) {
      expect(keyFromKeyboard(key)).toBeNull();
    }
  });
});

describe('paste and copy', () => {
  it('pastes an expression, skipping spaces and digit-group commas', () => {
    const s = calculatorReducer(INITIAL_CALCULATOR, { type: 'paste', text: ' 1,234 × (2 + 1) ' });
    expect(mainLine(s)).toBe('1,234 × (2 + 1)');
    expect(mainLine(press(s, 'equals'))).toBe('3,702');
  });

  it("reads JavaScript's and the game's exponent forms", () => {
    const paste = (text: string): string =>
      mainLine(press(calculatorReducer(INITIAL_CALCULATOR, { type: 'paste', text }), 'equals'));
    expect(paste('1e+21')).toBe('1e21');
    expect(paste('1.5e30*2')).toBe('3e30');
    expect(paste('2.5E-3')).toBe('0.0025');
  });

  it('pastes nothing from text it cannot read in full', () => {
    expect(keysFromText('12.5M')).toBeNull();
    expect(keysFromText('')).toBeNull();
    expect(keysFromText('2+2=')).toEqual(['2', 'add', '2']);
    const s = typed('7');
    expect(calculatorReducer(s, { type: 'paste', text: 'twelve' })).toBe(s);
  });

  it('continues an answer when the paste starts with an operator', () => {
    const s = calculatorReducer(typed('6*7='), { type: 'paste', text: '-2' });
    expect(mainLine(press(s, 'equals'))).toBe('40');
  });

  it('copies an answer as plain digits and an expression as shown', () => {
    expect(copyText(typed('1000*1000*-1='))).toBe('-1000000');
    expect(copyText(typed('12+7'))).toBe('12 + 7');
    expect(copyText(INITIAL_CALCULATOR)).toBe('0');
  });
});
