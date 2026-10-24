/**
 * HypothesisTracker.js - records structural hypotheses and evaluates them on
 * training data (randomized baseline) and held-out data.
 * Kinds: 'unit-prefix' (params.symbols: units start with this prefix) and
 * 'transition' (params.symbols: [a, b] occurs as a neighboring pair).
 * Decision rule (alpha, Holm-adjusted across hypotheses evaluated together):
 *   too little data -> inconclusive; train p >= alpha -> inconclusive;
 *   train significant AND held-out observed <= null mean -> contradicted;
 *   train significant AND held-out observed > null mean AND held-out p < alpha -> supported;
 *   otherwise inconclusive. No confidence scores are produced.
 * Statuses: untested | supported | contradicted | inconclusive.
 */
import PageCorpus from './PageCorpus.js';
import PermutationTester, { BASELINES } from './PermutationTester.js';
import HeldOutSplitter from './HeldOutSplitter.js';

const STATUSES = ['untested', 'supported', 'contradicted', 'inconclusive'];

function measure(h) {
  const p = h.params.symbols;
  if (h.kind === 'unit-prefix') {
    const match = (s) => s.length >= p.length && p.every((v, i) => s[i] === v);
    return { count: (seqs) => seqs.filter(match).length, total: (seqs) => seqs.filter((s) => s.length >= p.length).length, unit: 'units',
      refs: (units) => units.filter((u) => match(u.symbols)).map((u) => PageCorpus.ref(u, 0)) };
  }
  if (h.kind === 'transition') {
    const at = (s, i) => s[i] === p[0] && s[i + 1] === p[1];
    return { count: (seqs) => seqs.reduce((n, s) => n + s.slice(0, -1).filter((_, i) => at(s, i)).length, 0),
      total: (seqs) => seqs.reduce((n, s) => n + Math.max(0, s.length - 1), 0), unit: 'neighboring pairs',
      refs: (units) => units.flatMap((u) => u.symbols.slice(0, -1).map((_, i) => (at(u.symbols, i) ? PageCorpus.ref(u, i) : null)).filter(Boolean)) };
  }
  throw new RangeError(`Unsupported hypothesis kind: ${h.kind}`);
}

export default class HypothesisTracker {
  #records = new Map(); #seq = 0;

  add({ description, kind, params = {}, sourceRefs = [] }) {
    if (!description) throw new RangeError('description is required');
    measure({ kind, params }); // validates kind
    const record = Object.freeze({ id: ++this.#seq, description, kind, params: Object.freeze({ ...params }), sourceRefs: Object.freeze([...sourceRefs]),
      status: 'untested', method: null, conditions: null, supporting: Object.freeze([]), contradicting: Object.freeze([]), trainResult: null, heldOutResult: null, reason: null });
    this.#records.set(record.id, record);
    return record;
  }

