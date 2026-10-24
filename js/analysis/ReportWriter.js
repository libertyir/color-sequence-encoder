/**
 * ReportWriter.js - turns AnalysisRunner output (`out.raw`) into a plain-language
 * report in Persian ('fa') or English ('en'). Every sentence is generated from
 * computed numbers; nothing is translated into meaning. Colors are named, not
 * numbered. The overall "evidence level" is a rule-based summary (see
 * docs/ANALYSIS_GUIDE.md), NOT a probability.
 */
import Palette from '../Palette.js';
import InformationMeasures from './InformationMeasures.js';
import { BASELINES } from './PermutationTester.js';

const FA = { 1: 'سبزآبی', 2: 'آبی آسمانی', 3: 'زرد', 4: 'نارنجی', 5: 'کرم', 6: 'فیروزه‌ای (پایان)' };
const pct = (x) => `${(x * 100).toFixed(0)}%`, num = (x, d = 2) => (x === null || x === undefined ? '–' : Number(x).toFixed(d));
const level = (x, l) => (x < 0.05 ? l.negligible : x < 0.2 ? l.weak : x < 0.5 ? l.moderate : l.strong);

const TEXT = {
  fa: {
    dir: 'rtl', title: 'گزارش به زبان ساده', verdictTitle: 'جمع‌بندی', levels: { none: 'هیچ شاهدی', weak: 'شاهد ضعیف', moderate: 'شاهد متوسط', strong: 'شاهد قوی' },
    mi: { negligible: 'ناچیز', weak: 'ضعیف', moderate: 'متوسط', strong: 'قوی' },
    verdict: (lv, ind, tests) => `شاهد وجود ساختار غیرتصادفی در این داده‌ها: ${lv}. نشانه‌های برآورده‌شده: ${ind.length ? ind.join('؛ ') : 'هیچ‌کدام'}. توجه: ${tests} آزمون بررسی شده و برخی نتایج «معنادار» ممکن است تصادفی باشند. این جمع‌بندی احتمال نیست و معنای نمادها را مشخص نمی‌کند.`,
    indicators: { baseline: 'الگوی فراتر از تصادف در دو مدل تصادفی', markov: 'پیش‌بینی بهتر رنگ بعدی روی داده‌های دیده‌نشده', hypothesis: 'فرضیه‌ای که روی داده‌های کنارگذاشته هم برقرار ماند' },
    data: (p, u, s) => ({ h: 'داده‌های تحلیل‌شده', d: `${p} صفحه، ${u} واحد کامل و ${s} نماد رنگی.` }),
    small: ['حجم داده بسیار کم است؛ نتایج آماری قابل اتکا نیستند.', 'حجم داده کم است؛ نتایج را محتاطانه بخوانید.'],
    even: (e) => ({ h: 'استفاده از رنگ‌ها', d: `رنگ‌ها تقریباً یکنواخت استفاده شده‌اند (یکنواختی ${e})؛ ترجیح مشخصی دیده نمی‌شود.` }),
    uneven: (a, pa, b, pb, e) => ({ h: 'استفاده از رنگ‌ها', d: `رنگ ${a} با ${pa} بیشترین و رنگ ${b} با ${pb} کمترین فراوانی را دارد؛ استفاده نابرابر است (یکنواختی ${e}).` }),
    lengths: (mn, mx, mode, ms, mean, emp) => ({ h: 'طول واحدها', d: `طول واحدها از ${mn} تا ${mx} است؛ رایج‌ترین طول ${mode} (${ms} واحدها) و میانگین ${mean}.${emp ? ` ${emp} واحدها تهی‌اند (فقط پایان‌دهنده).` : ''}` }),
    repUnits: (p, d) => ({ h: 'واحدهای تکراری', d: `${p} واحدها نسخهٔ دقیق واحد دیگری هستند (${d} واحد متمایز تکرار شده‌اند).` }),
    repUnitsCav: 'واحدهای کوتاه به‌طور تصادفی هم زیاد تکرار می‌شوند؛ برای قضاوت به آزمون خط پایه نگاه کنید.',
    repeat: (len, seq, occ, non) => ({ h: 'الگوی تکراری بلند', d: `بلندترین الگوی تکراری ${len} رنگ دارد (${seq}) و ${occ} بار دیده شده (${non} بار بدون هم‌پوشانی).` }),
    noRepeat: (m) => ({ h: 'الگوی تکراری بلند', d: `الگوی تکراری با طول دست‌کم ${m} رنگ پیدا نشد.` }),
    baseOk: (t, w, a, i, sim) => ({ h: 'آیا الگوها فراتر از تصادف‌اند؟', d: `${t} الگوی پرتکرار با سه مدل تصادفی مقایسه شد (${sim} شبیه‌سازی). معنادار (p تصحیح‌شده < 0.05) زیر «ترتیب درون واحد»: ${w}؛ زیر «توزیع رنگ‌ها بین واحدها»: ${a}؛ زیر «انتخاب مستقل رنگ‌ها»: ${i}.` }),
    baseNo: { h: 'آیا الگوها فراتر از تصادف‌اند؟', d: 'داده یا الگوی پرتکرار کافی برای آزمون وجود ندارد.' },
    baseMean: { both: 'یعنی ترتیب رنگ‌ها درون واحدها و نحوهٔ گروه‌بندی آن‌ها از حالت تصادفی فاصله دارد.', across: 'یعنی گروه‌بندی رنگ‌ها در واحدها غیرتصادفی است، ولی ترتیب مشخصی ثابت نشد.', within: 'یعنی ترتیب درون واحدها اثر دارد، ولی با پخش سراسری رنگ‌ها کاملاً رد نمی‌شود.', iid: 'فقط نسبت به انتخاب مستقل معنادار است؛ احتمالاً اثر ترکیب رنگ‌ها و طول واحدهاست.', none: 'هیچ الگویی فراتر از تصادف نبود؛ فراوانی بالا به‌تنهایی نشانهٔ ساختار نیست.' },
    mi: (n, lab) => ({ h: 'وابستگی رنگ‌های همسایه', d: `اطلاعات متقابل نرمال‌شدهٔ رنگ‌های مجاور ${n} است (${lab}).` }),
    miCav: 'برچسب‌ها قراردادی‌اند و علیت یا معنا را نشان نمی‌دهند.', miNo: { h: 'وابستگی رنگ‌های همسایه', d: 'جفت رنگ مجاور کافی برای محاسبه نیست.' },
    markovYes: (k, ce, c0) => ({ h: 'پیش‌بینی‌پذیری', d: `دانستن ${k} رنگ قبلی حدس رنگ بعدی را روی صفحه‌های دیده‌نشده بهتر می‌کند (${ce} بیت در برابر ${c0} بیت بدون زمینه).` }),
    markovNo: { h: 'پیش‌بینی‌پذیری', d: 'زمینهٔ رنگ‌های قبلی پیش‌بینی روی داده‌های کنارگذاشته را بهتر نکرد.' },
    markovNa: (r) => ({ h: 'پیش‌بینی‌پذیری', d: `ارزیابی روی داده‌های کنارگذاشته ممکن نبود: ${r}` }),
    clusters: (n, size, pre) => ({ h: 'گروه‌های واحدهای مشابه', d: `${n} گروه از واحدهای مشابه یافت شد؛ بزرگ‌ترین ${size} واحد متمایز دارد و ${pre ? `همه با ${pre} رنگ مشترک شروع می‌شوند` : 'بخش آغازین مشترک ندارند'}.` }),
    noClusters: { h: 'گروه‌های واحدهای مشابه', d: 'گروهی از واحدهای مشابه در آستانهٔ انتخابی دیده نشد.' }, clusterCav: 'شباهت ظاهری دلیل هم‌معنایی نیست.',
    spatial: (w, nl, r) => ({ h: 'چیدمان روی شبکه', d: `بزرگ‌ترین ناحیهٔ نوشته‌شده ${w} سلول و بزرگ‌ترین ناحیهٔ NULL ${nl} سلول است.${r === null ? '' : ` همبستگی ستون و طول واحد: r=${num(r)}.`}` }),
    spatialCav: 'بخش بزرگی از چیدمان شبکه حاصل خود الگوریتم نوشتن است (جای NULLها و رشد ارتفاع)، نه لزوماً محتوا.',
    hyp: (s, c, i, u) => ({ h: 'فرضیه‌ها', d: `${s} تأییدشده، ${c} ردشده، ${i} نامشخص${u ? `، ${u} آزمون‌نشده` : ''}.` }),
  },
  en: {
    dir: 'ltr', title: 'Plain-language report', verdictTitle: 'Overall', levels: { none: 'no evidence', weak: 'weak evidence', moderate: 'moderate evidence', strong: 'strong evidence' },
    mi: { negligible: 'negligible', weak: 'weak', moderate: 'moderate', strong: 'strong' },
    verdict: (lv, ind, tests) => `Evidence of non-random structure in this data: ${lv}. Indicators met: ${ind.length ? ind.join('; ') : 'none'}. Note: ${tests} tests were examined, so some "significant" results may be chance. This summary is not a probability and does not reveal what the symbols mean.`,
    indicators: { baseline: 'a pattern beyond chance under two randomized baselines', markov: 'better prediction of the next color on unseen data', hypothesis: 'a hypothesis that also held on held-out data' },
    data: (p, u, s) => ({ h: 'Data analyzed', d: `${p} page(s), ${u} complete units and ${s} colored symbols.` }),
    small: ['Very little data: statistical results are not reliable.', 'Little data: read the results cautiously.'],
    even: (e) => ({ h: 'Color usage', d: `Colors are used almost evenly (evenness ${e}); no clear preference.` }),
    uneven: (a, pa, b, pb, e) => ({ h: 'Color usage', d: `${a} is the most common color (${pa}) and ${b} the least (${pb}); usage is uneven (evenness ${e}).` }),
    lengths: (mn, mx, mode, ms, mean, emp) => ({ h: 'Unit lengths', d: `Units are ${mn} to ${mx} colors long; the most common length is ${mode} (${ms} of units), mean ${mean}.${emp ? ` ${emp} of units are empty (terminator only).` : ''}` }),
    repUnits: (p, d) => ({ h: 'Repeated units', d: `${p} of units are exact copies of another unit (${d} distinct units repeat).` }),
    repUnitsCav: 'Short units repeat often by chance; see the baseline tests before concluding anything.',
    repeat: (len, seq, occ, non) => ({ h: 'Longest repeated pattern', d: `The longest repeated pattern has ${len} colors (${seq}) and appears ${occ} times (${non} without overlap).` }),
    noRepeat: (m) => ({ h: 'Longest repeated pattern', d: `No pattern of at least ${m} colors repeats.` }),
    baseOk: (t, w, a, i, sim) => ({ h: 'Are the patterns beyond chance?', d: `${t} frequent patterns were compared with three randomized models (${sim} simulations). Significant (adjusted p < 0.05) under "order within units": ${w}; "colors pooled across units": ${a}; "independent color draws": ${i}.` }),
    baseNo: { h: 'Are the patterns beyond chance?', d: 'Not enough data or frequent patterns to test.' },
    baseMean: { both: 'So both the order of colors inside units and how colors are grouped into units look non-random.', across: 'So the grouping of colors into units is non-random, but no specific order was established.', within: 'So order inside units matters, but pooling colors across units does not fully explain it away.', iid: 'Significant only against independent draws; likely an effect of color mix and unit lengths.', none: 'No pattern beat chance; high frequency alone is not evidence of structure.' },
    mi: (n, lab) => ({ h: 'Dependence between neighboring colors', d: `Normalized mutual information between adjacent colors is ${n} (${lab}).` }),
    miCav: 'Labels are rules of thumb; they imply neither causation nor meaning.', miNo: { h: 'Dependence between neighboring colors', d: 'Not enough adjacent pairs to compute.' },
    markovYes: (k, ce, c0) => ({ h: 'Predictability', d: `Knowing the previous ${k} color(s) improves guessing the next color on unseen pages (${ce} bits vs ${c0} bits without context).` }),
    markovNo: { h: 'Predictability', d: 'Previous colors did not improve prediction on held-out data.' },
    markovNa: (r) => ({ h: 'Predictability', d: `Held-out evaluation was not possible: ${r}` }),
    clusters: (n, size, pre) => ({ h: 'Groups of similar units', d: `${n} group(s) of similar units found; the largest has ${size} distinct units and ${pre ? `all start with the same ${pre} color(s)` : 'no shared start'}.` }),
    noClusters: { h: 'Groups of similar units', d: 'No groups of similar units at the chosen threshold.' }, clusterCav: 'Surface similarity is not evidence of shared meaning.',
    spatial: (w, nl, r) => ({ h: 'Layout on the grid', d: `The largest written region has ${w} cells and the largest NULL region ${nl} cells.${r === null ? '' : ` Column vs unit length correlation: r=${num(r)}.`}` }),
    spatialCav: 'Much of the grid layout is produced by the writing algorithm itself (NULL placement, growth), not necessarily by content.',
    hyp: (s, c, i, u) => ({ h: 'Hypotheses', d: `${s} supported, ${c} contradicted, ${i} inconclusive${u ? `, ${u} untested` : ''}.` }),
  },
};

