/**
 * BatchPageGenerator.js - creates N pages strictly ONE AFTER ANOTHER: page i is
 * filled until it closes (or halts / hits a safety limit) before page i+1 is
 * created. Every symbol goes through Page.write -> WritingEngine, exactly like
 * manual and random mode. Work is chunked so the UI stays responsive.
 */
import Palette from './Palette.js';
import Limits from './Limits.js';

export default class BatchPageGenerator {
  static MAX_PAGES = 500;
  #pages; #rng; #chunk; #maxWrites; #yield; #stopped = false; #running = false;

  constructor(pages, { rng = Math.random, chunkSize = 1000, maxWritesPerPage = 2_000_000, yieldControl = () => new Promise((r) => setTimeout(r, 0)) } = {}) {
    this.#pages = pages; this.#rng = rng; this.#chunk = chunkSize; this.#maxWrites = maxWritesPerPage; this.#yield = yieldControl;
  }

  get running() { return this.#running; }
  /** Ask the run to stop after the current chunk; the current page stays as written so far. */
  stop() { this.#stopped = true; }

  async run({ count, width, height, namePrefix = 'Batch', onPageStart, onProgress, onPageDone }) {
    if (this.#running) throw new Error('A batch is already running');
    if (!Number.isInteger(count) || count < 1 || count > BatchPageGenerator.MAX_PAGES) throw new RangeError(`count must be 1..${BatchPageGenerator.MAX_PAGES}`);
    if (!Limits.isValidInitialSize(width, height)) throw new RangeError('Dimensions outside the supported limits');
    this.#running = true; this.#stopped = false;
    const codes = Palette.writableCodes(), results = [];
    try {
      for (let i = 1; i <= count && !this.#stopped; i++) {
        const page = this.#pages.create(width, height, `${namePrefix} ${i}`);
        onPageStart?.(page, i, count);
        let writes = 0;
        while (!this.#stopped && page.status === 'open' && writes < this.#maxWrites) {
          for (let k = 0; k < this.#chunk && page.status === 'open' && writes < this.#maxWrites; k++, writes++) page.write(codes[Math.floor(this.#rng() * codes.length)]);
          onProgress?.(page, i, count, writes);
          await this.#yield();
        }
        const outcome = page.status === 'closed' ? 'closed' : page.status === 'halted' ? 'halted' : this.#stopped ? 'stopped' : 'limit';
        results.push({ page, outcome, writes });
        onPageDone?.(page, i, count, outcome);
      }
    } finally { this.#running = false; }
    return { requested: count, created: results.length, results, stopped: this.#stopped };
  }
}
