/**
 * AnalysisRunner.js - DOM-free orchestrator. Turns the analyzers' results into
 * generic "section" descriptors {id, analysis, title, kind, notes, columns, rows,
 * emptyText, truncated}; rows may carry `details` (strings, e.g. source
 * locations, 1-based for display). kind: observation | statistic | interpretation.
 * Reads pages only; nothing is written back.
 */
import Palette from '../Palette.js';
import PageCorpus from './PageCorpus.js';
import FrequencyAnalyzer from './FrequencyAnalyzer.js';
import NGramAnalyzer from './NGramAnalyzer.js';
import RepeatedSubstringFinder from './RepeatedSubstringFinder.js';
import ApproxMatcher from './ApproxMatcher.js';
import HierarchicalClusterer from './HierarchicalClusterer.js';
import InformationMeasures from './InformationMeasures.js';
import MarkovModel from './MarkovModel.js';
import MarkovEvaluator from './MarkovEvaluator.js';
import PermutationTester, { BASELINES } from './PermutationTester.js';
import SpatialAnalyzer from './SpatialAnalyzer.js';

export const ANALYSES = Object.freeze(['frequency', 'ngram', 'repeats', 'approx', 'clustering', 'information', 'markov', 'baseline', 'spatial', 'hypotheses']);
const DEFAULTS = { analyses: ANALYSES, pageIds: null, minCount: 2, n: 2, minLength: 3, maxResults: 100, threshold: 0.75, simulations: 500, seed: 1,
  topK: 15, maxDistance: 4, markovOrder: 1, orders: [0, 1, 2], split: { mode: 'page', testFraction: 0.3, seed: 1 }, hypotheses: null };
const symbols = (a) => a.join(' ');
const at = (r) => `page ${r.pageId} · unit ${r.unitIndex + 1} · symbol ${r.symbolIndex + 1} · row ${r.row + 1}, col ${r.col + 1}`;
const cell = (p) => `page ${p.pageId} · row ${p.row + 1}, col ${p.col + 1}`;
const col = (key, label, numeric = false) => ({ key, label, numeric });

