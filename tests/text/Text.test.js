import Palette from '../../js/Palette.js';
import GridModel from '../../js/GridModel.js';
import WritingEngine from '../../js/WritingEngine.js';
import PageCollection, { Page } from '../../js/PageCollection.js';
import PngCodec from '../../js/PngCodec.js';
import TextCodec, { TextCodecError } from '../../js/text/TextCodec.js';
import DigitColorMap from '../../js/text/DigitColorMap.js';
import TextSequenceBuilder from '../../js/text/TextSequenceBuilder.js';
import TextPageWriter, { TextWriteError } from '../../js/text/TextPageWriter.js';
import TextPageReader from '../../js/text/TextPageReader.js';
import PageSaver from '../../js/text/PageSaver.js';
import PageFileOrder from '../../js/text/PageFileOrder.js';
import { mulberry32 } from '../helpers.js';

const noYield = () => Promise.resolve();
const readerInput = (pages) => pages.map((p, i) => ({ name: `p${i + 1}`, grid: p.grid }));
async function encodeToPages(text, w = 10, h = 20) {
  const c = new PageCollection(), b = TextSequenceBuilder.build(text);
  const res = await new TextPageWriter(c, { yieldControl: noYield }).write(b.units, { width: w, height: h });
  return { c, b, res };
}

