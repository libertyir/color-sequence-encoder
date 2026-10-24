/**
 * AppController.js - connects the DOM to the collaborating classes. It holds
 * no encoding logic: every write goes through Page -> WritingEngine.
 */
import PageCollection from './PageCollection.js';
import GridRenderer from './GridRenderer.js';
import RandomWriter from './RandomWriter.js';
import Base5Converter from './Base5Converter.js';
import Palette from './Palette.js';

const IDS = ['input-width', 'input-height', 'btn-apply-size', 'btn-new-page', 'grid-canvas', 'palette',
  'selected-symbol', 'btn-write', 'btn-random-start', 'btn-random-pause', 'btn-random-resume',
  'btn-random-stop', 'input-speed', 'random-status', 'btn-export', 'input-import', 'message',
  'stat-size', 'stat-cursor', 'stat-status', 'stat-count', 'units-body', 'page-list', 'units-panel', 'btn-toggle-units'];
const MAX_UNIT_ROWS = 500;

export default class AppController {
  #locked = false; #doc; #d = {}; #pages = new PageCollection(); #renderer; #symbol = 1; #writer = null; #unitsTimer = null;

  /** Read access for the analysis module (the collection itself is unchanged). */
  get pages() { return this.#pages; }

  /** Redraw everything for the selected page (used after external page creation). */
  refresh() { this.#refreshAll(); }

  /** Lock all writing/page controls while an automatic batch is running. */
  setLocked(flag) { this.#locked = flag; if (flag) this.#stopWriter(); this.#refreshControls(); this.#refreshPages(); }

  constructor(doc = document) {
    this.#doc = doc;
    for (const id of IDS) {
      const el = doc.getElementById(id);
      if (!el) throw new Error(`Missing element #${id}`);
      this.#d[id] = el;
    }
    this.#renderer = new GridRenderer(this.#d['grid-canvas']);
    this.#buildPalette();
    this.#bind();
    this.#pages.create(10, 20, 'Page 1');
    this.#select(1);
    this.#refreshAll();
  }

  #buildPalette() {
    for (const code of Palette.writableCodes()) {
      const b = this.#doc.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.dataset.code = String(code);
      b.title = Palette.get(code).label; b.setAttribute('aria-label', Palette.get(code).label);
      const canvas = this.#doc.createElement('canvas');
      GridRenderer.drawSwatch(canvas, code);
      b.appendChild(canvas);
      b.addEventListener('click', () => this.#select(code));
      this.#d.palette.appendChild(b);
    }
  }

  #bind() {
    const d = this.#d;
    d['btn-write'].addEventListener('click', () => this.#write(this.#symbol));
    d['btn-apply-size'].addEventListener('click', () => this.#applySize());
    d['btn-new-page'].addEventListener('click', () => this.#newPage());
    d['btn-random-start'].addEventListener('click', () => this.#startRandom());
    d['btn-random-pause'].addEventListener('click', () => { this.#writer?.pause(); this.#refreshControls(); });
    d['btn-random-resume'].addEventListener('click', () => { this.#writer?.resume(); this.#refreshControls(); });
    d['btn-random-stop'].addEventListener('click', () => this.#writer?.stop());
    d['input-speed'].addEventListener('input', () => this.#writer?.setSpeed(Number(d['input-speed'].value)));
    d['btn-export'].addEventListener('click', () => this.#export());
    d['input-import'].addEventListener('change', () => this.#import());
    d['btn-toggle-units'].addEventListener('click', () => this.#toggleUnits());
  }

  #dims() { return [Number(this.#d['input-width'].value), Number(this.#d['input-height'].value)]; }
  #say(text, kind = 'info') { this.#d.message.textContent = text; this.#d.message.dataset.kind = kind; }
  #stopWriter() { if (this.#writer) { this.#writer.stop(); this.#writer = null; } }

  #select(code) {
    this.#symbol = code;
    for (const b of this.#d.palette.children) {
      const on = Number(b.dataset.code) === code;
      b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-selected', on);
    }
    this.#d['selected-symbol'].textContent = `${code}: ${Palette.get(code).label}`;
  }

  #write(symbol) {
    const page = this.#pages.selected;
    try {
      const result = page.write(symbol);
      this.#renderer.update(page.grid, result, page.peekTarget());
      this.#say(page.status === 'closed' ? 'Page closed permanently.' : page.status === 'halted' ? 'Height limit reached: writing halted.' : '');
    } catch (e) { this.#say(e.message, 'error'); }
    this.#refreshStatus(); this.#refreshControls(); this.#scheduleUnits();
  }

  #applySize() {
    try {
      const [w, h] = this.#dims();
      this.#stopWriter();
      this.#pages.resizePristine(this.#pages.selected.id, w, h);
      this.#say('Size applied.'); this.#refreshAll();
    } catch (e) { this.#say(e.message, 'error'); }
  }

  #newPage() {
    try {
      const [w, h] = this.#dims();
      this.#stopWriter(); this.#pages.create(w, h);
      this.#say('New page created.'); this.#refreshAll();
    } catch (e) { this.#say(e.message, 'error'); }
  }

  #startRandom() {
    const page = this.#pages.selected;
    this.#writer = new RandomWriter(page, {
      speed: Number(this.#d['input-speed'].value),
      onStep: (result) => { this.#renderer.update(page.grid, result, page.peekTarget()); this.#refreshStatus(); this.#scheduleUnits(); },
      onStop: (reason) => {
        this.#say(`Random writing stopped (${reason}).`, reason.startsWith('error') ? 'error' : 'info');
        this.#refreshStatus(); this.#refreshControls(); this.#refreshUnits();
      },
    });
    this.#writer.start(); this.#refreshControls();
  }

  async #export() {
    try {
      const page = this.#pages.selected;
      const bytes = await this.#pages.exportPng(page.id);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      const a = this.#doc.createElement('a');
      a.href = url; a.download = `${page.name}.png`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { this.#say(e.message, 'error'); }
  }

  async #import() {
    const input = this.#d['input-import'];
    const file = input.files[0];
    if (!file) return;
    this.#stopWriter();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { page, reason } = await this.#pages.importPng(bytes, file.name.replace(/\.png$/i, ''));
    input.value = '';
    if (!page) this.#say(`Rejected: ${reason}`, 'error');
    else if (page.status === 'invalid') this.#say(`Rejected (page is read-only): ${reason}`, 'error');
    else this.#say(`Imported "${page.name}" (${page.status}).`);
    this.#refreshAll();
  }

  #refreshAll() {
    const page = this.#pages.selected;
    this.#renderer.render(page.grid, page.peekTarget());
    this.#refreshStatus(); this.#refreshControls(); this.#refreshPages(); this.#refreshUnits();
  }

  #refreshStatus() {
    const page = this.#pages.selected, t = page.peekTarget(), d = this.#d;
    d['stat-size'].textContent = `${page.grid.width} columns x ${page.grid.height} rows`;
    d['stat-cursor'].textContent = t ? `row ${t.row + 1}, column ${t.col + 1}${t.expands ? ' (adds a row)' : ''}` : 'none';
    d['stat-status'].textContent = page.status + (page.reason ? `: ${page.reason}` : '');
    d['stat-status'].dataset.status = page.status;
    d['stat-count'].textContent = String(page.writtenCount);
  }

  #refreshControls() {
    const page = this.#pages.selected, d = this.#d;
    const state = this.#writer?.state ?? RandomWriter.STATE.IDLE;
    const idle = state === RandomWriter.STATE.IDLE, open = page.status === 'open';
    const locked = !page.engine || !page.isPristine;
    d['btn-write'].disabled = !open || !idle || this.#locked;
    d['btn-random-start'].disabled = !open || !idle || this.#locked;
    d['btn-new-page'].disabled = this.#locked;
    d['input-import'].disabled = this.#locked;
    d['btn-random-pause'].disabled = state !== RandomWriter.STATE.RUNNING;
    d['btn-random-resume'].disabled = state !== RandomWriter.STATE.PAUSED;
    d['btn-random-stop'].disabled = idle;
    d['btn-export'].disabled = !page.engine;
    d['input-width'].disabled = d['input-height'].disabled = d['btn-apply-size'].disabled = locked || this.#locked;
    d['random-status'].textContent = state;
  }

  #refreshPages() {
    const list = this.#d['page-list'];
    list.replaceChildren();
    for (const page of this.#pages.pages) {
      const li = this.#doc.createElement('li');
      const pick = this.#doc.createElement('button');
      pick.type = 'button'; pick.textContent = `${page.name} (${page.status})`; pick.disabled = this.#locked;
      if (page.id === this.#pages.selected.id) pick.setAttribute('aria-current', 'true');
      pick.addEventListener('click', () => { this.#stopWriter(); this.#pages.select(page.id); this.#refreshAll(); });
      li.appendChild(pick);
      for (const [label, delta] of [['Up', -1], ['Down', 1]]) {
        const b = this.#doc.createElement('button');
        b.type = 'button'; b.textContent = label; b.disabled = this.#locked; b.setAttribute('aria-label', `Move ${page.name} ${label.toLowerCase()}`);
        b.addEventListener('click', () => { this.#pages.move(page.id, delta); this.#refreshPages(); });
        li.appendChild(b);
      }
      list.appendChild(li);
    }
  }

  #scheduleUnits() {
    if (this.#unitsTimer !== null) return;
    this.#unitsTimer = setTimeout(() => { this.#unitsTimer = null; this.#refreshUnits(); }, 400);
  }

  #toggleUnits() {
    const panel = this.#d['units-panel'], button = this.#d['btn-toggle-units'];
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    button.textContent = panel.hidden ? 'Show base-5 conversion' : 'Hide base-5 conversion';
    if (!panel.hidden) this.#refreshUnits();
  }

  #refreshUnits() {
    if (this.#d['units-panel'].hidden) return; // computed only when the user asks to see it
    const body = this.#d['units-body'];
    body.replaceChildren();
    for (const u of Base5Converter.extractUnits(this.#pages.selected.grid).slice(0, MAX_UNIT_ROWS)) {
      const tr = this.#doc.createElement('tr');
      const cells = [u.column, u.isEmpty ? '(empty unit)' : u.digits,
        u.decimal === null ? '-' : u.decimal.toString(), u.complete ? 'complete' : 'incomplete'];
      for (const text of cells) { const td = this.#doc.createElement('td'); td.textContent = String(text); tr.appendChild(td); }
      body.appendChild(tr);
    }
  }
}
