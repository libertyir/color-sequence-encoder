/**
 * PermutationTester.js - randomized-baseline (Monte Carlo permutation) tests.
 * `statistic(sequences) -> Map<string, number>` is evaluated on the observed
 * data and on each randomized dataset. p = (k + 1) / (N + 1), k = number of
 * simulations at least as extreme as observed. Seeded => reproducible.
 */
import SeededRandom from './SeededRandom.js';

export const BASELINES = Object.freeze({
  SHUFFLE_WITHIN_UNITS: 'shuffle-within-units',
  SHUFFLE_ACROSS_UNITS: 'shuffle-across-units',
  IID_FREQUENCY: 'iid-frequency',
});

const DESCRIPTIONS = {
  [BASELINES.SHUFFLE_WITHIN_UNITS]: {
    nullHypothesis: 'Symbol order inside each unit carries no structure beyond which symbols the unit contains.',
    randomized: 'order of symbols inside every unit', preserved: 'unit lengths, each unit\'s symbol multiset',
  },
  [BASELINES.SHUFFLE_ACROSS_UNITS]: {
    nullHypothesis: 'Symbols are assigned to positions independently of unit and order.',
    randomized: 'all symbols pooled and redistributed', preserved: 'global symbol frequencies, unit lengths',
  },
  [BASELINES.IID_FREQUENCY]: {
    nullHypothesis: 'Every position is an independent draw from the global symbol distribution.',
    randomized: 'every symbol', preserved: 'unit lengths, expected (not exact) symbol frequencies',
  },
};

export default class PermutationTester {
  static randomize(sequences, baseline, rng) {
    if (baseline === BASELINES.SHUFFLE_WITHIN_UNITS) return sequences.map((s) => rng.shuffle(s.slice()));
    const pool = sequences.flat();
    if (baseline === BASELINES.SHUFFLE_ACROSS_UNITS) {
      rng.shuffle(pool);
      let at = 0;
      return sequences.map((s) => { const out = pool.slice(at, at + s.length); at += s.length; return out; });
    }
    if (baseline === BASELINES.IID_FREQUENCY) return sequences.map((s) => s.map(() => pool[rng.int(pool.length)]));
    throw new RangeError(`Unknown baseline: ${baseline}`);
  }

  /** Holm (FWER) or Benjamini-Hochberg (FDR) adjusted p-values, same order as input. */
  static adjust(pValues, method = 'holm') {
    const m = pValues.length, order = pValues.map((p, i) => i).sort((a, b) => pValues[a] - pValues[b]), out = new Array(m);
    if (method === 'holm') {
      let run = 0;
      order.forEach((idx, r) => { run = Math.max(run, Math.min(1, pValues[idx] * (m - r))); out[idx] = run; });
    } else if (method === 'bh') {
      let run = 1;
      for (let r = m - 1; r >= 0; r--) { const idx = order[r]; run = Math.min(run, pValues[idx] * m / (r + 1)); out[idx] = Math.min(1, run); }
    } else throw new RangeError(`Unknown correction method: ${method}`);
    return out;
  }

  static run(sequences, statistic, { baseline = BASELINES.SHUFFLE_WITHIN_UNITS, simulations = 1000, seed = 1, alternative = 'greater', correction = 'holm', keys = null } = {}) {
    const description = DESCRIPTIONS[baseline];
    if (!description) throw new RangeError(`Unknown baseline: ${baseline}`);
    const observed = statistic(sequences), tested = keys ?? [...observed.keys()];
    const meta = { baseline, ...description, simulations, seed, alternative, correction };
    if (!sequences.length || !tested.length) return { ...meta, results: [], warning: 'No data to test' };

    const rng = new SeededRandom(seed);
    const acc = new Map(tested.map((k) => [k, { ge: 0, le: 0, sum: 0, sumSq: 0, min: Infinity, max: -Infinity }]));
    for (let s = 0; s < simulations; s++) {
      const sim = statistic(PermutationTester.randomize(sequences, baseline, rng));
      for (const k of tested) {
        const v = sim.get(k) ?? 0, a = acc.get(k), o = observed.get(k) ?? 0;
        if (v >= o) a.ge++;
        if (v <= o) a.le++;
        a.sum += v; a.sumSq += v * v; a.min = Math.min(a.min, v); a.max = Math.max(a.max, v);
      }
    }
    const rows = tested.map((k) => {
      const a = acc.get(k), o = observed.get(k) ?? 0, mean = a.sum / simulations;
      const sd = Math.sqrt(Math.max(0, a.sumSq / simulations - mean * mean));
      const pg = (a.ge + 1) / (simulations + 1), pl = (a.le + 1) / (simulations + 1);
      const pValue = alternative === 'greater' ? pg : alternative === 'less' ? pl : Math.min(1, 2 * Math.min(pg, pl));
      return { key: k, observed: o, nullMean: mean, nullSd: sd, nullMin: a.min, nullMax: a.max, effect: o - mean,
        zScore: sd > 0 ? (o - mean) / sd : null, observedOverExpected: mean > 0 ? o / mean : null, pValue };
    });
    const adjusted = PermutationTester.adjust(rows.map((r) => r.pValue), correction);
    rows.forEach((r, i) => { r.adjustedPValue = adjusted[i]; });
    rows.sort((a, b) => a.pValue - b.pValue || String(a.key).localeCompare(String(b.key)));
    return { ...meta, results: rows };
  }

  /** Convenience: test n-gram counts of the `topK` most frequent observed n-grams. */
  static testNgrams(sequences, countMap, n, { topK = 20, minCount = 2, ...options } = {}) {
    const observed = countMap(sequences, n);
    const keys = [...observed].filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topK).map(([k]) => k);
    return PermutationTester.run(sequences, (seqs) => countMap(seqs, n), { ...options, keys });
  }
}
