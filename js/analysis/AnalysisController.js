/**
 * AnalysisController.js - wires the analysis panel to AnalysisRunner. It only
 * READS pages from the existing PageCollection; analysis runs on demand.
 */
import Palette from '../Palette.js';
import AnalysisRunner, { ANALYSES } from './AnalysisRunner.js';
import AnalysisTable from './AnalysisTable.js';
import HypothesisTracker from './HypothesisTracker.js';
import ReportWriter from './ReportWriter.js';
import VolumeBuilder from './VolumeBuilder.js';
import ThreeViewer from './ThreeViewer.js';

const IDS = ['analysis-pages', 'analysis-type', 'analysis-min-count', 'analysis-pattern-length', 'analysis-min-repeat', 'analysis-threshold',
  'analysis-simulations', 'analysis-seed', 'analysis-split-mode', 'btn-analysis-run', 'analysis-status', 'analysis-results', 'analysis-legend',
  'hyp-kind', 'hyp-symbols', 'btn-hyp-add', 'hyp-list', 'analysis-report', 'report-lang', 'btn-report-download', 'btn-volume-open', 'volume-view', 'volume-status', 'analysis-warnings', 'analysis-details', 'btn-toggle-details'];

export default class AnalysisController {
  #doc; #pages; #d = {}; #tracker = new HypothesisTracker(); #reportText = ''; #viewer = null; #lastOut = null; #detailsRendered = false;

  constructor(doc, pages) {
    this.#doc = doc; this.#pages = pages;
    for (const id of IDS) { const el = doc.getElementById(id); if (!el) throw new Error(`Missing element #${id}`); this.#d[id] = el; }
    this.#d['analysis-legend'].textContent = 'Color codes: ' + Palette.writableCodes().map((c) => `${c} = ${Palette.get(c).label}`).join('; ') + '.';
    this.#refreshPages();
    this.#d['analysis-pages'].addEventListener('focus', () => this.#refreshPages());
    this.#d['btn-analysis-run'].addEventListener('click', () => this.#run());
    this.#d['btn-hyp-add'].addEventListener('click', () => this.#addHypothesis());
    this.#d['btn-report-download'].addEventListener('click', () => this.#download());
    this.#d['btn-toggle-details'].addEventListener('click', () => this.#toggleDetails());
    this.#d['btn-volume-open'].addEventListener('click', () => this.#openVolume());
  }

  #num(id, fallback) { const v = Number(this.#d[id].value); return Number.isFinite(v) && v > 0 ? v : fallback; }

  #refreshPages() {
    const select = this.#d['analysis-pages'], keep = new Set([...select.selectedOptions].map((o) => o.value));
    select.replaceChildren();
    for (const p of this.#pages.pages) {
      const o = this.#doc.createElement('option');
      o.value = String(p.id); o.textContent = `${p.name} (${p.status})`; o.selected = keep.has(o.value);
      select.appendChild(o);
    }
  }

  #addHypothesis() {
    const symbols = this.#d['hyp-symbols'].value.split(/[\s,]+/).filter(Boolean).map(Number), kind = this.#d['hyp-kind'].value;
    const bad = !symbols.length || symbols.some((s) => !Palette.isDigit(s)) || (kind === 'transition' && symbols.length !== 2);
    if (bad) { this.#d['analysis-status'].textContent = 'Hypothesis needs color codes 1-5 (exactly two for a transition).'; return; }
    const description = kind === 'unit-prefix' ? `Units start with ${symbols.join(' ')}` : `${symbols[0]} is directly followed by ${symbols[1]}`;
    this.#tracker.add({ description, kind, params: { symbols } });
    const li = this.#doc.createElement('li'); li.textContent = `${description} (untested)`; this.#d['hyp-list'].appendChild(li);
    this.#d['hyp-symbols'].value = '';
  }