export default function register(t) {
  t.suite('Text: TextCodec');
  t.test('known vector and exact round trips for Latin, Persian, CJK, emoji and mixed words', () => {
    t.equal(TextCodec.wordToDigits('a'), '2403');                       // 0x0161 = 353 = 2403 in base 5
    for (const w of ['Hello', 'hello', 'سلام', '世界', '🌍', 'Hello', '3.14,x!', '∑∞≠', 'می\u200Cخواهم', 'Ünï', '\u0000\u0000x', '\uFEFFx', 'a'.repeat(1024)]) {
      const d = TextCodec.wordToDigits(w);
      t.equal(TextCodec.digitsToWord(d), w, `round trip ${JSON.stringify(w.slice(0, 10))}`);
      t.assert(d[0] !== '0' && /^[0-4]+$/.test(d), 'canonical digits');
    }
    t.assert(TextCodec.wordToDigits('Hello') !== TextCodec.wordToDigits('hello'), 'case is preserved');
    for (const w of 'Hello سلام 世界 🌍'.split(' ')) t.equal(TextCodec.digitsToWord(TextCodec.wordToDigits(w)), w);
  });
  t.test('tokenization: whitespace runs only separate; nothing inside words changes', () => {
    t.equal(JSON.stringify(TextCodec.tokenize('  a  b\t\nc\u00A0d \u2003 ')), '["a","b","c","d"]');
    t.equal(JSON.stringify(TextCodec.tokenize('می\u200Cخواهم Hello,World!')), '["می\u200Cخواهم","Hello,World!"]');
    t.equal(TextCodec.tokenize('').length, 0); t.equal(TextCodec.tokenize(' \n\t ').length, 0);
  });
  t.test('limits and invalid input: 1024 characters ok, 1025 rejected, lone surrogates rejected', () => {
    t.equal(TextCodec.tokenize('x'.repeat(1024)).length, 1); t.equal(TextCodec.tokenize('🌍'.repeat(1024)).length, 1);
    let e = null; try { TextCodec.tokenize('ok ' + 'x'.repeat(1025)); } catch (err) { e = err; }
    t.assert(e instanceof TextCodecError && e.code === 'WORD_TOO_LONG' && e.wordIndex === 2, 'too long names word 2');
    for (const bad of ['a\uD800b', '\uDC00']) { let c = null; try { TextCodec.tokenize(bad); } catch (err) { c = err.code; } t.equal(c, 'LONE_SURROGATE'); }
    t.throws(() => TextCodec.tokenize(5));
  });
  t.test('decoding rejects non-canonical or corrupted units with a reason', () => {
    const code = (d) => { try { TextCodec.digitsToWord(d); return 'ok'; } catch (e) { return e.code; } };
    t.equal(code(''), 'INVALID_DIGITS'); t.equal(code('12a'), 'INVALID_DIGITS'); t.equal(code('0241'), 'LEADING_ZERO');
    t.equal(code('2'), 'BAD_SENTINEL'); t.equal(code('1'), 'EMPTY_WORD');
    t.equal(code(BigInt('0x01ff').toString(5)), 'INVALID_UTF8');
  });
  t.test('the digit-color mapping is central, one-to-one, and the terminator is never a digit', () => {
    const codes = [0, 1, 2, 3, 4].map((d) => DigitColorMap.codeOfDigit(d));
    t.equal(codes.join(), '1,2,3,4,5'); t.equal(new Set(codes.map((c) => Palette.hexOf(c))).size, 5);
    codes.forEach((c, d) => t.equal(DigitColorMap.digitOfCode(c), d));
    t.equal(DigitColorMap.digitOfCode(Palette.TERMINATOR), null); t.equal(DigitColorMap.digitOfCode(Palette.NULL), null); t.equal(DigitColorMap.digitOfCode(Palette.EMPTY), null);
    const digits = TextCodec.wordToDigits('سلام');
    t.equal(DigitColorMap.codesToDigits(DigitColorMap.digitsToCodes(digits)), digits);
    t.throws(() => DigitColorMap.codeOfDigit(5)); t.throws(() => DigitColorMap.codesToDigits([6]));
  });
  t.test('sequence: exactly one turquoise-blue per word, never inside the digits; empty input gives nothing', () => {
    const b = TextSequenceBuilder.build('Hello سلام 世界 🌍');
    t.equal(b.units.length, 4);
    for (const u of b.units) {
      t.equal(u.symbols.filter((s) => s === Palette.TERMINATOR).length, 1); t.equal(u.symbols[u.symbols.length - 1], Palette.TERMINATOR);
      t.equal(DigitColorMap.codesToDigits(u.symbols.slice(0, -1)), u.digits);
    }
    t.equal(TextSequenceBuilder.build('   ').units.length, 0); t.equal(TextSequenceBuilder.build('').symbolCount, 0);
  });

  t.suite('Text: pages');
  t.test('short text fills one page and decodes back exactly (words joined by single spaces)', async () => {
    const { res } = await encodeToPages('Hello سلام 世界 🌍');
    t.equal(res.pages.length, 1);
    const d = TextPageReader.decode(readerInput(res.pages));
    t.assert(d.ok, JSON.stringify(d.errors)); t.equal(d.text, 'Hello سلام 世界 🌍');
  });
  t.test('words that fill pocket rows in later sweeps are still read back in WRITING order', async () => {
    const words = ['a', 'bb', 'ccc', 'dddd', 'e', 'ff', 'ggg', 'hhhh', 'i', 'jj', 'kkk', 'llll'];
    const { res } = await encodeToPages(words.join(' '), 2, 8);
    const d = TextPageReader.decode(readerInput(res.pages));
    t.assert(d.ok, JSON.stringify(d.errors)); t.equal(d.text, words.join(' '));
  });
  t.test('thousands of words span many pages; page transitions never change the logical sequence', async () => {
    const rng = mulberry32(9), chars = ['a', 'Z', '9', 'ب', '世', '🌍', '!'];
    const words = Array.from({ length: 3000 }, () => Array.from({ length: 1 + Math.floor(rng() * 8) }, () => chars[Math.floor(rng() * chars.length)]).join(''));
    const text = words.join('  ');
    const { res } = await encodeToPages(text, 4, 4);
    t.assert(res.pages.length > 3, `pages ${res.pages.length}`);
    const d = TextPageReader.decode(readerInput(res.pages));
    t.assert(d.ok, JSON.stringify(d.errors.slice(0, 2))); t.equal(d.text, text.split(/\s+/u).join(' '));
    t.assert(res.pages.slice(0, -1).every((p) => p.status === 'closed' || p.status === 'open'), 'valid states');
  });
  t.test('a word ending exactly at the page boundary closes the page and the next word starts on a new page', async () => {
    const { res } = await encodeToPages('one two three', 1, 3);     // width 1: each word fills its whole column
    t.equal(res.pages.length, 3); t.assert(res.pages.slice(0, 3).every((p) => p.status === 'closed'), 'each page consumed');
    t.equal(TextPageReader.decode(readerInput(res.pages)).text, 'one two three');
  });
  t.test('a word that does not fit in the remaining capacity moves whole to a new page; the old page stays valid and open', async () => {
    const make = (w, h, name) => new Page({ id: Math.random(), name, engine: WritingEngine.fromEmpty(w, h, { maxHeight: 8 }) });
    const b = TextSequenceBuilder.build('a b c d e f');                 // each word = 5 cells
    const res = await new TextPageWriter({}, { createPage: make, yieldControl: noYield }).write(b.units, { width: 2, height: 6 });
    t.assert(res.pages.length >= 2 && res.pages[0].status === 'open' && res.pages[0].grid.hasEmptyCell(), 'old page left open with unused cells');
    const d = TextPageReader.decode(readerInput(res.pages));
    t.assert(d.ok, JSON.stringify(d.errors)); t.equal(d.text, 'a b c d e f');
    const tooLong = TextSequenceBuilder.build('a'.repeat(20));
    let code = null; try { await new TextPageWriter({}, { createPage: make, yieldControl: noYield }).write(tooLong.units, { width: 2, height: 2 }); } catch (e) { code = e instanceof TextWriteError && e.code; }
    t.equal(code, 'WORD_TOO_LONG_FOR_PAGE');
  });
  t.test('the longest allowed words fit: 1024 ASCII letters and 1024 emoji, with exact round trip', async () => {
    const w1 = 'x'.repeat(1024), w2 = '🌍'.repeat(1024);
    const { res } = await encodeToPages(`${w1} ${w2} end`, 10, 20);
    const d = TextPageReader.decode(readerInput(res.pages));
    t.assert(d.ok, JSON.stringify(d.errors)); t.equal(d.text, `${w1} ${w2} end`);
  });
  t.test('empty input creates no pages; stopping leaves an honest partial result', async () => {
    const { res } = await encodeToPages('   ');
    t.equal(res.pages.length, 0);
    const c = new PageCollection(), b = TextSequenceBuilder.build('a b c d e f g h');
    let n = 0;
    const r = await new TextPageWriter(c, { yieldControl: noYield }).write(b.units, { width: 5, height: 5, shouldStop: () => n++ >= 3 });
    t.assert(r.stopped, 'stopped flag');
  });
  t.test('full pipeline: text -> pages -> lossless PNG bytes -> grids -> text', async () => {
    const { c, res } = await encodeToPages('Hello سلام 世界 🌍 Mixed-Case 42 ∑');
    const grids = [];
    for (const p of res.pages) { const png = await PngCodec.decode(await c.exportPng(p.id)); t.assert(png.ok && png.grid.equals(p.grid), 'pixel-exact PNG round trip'); grids.push({ name: 'x', grid: png.grid }); }
    t.equal(TextPageReader.decode(grids).text, 'Hello سلام 世界 🌍 Mixed-Case 42 ∑');
  });
  t.test('decoding is strict: invalid units, unfinished words and invalid pages are reported with page and unit', () => {
    const page = (...codes) => { const e = WritingEngine.fromEmpty(3, 8); for (const x of codes) e.write(x); return { name: 'f', grid: e.grid }; };
    const good = TextCodec.wordToDigits('ok'), codes = DigitColorMap.digitsToCodes(good);
    const bad = TextPageReader.decode([page(...codes, 6, 1, 2, 6)]);                  // 2nd unit starts with digit 0
    t.assert(!bad.ok && bad.text === null && bad.errors[0].page === 1 && bad.errors[0].unit === 2, JSON.stringify(bad.errors));
    t.assert(!TextPageReader.decode([page(6)]).ok, 'empty unit');
    t.assert(/unfinished/.test(TextPageReader.decode([page(...codes)]).errors[0].reason), 'unfinished word');
    const g0 = page(...codes, 6).grid, cells = g0.toCells(); cells[1 * 3] = 0; cells[0] = 0;
    const broken = TextPageReader.decode([{ name: 'h', grid: GridModel.fromCells(3, g0.height, cells) }]);
    t.assert(!broken.ok && broken.errors[0].page === 1, 'structurally invalid page');
  });
  t.test('files are ordered by the number in their names; without numbers the given order is kept', () => {
    const names = (a) => a.ordered.map((f) => f.name).join();
    t.equal(names(PageFileOrder.sort([{ name: 'page_0010.png' }, { name: 'page_0002.png' }, { name: 'page_0001.png' }])), 'page_0001.png,page_0002.png,page_0010.png');
    const r = PageFileOrder.sort([{ name: 'b.png' }, { name: 'a.png' }]); t.equal(names(r), 'b.png,a.png'); t.equal(r.byNumber, false);
  });

  t.suite('Text: PageSaver');
  const fakePages = (failIds = []) => ({ exportPng: async (id) => { if (failIds.includes(id)) throw new Error('export failed'); return new Uint8Array([id]); } });
  const entries = (nums) => nums.map((n) => ({ number: n, page: { id: n } }));
  t.test('pages are saved one at a time in ascending NUMERIC order with predictable names', async () => {
    const log = [];
    const s = new PageSaver(fakePages(), { download: async (name) => { log.push(name); }, wait: noYield });
    const r = await s.saveAll(entries([10, 2, 1]));
    t.equal(log.join(), 'page_0001.png,page_0002.png,page_0010.png'); t.equal(r.started.join(), '1,2,10'); t.equal(r.failed.length, 0);
  });
  t.test('a failing page is reported by number, never silently skipped, and the rest are still attempted', async () => {
    const log = [];
    const s = new PageSaver(fakePages([2]), { download: async (n) => { log.push(n); }, wait: noYield });
    const r = await s.saveAll(entries([1, 2, 3]));
    t.equal(r.failed.length, 1); t.equal(r.failed[0].number, 2); t.equal(r.started.join(), '1,3'); t.equal(log.join(), 'page_0001.png,page_0003.png');
    const d = new PageSaver(fakePages(), { download: async (n) => { if (n === 'page_0001.png') throw new Error('blocked'); }, wait: noYield });
    t.equal((await d.saveAll(entries([1, 2]))).failed[0].reason, 'blocked');
  });
  t.test('an interrupted save lists the pages that were not attempted; a second run cannot overlap', async () => {
    let s;
    s = new PageSaver(fakePages(), { download: async (n) => { if (n === 'page_0002.png') s.stop(); }, wait: noYield });
    const r = await s.saveAll(entries([1, 2, 3, 4]));
    t.assert(r.interrupted && r.notAttempted.join() === '3,4' && r.started.join() === '1,2', JSON.stringify(r));
    const slow = new PageSaver(fakePages(), { download: async () => {}, wait: () => new Promise((res) => setTimeout(res, 5)) });
    const first = slow.saveAll(entries([1, 2]));
    let failed = false; try { await slow.saveAll(entries([1])); } catch { failed = true; }
    t.assert(failed && slow.running, 'overlap refused'); await first; t.assert(!slow.running, 'finished');
    t.equal(PageSaver.fileName(7), 'page_0007.png');
  });
}
