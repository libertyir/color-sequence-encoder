/**
 * PageCollection.js - session-only list of pages (order is kept for future 3D
 * stacking and is NOT stored in the PNGs). Pages vanish with the browser
 * session unless exported as PNG.
 */
import Palette from './Palette.js';
import WritingEngine from './WritingEngine.js';
import PageValidator from './PageValidator.js';
import PngCodec from './PngCodec.js';
import Limits from './Limits.js';

export class Page {
  constructor({ id, name, grid, engine = null, reason = null }) {
    this.id = id; this.name = name; this.engine = engine; this.reason = reason;
    this.grid = engine ? engine.grid : grid;
    this.writtenCount = 0;
    for (const code of this.grid.toCells()) if (code >= 1 && code <= 6) this.writtenCount++;
  }
  get status() { return this.engine ? this.engine.status : 'invalid'; }
  get isPristine() { return this.grid.isPristine(); }
  peekTarget() { return this.engine ? this.engine.peekTarget() : null; }
  write(symbol) {
    if (!this.engine) throw new Error('Invalid page: writing is disabled');
    const result = this.engine.write(symbol);
    this.writtenCount++;
    return result;
  }
}

export default class PageCollection {
  #pages = []; #seq = 0; #selectedId = null;

  get pages() { return [...this.#pages]; }
  get selected() { return this.#pages.find((p) => p.id === this.#selectedId) ?? null; }

  create(width, height, name = `Page ${this.#seq + 1}`) {
    if (!Limits.isValidInitialSize(width, height)) throw new RangeError('Dimensions outside the supported limits');
    return this.#add(new Page({ id: ++this.#seq, name, engine: WritingEngine.fromEmpty(width, height) }));
  }

  /** Re-derives everything from the PNG. Structurally invalid images become INVALID pages. */
  async importPng(bytes, name = 'Imported') {
    const v = await PageValidator.validatePng(bytes);
    if (!v.grid) return { page: null, reason: v.reason };
    const page = this.#add(new Page({ id: ++this.#seq, name, grid: v.grid, engine: v.valid ? v.engine : null, reason: v.reason }));
    return { page, reason: v.reason };
  }

  async exportPng(id) {
    const page = this.#find(id);
    if (!page.engine) throw new Error('Invalid pages cannot be exported');
    return PngCodec.encode(page.grid);
  }

  /** Only allowed while cell (1,1) is still white. */
  resizePristine(id, width, height) {
    const i = this.#pages.findIndex((p) => p.id === id);
    const page = this.#find(id);
    if (!page.engine || !page.isPristine) throw new Error('Dimensions are locked once writing has begun');
    if (!Limits.isValidInitialSize(width, height)) throw new RangeError('Dimensions outside the supported limits');
    this.#pages[i] = new Page({ id, name: page.name, engine: WritingEngine.fromEmpty(width, height) });
    return this.#pages[i];
  }

  select(id) { this.#find(id); this.#selectedId = id; }
  move(id, delta) {
    const i = this.#pages.findIndex((p) => p.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= this.#pages.length) return;
    [this.#pages[i], this.#pages[j]] = [this.#pages[j], this.#pages[i]];
  }

  #add(page) { this.#pages.push(page); this.#selectedId = page.id; return page; }
  #find(id) {
    const p = this.#pages.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown page ${id}`);
    return p;
  }
}
