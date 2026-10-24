/**
 * GridModel.js
 * In-memory source of truth for one page. Indices are 0-based internally
 * (row 0 / col 0 is the user-facing cell (1,1)). Cells hold Palette codes.
 * The model knows nothing about Canvas, cursors or writing order.
 */
import Palette from './Palette.js';

export default class GridModel {
  #width;
  #height;
  #cells;
  #emptyHint; // per-column lower bound of the topmost EMPTY row (empties never reappear above it)

  constructor(width, height) {
    GridModel.#assertSize(width, height);
    this.#width = width;
    this.#height = height;
    this.#cells = new Uint8Array(width * height); // zeros === Palette.EMPTY
    this.#emptyHint = new Int32Array(width);
  }

  static #assertSize(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`Invalid grid size: ${width} x ${height}`);
    }
  }

  /** Build a model from raw codes (used by the importer). Values are copied. */
  static fromCells(width, height, cells) {
    GridModel.#assertSize(width, height);
    if (cells.length !== width * height) throw new RangeError('Cell count does not match size');
    const grid = new GridModel(width, height);
    for (let i = 0; i < cells.length; i++) {
      Palette.get(cells[i]); // throws on unknown codes
      grid.#cells[i] = cells[i];
    }
    return grid;
  }

  get width()  { return this.#width; }
  get height() { return this.#height; }

  #index(row, col) {
    if (!Number.isInteger(row) || !Number.isInteger(col) ||
        row < 0 || row >= this.#height || col < 0 || col >= this.#width) {
      throw new RangeError(`Cell out of range: (${row}, ${col})`);
    }
    return row * this.#width + col;
  }

  get(row, col) { return this.#cells[this.#index(row, col)]; }

  /** Write-once: only an EMPTY cell may receive a writable symbol. */
  write(row, col, code) {
    const i = this.#index(row, col);
    if (!Palette.isWritable(code)) throw new RangeError(`Not a writable symbol: ${code}`);
    if (this.#cells[i] !== Palette.EMPTY) {
      throw new Error(`Refusing to overwrite cell (${row}, ${col})`);
    }
    this.#cells[i] = code;
  }

  /**
   * Append `count` rows at the bottom. Existing cells are copied untouched.
   * `codeForColumn(col)` must return Palette.EMPTY or Palette.NULL.
   */
  appendRows(count, codeForColumn) {
    if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be >= 1');
    const used = this.#width * this.#height, needed = this.#width * (this.#height + count);
    if (needed > this.#cells.length) { // amortized growth: capacity doubles, so long columns stay fast
      const bigger = new Uint8Array(Math.max(needed, this.#cells.length * 2));
      bigger.set(this.#cells.subarray(0, used)); // row-major: old data is an exact prefix
      this.#cells = bigger;
    }
    for (let r = this.#height; r < this.#height + count; r++) {
      for (let c = 0; c < this.#width; c++) {
        const code = codeForColumn(c);
        if (code !== Palette.EMPTY && code !== Palette.NULL) {
          throw new RangeError(`Invalid fill code for new cell: ${code}`);
        }
        this.#cells[r * this.#width + c] = code;
      }
    }
    this.#height += count;
  }

  /**
   * Turn EVERY white cell in columns 0..col-1 into NULL (data cells untouched).
   * Returns, per column, the first row that was nulled (-1 if none).
   */
  nullifyEmptyBefore(col) {
    const from = new Int32Array(col).fill(-1);
    for (let c = 0; c < col; c++) {
      for (let r = this.firstEmptyRow(c); r >= 0 && r < this.#height; r++) {
        const i = r * this.#width + c;
        if (this.#cells[i] === Palette.EMPTY) {
          if (from[c] < 0) from[c] = r;
          this.#cells[i] = Palette.NULL;
        }
      }
      this.#emptyHint[c] = this.#height;
    }
    return from;
  }

  /** Topmost EMPTY row in a column, or -1 if the column has none. */
  firstEmptyRow(col) {
    if (!Number.isInteger(col) || col < 0 || col >= this.#width) {
      throw new RangeError(`Column out of range: ${col}`);
    }
    let r = this.#emptyHint[col];
    while (r < this.#height && this.#cells[r * this.#width + col] !== Palette.EMPTY) r++;
    this.#emptyHint[col] = r;
    return r < this.#height ? r : -1;
  }

  hasEmptyCell() { return this.#cells.subarray(0, this.#width * this.#height).includes(Palette.EMPTY); }

  /** True while cell (1,1) is still pure white (dimension controls stay enabled). */
  isPristine() { return this.#cells[0] === Palette.EMPTY; }

  clone() { return GridModel.fromCells(this.#width, this.#height, this.#cells.subarray(0, this.#width * this.#height)); }

  equals(other) {
    if (!(other instanceof GridModel) || other.#width !== this.#width || other.#height !== this.#height) {
      return false;
    }
    for (let i = 0, n = this.#width * this.#height; i < n; i++) if (this.#cells[i] !== other.#cells[i]) return false;
    return true;
  }

  /** Copy of the raw row-major codes. */
  toCells() { return this.#cells.slice(0, this.#width * this.#height); }
}
