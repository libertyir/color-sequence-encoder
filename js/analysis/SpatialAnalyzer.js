/**
 * SpatialAnalyzer.js - the SPATIAL track: works on the grid itself (read-only),
 * keeping the five cell states distinct: data 1-5, terminator 6, NULL 7,
 * unwritten 0. Coordinates are 0-based {pageId, row, col}. Spatial regularity
 * is reported as observation only; it is not evidence of linguistic meaning.
 * pages: [{ id, grid }].
 */
import Palette from '../Palette.js';
import NGramAnalyzer from './NGramAnalyzer.js';
import PermutationTester, { BASELINES } from './PermutationTester.js';
import SeededRandom from './SeededRandom.js';

const hasData = (codes) => codes.some((c) => Palette.isDigit(c));

export default class SpatialAnalyzer {
  /** Repeated 1-D windows along rows (left->right) or columns (top->bottom); windows without any data symbol are ignored. */
  static linePatterns(pages, { axis = 'row', n = 3, minCount = 2, maxResults = 100, maxPositions = 20 } = {}) {
    if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be a positive integer');
    const map = new Map(), lastEnd = new Map();
    for (const { id, grid } of pages) {
      const lines = axis === 'row' ? grid.height : grid.width, len = axis === 'row' ? grid.width : grid.height;
      for (let line = 0; line < lines; line++) {
        const codes = Array.from({ length: len }, (_, i) => (axis === 'row' ? grid.get(line, i) : grid.get(i, line)));
        for (let i = 0; i + n <= len; i++) {
          const win = codes.slice(i, i + n);
          if (!hasData(win)) continue;
          const key = win.join(','), pos = axis === 'row' ? { pageId: id, row: line, col: i } : { pageId: id, row: i, col: line };
          const e = map.get(key) ?? { key, codes: win, occurrences: 0, nonOverlapping: 0, positions: [], positionsTruncated: false };
          map.set(key, e); e.occurrences++;
          const lk = `${id}:${line}:${key}`;
          if (i >= (lastEnd.get(lk) ?? -1)) { e.nonOverlapping++; lastEnd.set(lk, i + n); }
          if (e.positions.length < maxPositions) e.positions.push(pos); else e.positionsTruncated = true;
        }
      }
    }
    const rows = [...map.values()].filter((e) => e.occurrences >= minCount).sort((a, b) => b.occurrences - a.occurrences || a.key.localeCompare(b.key));
    return { axis, n, minCount, total: rows.length, truncated: rows.length > maxResults, results: rows.slice(0, maxResults) };
  }

  /** Repeated height x width patches (exact cell-state equality, patches with no data symbol ignored). */
  static patchPatterns(pages, { height = 2, width = 2, minCount = 2, maxResults = 100, maxPositions = 20 } = {}) {
    const map = new Map();
    for (const { id, grid } of pages) {
      for (let r = 0; r + height <= grid.height; r++) for (let c = 0; c + width <= grid.width; c++) {
        const rows = [], flat = [];
        for (let y = 0; y < height; y++) { const row = []; for (let x = 0; x < width; x++) { row.push(grid.get(r + y, c + x)); } rows.push(row.join(',')); flat.push(...row); }
        if (!hasData(flat)) continue;
        const key = rows.join('/');
        const e = map.get(key) ?? { key, occurrences: 0, nonOverlapping: 0, occupied: new Set(), positions: [], positionsTruncated: false };
        map.set(key, e); e.occurrences++;
        const cells = []; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push(`${id}:${r + y}:${c + x}`);
        if (!cells.some((k) => e.occupied.has(k))) { e.nonOverlapping++; cells.forEach((k) => e.occupied.add(k)); }
        if (e.positions.length < maxPositions) e.positions.push({ pageId: id, row: r, col: c }); else e.positionsTruncated = true;
      }
    }
    const rows = [...map.values()].filter((e) => e.occurrences >= minCount).map(({ occupied, ...rest }) => rest)
      .sort((a, b) => b.occurrences - a.occurrences || a.key.localeCompare(b.key));
    return { height, width, minCount, total: rows.length, truncated: rows.length > maxResults, results: rows.slice(0, maxResults) };
  }

