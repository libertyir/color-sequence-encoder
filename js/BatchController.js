/**
 * BatchController.js - UI for BatchPageGenerator. While a batch runs, the main
 * app controls are locked so nothing else can write at the same time.
 */
import BatchPageGenerator from './BatchPageGenerator.js';
import SeededRandom from './analysis/SeededRandom.js';

const IDS = ['batch-count', 'batch-width', 'batch-height', 'batch-seed', 'btn-batch-start', 'btn-batch-stop', 'batch-status'];

export default class BatchController {
  #d = {}; #app; #generator = null;

  constructor(doc, app) {
    this.#app = app;
    for (const id of IDS) { const el = doc.getElementById(id); if (!el) throw new Error(`Missing element #${id}`); this.#d[id] = el; }
    this.#d['btn-batch-start'].addEventListener('click', () => this.#start());
    this.#d['btn-batch-stop'].addEventListener('click', () => this.#generator?.stop());
  }

  #say(text) { this.#d['batch-status'].textContent = text; }
  #buttons(running) { this.#d['btn-batch-start'].disabled = running; this.#d['btn-batch-stop'].disabled = !running; }

  async #start() {
    const d = this.#d, seedText = d['batch-seed'].value.trim(), seed = Number(seedText);
    if (seedText && !Number.isFinite(seed)) { this.#say('The seed must be a number (or empty for a random run).'); return; }
    const random = seedText ? new SeededRandom(seed) : null;
    this.#generator = new BatchPageGenerator(this.#app.pages, { rng: random ? () => random.next() : Math.random });
    this.#app.setLocked(true); this.#buttons(true);
    const w = Number(d['batch-width'].value), h = Number(d['batch-height'].value);
    try {
      const res = await this.#generator.run({
        count: Number(d['batch-count'].value), width: w, height: h,
        onPageStart: (page, i, n) => this.#say(`Page ${i} of ${n}: created (${w} × ${h}), filling…`),
        onProgress: (page, i, n, writes) => this.#say(`Page ${i} of ${n}: ${writes} symbols written…`),
        onPageDone: (page, i, n, outcome) => { this.#app.refresh(); this.#say(`Page ${i} of ${n} finished (${outcome}): ${page.writtenCount} symbols, ${page.grid.width} × ${page.grid.height}.`); },
      });
      const by = (o) => res.results.filter((r) => r.outcome === o).length;
      this.#say(`${res.stopped ? 'Stopped' : 'Done'}: ${res.created} of ${res.requested} page(s) created — ${by('closed')} closed, ${by('halted')} halted at the height limit, ${by('limit') + by('stopped')} incomplete.`);
    } catch (e) { this.#say(`Batch failed: ${e.message}`); }
    finally { this.#app.setLocked(false); this.#app.refresh(); this.#buttons(false); }
  }
}
