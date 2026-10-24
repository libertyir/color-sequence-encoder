/**
 * MarkovModel.js - order-k Markov model over tokens 1..5 (data symbols) and
 * END (6, the unit terminator, predicted only after COMPLETE units). Contexts
 * are padded with START (0) so unit beginnings are modeled explicitly.
 * Smoothing: 'add-k' (default k = 1, i.e. Laplace) over the 6 predictable
 * tokens, or 'none' (unseen contexts/tokens have probability 0 or null).
 * Units containing a NULL/white gap are skipped and counted, never bridged.
 */
export default class MarkovModel {
  static START = 0;
  static END = 6;
  static VOCAB = Object.freeze([1, 2, 3, 4, 5, 6]);

  #order; #smoothing; #k; #counts = new Map(); #totals = new Map();

  constructor({ order = 1, smoothing = 'add-k', k = 1 } = {}) {
    if (!Number.isInteger(order) || order < 0) throw new RangeError('order must be an integer >= 0');
    if (smoothing !== 'add-k' && smoothing !== 'none') throw new RangeError('smoothing must be "add-k" or "none"');
    if (!(k > 0)) throw new RangeError('k must be > 0');
    this.#order = order; this.#smoothing = smoothing; this.#k = k;
  }

  get order() { return this.#order; }
  get contextCount() { return this.#counts.size; }

  /** units -> token sequences (symbols + END for complete units). */
  static tokensFromUnits(units) {
    const sequences = []; let skippedUnitsWithGap = 0;
    for (const u of units) {
      if (u.hasGap) { skippedUnitsWithGap++; continue; }
      sequences.push(u.complete ? [...u.symbols, MarkovModel.END] : [...u.symbols]);
    }
    return { sequences, skippedUnitsWithGap };
  }

  #context(seq, i) {
    const ctx = [];
    for (let j = i - this.#order; j < i; j++) ctx.push(j < 0 ? MarkovModel.START : seq[j]);
    return ctx;
  }

  train(sequences) {
    for (const seq of sequences) for (let i = 0; i < seq.length; i++) {
      const key = this.#context(seq, i).join(',');
      let row = this.#counts.get(key);
      if (!row) { row = new Map(); this.#counts.set(key, row); this.#totals.set(key, 0); }
      row.set(seq[i], (row.get(seq[i]) ?? 0) + 1); this.#totals.set(key, this.#totals.get(key) + 1);
    }
    return this;
  }

  probability(context, token) {
    const key = context.join(','), row = this.#counts.get(key), total = this.#totals.get(key) ?? 0, c = row?.get(token) ?? 0;
    if (this.#smoothing === 'none') return total ? c / total : null;
    return (c + this.#k) / (total + this.#k * MarkovModel.VOCAB.length);
  }

  distribution(context) { return MarkovModel.VOCAB.map((token) => ({ token, probability: this.probability(context, token) })); }

  /** Most probable next token (ties: lowest token), or null when undefined. */
  predict(context) {
    let best = null;
    for (const { token, probability } of this.distribution(context)) if (probability !== null && (best === null || probability > best.probability)) best = { token, probability };
    return best;
  }

  transitions() {
    const rows = [];
    for (const [context, row] of this.#counts) for (const [token, count] of row) {
      rows.push({ context: context.split(',').filter((x) => x !== '').map(Number), token, count, probability: this.probability(context.split(',').filter((x) => x !== '').map(Number), token) });
    }
    return rows.sort((a, b) => a.context.join().localeCompare(b.context.join()) || a.token - b.token);
  }

  evaluate(sequences) {
    let tokens = 0, zero = 0, correct = 0, ll = 0;
    for (const seq of sequences) for (let i = 0; i < seq.length; i++) {
      const ctx = this.#context(seq, i), p = this.probability(ctx, seq[i]);
      tokens++;
      if (p === null || p === 0) zero++; else ll += Math.log2(p);
      if (this.predict(ctx)?.token === seq[i]) correct++;
    }
    const defined = tokens > 0 && zero === 0;
    return { tokens, zeroProbabilityTokens: zero, accuracy: tokens ? correct / tokens : null,
      crossEntropy: defined ? -ll / tokens : null, perplexity: defined ? 2 ** (-ll / tokens) : null,
      reason: tokens === 0 ? 'no tokens to evaluate' : zero ? 'zero-probability tokens: use smoothing for a finite score' : null };
  }
}