  /** 4-connected regions of written (data + terminator), NULL and unwritten cells. */
  static regions(grid, pageId = 0, { maxResults = 200 } = {}) {
    const kindOf = (code) => (Palette.isNull(code) ? 'null' : Palette.isEmpty(code) ? 'unwritten' : 'written');
    const seen = new Uint8Array(grid.width * grid.height), out = [];
    for (let r = 0; r < grid.height; r++) for (let c = 0; c < grid.width; c++) {
      if (seen[r * grid.width + c]) continue;
      const kind = kindOf(grid.get(r, c)), stack = [[r, c]];
      seen[r * grid.width + c] = 1;
      const box = { top: r, left: c, bottom: r, right: c }; let size = 0;
      while (stack.length) {
        const [y, x] = stack.pop(); size++;
        box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y); box.left = Math.min(box.left, x); box.right = Math.max(box.right, x);
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y + dy, nx = x + dx;
          if (ny < 0 || nx < 0 || ny >= grid.height || nx >= grid.width || seen[ny * grid.width + nx] || kindOf(grid.get(ny, nx)) !== kind) continue;
          seen[ny * grid.width + nx] = 1; stack.push([ny, nx]);
        }
      }
      out.push({ pageId, kind, size, bbox: box, firstCell: { row: r, col: c } });
    }
    out.sort((a, b) => b.size - a.size);
    return { total: out.length, truncated: out.length > maxResults, results: out.slice(0, maxResults) };
  }

  /** Per-unit geometry from PageCorpus units: column, first row, length, terminator row. */
  static unitGeometry(units) {
    return units.map((u) => ({ pageId: u.pageId, unitIndex: u.unitIndex, column: u.column, startRow: u.cells[0]?.[0] ?? u.terminator?.row ?? null,
      length: u.symbols.length, terminatorRow: u.terminator?.row ?? null, complete: u.complete }));
  }

  /** Pearson r, or null when fewer than 3 points or zero variance. */
  static correlation(xs, ys) {
    const n = xs.length;
    if (n < 3 || n !== ys.length) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }

  /** Two-sided permutation test of correlation (ys shuffled against xs). */
  static correlationTest(xs, ys, { simulations = 1000, seed = 1 } = {}) {
    const meta = { nullHypothesis: 'x and y are unrelated (y values are exchangeable across positions)', randomized: 'order of y', preserved: 'both marginal distributions', simulations, seed };
    const r = SpatialAnalyzer.correlation(xs, ys);
    if (r === null) return { ...meta, n: xs.length, r: null, pValue: null, warning: 'correlation undefined (fewer than 3 points or no variance)' };
    const rng = new SeededRandom(seed);
    let k = 0;
    for (let s = 0; s < simulations; s++) if (Math.abs(SpatialAnalyzer.correlation(xs, rng.shuffle(ys.slice()))) >= Math.abs(r) - 1e-12) k++;
    return { ...meta, n: xs.length, r, pValue: (k + 1) / (simulations + 1) };
  }

  /** Maximal horizontal runs of data symbols (used as the units of a spatial null model). */
  static horizontalRuns(grid) {
    const runs = [];
    for (let r = 0; r < grid.height; r++) {
      let run = [];
      for (let c = 0; c <= grid.width; c++) {
        const code = c < grid.width ? grid.get(r, c) : Palette.EMPTY;
        if (Palette.isDigit(code)) run.push(code); else { if (run.length) runs.push(run); run = []; }
      }
    }
    return runs;
  }

  /** Are horizontal n-grams of data runs more frequent than if each run's order were random? */
  static testHorizontalRuns(pages, n = 2, options = {}) {
    const runs = pages.flatMap((p) => SpatialAnalyzer.horizontalRuns(p.grid));
    return PermutationTester.testNgrams(runs, NGramAnalyzer.countMap, n, { baseline: BASELINES.SHUFFLE_WITHIN_UNITS, ...options });
  }
}
