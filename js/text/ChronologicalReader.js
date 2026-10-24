/**
 * ChronologicalReader.js - recovers the units of ONE page in WRITING order.
 * The page is validated by CursorManager (existing). Because the writing order
 * is not column order (later sweeps fill pockets), the grid is replayed through
 * the real WritingEngine for every consistent initial height; all of them must
 * give the same unit sequence, otherwise the page is reported as ambiguous.
 */
import Palette from '../Palette.js';
import WritingEngine from '../WritingEngine.js';
import CursorManager from '../CursorManager.js';

export default class ChronologicalReader {
  /** @returns {{ok, reason, units}} units: [{codes (digit symbols), complete, column, firstRow, lastRow}] */
  static read(grid) {
    const state = CursorManager.reconstruct(grid);
    if (!state.ok) return { ok: false, reason: state.reason, units: [] };
    let result = null, key = null;
    for (const h0 of state.consistentInitialHeights) {
      const units = ChronologicalReader.#replay(grid, h0), k = JSON.stringify(units.map((u) => [u.codes, u.complete, u.column]));
      if (key === null) { key = k; result = units; } else if (k !== key) return { ok: false, reason: 'Ambiguous page: different initial heights give a different word order', units: [] };
    }
    return { ok: true, reason: null, units: result };
  }

  static #replay(grid, h0) {
    const engine = WritingEngine.fromEmpty(grid.width, h0), units = [];
    let cur = null;
    for (;;) {
      const t = engine.peekTarget();
      if (t === null) break;
      const code = t.row < grid.height ? grid.get(t.row, t.col) : Palette.EMPTY;
      if (code === Palette.EMPTY) break;
      const r = engine.write(code);
      cur ??= { codes: [], complete: false, column: r.col, firstRow: r.row, lastRow: r.row };
      cur.lastRow = r.row;
      if (r.unitCompleted) { cur.complete = true; units.push(cur); cur = null; } else cur.codes.push(code);
    }
    if (cur) units.push(cur);
    return units;
  }
}