  #options() {
    const ids = [...this.#d['analysis-pages'].selectedOptions].map((o) => Number(o.value)), type = this.#d['analysis-type'].value;
    return { analyses: type === 'all' ? ANALYSES : [type], pageIds: ids.length ? ids : null, minCount: this.#num('analysis-min-count', 2), n: this.#num('analysis-pattern-length', 2),
      minLength: this.#num('analysis-min-repeat', 3), threshold: Math.min(1, this.#num('analysis-threshold', 0.75)), simulations: Math.min(5000, this.#num('analysis-simulations', 500)),
      seed: this.#num('analysis-seed', 1), split: { mode: this.#d['analysis-split-mode'].value }, hypotheses: this.#tracker };
  }

  #renderWarnings(out) {
    const box = this.#d['analysis-warnings'];
    box.replaceChildren();
    for (const w of out.warnings) { const p = this.#doc.createElement('p'); p.className = 'analysis-warning'; p.textContent = w; box.appendChild(p); }
  }

  #renderDetails() {
    const box = this.#d['analysis-results'];
    box.replaceChildren();
    if (this.#lastOut) for (const sec of this.#lastOut.sections) box.appendChild(AnalysisTable.build(this.#doc, sec));
    this.#detailsRendered = true;
  }

  #toggleDetails() {
    const panel = this.#d['analysis-details'], button = this.#d['btn-toggle-details'];
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    button.textContent = panel.hidden ? 'Show detailed result tables' : 'Hide detailed result tables';
    if (!panel.hidden && !this.#detailsRendered) this.#renderDetails();
  }

  #renderReport(out) {
    const lang = this.#d['report-lang'].value, report = ReportWriter.write(out, { lang }), box = this.#d['analysis-report'];
    box.replaceChildren(); box.dir = report.dir; box.lang = lang;
    const h = this.#doc.createElement('h3'); h.textContent = report.title; box.appendChild(h);
    if (report.verdict) { const v = this.#doc.createElement('p'); v.className = 'report-verdict'; v.dataset.level = report.verdict.level; v.textContent = report.verdict.text; box.appendChild(v); }
    for (const f of report.findings) {
      const a = this.#doc.createElement('article'); a.className = 'report-finding'; a.dataset.strength = f.strength;
      const t = this.#doc.createElement('h4'), p = this.#doc.createElement('p'); t.textContent = f.headline; p.textContent = f.detail; a.append(t, p);
      for (const c of f.caveats) { const n = this.#doc.createElement('p'); n.className = 'report-caveat'; n.textContent = c; a.appendChild(n); }
      box.appendChild(a);
    }
    this.#reportText = ReportWriter.toText(report); this.#d['btn-report-download'].disabled = false;
  }

  #download() {
    const url = URL.createObjectURL(new Blob([this.#reportText], { type: 'text/plain;charset=utf-8' })), a = this.#doc.createElement('a');
    a.href = url; a.download = 'analysis-report.txt'; a.click(); URL.revokeObjectURL(url);
  }

  async #openVolume() {
    const status = this.#d['volume-status'];
    status.textContent = 'Loading 3D view…';
    try {
      this.#viewer?.dispose();
      const volume = VolumeBuilder.build(this.#pages.pages.filter((p) => p.status !== 'invalid').map((p) => ({ id: p.id, grid: p.grid })));
      this.#viewer = await ThreeViewer.open(this.#d['volume-view'], volume);
      status.textContent = `${volume.bounds.layers} layer(s), ${volume.voxels} written cells. Drag to rotate. NULL and unwritten cells are not drawn.`;
    } catch (e) { status.textContent = `3D view unavailable: ${e.message}`; }
  }

  #run() {
    const status = this.#d['analysis-status'], button = this.#d['btn-analysis-run'];
    status.textContent = 'Running analysis…'; button.disabled = true; this.#refreshPages();
    setTimeout(() => { // yield once so the status text paints before the computation
      try {
        const out = AnalysisRunner.run(this.#pages.pages, this.#options());
        this.#lastOut = out; this.#detailsRendered = false;
        this.#renderReport(out); this.#renderWarnings(out);
        if (!this.#d['analysis-details'].hidden) this.#renderDetails();
        status.textContent = `Done: report ready for pages ${out.usedPageIds.join(', ') || '–'} (${out.sections.length} detailed tables are hidden until you ask for them).`;
        const items = this.#d['hyp-list']; items.replaceChildren();
        for (const h of this.#tracker.list()) { const li = this.#doc.createElement('li'); li.textContent = `${h.description} (${h.status})`; items.appendChild(li); }
      } catch (e) { status.textContent = `Analysis failed: ${e.message}`; } finally { button.disabled = false; }
    }, 0);
  }
}
