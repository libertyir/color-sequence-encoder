/**
 * InformationMeasures.js - entropy, conditional entropy and mutual information
 * (bits, log base 2). Pairs/windows never cross a unit boundary or NULL gap:
 * pass gap-free symbol arrays (see sequencesOf).
 * MI is an association measure; it implies neither causation nor meaning.
 * Estimators: 'plugin' (maximum likelihood, biased upward on sparse data) and
 * Miller-Madow corrections, both reported so sparsity is visible.
 */
import PageCorpus from './PageCorpus.js';
import PermutationTester, { BASELINES } from './PermutationTester.js';

const LN2 = Math.log(2);

export default class InformationMeasures {
  /** Gap-free symbol arrays from units. */
  static sequencesOf(units) { return PageCorpus.segments(units).map((s) => s.symbols); }

  /** Shannon entropy of counts (Map or array); null when there is no data. */
  static entropy(counts, { correction = 'plugin' } = {}) {
    const values = [...(counts instanceof Map ? counts.values() : counts)].filter((c) => c > 0);
    const n = values.reduce((a, b) => a + b, 0);
    if (n === 0) return null;
    let h = 0;
    for (const c of values) h -= (c / n) * Math.log2(c / n);
    if (correction === 'miller-madow') h += (values.length - 1) / (2 * n * LN2);
    return h + 0;
  }

  static symbolEntropy(sequences, options) {
    const counts = new Map();
    for (const s of sequences) for (const v of s) counts.set(v, (counts.get(v) ?? 0) + 1);
    return InformationMeasures.entropy(counts, options);
  }

  /** H(next | previous `order` symbols), estimated from windows inside sequences. */
  static conditionalEntropy(sequences, order = 1) {
    const joint = new Map(), ctx = new Map();
    for (const s of sequences) for (let i = 0; i + order < s.length; i++) {
      const c = s.slice(i, i + order).join(','), j = `${c}>${s[i + order]}`;
      joint.set(j, (joint.get(j) ?? 0) + 1); ctx.set(c, (ctx.get(c) ?? 0) + 1);
    }
    const hj = InformationMeasures.entropy(joint);
    return hj === null ? null : hj - InformationMeasures.entropy(ctx);
  }

  static mutualInformation(sequences, distance = 1, { correction = 'both' } = {}) {
    if (!Number.isInteger(distance) || distance < 1) throw new RangeError('distance must be a positive integer');
    const joint = new Map(), left = new Map(), right = new Map();
    let n = 0;
    for (const s of sequences) for (let i = 0; i + distance < s.length; i++) {
      const x = s[i], y = s[i + distance], k = `${x},${y}`;
      joint.set(k, (joint.get(k) ?? 0) + 1); left.set(x, (left.get(x) ?? 0) + 1); right.set(y, (right.get(y) ?? 0) + 1); n++;
    }
    if (n === 0) return { distance, pairs: 0, mi: null, miCorrected: null, normalized: null, hx: null, hy: null, reason: 'no symbol pairs at this distance' };
    let mi = 0;
    for (const [k, c] of joint) { const [x, y] = k.split(',').map(Number); mi += (c / n) * Math.log2((c * n) / (left.get(x) * right.get(y))); }
    mi = Math.max(0, mi) + 0;
    const hx = InformationMeasures.entropy(left), hy = InformationMeasures.entropy(right), floor = Math.min(hx, hy);
    const bias = (joint.size - left.size - right.size + 1) / (2 * n * LN2);
    return { distance, pairs: n, mi, miCorrected: mi - bias, normalized: floor > 0 ? mi / floor : null, hx, hy, reason: null };
  }

  static profile(sequences, maxDistance = 5) {
    return Array.from({ length: maxDistance }, (_, i) => InformationMeasures.mutualInformation(sequences, i + 1));
  }

  /** Permutation test of MI at one distance against a randomized baseline. */
  static testMutualInformation(sequences, distance = 1, { baseline = BASELINES.SHUFFLE_WITHIN_UNITS, ...options } = {}) {
    const name = `MI@${distance}`;
    return PermutationTester.run(sequences, (seqs) => new Map([[name, InformationMeasures.mutualInformation(seqs, distance).mi ?? 0]]), { baseline, ...options });
  }
}
