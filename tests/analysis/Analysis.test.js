import GridModel from '../../js/GridModel.js';
import PageCorpus from '../../js/analysis/PageCorpus.js';
import FrequencyAnalyzer from '../../js/analysis/FrequencyAnalyzer.js';
import NGramAnalyzer from '../../js/analysis/NGramAnalyzer.js';
import SuffixArray from '../../js/analysis/SuffixArray.js';
import RepeatedSubstringFinder from '../../js/analysis/RepeatedSubstringFinder.js';
import Levenshtein from '../../js/analysis/Levenshtein.js';
import ApproxMatcher from '../../js/analysis/ApproxMatcher.js';
import PermutationTester, { BASELINES } from '../../js/analysis/PermutationTester.js';
import SeededRandom from '../../js/analysis/SeededRandom.js';
import { corpusOf, unitsOf, pageFromUnits } from './helpers.js';

const seqs = (units) => units.map((u) => u.symbols.slice());

export default function register(t) {
  t.suite('Analysis: PageCorpus');
  t.test('extracts units with coordinates; terminators/NULL stay structural', () => {
    const c = corpusOf([[1, 2], [3], []]);
    const u = c.pages[0].units;
    t.equal(u.length, 3); t.equal(u[0].key, '1,2'); t.equal(u[2].symbols.length, 0);
    t.equal(u[0].cells[1][0], 1); t.equal(u[0].terminator.row, 2); t.equal(u[1].column, 1);
    t.equal(c.pages[0].structure.terminators, 3); t.equal(c.pages[0].structure.dataSymbols, 3);
  });
  t.test('a NULL gap inside a unit is flagged and never bridged', () => {
    const g = GridModel.fromCells(1, 5, [1, 7, 2, 6, 0]);
    const [u] = PageCorpus.fromGrid(g).units;
    t.assert(u.hasGap && u.gaps[1], 'gap flagged');
    t.equal(NGramAnalyzer.symbolNgrams([u], { n: 2, minCount: 1 }).total, 0);
    t.equal(PageCorpus.segments([u]).length, 2);
  });
  t.test('analysis never modifies the page', () => {
    const page = pageFromUnits([[1, 2, 3], [1, 2, 3], [2, 1]]), before = page.grid.clone();
    const corpus = PageCorpus.fromPages([page]), units = PageCorpus.units(corpus);
    FrequencyAnalyzer.analyze(corpus); NGramAnalyzer.symbolNgrams(units); RepeatedSubstringFinder.find(units);
    ApproxMatcher.group(units); PermutationTester.testNgrams(seqs(units), NGramAnalyzer.countMap, 2, { simulations: 20 });
    t.assert(page.grid.equals(before), 'grid changed');
    t.assert(Object.isFrozen(corpus.pages[0].units[0]), 'corpus is frozen');
  });

  t.suite('Analysis: FrequencyAnalyzer');
  t.test('symbol, unit and length frequencies; repeated vs unique units', () => {
    const f = FrequencyAnalyzer.analyze(corpusOf([[1, 2], [1, 2], [3], []]));
    t.equal(f.totalSymbols, 5); t.equal(f.symbols[0].count, 2); t.equal(f.symbols[0].relative, 0.4);
    t.equal(f.completeUnits, 4); t.equal(f.uniqueUnits, 3); t.equal(f.repeatedDistinctUnits, 1);
    t.equal(f.repeatedUnitInstances, 2); t.equal(f.unitFrequencies[0].key, '1,2');
    t.equal(f.lengthDistribution.map((l) => `${l.length}:${l.count}`).join(' '), '0:1 1:1 2:2');
    t.equal(f.structure.terminators, 4); t.equal(f.structure.emptyUnits, 1);
  });
  t.test('an empty corpus gives zeros and null proportions, not NaN', () => {
    const f = FrequencyAnalyzer.analyze(corpusOf([]));
    t.equal(f.completeUnits, 0); t.equal(f.symbols[0].relative, null); t.equal(f.repeatedProportion, null);
  });

  t.suite('Analysis: NGramAnalyzer');
  t.test('symbol bigrams are exact, located, and never cross unit boundaries', () => {
    const r = NGramAnalyzer.symbolNgrams(unitsOf([[1, 2], [2, 1], [1, 2]]), { n: 2, minCount: 1 });
    const by = Object.fromEntries(r.results.map((e) => [e.key, e]));
    t.equal(by['1,2'].count, 2); t.equal(by['2,1'].count, 1); t.assert(!by['2,2'] && !by['1,1'], 'no cross-unit grams');
    t.equal(by['1,2'].positions[1].unitIndex, 2); t.equal(by['1,2'].units, 2);
  });
  t.test('minCount, truncation flag and ranking by lift', () => {
    const units = unitsOf([[1, 2], [1, 2], [3, 4]]);
    t.equal(NGramAnalyzer.symbolNgrams(units, { n: 2, minCount: 2 }).total, 1);
    const r = NGramAnalyzer.symbolNgrams(units, { n: 2, minCount: 1, maxResults: 1, rankBy: 'lift' });
    t.assert(r.truncated && r.results.length === 1, 'truncation must be explicit');
  });
  t.test('multi-unit n-grams use consecutive units only', () => {
    const r = NGramAnalyzer.multiUnitNgrams(unitsOf([[1], [2], [1], [2]]), { n: 2, minCount: 1 });
    const by = Object.fromEntries(r.results.map((e) => [e.key, e.count]));
    t.equal(by['1|2'], 2); t.equal(by['2|1'], 1);
  });

  t.suite('Analysis: SuffixArray and repeats');
  t.test('suffix array and LCP match a brute-force reference', () => {
    const rng = new SeededRandom(3);
    for (let k = 0; k < 30; k++) {
      const s = Array.from({ length: 1 + rng.int(25) }, () => 1 + rng.int(3));
      const sa = new SuffixArray(s);
      const ref = s.map((_, i) => i).sort((a, b) => { const x = s.slice(a), y = s.slice(b); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; });
      t.equal(sa.sa.join(), ref.join(), `SA ${s}`);
      for (let i = 1; i < s.length; i++) { let h = 0; while (ref[i] + h < s.length && ref[i - 1] + h < s.length && s[ref[i] + h] === s[ref[i - 1] + h]) h++; t.equal(sa.lcp[i], h, `LCP ${s} @${i}`); }
    }
    t.equal(new SuffixArray([]).sa.length, 0);
  });
  t.test('overlapping occurrences are reported separately from non-overlapping counts', () => {
    const r = RepeatedSubstringFinder.find(unitsOf([[1, 1, 1, 1, 1]]), { minLength: 2 });
    const p = r.results.find((x) => x.length === 4);
    t.equal(p.occurrences, 2); t.equal(p.nonOverlapping, 1);
    const q = r.results.find((x) => x.length === 3);
    t.assert(q === undefined || q.occurrences >= 1, 'no crash');
  });
  t.test('repeats across units are found with exact refs and never cross unit boundaries', () => {
    const r = RepeatedSubstringFinder.find(unitsOf([[1, 2, 3, 4], [9 - 4, 2, 3, 4], [4, 1]]), { minLength: 3 });
    const p = r.results[0];
    t.equal(p.symbols.join(), '2,3,4'); t.equal(p.occurrences, 2); t.equal(p.distinctUnitsContaining, 2);
    t.equal(p.refs[0].unitIndex, 0); t.equal(p.refs[0].symbolIndex, 1); t.equal(p.refs[1].unitIndex, 1);
    const none = RepeatedSubstringFinder.find(unitsOf([[1, 2], [2, 1]]), { minLength: 2 });
    t.equal(none.results.length, 0);
  });

  t.suite('Analysis: Levenshtein and ApproxMatcher');
  t.test('insertion, deletion, substitution, similarity and Hamming', () => {
    t.equal(Levenshtein.distance([1, 2, 3], [1, 3]), 1);
    t.equal(Levenshtein.distance([1, 3], [1, 2, 3]), 1);
    t.equal(Levenshtein.distance([1, 2, 3], [1, 4, 3]), 1);
    t.equal(Levenshtein.distance([], [1, 2]), 2);
    t.equal(Levenshtein.similarity([1, 2, 3, 4], [1, 2, 3, 5]), 0.75);
    t.equal(Levenshtein.similarity([], []), 1);
    t.equal(Levenshtein.hamming([1, 2, 3], [1, 4, 3]), 1); t.equal(Levenshtein.hamming([1], [1, 2]), null);
    t.equal(Levenshtein.alignment([1, 2, 3], [1, 3]).filter((o) => o.op === 'delete')[0].a, 2);
  });
  t.test('similar units are grouped with their actual differences; dissimilar ones are not', () => {
    const r = ApproxMatcher.group(unitsOf([[1, 2, 3, 4], [1, 2, 3, 5], [1, 2, 3, 4], [5, 5, 5, 5]]), { threshold: 0.75 });
    t.equal(r.clusters.length, 1); t.equal(r.clusters[0].size, 2); t.equal(r.clusters[0].instances, 3);
    t.equal(r.clusters[0].edges[0].distance, 1); t.equal(r.clusters[0].edges[0].differences[0].op, 'substitute');
    t.throws(() => ApproxMatcher.group([], { threshold: 0 }));
  });

  t.suite('Analysis: PermutationTester');
  const bigram = (seq) => NGramAnalyzer.countMap(seq, 2);
  t.test('baselines preserve exactly what they claim to preserve', () => {
    const data = [[1, 2, 3], [4, 4], [5]], rng = new SeededRandom(1);
    const within = PermutationTester.randomize(data, BASELINES.SHUFFLE_WITHIN_UNITS, rng);
    t.equal(within.map((u) => u.slice().sort().join()).join('|'), '1,2,3|4,4|5');
    const across = PermutationTester.randomize(data, BASELINES.SHUFFLE_ACROSS_UNITS, rng);
    t.equal(across.map((u) => u.length).join(), '3,2,1'); t.equal(across.flat().sort().join(), '1,2,3,4,4,5');
    t.equal(PermutationTester.randomize(data, BASELINES.IID_FREQUENCY, rng).map((u) => u.length).join(), '3,2,1');
    t.throws(() => PermutationTester.randomize(data, 'nope', rng));
  });
  t.test('results are reproducible for a seed and report all required fields', () => {
    const data = seqs(unitsOf([[1, 2], [1, 2], [1, 2], [2, 1]]));
    const a = PermutationTester.testNgrams(data, NGramAnalyzer.countMap, 2, { simulations: 200, seed: 9 });
    const b = PermutationTester.testNgrams(data, NGramAnalyzer.countMap, 2, { simulations: 200, seed: 9 });
    t.equal(JSON.stringify(a), JSON.stringify(b));
    const r = a.results[0];
    for (const k of ['observed', 'nullMean', 'nullSd', 'effect', 'pValue', 'adjustedPValue']) t.assert(k in r, k);
    t.assert(a.nullHypothesis && a.randomized && a.preserved && a.simulations === 200 && a.seed === 9, 'metadata');
  });
  t.test('Holm and Benjamini-Hochberg corrections match hand-computed values', () => {
    const p = [0.01, 0.04, 0.03, 0.005];
    t.equal(PermutationTester.adjust(p, 'holm').map((x) => x.toFixed(3)).join(), '0.030,0.060,0.060,0.020');
    t.equal(PermutationTester.adjust(p, 'bh').map((x) => x.toFixed(3)).join(), '0.020,0.040,0.040,0.020');
  });
  t.test('a frequent pattern is not significant when composition alone explains it', () => {
    const units = []; for (let i = 0; i < 10; i++) units.push([1, 1], [1, 2], [2, 1], [2, 2]);
    const r = PermutationTester.run(units, bigram, { baseline: BASELINES.SHUFFLE_ACROSS_UNITS, simulations: 1000, seed: 4, keys: ['1,2'] });
    t.equal(r.results[0].observed, 10); t.assert(r.results[0].pValue > 0.2, `p=${r.results[0].pValue}`);
  });
  t.test('significance can differ between baselines', () => {
    const units = []; for (let i = 0; i < 20; i++) units.push([1, 2], [2, 1]);
    const opt = { simulations: 2000, seed: 11, keys: ['1,2'] };
    const across = PermutationTester.run(units, bigram, { ...opt, baseline: BASELINES.SHUFFLE_ACROSS_UNITS }).results[0];
    const within = PermutationTester.run(units, bigram, { ...opt, baseline: BASELINES.SHUFFLE_WITHIN_UNITS }).results[0];
    t.assert(across.pValue < 0.01, `across p=${across.pValue}`); t.assert(within.pValue > 0.2, `within p=${within.pValue}`);
  });
  t.test('strong order structure is significant; empty input is handled', () => {
    const units = Array.from({ length: 30 }, () => [1, 2]);
    const r = PermutationTester.run(units, bigram, { baseline: BASELINES.SHUFFLE_WITHIN_UNITS, simulations: 500, seed: 2, keys: ['1,2'] });
    t.assert(r.results[0].pValue < 0.01 && r.results[0].effect > 10, 'significant');
    t.assert(PermutationTester.run([], bigram).warning, 'warning for empty data');
  });
}
