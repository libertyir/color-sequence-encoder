import GridModel from '../../js/GridModel.js';
import SpatialAnalyzer from '../../js/analysis/SpatialAnalyzer.js';
import { unitsOf } from './helpers.js';

const grid = (w, rows) => GridModel.fromCells(w, rows.length, rows.flat());
const pg = (g, id = 1) => [{ id, grid: g }];

export default function register(t) {
  t.suite('Analysis: SpatialAnalyzer');
  t.test('horizontal patterns have exact coordinates and keep NULL / white / data distinct', () => {
    const g = grid(4, [[1, 2, 1, 2], [1, 2, 0, 0]]);
    const r = SpatialAnalyzer.linePatterns(pg(g), { axis: 'row', n: 2, minCount: 1 });
    const p = r.results.find((e) => e.key === '1,2');
    t.equal(p.occurrences, 3); t.equal(p.nonOverlapping, 3);
    t.equal(JSON.stringify(p.positions), '[{"pageId":1,"row":0,"col":0},{"pageId":1,"row":0,"col":2},{"pageId":1,"row":1,"col":0}]');
    t.assert(!r.results.some((e) => e.key === '0,0'), 'windows without data are ignored');
    const k = SpatialAnalyzer.linePatterns(pg(grid(4, [[7, 1, 0, 1]])), { n: 2, minCount: 1 }).results.map((e) => e.key).sort().join('|');
    t.equal(k, '0,1|1,0|7,1');
  });
  t.test('vertical patterns and overlapping occurrences', () => {
    const g = grid(2, [[1, 3], [1, 3], [1, 3], [2, 3]]);
    const v = SpatialAnalyzer.linePatterns(pg(g), { axis: 'col', n: 2, minCount: 1 }).results.find((e) => e.key === '1,1');
    t.equal(v.occurrences, 2); t.equal(v.nonOverlapping, 1); t.equal(v.positions[1].row, 1);
  });
  t.test('2-D patches: repeated arrangement and overlap handling', () => {
    const r = SpatialAnalyzer.patchPatterns(pg(grid(4, [[1, 2, 1, 2], [3, 4, 3, 4]])), { minCount: 2 });
    const p = r.results.find((e) => e.key === '1,2/3,4');
    t.equal(p.occurrences, 2); t.equal(p.nonOverlapping, 2); t.equal(p.positions[1].col, 2);
    const o = SpatialAnalyzer.patchPatterns(pg(grid(3, [[1, 1, 1], [1, 1, 1]])), { minCount: 2 }).results.find((e) => e.key === '1,1/1,1');
    t.equal(o.occurrences, 2); t.equal(o.nonOverlapping, 1);
  });
  t.test('regions of written, NULL and unwritten cells', () => {
    const r = SpatialAnalyzer.regions(grid(3, [[1, 6, 7], [1, 6, 7], [0, 0, 7]]), 1).results;
    const by = Object.fromEntries(r.map((x) => [x.kind, x]));
    t.equal(by.written.size, 4); t.equal(by.null.size, 3); t.equal(by.unwritten.size, 2);
    t.equal(JSON.stringify(by.null.bbox), '{"top":0,"left":2,"bottom":2,"right":2}');
  });
  t.test('unit geometry, correlation edge cases and reproducible permutation test', () => {
    const geo = SpatialAnalyzer.unitGeometry(unitsOf([[1, 2, 3], [1], []]));
    t.equal(geo.map((g) => `${g.column}:${g.startRow}:${g.length}:${g.terminatorRow}`).join(' '), '0:0:3:3 1:0:1:1 2:0:0:0');
    t.equal(SpatialAnalyzer.correlation([1, 2, 3, 4], [2, 4, 6, 8]), 1);
    t.equal(SpatialAnalyzer.correlation([1, 2], [1, 2]), null); t.equal(SpatialAnalyzer.correlation([1, 1, 1], [1, 2, 3]), null);
    const xs = [1, 2, 3, 4, 5, 6, 7, 8], ys = [2, 4, 6, 8, 10, 12, 14, 16];
    const a = SpatialAnalyzer.correlationTest(xs, ys, { simulations: 2000, seed: 3 });
    t.assert(a.pValue < 0.01, `p=${a.pValue}`); t.equal(JSON.stringify(a), JSON.stringify(SpatialAnalyzer.correlationTest(xs, ys, { simulations: 2000, seed: 3 })));
    t.assert(SpatialAnalyzer.correlationTest([1, 1], [1, 2]).warning, 'undefined correlation is explained');
  });
  t.test('horizontal runs feed a randomized-baseline test; the grid is never modified', () => {
    const rows = Array.from({ length: 12 }, () => [1, 2, 3, 0]), g = grid(4, rows), before = g.clone();
    t.equal(SpatialAnalyzer.horizontalRuns(g).length, 12);
    const r = SpatialAnalyzer.testHorizontalRuns(pg(g), 2, { simulations: 300, seed: 2, topK: 2 });
    t.assert(r.results[0].pValue < 0.01, `p=${r.results[0].pValue}`);
    t.assert(g.equals(before), 'grid changed');
    t.equal(SpatialAnalyzer.linePatterns([], { n: 2 }).total, 0);
  });
}