  get(id) { return this.#records.get(id) ?? null; }
  list() { return [...this.#records.values()]; }

  /** Manual note/status for hypotheses the user judges by other means. */
  annotate(id, { status, supporting = [], contradicting = [], reason = null }) {
    const r = this.get(id);
    if (!r) throw new RangeError(`Unknown hypothesis ${id}`);
    if (status && !STATUSES.includes(status)) throw new RangeError(`Unknown status ${status}`);
    const next = Object.freeze({ ...r, status: status ?? r.status, reason: reason ?? r.reason, supporting: Object.freeze([...r.supporting, ...supporting]), contradicting: Object.freeze([...r.contradicting, ...contradicting]) });
    this.#records.set(id, next);
    return next;
  }

  /** Evaluate the given ids (default: all) on `units` (PageCorpus units; incomplete or gapped units are excluded). */
  evaluate(units, { ids = null, alpha = 0.05, simulations = 1000, seed = 1, baseline = BASELINES.SHUFFLE_WITHIN_UNITS, split = {}, minTotal = 10 } = {}) {
    const usable = units.filter((u) => u.complete && !u.hasGap);
    const conditions = Object.freeze({ baseline, simulations, seed, alpha, correction: 'holm', minTotal, split: { mode: 'page', ...split }, excludedUnits: units.length - usable.length });
    const parts = HeldOutSplitter.split(usable, conditions.split);
    const targets = (ids ?? [...this.#records.keys()]).map((id) => this.get(id)).filter(Boolean);
    const rate = (r, total) => ({ observed: r.observed, total, rate: total ? r.observed / total : null, expectedRate: total ? r.nullMean / total : null,
      nullMean: r.nullMean, nullSd: r.nullSd, effect: r.effect, pValue: r.pValue, baseline, simulations, seed });
    const run = (m, seqs) => {
      const total = m.total(seqs);
      if (total < minTotal) return { insufficient: true, total };
      return { insufficient: false, total, r: PermutationTester.run(seqs, (s) => new Map([['count', m.count(s)]]), { baseline, simulations, seed, alternative: 'greater' }).results[0] };
    };

    const staged = targets.map((h) => {
      if (!parts.ok) return { h, fail: `no held-out split possible: ${parts.reason}` };
      const m = measure(h), train = run(m, parts.train.map((u) => u.symbols.slice())), test = run(m, parts.test.map((u) => u.symbols.slice()));
      return { h, m, train, test };
    });
    const valid = staged.filter((s) => !s.fail && !s.train.insufficient);
    const adj = PermutationTester.adjust(valid.map((s) => s.train.r.pValue), 'holm');
    valid.forEach((s, i) => { s.adjusted = adj[i]; });

    return staged.map((s) => {
      const base = { ...s.h, method: 'permutation test vs randomized baseline + held-out replication', conditions };
      let status = 'inconclusive', reason, trainResult = null, heldOutResult = null, supporting = [], contradicting = [];
      if (s.fail) reason = s.fail;
      else if (s.train.insufficient) reason = `training data too small (${s.train.total} ${s.m.unit} < ${minTotal})`;
      else {
        trainResult = { ...rate(s.train.r, s.train.total), adjustedPValue: s.adjusted, pages: parts.trainPages ?? null };
        const note = `train: ${s.train.r.observed} of ${s.train.total} ${s.m.unit} (expected ${s.train.r.nullMean.toFixed(2)} under baseline), p=${s.train.r.pValue.toFixed(4)}, adjusted p=${s.adjusted.toFixed(4)}`;
        if (s.test.insufficient) reason = `held-out data too small (${s.test.total} ${s.m.unit} < ${minTotal}); cannot judge replication`;
        else heldOutResult = { ...rate(s.test.r, s.test.total), pages: parts.testPages ?? null };
        if (s.adjusted >= alpha) reason = 'not significant on training data under this baseline';
        else if (heldOutResult) {
          const hnote = `held-out: ${s.test.r.observed} of ${s.test.total} ${s.m.unit} (expected ${s.test.r.nullMean.toFixed(2)}), p=${s.test.r.pValue.toFixed(4)}`;
          if (s.test.r.observed <= s.test.r.nullMean) { status = 'contradicted'; reason = 'effect absent or reversed on held-out data'; contradicting = [hnote]; supporting = [note]; }
          else if (s.test.r.pValue < alpha) { status = 'supported'; reason = 'significant on training data and replicated on held-out data'; supporting = [note, hnote]; }
          else { reason = 'effect direction replicates on held-out data but is not significant there'; supporting = [note]; contradicting = [hnote]; }
        }
      }
      const refs = s.m ? s.m.refs(parts.ok ? parts.train : []).slice(0, 10) : [];
      const record = Object.freeze({ ...base, status, reason, trainResult, heldOutResult, supporting: Object.freeze(supporting), contradicting: Object.freeze(contradicting), sourceRefs: Object.freeze([...s.h.sourceRefs, ...refs]) });
      this.#records.set(record.id, record);
      return record;
    });
  }
}
