import PageCollection from '../../js/PageCollection.js';
import GridModel from '../../js/GridModel.js';
import AnalysisRunner, { ANALYSES } from '../../js/analysis/AnalysisRunner.js';
import AnalysisTable from '../../js/analysis/AnalysisTable.js';
import HypothesisTracker from '../../js/analysis/HypothesisTracker.js';

function collection() {
  const c = new PageCollection();
  for (let p = 0; p < 2; p++) { const page = c.create(10, 8); for (let u = 0; u < 8; u++) { for (const s of [1, 2, 3, 4]) page.write(s); page.write(6); } }
  return c;
}
const fast = { simulations: 40, topK: 3 };

export default function register(t) {
  t.suite('Analysis: AnalysisRunner / AnalysisTable');
  t.test('every analysis produces well-formed, traceable sections', () => {
    const tracker = new HypothesisTracker(); tracker.add({ description: 'starts with 1', kind: 'unit-prefix', params: { symbols: [1] } });
    const c = collection(), before = c.pages.map((p) => p.grid.clone());
    const out = AnalysisRunner.run(c.pages, { ...fast, hypotheses: tracker, split: { mode: 'page' } });
    for (const a of ANALYSES) t.assert(out.sections.some((s) => s.analysis === a), `missing ${a}`);
    for (const s of out.sections) {
      t.assert(['observation', 'statistic', 'interpretation'].includes(s.kind), 'kind');
      for (const r of s.rows) for (const col of s.columns) t.assert(col.key in r, `${s.title}: row lacks ${col.key}`);
    }
    const repeats = out.sections.find((s) => s.analysis === 'repeats');
    t.assert(repeats.rows.length > 0 && /^page \d+ · unit \d+ · symbol \d+ · row \d+, col \d+$/.test(repeats.rows[0].details[0]), 'source location format');
    t.equal(out.sections.find((s) => s.analysis === 'frequency').rows[0].count, 16);
    c.pages.forEach((p, i) => t.assert(p.grid.equals(before[i]), 'page modified'));
  });
  t.test('filters: page selection, analysis type, minimum frequency', () => {
    const c = collection();
    const one = AnalysisRunner.run(c.pages, { ...fast, pageIds: [1], analyses: ['frequency'] });
    t.equal(one.usedPageIds.join(), '1'); t.assert(one.sections.every((s) => s.analysis === 'frequency'), 'type filter');
    t.equal(one.sections[0].rows[0].count, 8);
    const strict = AnalysisRunner.run(c.pages, { ...fast, analyses: ['ngram'], minCount: 1000 });
    t.assert(strict.sections.every((s) => s.rows.length === 0), 'nothing reaches the minimum');
  });
  t.test('empty inputs, invalid pages and missing hypotheses give explicit messages, not fabricated findings', () => {
    t.assert(AnalysisRunner.run([], {}).warnings.length === 1, 'no pages');
    const c = new PageCollection(); c.create(4, 4);
    const out = AnalysisRunner.run(c.pages, { ...fast });
    t.assert(out.warnings.some((w) => /no completed units/.test(w)), 'empty-data warning');
    t.assert(out.warnings.some((w) => /No hypotheses/.test(w)), 'hypothesis hint');
    for (const s of out.sections.filter((x) => ['ngram', 'repeats', 'approx'].includes(x.analysis))) t.equal(s.rows.length, 0);
    const bad = { id: 9, name: 'bad', status: 'invalid', grid: GridModel.fromCells(1, 2, [0, 2]) };
    t.equal(AnalysisRunner.run([bad], {}).sections.length, 0);
  });
  t.test('baseline table compares all three randomized baselines side by side', () => {
    const out = AnalysisRunner.run(collection().pages, { ...fast, analyses: ['baseline'] }), s = out.sections[0];
    t.equal(s.columns.filter((c) => c.key.startsWith('a') && c.label.startsWith('Adj.')).length, 3);
    t.assert(s.notes.some((n) => /shuffle-within-units/.test(n)) && s.notes.some((n) => /iid-frequency/.test(n)), 'null hypotheses are stated');
    t.assert(s.rows.length > 0 && typeof s.rows[0].sig === 'string', 'significance column is derived from the runs');
  });
  t.test('table helpers: formatting and stable numeric/text sorting with empty values last', () => {
    t.equal(AnalysisTable.format(null), '–'); t.equal(AnalysisTable.format(NaN), '–'); t.equal(AnalysisTable.format(3), '3'); t.equal(AnalysisTable.format(0.123456), '0.1235');
    const rows = [{ k: 10 }, { k: 2 }, { k: null }, { k: 33 }];
    t.equal(AnalysisTable.sortRows(rows, 'k', 'asc', true).map((r) => r.k).join(), '2,10,33,');
    t.equal(AnalysisTable.sortRows(rows, 'k', 'desc', true).map((r) => r.k).join(), '33,10,2,');
    t.equal(AnalysisTable.sortRows([{ k: 'b' }, { k: 'a' }], 'k').map((r) => r.k).join(), 'a,b');
  });
}
