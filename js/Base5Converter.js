/**
 * Base5Converter.js - extracts numerical units and converts them (BigInt).
 * Units never span columns. NULL and unwritten cells are not digits.
 * A unit that has only its terminator is "empty": it has no numeric value.
 */
import Palette from './Palette.js';

export default class Base5Converter {
  static extractUnits(grid) {
    const units = [];
    for (let c = 0; c < grid.width; c++) {
      let digits = '', start = -1, last = -1;
      for (let r = 0; r < grid.height; r++) {
        const code = grid.get(r, c);
        if (Palette.isDigit(code)) {
          if (start < 0) start = r;
          digits += Palette.digitOf(code); last = r;
        } else if (Palette.isTerminator(code)) {
          if (start < 0) start = r;
          units.push(Base5Converter.#unit(c, digits, true, start, r)); digits = ''; start = -1;
        }
      }
      if (start >= 0) units.push(Base5Converter.#unit(c, digits, false, start, last));
    }
    return units;
  }

  static #unit(col, digits, complete, start, end) {
    return Object.freeze({
      column: col + 1, digits, complete, isEmpty: digits === '',
      startRow: start + 1, endRow: end + 1,
      decimal: complete ? Base5Converter.toDecimal(digits) : null,
    });
  }

  /** Base-5 digit string -> BigInt, or null for an empty string. */
  static toDecimal(digits) {
    if (!/^[0-4]*$/.test(digits)) throw new RangeError('Not a base-5 digit string');
    if (digits === '') return null;
    let v = 0n;
    for (const ch of digits) v = v * 5n + BigInt(ch);
    return v;
  }
}
