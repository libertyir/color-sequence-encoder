/**
 * FrequencyAnalyzer.js - symbol, unit and length statistics (stage 3.1).
 * Structural markers are reported separately from data symbols.
 */
import Palette from '../Palette.js';
import PageCorpus from './PageCorpus.js';

export default class FrequencyAnalyzer {
  static analyze(corpus, { pageIds = null, maxRefs = 20 } = {}) {
    const units = PageCorpus.units(corpus, { pageIds });
    const structure = PageCorpus.structure(corpus, pageIds);
    const total = units.reduce((n, u) => n + u.symbols.length, 0);

    const symbols = [1, 2, 3, 4, 5].map((code) => {
      const containing = units.filter((u) => u.symbols.includes(code));
      const count = units.reduce((n, u) => n + u.symbols.filter((s) => s === code).length, 0);
      return { code, label: Palette.get(code).label, count, relative: total ? count / total : null,
        unitsContaining: containing.length, distinctUnitsContaining: new Set(containing.map((u) => u.key)).size };
    });

    const byKey = new Map();
    for (const u of units) {
      let e = byKey.get(u.key);
      if (!e) { e = { key: u.key, symbols: u.symbols, length: u.symbols.length, count: 0, refs: [], refsTruncated: false }; byKey.set(u.key, e); }
      e.count++;
      if (e.refs.length < maxRefs) e.refs.push({ pageId: u.pageId, unitIndex: u.unitIndex, column: u.column, row: u.cells[0]?.[0] ?? u.terminator?.row ?? null });
      else e.refsTruncated = true;
    }
    const unitFrequencies = [...byKey.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    const repeated = unitFrequencies.filter((e) => e.count > 1);

    const lengths = new Map();
    for (const u of units) lengths.set(u.symbols.length, (lengths.get(u.symbols.length) ?? 0) + 1);
    const lengthDistribution = [...lengths].sort((a, b) => a[0] - b[0])
      .map(([length, count]) => ({ length, count, relative: count / units.length }));

    return {
      completeUnits: units.length, totalSymbols: total, symbols, unitFrequencies, lengthDistribution,
      uniqueUnits: unitFrequencies.length, repeatedDistinctUnits: repeated.length,
      repeatedUnitInstances: repeated.reduce((n, e) => n + e.count, 0),
      repeatedProportion: units.length ? repeated.reduce((n, e) => n + e.count, 0) / units.length : null,
      structure,
    };
  }
}