export default class ReportWriter {
  static write(out, { lang = 'fa' } = {}) {
    const T = TEXT[lang] ?? TEXT.fa, raw = out.raw, findings = [];
    const name = (c) => (lang === 'fa' ? FA[c] : Palette.get(c).label);
    const add = (id, { h, d }, strength = 'info', caveats = []) => findings.push({ id, headline: h, detail: d, strength, caveats });
    if (!raw || !raw.units?.length) return { lang, dir: T.dir, title: T.title, verdict: null, findings: [{ id: 'data', headline: T.data(0, 0, 0).h, detail: T.data(out.usedPageIds?.length ?? 0, 0, 0).d, strength: 'info', caveats: [T.small[0]] }] };

    const units = raw.units, symbolsTotal = units.reduce((n, u) => n + u.symbols.length, 0), small = units.length < 30 ? [T.small[0]] : units.length < 200 ? [T.small[1]] : [];
    add('data', T.data(raw.pageCount, units.length, symbolsTotal), 'info', small);

    const f = raw.frequency;
    if (f && symbolsTotal) {
      const counts = f.symbols.map((s) => s.count), H = InformationMeasures.entropy(counts), even = H / Math.log2(5), top = f.symbols.reduce((a, b) => (b.count > a.count ? b : a)), low = f.symbols.reduce((a, b) => (b.count < a.count ? b : a));
      add('colors', even >= 0.97 ? T.even(pct(even)) : T.uneven(name(top.code), pct(top.relative), name(low.code), pct(low.relative), pct(even)));
      const ld = f.lengthDistribution, mode = ld.reduce((a, b) => (b.count > a.count ? b : a)), mean = units.reduce((n, u) => n + u.symbols.length, 0) / units.length, empty = ld.find((l) => l.length === 0);
      add('lengths', T.lengths(ld[0].length, ld[ld.length - 1].length, mode.length, pct(mode.share ?? mode.relative), num(mean), empty ? pct(empty.relative) : ''));
      add('repeatedUnits', T.repUnits(pct(f.repeatedProportion ?? 0), f.repeatedDistinctUnits), 'info', [T.repUnitsCav]);
    }
    if (raw.repeats) {
      const r = raw.repeats.results[0];
      add('repeats', r ? T.repeat(r.length, r.symbols.map(name).join(lang === 'fa' ? ' ← ' : ' → '), r.occurrences, r.nonOverlapping) : T.noRepeat(raw.repeats.minLength));
    }

    let baselineSig = 0;
    if (raw.baseline?.length && raw.baseline[0].results.length) {
      const sig = { w: new Set(), a: new Set(), i: new Set() }, map = { [BASELINES.SHUFFLE_WITHIN_UNITS]: 'w', [BASELINES.SHUFFLE_ACROSS_UNITS]: 'a', [BASELINES.IID_FREQUENCY]: 'i' };
      for (const run of raw.baseline) for (const r of run.results) if (r.adjustedPValue < 0.05) sig[map[run.baseline]].add(r.key);
      baselineSig = [...sig.w].filter((k) => sig.a.has(k)).length;
      const key = sig.w.size && sig.a.size ? 'both' : sig.a.size ? 'across' : sig.w.size ? 'within' : sig.i.size ? 'iid' : 'none';
      const t = T.baseOk(raw.baseline[0].results.length, sig.w.size, sig.a.size, sig.i.size, raw.baseline[0].simulations);
      add('baseline', { h: t.h, d: `${t.d} ${T.baseMean[key]}` }, key === 'both' ? 'strong' : key === 'none' ? 'none' : 'weak');
    } else add('baseline', T.baseNo, 'none');

    const mi = InformationMeasures.mutualInformation(raw.sequences, 1);
    if (mi.pairs && mi.normalized !== null) add('dependence', T.mi(num(mi.normalized, 3), level(mi.normalized, T.mi)), 'info', [T.miCav]);
    else add('dependence', T.miNo);

    let markovGain = 0;
    if (raw.markov?.ok) {
      const uni = raw.markov.results.find((r) => r.order === 0), best = raw.markov.results.filter((r) => r.order > 0 && r.improvesOnUnigram).sort((a, b) => a.crossEntropy - b.crossEntropy)[0];
      markovGain = best && uni ? uni.crossEntropy - best.crossEntropy : 0;
      add('markov', markovGain >= 0.05 ? T.markovYes(best.order, num(best.crossEntropy), num(uni.crossEntropy)) : T.markovNo, markovGain >= 0.05 ? 'moderate' : 'none');
    } else if (raw.markov) add('markov', T.markovNa(raw.markov.reason), 'none');

    if (raw.clusters) {
      const c = raw.clusters.clusters;
      add('clusters', c.length ? T.clusters(c.length, c[0].size, c[0].sharedPrefix.length) : T.noClusters, 'info', c.length ? [T.clusterCav] : []);
    }
    const sections = out.sections ?? [], regions = sections.find((s) => s.title.startsWith('Largest connected'))?.rows ?? [], geo = sections.find((s) => s.title.startsWith('Unit position'))?.rows ?? [];
    if (regions.length) add('spatial', T.spatial(Math.max(0, ...regions.filter((r) => r.kind === 'written').map((r) => r.size)), Math.max(0, ...regions.filter((r) => r.kind === 'null').map((r) => r.size)), geo[0]?.r ?? null), 'info', [T.spatialCav]);

    let supported = 0;
    if (raw.hypotheses?.length) {
      const c = (s) => raw.hypotheses.filter((h) => h.status === s).length; supported = c('supported');
      add('hypotheses', T.hyp(supported, c('contradicted'), c('inconclusive'), c('untested')), supported ? 'moderate' : 'none');
    }

    const indicators = [];
    if (baselineSig > 0) indicators.push(T.indicators.baseline);
    if (markovGain >= 0.05) indicators.push(T.indicators.markov);
    if (supported > 0) indicators.push(T.indicators.hypothesis);
    const lv = !indicators.length ? 'none' : indicators.length === 1 ? 'weak' : indicators.length === 2 || units.length < 200 ? 'moderate' : 'strong';
    const tests = (raw.baseline?.[0]?.results.length ?? 0) * 3 + (raw.hypotheses?.length ?? 0) + (raw.markov?.results?.length ?? 0);
    return { lang, dir: T.dir, title: T.title, verdict: { level: lv, label: T.levels[lv], indicators, text: T.verdict(T.levels[lv], indicators, tests) }, findings };
  }

  static toText(report) {
    const lines = [report.title, ''];
    if (report.verdict) lines.push(`${report.verdictTitle ?? ''} ${report.verdict.text}`.trim(), '');
    for (const f of report.findings) { lines.push(`${f.headline}: ${f.detail}`); for (const c of f.caveats) lines.push(`  * ${c}`); }
    return lines.join('\n');
  }
}
