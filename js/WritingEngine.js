/**
 * WritingEngine.js
 * The ONLY component that decides where a symbol lands and when the grid grows.
 * Manual mode, random mode and the importer's replay all go through write().
 *
 * Rules:
 *  - Target = topmost EMPTY (white) cell of the active column. Below a column's
 *    first white cell everything down to the bottom is white, so a unit never
 *    meets NULL in the middle of writing.
 *  - If the active column has no white cell, the grid grows by exactly ONE row
 *    at that moment, and at that same moment:
 *      * EVERY white cell in all columns LEFT of the active column becomes NULL
 *        (those columns are finished for this sweep) - not only the new row;
 *      * the active column and all columns to its right receive a white new row.
 *    Data cells never change.
 *  - Writing the terminator (6) ends the unit; the next column is the first
 *    column to the right with a white cell, otherwise wrap and scan from column 0.
 *    None found => CLOSED (permanent).
 *  - If growth is needed but the height limit is reached => HALTED (writing
 *    stops, the page is NOT closed).
 */
import Palette from './Palette.js';
import GridModel from './GridModel.js';
import Limits from './Limits.js';

const NO_NULLED = Object.freeze([]);

export default class WritingEngine {
  static STATUS = Object.freeze({ OPEN: 'open', CLOSED: 'closed', HALTED: 'halted' });

  #grid;
  #activeColumn; // -1 means closed
  #unitOpen;     // a unit has started but is not yet terminated
  #maxHeight;

  constructor(grid, { activeColumn = 0, unitOpen = false, maxHeight = Limits.MAX_HEIGHT } = {}) {
    if (!(grid instanceof GridModel)) throw new TypeError('grid must be a GridModel');
    const closed = activeColumn === -1;
    if (!closed && (!Number.isInteger(activeColumn) || activeColumn < 0 || activeColumn >= grid.width)) {
      throw new RangeError(`Invalid active column: ${activeColumn}`);
    }
    if (closed && unitOpen) throw new Error('A closed page cannot have an open unit');
    this.#grid = grid;
    this.#activeColumn = activeColumn;
    this.#unitOpen = unitOpen;
    this.#maxHeight = maxHeight;
  }

  static fromEmpty(width, height, options) {
    return new WritingEngine(new GridModel(width, height), options);
  }

  get grid()         { return this.#grid; }
  get activeColumn() { return this.#activeColumn; }
  get unitOpen()     { return this.#unitOpen; }
  get maxHeight()    { return this.#maxHeight; }

  get status() {
    if (this.#activeColumn === -1) return WritingEngine.STATUS.CLOSED;
    const target = this.peekTarget();
    return target.expands && this.#grid.height >= this.#maxHeight
      ? WritingEngine.STATUS.HALTED
      : WritingEngine.STATUS.OPEN;
  }
  get isClosed() { return this.status === WritingEngine.STATUS.CLOSED; }
  get isHalted() { return this.status === WritingEngine.STATUS.HALTED; }

  /**
   * Where the next symbol would land, without changing anything.
   * `expands: true` means row === current height (one row will be added).
   * Returns null when the page is closed.
   */
  peekTarget() {
    if (this.#activeColumn === -1) return null;
    const col = this.#activeColumn;
    const row = this.#grid.firstEmptyRow(col);
    return row >= 0
      ? { col, row, expands: false }
      : { col, row: this.#grid.height, expands: true };
  }

  /** Write exactly one symbol (code 1..6). Returns a frozen result record. */
  write(symbol) {
    if (!Palette.isWritable(symbol)) throw new RangeError(`Not a writable symbol: ${symbol}`);
    const status = this.status;
    if (status === WritingEngine.STATUS.CLOSED) throw new Error('Page is closed: writing is disabled');
    if (status === WritingEngine.STATUS.HALTED) throw new Error('Height limit reached: writing is halted');

    const target = this.peekTarget();
    let rowsAdded = 0;
    let nulledFrom = NO_NULLED;
    if (target.expands) {
      const activeCol = target.col;
      this.#grid.appendRows(1, (c) => (c < activeCol ? Palette.NULL : Palette.EMPTY));
      nulledFrom = this.#grid.nullifyEmptyBefore(activeCol); // blacken leftover white cells left of the active column
      rowsAdded = 1;
    }
    this.#grid.write(target.row, target.col, symbol);

    let unitCompleted = false;
    if (Palette.isTerminator(symbol)) {
      unitCompleted = true;
      this.#unitOpen = false;
      this.#activeColumn = this.#findNextColumn(target.col);
    } else {
      this.#unitOpen = true;
    }

    return Object.freeze({
      col: target.col,
      row: target.row,
      symbol,
      rowsAdded,
      nulledFrom,
      unitCompleted,
      nextColumn: this.#activeColumn,
      closed: this.#activeColumn === -1,
    });
  }

  /** First column right of `from` with an EMPTY cell; else wrap from column 0; else -1. */
  #findNextColumn(from) {
    for (let c = from + 1; c < this.#grid.width; c++) {
      if (this.#grid.firstEmptyRow(c) >= 0) return c;
    }
    for (let c = 0; c < this.#grid.width; c++) {
      if (this.#grid.firstEmptyRow(c) >= 0) return c;
    }
    return -1;
  }

  snapshot() {
    return Object.freeze({
      width: this.#grid.width,
      height: this.#grid.height,
      status: this.status,
      activeColumn: this.#activeColumn,
      unitOpen: this.#unitOpen,
      target: this.peekTarget(),
    });
  }
}
