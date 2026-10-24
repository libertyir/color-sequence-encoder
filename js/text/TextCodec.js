/**
 * TextCodec.js - reversible word <-> base-5 digit string.
 * word -> UTF-8 bytes -> prefix 0x01 -> unsigned big-endian BigInt -> base 5.
 * The sentinel keeps leading zero bytes. Words are never normalized or altered;
 * text that cannot be encoded exactly (lone surrogates) is rejected.
 * Word length limit: MAX_WORD_CHARS Unicode code points.
 */
export class TextCodecError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'TextCodecError'; this.code = code; Object.assign(this, details); }
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export default class TextCodec {
  static MAX_WORD_CHARS = 1024;
  static SENTINEL = 0x01;

  static isWellFormed(s) { return !LONE_SURROGATE.test(s); }
  static charCount(word) { let n = 0; for (const _ of word) n++; return n; }

  /** Split on runs of whitespace (JS \s, Unicode-aware). Empty input -> []. */
  static tokenize(text) {
    if (typeof text !== 'string') throw new TypeError('text must be a string');
    if (!TextCodec.isWellFormed(text)) throw new TextCodecError('LONE_SURROGATE', 'The text contains an invalid (unpaired) UTF-16 character and cannot be encoded exactly.');
    const words = text.split(/\s+/u).filter(Boolean);
    words.forEach((w, i) => {
      const n = TextCodec.charCount(w);
      if (n > TextCodec.MAX_WORD_CHARS) throw new TextCodecError('WORD_TOO_LONG', `Word ${i + 1} has ${n} characters; the limit is ${TextCodec.MAX_WORD_CHARS}.`, { wordIndex: i + 1 });
    });
    return words;
  }

  /** Canonical base-5 digit string (no leading zero) of one word. */
  static wordToDigits(word) {
    if (!word) throw new TextCodecError('EMPTY_WORD', 'A word cannot be empty.');
    if (!TextCodec.isWellFormed(word)) throw new TextCodecError('LONE_SURROGATE', 'The word contains an unpaired UTF-16 character.');
    let hex = '01';
    for (const b of new globalThis.TextEncoder().encode(word)) hex += b.toString(16).padStart(2, '0');
    return BigInt(`0x${hex}`).toString(5);
  }

  /** Inverse of wordToDigits; throws TextCodecError (with a code) for anything that is not a canonical encoding. */
  static digitsToWord(digits) {
    if (!/^[0-4]+$/.test(digits)) throw new TextCodecError('INVALID_DIGITS', 'The unit is empty or contains symbols that are not base-5 digits.');
    if (digits[0] === '0') throw new TextCodecError('LEADING_ZERO', 'The unit starts with digit 0, which an encoded word never does.');
    let v = 0n;
    for (let i = 0; i < digits.length; i += 20) {
      const chunk = digits.slice(i, i + 20);
      v = v * 5n ** BigInt(chunk.length) + BigInt(parseInt(chunk, 5));
    }
    let hex = v.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
    if (bytes[0] !== TextCodec.SENTINEL) throw new TextCodecError('BAD_SENTINEL', 'The integer does not start with the 0x01 sentinel byte.');
    let word;
    try { word = new globalThis.TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(1)); }
    catch { throw new TextCodecError('INVALID_UTF8', 'The bytes are not valid UTF-8.'); }
    if (word === '') throw new TextCodecError('EMPTY_WORD', 'The unit decodes to an empty word.');
    return word;
  }
}
