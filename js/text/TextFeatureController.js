/**
 * TextFeatureController.js - UI for text <-> color pages. Writes only through
 * TextPageWriter (new pages); main app controls are locked during encoding.
 */
import PngCodec from '../PngCodec.js';
import TextSequenceBuilder from './TextSequenceBuilder.js';
import TextPageWriter from './TextPageWriter.js';
import TextPageReader from './TextPageReader.js';
import PageSaver from './PageSaver.js';
import PageFileOrder from './PageFileOrder.js';

const IDS = ['text-input', 'text-width', 'text-height', 'btn-text-encode', 'btn-text-save', 'btn-text-stop', 'text-progress', 'text-status', 'text-decode-files', 'btn-text-decode-run', 'text-output'];

export default class TextFeatureController {
  #d = {}; #app; #run = []; #stop = false; #saver;

  constructor(doc, app) {
    this.#app = app; this.#saver = new PageSaver(app.pages);
    for (const id of IDS) { const el = doc.getElementById(id); if (!el) throw new Error(`Missing element #${id}`); this.#d[id] = el; }
    this.#d['btn-text-encode'].addEventListener('click', () => this.#encode());
    this.#d['btn-text-save'].addEventListener('click', () => this.#save());
    this.#d['btn-text-stop'].addEventListener('click', () => { this.#stop = true; this.#saver.stop(); });
    this.#d['btn-text-decode-run'].addEventListener('click', () => this.#decodeRun());
    this.#d['text-decode-files'].addEventListener('change', () => this.#decodeFiles());
  }

  #say(t) { this.#d['text-status'].textContent = t; }
  #busy(b) {
    const d = this.#d;
    d['btn-text-encode'].disabled = b; d['btn-text-stop'].disabled = !b; d['btn-text-save'].disabled = b || !this.#run.length;
  }
  #progress(done, total) { this.#d['text-progress'].value = total ? Math.round((100 * done) / total) : 0; }

  async #encode() {
    const d = this.#d;
    let built;
    try { built = TextSequenceBuilder.build(d['text-input'].value); } catch (e) { this.#say(`Cannot encode: ${e.message}`); return; }
    if (!built.units.length) { this.#say('The input is empty: nothing to encode, no pages created.'); return; }
    this.#stop = false; this.#progress(0, 1); this.#busy(true); this.#app.setLocked(true);
    this.#say(`Encoding ${built.units.length} word(s), ${built.symbolCount} cells…`);
    try {
      const res = await new TextPageWriter(this.#app.pages).write(built.units, {
        width: Number(d['text-width'].value), height: Number(d['text-height'].value), shouldStop: () => this.#stop,
        onProgress: ({ wordsDone, wordsTotal, pages }) => { this.#progress(wordsDone, wordsTotal); this.#say(`Encoding: word ${wordsDone} of ${wordsTotal}, page ${pages}…`); },
      });
      this.#run = res.pages.map((page, i) => ({ number: i + 1, page }));
      this.#progress(res.stopped ? 0 : 1, 1);
      this.#say(res.stopped ? `Stopped: ${res.pages.length} page(s) hold an incomplete encoding. Do not use them as a complete text.` : `Done: ${res.words} word(s) encoded into ${res.pages.length} page(s) (Text 0001 … ${String(res.pages.length).padStart(4, '0')}).`);
    } catch (e) { this.#say(`Encoding failed: ${e.message}`); }
    finally { this.#app.setLocked(false); this.#app.refresh(); this.#busy(false); }
  }

  async #save() {
    if (this.#saver.running) return;
    this.#busy(true); this.#d['btn-text-stop'].disabled = false;
    try {
      const r = await this.#saver.saveAll(this.#run, { onProgress: ({ current, index, total }) => { this.#progress(index - 1, total); this.#say(`Starting download of page ${current} (${index} of ${total})…`); } });
      this.#progress(r.started.length, r.total);
      const parts = [`${r.started.length} of ${r.total} download(s) started — the browser cannot confirm they finished, please check your downloads folder`];
      if (r.failed.length) parts.push(`FAILED pages: ${r.failed.map((f) => `${f.number} (${f.reason})`).join(', ')}`);
      if (r.interrupted) parts.push(`not attempted (stopped): pages ${r.notAttempted.join(', ')}`);
      this.#say(parts.join('. ') + '.');
    } catch (e) { this.#say(`Save failed: ${e.message}`); }
    finally { this.#busy(false); }
  }

  #show(res, note = '') {
    this.#d['text-output'].value = res.ok ? res.text : '';
    this.#say(res.ok ? `Decoded ${res.words.length} word(s) from ${res.pagesRead} page(s).${note}` : `Cannot decode: ${res.errors.map((e) => `page ${e.page}${e.unit ? `, unit ${e.unit}` : ''}${e.name ? ` (${e.name})` : ''}: ${e.reason}`).join(' | ')}`);
  }

  #decodeRun() {
    if (!this.#run.length) { this.#say('No generated pages yet: encode some text first, or choose PNG files.'); return; }
    this.#show(TextPageReader.decode(this.#run.map((e) => ({ name: `page ${e.number}`, grid: e.page.grid }))));
  }

  async #decodeFiles() {
    const input = this.#d['text-decode-files'], files = [...input.files];
    if (!files.length) return;
    const { ordered, byNumber } = PageFileOrder.sort(files);
    const pages = [];
    for (const f of ordered) {
      const png = await PngCodec.decode(new Uint8Array(await f.arrayBuffer()));
      if (!png.ok) { this.#d['text-output'].value = ''; this.#say(`Cannot decode: ${f.name}: ${png.reason}`); input.value = ''; return; }
      pages.push({ name: f.name, grid: png.grid });
    }
    input.value = '';
    this.#show(TextPageReader.decode(pages), byNumber ? '' : ' Warning: file names have no page numbers, so the selection order was used.');
  }
}
