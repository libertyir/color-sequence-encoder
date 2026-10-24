/**
 * GridRenderer.js - draws a GridModel on a canvas. Never mutates the model or
 * decides encoding rules. Colors come from Palette; overlay colors from CSS
 * custom properties (--cursor-color, --grid-line-color).
 */
import Palette from './Palette.js';

export default class GridRenderer {
  #canvas; #ctx; #grid = null; #cell = 12; #cursor = null; #lineColor = ''; #cursorColor = '';

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#ctx.imageSmoothingEnabled = false;
  }

  static #cellFor(grid) { return Math.max(2, Math.min(16, Math.floor(2048 / Math.max(grid.width, grid.height, 1)))); }

  static drawSwatch(canvas, code) {
    canvas.width = 24; canvas.height = 24;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = Palette.hexOf(code);
    ctx.fillRect(0, 0, 24, 24);
  }

  render(grid, target) {
    this.#grid = grid; this.#cell = GridRenderer.#cellFor(grid);
    this.#canvas.width = grid.width * this.#cell; this.#canvas.height = grid.height * this.#cell;
    this.#ctx.imageSmoothingEnabled = false;
    const css = getComputedStyle(this.#canvas);
    this.#lineColor = css.getPropertyValue('--grid-line-color').trim() || '#9e9e9e';
    this.#cursorColor = css.getPropertyValue('--cursor-color').trim() || '#d81b60';
    for (let r = 0; r < grid.height; r++) for (let c = 0; c < grid.width; c++) this.#drawCell(r, c);
    this.#cursor = null; this.#drawCursor(target);
  }

  /** Incremental redraw after one engine write. */
  update(grid, result, target) {
    if (this.#grid !== grid || this.#canvas.height !== grid.height * GridRenderer.#cellFor(grid) || result.rowsAdded) {
      return this.render(grid, target);
    }
    if (this.#cursor) this.#drawCell(this.#cursor.row, this.#cursor.col);
    this.#drawCell(result.row, result.col);
    this.#cursor = null; this.#drawCursor(target);
  }

  #drawCell(r, c) {
    const s = this.#cell, x = c * s, y = r * s;
    this.#ctx.fillStyle = Palette.hexOf(this.#grid.get(r, c));
    this.#ctx.fillRect(x, y, s, s);
    if (s >= 6) {
      this.#ctx.fillStyle = this.#lineColor;
      this.#ctx.fillRect(x + s - 1, y, 1, s); this.#ctx.fillRect(x, y + s - 1, s, 1);
    }
  }

  #drawCursor(target) {
    if (!target || target.row >= this.#grid.height) return;
    const s = this.#cell;
    this.#ctx.strokeStyle = this.#cursorColor; this.#ctx.lineWidth = 2;
    this.#ctx.strokeRect(target.col * s + 1, target.row * s + 1, s - 2, s - 2);
    this.#cursor = { row: target.row, col: target.col };
  }
}
