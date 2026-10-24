import PageCorpus from '../../js/analysis/PageCorpus.js';
import HypothesisTracker from '../../js/analysis/HypothesisTracker.js';
import { pageFromUnits } from './helpers.js';

const rep = (u, n) => Array.from({ length: n }, () => u);
const units = (pages) => PageCorpus.units(PageCorpus.fromPages(pages.map((u, i) => pageFromUnits(u, i + 1))));
const opts = { simulations: 300, seed: 1, split: { trainPages: [1, 2], testPages: [3, 4] } };
const permutations = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];

export default function register(t) {
  t.suite('Analysis: HypothesisTracker');
  t.test('new hypotheses are untested and carry no confidence score', () => {
    const h = new HypothesisTracker().add({ description: 'units start with 1', kind: 'unit-prefix', params: { symbols: [1] } });
    t.equal(h.status, 'untested'); t.assert(!('confidence' in h), 'no heuristic confidence');
    t.throws(() => new HypothesisTracker().add({ description: 'x', kind: 'nope' })); t.throws(() => new HypothesisTracker().add({ kind: 'unit-prefix', params: { symbols: [1] } }));
  });
  t.test('a pattern that holds on training and held-out pages is supported, with traceable sources', () => {
    const tr = new HypothesisTracker(); tr.add({ description: 'units start with 1', kind: 'unit-prefix', params: { symbols: [1] } });
    const r = tr.evaluate(units([rep([1, 2, 3], 12), rep([1, 2, 3], 12), rep([1, 2, 3], 12), rep([1, 2, 3], 12)]), opts)[0];
    t.equal(r.status, 'supported'); t.assert(r.trainResult.rate === 1 && r.heldOutResult.rate === 1, 'rates');
    t.assert(r.sourceRefs.length === 10 && r.sourceRefs[0].pageId <= 2, 'refs point at training units');
    t.assert(r.supporting.length === 2 && r.conditions.baseline && r.conditions.simulations === 300, 'evidence and conditions recorded');
    t.equal(tr.get(r.id).status, 'supported');
  });
  t.test('an effect that fails on held-out pages is contradicted', () => {
    const tr = new HypothesisTracker(); tr.add({ description: 'units start with 1', kind: 'unit-prefix', params: { symbols: [1] } });
    const r = tr.evaluate(units([rep([1, 2, 3], 12), rep([1, 2, 3], 12), rep([2, 3, 1], 12), rep([2, 3, 1], 12)]), opts)[0];
    t.equal(r.status, 'contradicted'); t.assert(r.contradicting.length === 1, 'contradicting observation');
  });
  t.test('composition-explained patterns and tiny data are inconclusive, not supported', () => {
    const page = [...permutations, ...permutations];
    const tr = new HypothesisTracker(); tr.add({ description: 'units start with 1', kind: 'unit-prefix', params: { symbols: [1] } });
    const r = tr.evaluate(units([page, page, page, page]), opts)[0];
    t.equal(r.status, 'inconclusive'); t.assert(/not significant/.test(r.reason), r.reason);
    const small = new HypothesisTracker(); small.add({ description: 's', kind: 'unit-prefix', params: { symbols: [1] } });
    const s = small.evaluate(units([[[1, 2]], [[1, 2]], [[1, 2]], [[1, 2]]]), opts)[0];
    t.equal(s.status, 'inconclusive'); t.assert(/too small/.test(s.reason), s.reason);
    const single = new HypothesisTracker(); single.add({ description: 'p', kind: 'unit-prefix', params: { symbols: [1] } });
    t.assert(/held-out split/.test(single.evaluate(units([rep([1, 2, 3], 12)]), { simulations: 50 })[0].reason), 'single page cannot be split by page');
  });
  t.test('a transition hypothesis is supported; multiple hypotheses get Holm-adjusted p-values', () => {
    const tr = new HypothesisTracker();
    tr.add({ description: '1 is followed by 2', kind: 'transition', params: { symbols: [1, 2] } });
    tr.add({ description: 'units start with 2', kind: 'unit-prefix', params: { symbols: [2] } });
    const res = tr.evaluate(units([rep([1, 2, 3], 12), rep([1, 2, 3], 12), rep([1, 2, 3], 12), rep([1, 2, 3], 12)]), opts);
    t.equal(res[0].status, 'supported'); t.equal(res[1].status, 'inconclusive');
    t.assert(res[0].trainResult.adjustedPValue >= res[0].trainResult.pValue, 'adjusted >= raw');
    t.equal(tr.list().length, 2);
  });
  t.test('manual annotation validates statuses; evaluation never mutates the units', () => {
    const tr = new HypothesisTracker(), h = tr.add({ description: 'manual', kind: 'transition', params: { symbols: [1, 2] } });
    t.equal(tr.annotate(h.id, { status: 'inconclusive', supporting: ['seen once'] }).supporting.length, 1);
    t.throws(() => tr.annotate(h.id, { status: 'proven' }));
    const u = units([rep([1, 2, 3], 12), rep([1, 2, 3], 12), rep([1, 2, 3], 12), rep([1, 2, 3], 12)]), snapshot = JSON.stringify(u);
    tr.evaluate(u, opts); t.equal(JSON.stringify(u), snapshot);
  });
}
