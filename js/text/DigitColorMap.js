/**
 * DigitColorMap.js - the ONE place that maps base-5 digits to the existing
 * palette symbols (digit 0..4 = turquoise green, sky blue, yellow, orange,
 * milky cream). Turquoise blue is the word terminator, never a digit.
 */
import Palette from '../Palette.js';

const DIGIT_CODES = Object.freeze(Palette.all().filter((e) => e.role === 'digit').sort((a, b) => a.digit - b.digit).map((e) => e.code));
if (DIGIT_CODES.length !== 5) throw new Error('Palette must define exactly five digit colors');

export default class DigitColorMap {
  static TERMINATOR = Palette.TERMINATOR;
  static codeOfDigit(d) {
    if (!Number.isInteger(d) || d < 0 || d > 4) throw new RangeError(`Not a base-5 digit: ${d}`);
    return DIGIT_CODES[d];
  }
  /** Digit 0..4 for a digit symbol, otherwise null (also for the terminator, NULL and white). */
  static digitOfCode(code) { return Palette.digitOf(code); }
  static hexOfDigit(d) { return Palette.hexOf(DigitColorMap.codeOfDigit(d)); }
  static digitsToCodes(digits) { return [...digits].map((ch) => DigitColorMap.codeOfDigit(Number(ch))); }
  static codesToDigits(codes) { return codes.map((c) => { const d = DigitColorMap.digitOfCode(c); if (d === null) throw new RangeError(`Symbol ${c} is not a digit color`); return d; }).join(''); }
}
