/**
 * Palette.js
 * Single source of truth for every color and symbol meaning.
 * To re-tint the encoding, edit ONLY the hex values in DEFINITIONS.
 *
 * Cell codes stored in the grid model:
 *   0 = unwritten (pure white)   1..5 = digit symbols (values 0..4)
 *   6 = unit terminator          7 = NULL (unavailable cell)
 */

function parseHex(hex) {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return Object.freeze([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}

const pack = (r, g, b) => (r << 16) | (g << 8) | b;

// Order matters: the array index equals the cell code.
const DEFINITIONS = [
  { code: 0, key: 'EMPTY',           label: 'Unwritten (white)', hex: '#FFFFFF', role: 'empty',      digit: null },
  { code: 1, key: 'TURQUOISE_GREEN', label: 'Turquoise green',   hex: '#40C4A0', role: 'digit',      digit: 0 },
  { code: 2, key: 'SKY_BLUE',        label: 'Sky blue',          hex: '#87CEEB', role: 'digit',      digit: 1 },
  { code: 3, key: 'YELLOW',          label: 'Yellow',            hex: '#FFD700', role: 'digit',      digit: 2 },
  { code: 4, key: 'ORANGE',          label: 'Orange',            hex: '#FF8C00', role: 'digit',      digit: 3 },
  { code: 5, key: 'MILKY_CREAM',     label: 'Milky cream',       hex: '#FFF4D6', role: 'digit',      digit: 4 },
  { code: 6, key: 'TURQUOISE_BLUE',  label: 'Turquoise blue (terminator)', hex: '#00B8D4', role: 'terminator', digit: null },
  { code: 7, key: 'BLACK_NULL',      label: 'Black (NULL)',      hex: '#000000', role: 'null',       digit: null },
];

const ENTRIES = Object.freeze(
  DEFINITIONS.map((d) => Object.freeze({ ...d, rgb: parseHex(d.hex) }))
);

const BY_PACKED = new Map();
for (const e of ENTRIES) {
  const key = pack(...e.rgb);
  if (BY_PACKED.has(key)) throw new Error(`Palette colors must be unique: ${e.hex}`);
  BY_PACKED.set(key, e.code);
}

const WRITABLE = Object.freeze(
  ENTRIES.filter((e) => e.role === 'digit' || e.role === 'terminator').map((e) => e.code)
);

export default class Palette {
  static EMPTY = 0;
  static TERMINATOR = 6;
  static NULL = 7;
  static DIGIT_BASE = 5;

  /** All entries (including white and NULL), indexed by code. */
  static all() { return ENTRIES; }

  /** Codes a user or the random generator may write: 1..6. */
  static writableCodes() { return WRITABLE; }

  static get(code) {
    const e = Number.isInteger(code) ? ENTRIES[code] : undefined;
    if (!e) throw new RangeError(`Unknown cell code: ${code}`);
    return e;
  }

  static hexOf(code) { return Palette.get(code).hex; }
  static rgbOf(code) { return Palette.get(code).rgb; }

  /** Exact match only. Returns -1 for any color not in the palette. */
  static codeFromRgb(r, g, b) {
    const code = BY_PACKED.get(pack(r, g, b));
    return code === undefined ? -1 : code;
  }

  static isEmpty(code)      { return code === Palette.EMPTY; }
  static isNull(code)       { return code === Palette.NULL; }
  static isTerminator(code) { return code === Palette.TERMINATOR; }
  static isDigit(code)      { return Number.isInteger(code) && ENTRIES[code]?.role === 'digit'; }
  static isWritable(code)   { return WRITABLE.includes(code); }

  /** Base-5 digit value (0..4) of a digit symbol, otherwise null. */
  static digitOf(code) { return Palette.isDigit(code) ? ENTRIES[code].digit : null; }
}
