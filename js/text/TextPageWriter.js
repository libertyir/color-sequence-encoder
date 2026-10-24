/**
 * TextPageWriter.js - writes text units into NEW pages through the existing
 * Page.write -> WritingEngine path (no second filling algorithm). A word is never
 * split across pages: if it does not fit in the current page (page closed, or not
 * enough white cells plus growth room), a new page is created and the old page is
 * left valid and open. Pages are numbered by position in the run (1..N).
 */
import Limits from '../Limits.js';

export class TextWriteError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'TextWriteError'; this.code = code; Object.assign(this, details); }
}

export default class TextPageWriter {
  #create; #yield; #yieldEvery;

  constructor(pages, { createPage = (w, h, name) => pages.create(w, h, name), yieldControl = () => new Promise((r) => setTimeout(r, 0)), yieldEvery = 4000 } = {}) {
    this.#create = createPage; this.#yield = yieldControl; this.#yieldEvery = yieldEvery;
  }

  /** Cells the current page can still give to ONE unit: white cells of the active column + growth room. */
  static capacity(page) {
    const t = page.peekTarget();
    if (!t || page.status !== 'open') return 0;
    return (t.expands ? 0 : page.grid.height - t.row) + (page.engine.maxHeight - page.grid.height);
  }

  async write(units, { width, height, onProgress, shouldStop } = {}) {
    for (const u of units) {
      if (u.symbols.length > Limits.MAX_HEIGHT) throw new TextWriteError('WORD_TOO_LONG_FOR_PAGE', `Word ${u.index + 1} needs ${u.symbols.length} cells; a page column holds at most ${Limits.MAX_HEIGHT}.`, { wordIndex: u.index + 1 });
    }
    const pages = []; let page = null, written = 0, stopped = false;
    for (let i = 0; i < units.length; i++) {
      if (shouldStop?.()) { stopped = true; break; }
      const u = units[i];
      if (!page || TextPageWriter.capacity(page) < u.symbols.length) {
        page = this.#create(width, height, `Text ${String(pages.length + 1).padStart(4, '0')}`); pages.push(page);
        if (TextPageWriter.capacity(page) < u.symbols.length) throw new TextWriteError('WORD_TOO_LONG_FOR_PAGE', `Word ${u.index + 1} does not fit in a new page.`, { wordIndex: u.index + 1 });
      }
      for (const s of u.symbols) {
        page.write(s);
        if (++written % this.#yieldEvery === 0) { onProgress?.({ wordsDone: i, wordsTotal: units.length, pages: pages.length }); await this.#yield(); }
      }
    }
    onProgress?.({ wordsDone: stopped ? pages.length && units.length : units.length, wordsTotal: units.length, pages: pages.length });
    return { pages, words: units.length, symbols: written, stopped };
  }
}
