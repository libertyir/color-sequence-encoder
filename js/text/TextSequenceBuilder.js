/**
 * TextSequenceBuilder.js - text -> ordered units. Each unit is one word:
 * its digit colors followed by exactly one turquoise-blue terminator.
 * Empty (or whitespace-only) input gives no units.
 */
import TextCodec from './TextCodec.js';
import DigitColorMap from './DigitColorMap.js';

export default class TextSequenceBuilder {
  static build(text) {
    const words = TextCodec.tokenize(text);
    const units = words.map((word, index) => {
      const digits = TextCodec.wordToDigits(word);
      return Object.freeze({ index, word, digits, symbols: Object.freeze([...DigitColorMap.digitsToCodes(digits), DigitColorMap.TERMINATOR]) });
    });
    return Object.freeze({ words, units: Object.freeze(units), symbolCount: units.reduce((n, u) => n + u.symbols.length, 0) });
  }
}
