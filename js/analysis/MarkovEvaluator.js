/**
 * MarkovEvaluator.js - trains Markov models of several orders on a training
 * split and scores them on held-out data (cross-entropy in bits/token).
 * Predictability is a statistical property, not evidence of meaning.
 */
import MarkovModel from './MarkovModel.js';
import HeldOutSplitter from './HeldOutSplitter.js';

export default class MarkovEvaluator {
  static compare(units, { orders = [0, 1, 2], smoothing = 'add-k', k = 1, split = {} } = {}) {
    const parts = HeldOutSplitter.split(units, split);
    if (!parts.ok) return { ok: false, reason: parts.reason, results: [] };
    const train = MarkovModel.tokensFromUnits(parts.train), test = MarkovModel.tokensFromUnits(parts.test);
    const results = orders.map((order) => {
      const model = new MarkovModel({ order, smoothing, k }).train(train.sequences);
      return { order, contexts: model.contextCount, ...model.evaluate(test.sequences) };
    });
    const unigram = results.find((r) => r.order === 0);
    for (const r of results) r.improvesOnUnigram = unigram && r.order > 0 && r.crossEntropy !== null && unigram.crossEntropy !== null ? r.crossEntropy < unigram.crossEntropy : null;
    const scored = results.filter((r) => r.crossEntropy !== null);
    const warnings = [];
    if (test.sequences.reduce((n, s) => n + s.length, 0) < 30) warnings.push('held-out set has fewer than 30 tokens; conclusions are weak');
    if (train.skippedUnitsWithGap + test.skippedUnitsWithGap) warnings.push('units containing gaps were skipped');
    return { ok: true, split: { mode: parts.mode, seed: parts.seed, trainPages: parts.trainPages, testPages: parts.testPages, trainUnits: parts.train.length, testUnits: parts.test.length },
      smoothing, k, results, bestOrder: scored.length ? scored.reduce((a, b) => (b.crossEntropy < a.crossEntropy ? b : a)).order : null, warnings };
  }
}
