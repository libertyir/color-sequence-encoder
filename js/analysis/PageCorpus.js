/**
 * PageCorpus.js - READ-ONLY adapter from existing pages/grids to analysis data.
 * Only calls grid.get(); never writes. Output is deeply frozen.
 * Symbols are Palette codes 1..5 (colors, not numbers). Terminators and NULL
 * cells are structure, never symbols. Unit order within a page = column-major
 * (same as Base5Converter). gaps[i] is true when symbol i is not directly
 * below symbol i-1 (a NULL/white gap), so no adjacency is ever invented.
 */
import Palette from '../Palette.js';

const freeze = Object.freeze;

export default class PageCorpus {
  static fromPages(pages) {
    return freeze({ pages: freeze(pages.map((p) => PageCorpus.fromGrid(p.grid, { pageId: p.id, name: p.name }))) });
  }

  static fromGrid(grid, { pageId = 0, name = '' } = {}) {
    const units = [];
    const structure = { dataSymbols: 0, terminators: 0, nullCells: 0, unwrittenCells: 0 };
    for (let c = 0; c < grid.width; c++) {
      let symbols = [], cells = [], gaps = [], prevRow = -2;
      const flush = (terminator) => {
        units.push(freeze({
          pageId, unitIndex: units.length, column: c, symbols: freeze(symbols), cells: freeze(cells), gaps: freeze(gaps),
          terminator, complete: terminator !== null, key: symbols.join(','), hasGap: gaps.some(Boolean),
        }));
        symbols = []; cells = []; gaps = []; prevRow = -2;
      };
      for (let r = 0; r < grid.height; r++) {
        const code = grid.get(r, c);
        if (Palette.isDigit(code)) {
          gaps.push(symbols.length > 0 && r !== prevRow + 1);
          symbols.push(code); cells.push(freeze([r, c])); prevRow = r; structure.dataSymbols++;
        } else if (Palette.isTerminator(code)) {
          structure.terminators++; flush(freeze({ row: r, col: c }));
        } else if (Palette.isNull(code)) structure.nullCells++;
        else structure.unwrittenCells++;
      }
      if (symbols.length) flush(null);
    }
    return freeze({ pageId, name, width: grid.width, height: grid.height, units: freeze(units), structure: freeze(structure) });
  }

  static units(corpus, { pageIds = null, completeOnly = true } = {}) {
    return corpus.pages
      .filter((p) => !pageIds || pageIds.includes(p.pageId))
      .flatMap((p) => p.units.filter((u) => u.complete || !completeOnly));
  }

  static structure(corpus, pageIds = null) {
    const total = { dataSymbols: 0, terminators: 0, nullCells: 0, unwrittenCells: 0, incompleteUnits: 0, emptyUnits: 0 };
    for (const p of corpus.pages.filter((x) => !pageIds || pageIds.includes(x.pageId))) {
      for (const k of Object.keys(p.structure)) total[k] += p.structure[k];
      for (const u of p.units) { if (!u.complete) total.incompleteUnits++; if (u.symbols.length === 0) total.emptyUnits++; }
    }
    return total;
  }

  /** Gap-free runs of symbols: [{ unit, offset, symbols }]. */
  static segments(units) {
    const out = [];
    for (const unit of units) {
      let start = 0;
      for (let i = 1; i <= unit.symbols.length; i++) {
        if (i === unit.symbols.length || unit.gaps[i]) {
          if (i > start) out.push({ unit, offset: start, symbols: unit.symbols.slice(start, i) });
          start = i;
        }
      }
    }
    return out;
  }

  static ref(unit, symbolIndex) {
    const [row, col] = unit.cells[symbolIndex];
    return freeze({ pageId: unit.pageId, unitIndex: unit.unitIndex, symbolIndex, row, col });
  }
}
