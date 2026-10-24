import PageCorpus from '../../js/analysis/PageCorpus.js';
import InformationMeasures from '../../js/analysis/InformationMeasures.js';
import MarkovModel from '../../js/analysis/MarkovModel.js';
import HeldOutSplitter from '../../js/analysis/HeldOutSplitter.js';
import MarkovEvaluator from '../../js/analysis/MarkovEvaluator.js';
import SeededRandom from '../../js/analysis/SeededRandom.js';
import { unitsOf, pageFromUnits } from './helpers.js';

const IM = InformationMeasures;
const close = (t, a, b, msg = '') => t.assert(Math.abs(a - b) < 1e-9, `${msg} expected ${b} got ${a}`);
const seqs = (u) => IM.sequencesOf(unitsOf(u));
const multiPage = (pages) => PageCorpus.units(PageCorpus.fromPages(pages.map((u, i) => pageFromUnits(u, i + 1))));

export default function register(t) {
  t.suite('Analysis: entropy and mutual information');
  t.test('entropy edge cases and estimators', () => {
    close(t, IM.entropy([1, 1, 1, 1]), 2);
    close(t, IM.entropy([5]), 0);
    t.equal(IM.entropy([]), null); t.equal(IM.entropy(new Map()), null);
    close(t, IM.entropy([1, 1, 1, 1], { correction: 'miller-madow' }), 2 + 3 / (8 * Math.LN2));
    close(t, IM.symbolEntropy(seqs([[1, 2], [1, 2]])), 1);
    close(t, IM.conditionalEntropy([[1, 2], [1, 2], [1, 3], [1, 3]], 1), 1);
    t.equal(IM.conditionalEntropy([[1]], 1), null);
  });
  t.test('mutual information: deterministic, independent, distance 2, no pairs', () => {
    close(t, IM.mutualInformation(seqs([[1, 2], [3, 4], [1, 2], [3, 4]]), 1).mi, 1);
    close(t, IM.mutualInformation(seqs([[1, 1], [1, 2], [2, 1], [2, 2]]), 1).mi, 0);
    close(t, IM.mutualInformation([[1, 2, 1, 2]], 2).mi, 1);
    const none = IM.mutualInformation(seqs([[1], [2]]), 1);
    t.equal(none.mi, null); t.equal(none.pairs, 0); t.assert(none.reason.length > 0, 'reason');
    t.equal(IM.mutualInformation([[1, 1, 1]], 1).normalized, null);
    t.throws(() => IM.mutualInformation([[1, 2]], 0));
  });
  t.test('pairs never cross unit boundaries', () => {
    t.equal(IM.mutualInformation(seqs([[1, 2], [3, 4]]), 1).pairs, 2);
    t.equal(IM.profile(seqs([[1, 2, 3]]), 3).map((p) => p.pairs).join(), '2,1,0');
  });
  t.test('MI permutation test: structured data significant, reproducible, random data not', () => {
    const structured = seqs(Array.from({ length: 20 }, (_, i) => (i % 2 ? [3, 4, 3, 4] : [1, 2, 1, 2])));
    const a = IM.testMutualInformation(structured, 1, { simulations: 300, seed: 5 }), b = IM.testMutualInformation(structured, 1, { simulations: 300, seed: 5 });
    t.equal(JSON.stringify(a), JSON.stringify(b)); t.assert(a.results[0].pValue < 0.01 && a.results[0].effect > 0.5, `p=${a.results[0].pValue}`);
    const rng = new SeededRandom(7), random = Array.from({ length: 40 }, () => Array.from({ length: 6 }, () => 1 + rng.int(3)));
    t.assert(IM.testMutualInformation(random, 1, { simulations: 300, seed: 5 }).results[0].pValue > 0.01, 'random data should not be flagged');
  });

  t.suite('Analysis: Markov models');
  t.test('transition counts, probabilities and END handling (first order)', () => {
    const { sequences } = MarkovModel.tokensFromUnits(unitsOf([[1, 2], [1, 2], [1, 2]]));
    t.equal(JSON.stringify(sequences[0]), '[1,2,6]');
    const none = new MarkovModel({ order: 1, smoothing: 'none' }).train(sequences);
    t.equal(none.probability([0], 1), 1); t.equal(none.probability([1], 2), 1); t.equal(none.probability([2], 6), 1);
    t.equal(none.probability([5], 1), null); t.equal(none.probability([1], 3), 0);
    const rows = none.transitions();
    t.equal(rows.length, 3); t.equal(rows.find((r) => r.context[0] === 1).count, 3);
    const smooth = new MarkovModel({ order: 1 }).train(sequences);
    close(t, smooth.probability([1], 2), 4 / 9); close(t, smooth.probability([5], 1), 1 / 6);
    close(t, smooth.distribution([1]).reduce((s, d) => s + d.probability, 0), 1);
    t.equal(smooth.predict([1]).token, 2);
  });
  t.test('incomplete units get no END; gapped units are skipped and counted', () => {
    const u = unitsOf([[1, 2]]);
    const incomplete = { ...u[0], complete: false };
    t.equal(JSON.stringify(MarkovModel.tokensFromUnits([incomplete]).sequences[0]), '[1,2]');
    const gapped = { ...u[0], hasGap: true };
    const r = MarkovModel.tokensFromUnits([gapped, u[0]]);
    t.equal(r.skippedUnitsWithGap, 1); t.equal(r.sequences.length, 1);
  });
  t.test('order 0 and order 2 contexts; invalid settings are rejected', () => {
    const m0 = new MarkovModel({ order: 0, smoothing: 'none' }).train([[1, 1, 2, 6]]);
    t.equal(m0.probability([], 1), 0.5);
    const m2 = new MarkovModel({ order: 2, smoothing: 'none' }).train([[1, 2, 3, 6]]);
    t.equal(m2.probability([0, 0], 1), 1); t.equal(m2.probability([2, 3], 6), 1);
    t.throws(() => new MarkovModel({ order: -1 })); t.throws(() => new MarkovModel({ smoothing: 'x' }));
  });
  t.test('held-out scoring: smoothing gives finite scores, no smoothing reports undefined', () => {
    const train = MarkovModel.tokensFromUnits(unitsOf([[1, 2], [1, 2], [1, 2], [1, 2]])).sequences;
    const test = MarkovModel.tokensFromUnits(unitsOf([[2, 1]])).sequences;
    const smooth = new MarkovModel({ order: 1 }).train(train).evaluate(test);
    t.assert(smooth.crossEntropy > 1 && Number.isFinite(smooth.perplexity), 'finite');
    const raw = new MarkovModel({ order: 1, smoothing: 'none' }).train(train).evaluate(test);
    t.equal(raw.perplexity, null); t.assert(raw.zeroProbabilityTokens > 0 && raw.reason, 'undefined must be explained');
    t.equal(new MarkovModel().evaluate([]).crossEntropy, null);
  });

  t.suite('Analysis: held-out evaluation');
  t.test('page split is reproducible, disjoint, and needs two pages', () => {
    const units = multiPage([[[1]], [[2]], [[3]], [[4]]]);
    const a = HeldOutSplitter.split(units, { testFraction: 0.5, seed: 3 }), b = HeldOutSplitter.split(units, { testFraction: 0.5, seed: 3 });
    t.equal(JSON.stringify(a.testPages), JSON.stringify(b.testPages));
    t.equal(a.trainPages.length + a.testPages.length, 4); t.assert(!a.trainPages.some((p) => a.testPages.includes(p)), 'disjoint');
    t.equal(HeldOutSplitter.split(unitsOf([[1], [2]]), { mode: 'page' }).ok, false);
    t.equal(HeldOutSplitter.split(unitsOf([[1], [2]]), { mode: 'unit' }).ok, true);
    t.throws(() => HeldOutSplitter.split(units, { mode: 'x' }));
  });
  t.test('on structured data a context model beats the unigram model on held-out pages', () => {
    const page = Array.from({ length: 6 }, () => [1, 2, 1, 2, 1, 2, 1, 2]);
    const r = MarkovEvaluator.compare(multiPage([page, page, page, page]), { orders: [0, 1], split: { testFraction: 0.5, seed: 1 } });
    t.assert(r.ok, r.reason);
    t.assert(r.results[1].crossEntropy < r.results[0].crossEntropy, 'order 1 should predict better');
    t.equal(r.results[1].improvesOnUnigram, true); t.equal(r.bestOrder, 1); t.assert(r.split.testPages.length === 2, 'split info');
  });
  t.test('a single page cannot be split by page and a small test set is flagged', () => {
    t.equal(MarkovEvaluator.compare(unitsOf([[1, 2], [1, 2]])).ok, false);
    const r = MarkovEvaluator.compare(unitsOf([[1, 2], [1, 2], [1, 2]]), { split: { mode: 'unit' } });
    t.assert(r.ok && r.warnings.some((w) => /fewer than 30/.test(w)), 'small held-out warning');
  });
}