export default class AnalysisRunner {
  static run(pages, options = {}) {
    const o = { ...DEFAULTS, ...options, split: { ...DEFAULTS.split, ...(options.split ?? {}) } };
    const warnings = [], sections = [], raw = {};
    const used = pages.filter((p) => p.status !== 'invalid' && (!o.pageIds || o.pageIds.includes(p.id)));
    const excluded = pages.length - used.length;
    if (!used.length) return { sections, warnings: ['No analyzable pages selected (invalid pages are always excluded).'], usedPageIds: [], excludedPages: excluded };
    if (excluded) warnings.push(`${excluded} page(s) not analyzed (not selected or invalid).`);
    const corpus = PageCorpus.fromPages(used), units = PageCorpus.units(corpus), seqs = InformationMeasures.sequencesOf(units);
    raw.units = units; raw.sequences = seqs; raw.pageCount = used.length;
    if (!units.length) warnings.push('The selected pages contain no completed units; most analyses will be empty.');
    const want = (a) => o.analyses.includes(a);
    const add = (analysis, title, kind, columns, rows, extra = {}) => sections.push({ id: `${analysis}-${sections.length}`, analysis, title, kind, columns, rows, notes: [], emptyText: null, truncated: false, ...extra });

    if (want('frequency')) {
      const f = FrequencyAnalyzer.analyze(corpus); raw.frequency = f;
      add('frequency', 'Symbol frequencies', 'observation', [col('symbol', 'Symbol (color code)'), col('count', 'Count', true), col('share', 'Share', true), col('units', 'Units containing', true), col('distinct', 'Distinct units containing', true)],
        f.symbols.map((s) => ({ symbol: `${s.code} ${s.label}`, count: s.count, share: s.relative, units: s.unitsContaining, distinct: s.distinctUnitsContaining })), { notes: ['Terminators and NULL cells are structure, not data symbols.'] });
      add('frequency', 'Unit-length distribution', 'observation', [col('length', 'Length', true), col('count', 'Units', true), col('share', 'Share', true)], f.lengthDistribution.map((l) => ({ length: l.length, count: l.count, share: l.relative })));
      add('frequency', 'Structural markers (reported separately)', 'observation', [col('marker', 'Marker'), col('count', 'Count', true)],
        [['Terminators', f.structure.terminators], ['NULL cells', f.structure.nullCells], ['Unwritten cells', f.structure.unwrittenCells], ['Incomplete units', f.structure.incompleteUnits], ['Empty units', f.structure.emptyUnits]].map(([marker, count]) => ({ marker, count })));
      add('frequency', 'Most frequent complete units', 'observation', [col('unit', 'Unit'), col('length', 'Length', true), col('count', 'Count', true)],
        f.unitFrequencies.filter((u) => u.count >= o.minCount).slice(0, o.maxResults).map((u) => ({ unit: symbols(u.symbols) || '(empty)', length: u.length, count: u.count,
          details: u.refs.map((r) => `page ${r.pageId} · unit ${r.unitIndex + 1} (column ${r.column + 1}, row ${(r.row ?? 0) + 1})`) })),
        { notes: [`${f.uniqueUnits} distinct units; ${f.repeatedDistinctUnits} occur more than once (${f.repeatedUnitInstances} of ${f.completeUnits} units).`], emptyText: 'No unit occurs at least the minimum number of times.' });
    }
    if (want('ngram')) {
      const g = NGramAnalyzer.symbolNgrams(units, { n: o.n, minCount: o.minCount, maxResults: o.maxResults });
      add('ngram', `Symbol ${o.n}-grams inside units`, 'observation', [col('gram', 'n-gram'), col('count', 'Count', true), col('units', 'Units', true), col('distinct', 'Distinct units', true), col('lift', 'Lift vs independence', true)],
        g.results.map((e) => ({ gram: symbols(e.symbols), count: e.count, units: e.units, distinct: e.distinctUnits, lift: e.lift, details: e.positions.map(at) })), { truncated: g.truncated, notes: ['Never crosses a unit boundary or a NULL/unwritten gap.'] });
      const m = NGramAnalyzer.multiUnitNgrams(units, { n: Math.max(2, o.n), minCount: o.minCount, maxResults: o.maxResults });
      add('ngram', `Repeated sequences of ${Math.max(2, o.n)} consecutive units`, 'observation', [col('seq', 'Unit sequence'), col('count', 'Count', true)],
        m.results.map((e) => ({ seq: e.units.map((u) => symbols(u) || '(empty)').join(' | '), count: e.count, details: e.positions.map((p) => `page ${p.pageId} · units from ${p.firstUnitIndex + 1} (columns ${p.columns.map((c) => c + 1).join(', ')})`) })), { truncated: m.truncated, notes: ['Unit order within a page is column by column. Sequences never span pages.'] });
    }
    if (want('repeats')) {
      const r = RepeatedSubstringFinder.find(units, { minLength: o.minLength, minCount: o.minCount, maxResults: o.maxResults }); raw.repeats = r;
      add('repeats', 'Repeated substrings (suffix array + LCP)', 'observation', [col('pattern', 'Pattern'), col('length', 'Length', true), col('occ', 'Occurrences', true), col('non', 'Non-overlapping', true), col('distinct', 'Distinct units', true)],
        r.results.map((e) => ({ pattern: symbols(e.symbols), length: e.length, occ: e.occurrences, non: e.nonOverlapping, distinct: e.distinctUnitsContaining, details: e.refs.map(at) })), { truncated: r.truncated, notes: ['Right-maximal repeats; overlapping occurrences are counted separately from non-overlapping ones.'] });
    }
    if (want('approx')) {
      const a = ApproxMatcher.group(units, { threshold: o.threshold }); raw.approx = a;
      add('approx', `Approximate-match groups (similarity >= ${o.threshold})`, 'observation', [col('rep', 'Most frequent member'), col('size', 'Distinct units', true), col('inst', 'Instances', true), col('members', 'Members')],
        a.clusters.slice(0, o.maxResults).map((c) => ({ rep: symbols(c.members[0].symbols), size: c.size, inst: c.instances, members: c.members.map((m) => `${symbols(m.symbols)} (x${m.count})`).join('; '),
          details: c.edges.map((e) => `${e.a.replaceAll(',', ' ')} ↔ ${e.b.replaceAll(',', ' ')}: distance ${e.distance}, similarity ${e.similarity.toFixed(3)}${e.hamming === null ? '' : `, Hamming ${e.hamming}`}; ${e.differences.map((d) => `${d.op} ${d.a ?? ''}${d.op === 'substitute' ? '→' : ''}${d.b ?? ''}`).join(', ')}`) })),
        { truncated: a.truncated, notes: ['Similarity is a surface measure and is not evidence of shared meaning.'] });
    }
    if (want('clustering')) {
      const cl = HierarchicalClusterer.cluster(units, { cutDistance: 1 - o.threshold }); raw.clusters = cl;
      add('clustering', `Hierarchical clusters (average linkage, cut at distance ${(1 - o.threshold).toFixed(2)})`, 'observation',
        [col('rep', 'Most frequent member'), col('size', 'Distinct units', true), col('inst', 'Instances', true), col('len', 'Length range'), col('start', 'Shared start'), col('end', 'Shared end'), col('diff', 'Differing positions'), col('dist', 'Mean internal distance', true)],
        cl.clusters.slice(0, o.maxResults).map((c) => ({ rep: symbols(c.members[0].symbols), size: c.size, inst: c.instances, len: c.lengthRange[0] === c.lengthRange[1] ? String(c.lengthRange[0]) : `${c.lengthRange[0]}–${c.lengthRange[1]}`,
          start: symbols(c.sharedPrefix) || '–', end: symbols(c.sharedSuffix) || '–', diff: c.differingPositions ? c.differingPositions.map((p) => p + 1).join(', ') || '–' : 'lengths differ', dist: c.meanDistance, details: c.members.map((m) => `${symbols(m.symbols)} (x${m.count})`) })),
        { truncated: cl.truncated, notes: ['Grouping uses normalized edit distance (0 = identical). The shared start/end and differing positions show what drives each group. Groups carry no semantic label.'], emptyText: 'No units are similar enough at this threshold.' });
    }
    if (want('information')) {
      const IM = InformationMeasures;
      add('information', 'Entropy', 'statistic', [col('measure', 'Measure'), col('bits', 'Bits', true)],
        [['Symbol entropy H(X), plug-in', IM.symbolEntropy(seqs)], ['Symbol entropy H(X), Miller–Madow', IM.symbolEntropy(seqs, { correction: 'miller-madow' })], ['Conditional entropy H(next | previous)', IM.conditionalEntropy(seqs, 1)]].map(([measure, bits]) => ({ measure, bits })),
        { notes: ['Undefined values (no data) are shown as –.'] });
      add('information', 'Mutual information by distance', 'statistic', [col('d', 'Distance', true), col('pairs', 'Pairs', true), col('mi', 'MI (plug-in)', true), col('mic', 'MI (bias-adjusted)', true), col('norm', 'Normalized', true), col('why', 'Note')],
        IM.profile(seqs, o.maxDistance).map((p) => ({ d: p.distance, pairs: p.pairs, mi: p.mi, mic: p.miCorrected, norm: p.normalized, why: p.reason ?? '' })), { notes: ['Mutual information measures statistical association only, not causation or meaning. Sparse data biases the plug-in estimate upward.'] });
    }
    if (want('markov')) {
      const model = new MarkovModel({ order: o.markovOrder }).train(MarkovModel.tokensFromUnits(units).sequences);
      const name = (t) => (t === MarkovModel.END ? 'END' : t === MarkovModel.START ? 'START' : String(t));
      add('markov', `Markov transitions (order ${o.markovOrder}, add-1 smoothing for probabilities)`, 'statistic', [col('ctx', 'Context'), col('token', 'Next'), col('count', 'Count', true), col('p', 'Probability', true)],
        model.transitions().slice(0, o.maxResults).map((r) => ({ ctx: r.context.map(name).join(' ') || '(none)', token: name(r.token), count: r.count, p: r.probability })), { notes: ['END is the unit terminator, predicted only after complete units.'] });
      const ev = MarkovEvaluator.compare(units, { orders: o.orders, split: o.split }); raw.markov = ev;
      add('markov', 'Held-out model performance', 'statistic', [col('order', 'Order', true), col('contexts', 'Contexts', true), col('tokens', 'Held-out tokens', true), col('ce', 'Cross-entropy (bits)', true), col('pp', 'Perplexity', true), col('acc', 'Top-1 accuracy', true), col('beats', 'Beats unigram')],
        ev.results.map((r) => ({ order: r.order, contexts: r.contexts, tokens: r.tokens, ce: r.crossEntropy, pp: r.perplexity, acc: r.accuracy, beats: r.improvesOnUnigram === null ? '–' : r.improvesOnUnigram ? 'yes' : 'no' })),
        { notes: ev.ok ? [`Split by ${ev.split.mode}: train pages ${ev.split.trainPages?.join(', ') ?? '–'}, held-out pages ${ev.split.testPages?.join(', ') ?? '–'}.`, ...ev.warnings] : [`Not computed: ${ev.reason}`], emptyText: 'No held-out evaluation is possible with the current data/split.' });
    }
    if (want('baseline')) {
      const keys = new Map();
      const runs = Object.values(BASELINES).map((b) => PermutationTester.testNgrams(seqs, NGramAnalyzer.countMap, o.n, { baseline: b, simulations: o.simulations, seed: o.seed, topK: o.topK, minCount: o.minCount }));
      raw.baseline = runs; for (const run of runs) for (const r of run.results) { const e = keys.get(r.key) ?? { gram: r.key.replaceAll(',', ' '), observed: r.observed }; e[run.baseline] = r; keys.set(r.key, e); }
      const bl = (e, b, f) => e[b]?.[f] ?? null;
      add('baseline', `Do the top ${o.n}-grams beat randomized baselines? (${o.simulations} simulations, seed ${o.seed})`, 'statistic',
        [col('gram', 'n-gram'), col('obs', 'Observed', true), col('mw', 'Expected: within units', true), col('aw', 'Adj. p: within', true), col('ma', 'Expected: across units', true), col('aa', 'Adj. p: across', true), col('mi', 'Expected: iid', true), col('ai', 'Adj. p: iid', true), col('sig', 'Adj. p < 0.05 under')],
        [...keys.values()].map((e) => ({ gram: e.gram, obs: e.observed, mw: bl(e, BASELINES.SHUFFLE_WITHIN_UNITS, 'nullMean'), aw: bl(e, BASELINES.SHUFFLE_WITHIN_UNITS, 'adjustedPValue'), ma: bl(e, BASELINES.SHUFFLE_ACROSS_UNITS, 'nullMean'), aa: bl(e, BASELINES.SHUFFLE_ACROSS_UNITS, 'adjustedPValue'),
          mi: bl(e, BASELINES.IID_FREQUENCY, 'nullMean'), ai: bl(e, BASELINES.IID_FREQUENCY, 'adjustedPValue'),
          sig: Object.values(BASELINES).filter((b) => (e[b]?.adjustedPValue ?? 1) < 0.05).join(', ') || 'none' })),
        { notes: [...runs.map((r) => `${r.baseline}: H0 = ${r.nullHypothesis} Randomized: ${r.randomized}. Preserved: ${r.preserved}.`), 'Holm correction across the listed patterns. A pattern can be significant under one baseline and not another.'], emptyText: 'No pattern reaches the minimum count, or there is no data.' });
    }
    if (want('spatial')) {
      const grids = used.map((p) => ({ id: p.id, grid: p.grid }));
      const lines = ['row', 'col'].flatMap((axis) => SpatialAnalyzer.linePatterns(grids, { axis, n: Math.max(2, o.n), minCount: o.minCount, maxResults: o.maxResults }).results.map((e) => ({ axis: axis === 'row' ? 'horizontal' : 'vertical', ...e })));
      add('spatial', 'Repeated horizontal / vertical patterns', 'observation', [col('axis', 'Direction'), col('pattern', 'Cell states (0 = unwritten, 6 = terminator, 7 = NULL)'), col('occ', 'Occurrences', true), col('non', 'Non-overlapping', true)],
        lines.map((e) => ({ axis: e.axis, pattern: e.codes.join(' '), occ: e.occurrences, non: e.nonOverlapping, details: e.positions.map(cell) })), { notes: ['Spatial regularity is not evidence of linguistic meaning.'] });
      const patches = SpatialAnalyzer.patchPatterns(grids, { minCount: o.minCount, maxResults: o.maxResults });
      add('spatial', 'Repeated 2×2 local arrangements', 'observation', [col('patch', 'Rows (top / bottom)'), col('occ', 'Occurrences', true), col('non', 'Non-overlapping', true)],
        patches.results.map((e) => ({ patch: e.key.replaceAll(',', ' ').replaceAll('/', '  /  '), occ: e.occurrences, non: e.nonOverlapping, details: e.positions.map(cell) })), { truncated: patches.truncated });
      const regions = used.flatMap((p) => SpatialAnalyzer.regions(p.grid, p.id).results).sort((a, b) => b.size - a.size).slice(0, 30);
      add('spatial', 'Largest connected regions', 'observation', [col('kind', 'Kind'), col('page', 'Page', true), col('size', 'Cells', true), col('box', 'Bounding box (rows × columns)')],
        regions.map((r) => ({ kind: r.kind, page: r.pageId, size: r.size, box: `${r.bbox.top + 1}–${r.bbox.bottom + 1} × ${r.bbox.left + 1}–${r.bbox.right + 1}`, details: [`first cell: row ${r.firstCell.row + 1}, col ${r.firstCell.col + 1}`] })));
      const geo = SpatialAnalyzer.unitGeometry(units), len = geo.map((g) => g.length);
      add('spatial', 'Unit position vs length (permutation test)', 'statistic', [col('pair', 'Relationship'), col('n', 'Units', true), col('r', 'Pearson r', true), col('p', 'p (two-sided)', true), col('note', 'Note')],
        [['column vs length', geo.map((g) => g.column)], ['start row vs length', geo.map((g) => g.startRow ?? 0)]].map(([pair, xs]) => { const t = SpatialAnalyzer.correlationTest(xs, len, { simulations: o.simulations, seed: o.seed }); return { pair, n: t.n, r: t.r, p: t.pValue, note: t.warning ?? '' }; }));
    }
    if (want('hypotheses') && o.hypotheses?.list().length) {
      const res = o.hypotheses.evaluate(units, { simulations: o.simulations, seed: o.seed, split: o.split }); raw.hypotheses = res;
      add('hypotheses', 'Hypothesis evaluation', 'interpretation', [col('id', '#', true), col('desc', 'Hypothesis'), col('status', 'Status'), col('train', 'Training (obs/total, adj. p)'), col('held', 'Held-out (obs/total, p)'), col('why', 'Reason')],
        res.map((h) => ({ id: h.id, desc: h.description, status: h.status, train: h.trainResult ? `${h.trainResult.observed}/${h.trainResult.total}, ${h.trainResult.adjustedPValue.toFixed(4)}` : '–', held: h.heldOutResult ? `${h.heldOutResult.observed}/${h.heldOutResult.total}, ${h.heldOutResult.pValue.toFixed(4)}` : '–', why: h.reason ?? '',
          details: [...h.supporting.map((s) => `supports: ${s}`), ...h.contradicting.map((s) => `contradicts: ${s}`), ...h.sourceRefs.map(at)] })),
        { notes: ['Statuses come from a randomized-baseline test plus held-out replication. They are not probabilities and do not assign meaning.'] });
    } else if (want('hypotheses')) warnings.push('No hypotheses recorded yet; add one in the hypotheses form to evaluate it.');
    return { sections, warnings, usedPageIds: used.map((p) => p.id), excludedPages: excluded, raw };
  }
}
