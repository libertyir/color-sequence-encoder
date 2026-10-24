/**
 * PageSaver.js - sequential "Save All Pages": pages are exported with the
 * existing PageCollection.exportPng (lossless PNG) and handed to the normal
 * browser download one at a time, in ascending page number, as page_0001.png ...
 * A browser cannot confirm that a download finished, so success is reported as
 * "download started". No page is skipped silently; failures name the page.
 */
export default class PageSaver {
  #pages; #download; #wait; #running = false; #stop = false;

  constructor(pages, { download = PageSaver.browserDownload, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    this.#pages = pages; this.#download = download; this.#wait = wait;
  }

  get running() { return this.#running; }
  stop() { this.#stop = true; }
  static fileName(number) { return `page_${String(number).padStart(4, '0')}.png`; }

  static browserDownload(filename, bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /** entries: [{ number, page }] (any order; sorted numerically here). */
  async saveAll(entries, { onProgress, delayMs = 400 } = {}) {
    if (this.#running) throw new Error('A save operation is already running');
    this.#running = true; this.#stop = false;
    const sorted = [...entries].sort((a, b) => a.number - b.number), started = [], failed = [];
    let notAttempted = [];
    try {
      for (let i = 0; i < sorted.length; i++) {
        if (this.#stop) { notAttempted = sorted.slice(i).map((e) => e.number); break; }
        const { number, page } = sorted[i];
        onProgress?.({ current: number, index: i + 1, total: sorted.length });
        try {
          const bytes = await this.#pages.exportPng(page.id);
          await this.#download(PageSaver.fileName(number), bytes);
          started.push(number);
        } catch (e) { failed.push({ number, reason: e.message }); }
        if (i < sorted.length - 1) await this.#wait(delayMs);
      }
    } finally { this.#running = false; }
    return { total: sorted.length, started, failed, notAttempted, interrupted: notAttempted.length > 0 };
  }
}
