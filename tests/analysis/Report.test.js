import GridModel from '../../js/GridModel.js';
import PageCollection from '../../js/PageCollection.js';
import AnalysisRunner from '../../js/analysis/AnalysisRunner.js';
import HierarchicalClusterer from '../../js/analysis/HierarchicalClusterer.js';
import VolumeBuilder from '../../js/analysis/VolumeBuilder.js';
import ReportWriter from '../../js/analysis/ReportWriter.js';
import SeededRandom from '../../js/analysis/SeededRandom.js';
import { unitsOf } from './helpers.js';

const close = (t, a, b) => t.assert(Math.abs(a - b) < 1e-9, `expected ${b} got ${a}`);
const opts = { simulations: 150, topK: 5, split: { mode: 'page' }, analyses: ['frequency', 'repeats', 'clustering', 'information', 'markov', 'baseline', 'spatial'] };

function plantedPages() {
  const c = new PageCollection();
  for (let p = 0; p < 3; p++) { const page = c.create(25, 6); for (let u = 0; u < 20; u++) { for (const s of [1, 2, 3, 4]) page.write(s); page.write(6); } }
  return c.pages;
}
function randomPages() {
  const c = new PageCollection(), rng = new SeededRandom(11);
  for (let p = 0; p < 3; p++) { const page = c.create(20, 6); for (let i = 0; i < 400 && page.status === 'open'; i++) page.write(1 + rng.int(6)); }
  return c.pages;
}

export default function register(t) {
  t.suite('Analysis: HierarchicalClusterer');
  t.test('groups near-identical units and exposes the features behind the grouping', () => {
    const r = HierarchicalClusterer.cluster(unitsOf([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 5], [5, 5, 5, 5]]), { cutDistance: 0.3 });
    t.equal(r.clusters.length, 1); const c = r.clusters[0];
    t.equal(c.size, 2); t.equal(c.instances, 3); t.equal(c.sharedPrefix.join(), '1,2,3'); t.equal(c.differingPositions.join(), '3');
    close(t, c.meanDistance, 0.25); t.equal(r.merges.length, 1); close(t, r.merges[0].height, 0.25);
  });
  t.test('average linkage heights follow the Lance-Williams update; the cut stops merging', () => {
    const u = unitsOf([[1, 1, 1, 1], [1, 1, 1, 2], [1, 1, 2, 2]]);
    t.equal(HierarchicalClusterer.cluster(u, { cutDistance: 0.3 }).merges.length, 1);
    const full = HierarchicalClusterer.cluster(u, { cutDistance: 0.4 });
    t.equal(full.merges.length, 2); close(t, full.merges[1].height, 0.375); t.equal(full.clusters[0].size, 3);
  });
  t.test('empty units are ignored, truncation is flagged, no clusters when nothing is similar', () => {
    t.equal(HierarchicalClusterer.cluster(unitsOf([[], []])).clusters.length, 0);
    t.assert(HierarchicalClusterer.cluster(unitsOf([[1], [2], [3]]), { maxDistinct: 2 }).truncated, 'truncated');
    t.equal(HierarchicalClusterer.cluster(unitsOf([[1, 1, 1, 1], [2, 2, 2, 2]]), { cutDistance: 0.3 }).clusters.length, 0);
  });

  t.suite('Analysis: VolumeBuilder');
  t.test('layers share the origin, keep order, and NULL / unwritten cells create no geometry', () => {
    const v = VolumeBuilder.build([{ id: 7, grid: GridModel.fromCells(2, 2, [1, 6, 7, 0]) }, { id: 8, grid: GridModel.fromCells(3, 1, [2, 0, 6]) }]);
    t.equal(v.layers.map((l) => l.pageId).join(), '7,8'); t.equal(v.layers[1].z, 1);
    t.equal(v.voxels, 4); t.assert(v.layers.every((l) => l.cells.every((c) => c.code >= 1 && c.code <= 6)), 'only data/terminator cells');
    t.equal(`${v.bounds.rows}x${v.bounds.cols}x${v.bounds.layers}`, '2x3x2');
    t.equal(v.depth[0][0], 2); t.equal(v.depth[0][1], 1); t.equal(v.depth[1][0], 0);
    t.equal(VolumeBuilder.build([]).voxels, 0);
  });

  t.suite('Analysis: ReportWriter');
  t.test('planted structure is reported as evidence, in both languages, with named colors', () => {
    const out = AnalysisRunner.run(plantedPages(), opts);
    const fa = ReportWriter.write(out, { lang: 'fa' }), en = ReportWriter.write(out, { lang: 'en' });
    t.assert(['moderate', 'strong'].includes(fa.verdict.level), `level ${fa.verdict.level}`); t.equal(fa.verdict.level, en.verdict.level);
    for (const id of ['data', 'colors', 'repeats', 'baseline', 'markov', 'dependence']) t.assert(fa.findings.some((f) => f.id === id) && en.findings.some((f) => f.id === id), `finding ${id}`);
    t.assert(fa.findings.every((f) => f.headline && f.detail) && en.findings.every((f) => f.headline && f.detail), 'non-empty text');
    t.assert(/[\u0600-\u06FF]/.test(fa.findings[0].detail) && !/[\u0600-\u06FF]/.test(en.findings[0].detail), 'languages differ');
    t.assert(fa.dir === 'rtl' && en.dir === 'ltr', 'direction');
    t.assert(/سبزآبی/.test(fa.findings.find((f) => f.id === 'repeats').detail) && /Turquoise green/.test(en.findings.find((f) => f.id === 'repeats').detail), 'colors are named');
    t.assert(/not a probability/.test(en.verdict.text) && /احتمال/.test(fa.verdict.text), 'verdict is disclaimed');
    t.assert(ReportWriter.toText(en).includes(en.findings[1].headline), 'plain-text export');
  });
  t.test('negative control: random data is not reported as structured', () => {
    const out = AnalysisRunner.run(randomPages(), opts), r = ReportWriter.write(out, { lang: 'en' });
    t.assert(['none', 'weak'].includes(r.verdict.level), `random data got level ${r.verdict.level}: ${r.verdict.indicators}`);
  });
  t.test('little data is flagged; missing data does not crash the report', () => {
    const c = new PageCollection(), p = c.create(5, 5); p.write(1); p.write(6);
    const r = ReportWriter.write(AnalysisRunner.run(c.pages, { ...opts, simulations: 20 }), { lang: 'en' });
    t.assert(r.findings[0].caveats.length === 1, 'small-data caveat');
    const none = ReportWriter.write({ usedPageIds: [], sections: [] }, { lang: 'fa' });
    t.equal(none.verdict, null); t.equal(none.findings.length, 1);
  });
}
