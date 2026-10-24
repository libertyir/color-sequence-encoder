/**
 * TextPageReader.js - pages (in order) -> plain text. Each complete unit is one
 * word; words are joined by a single space. Strict: any invalid page or unit
 * stops the result (ok=false) and is reported with page and unit numbers.
 */
import TextCodec from './TextCodec.js';
import DigitColorMap from './DigitColorMap.js';
import ChronologicalReader from './ChronologicalReader.js';

export default class TextPageReader {
  /** @param {{name?: string, grid: GridModel}[]} pages in reading order */
  static decode(pages, { maxErrors = 50 } = {}) {
    const words = [], errors = [];
    const fail = (page, name, unit, reason) => { if (errors.length < maxErrors) errors.push({ page, name, unit, reason }); };
    pages.forEach((p, pi) => {
      const read = ChronologicalReader.read(p.grid);
      if (!read.ok) { fail(pi + 1, p.name, null, read.reason); return; }
      read.units.forEach((u, ui) => {
        if (!u.complete) { fail(pi + 1, p.name, ui + 1, 'the page ends with an unfinished word (no closing turquoise-blue cell)'); return; }
        try { words.push(TextCodec.digitsToWord(DigitColorMap.codesToDigits(u.codes))); }
        catch (e) { fail(pi + 1, p.name, ui + 1, e.message); }
      });
    });
    const ok = errors.length === 0;
    return { ok, text: ok ? words.join(' ') : null, words: ok ? words : [], pagesRead: pages.length, errors };
  }
}
