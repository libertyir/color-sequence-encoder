/**
 * NGramAnalyzer.js - symbol n-grams inside units and multi-unit n-grams.
 * Symbol n-grams never cross a unit boundary or a NULL/white gap.
 * Multi-unit n-grams use consecutive complete units of ONE page only.
 * Ranking: 'count' | 'units' (unit instances containing it) | 'distinctUnits' |
 * 'lift' (count / expected under independent symbols) | 'length'.
 */
import PageCorpus from './PageCorpus.js';

const rankers = {
  count: (a, b) => b.count - a.count, units: (a, b) => b.units - a.units,
  distinctUnits: (a, b) => b.distinctUnits - a.distinctUnits, lift: (a, b) => (b.lift ?? -1) - (a.lift ?? -1),
  length: (a, b) => b.length - a.length,
};

export default class NGramAnalyzer {
  static symbolNgrams(units, { n = 2, minCount = 2, maxResults = 200, maxPositions = 20, rankBy = 'count' } = {}) {
    if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be a positive integer');
    const map = new Map(), freq = new Map();
    let windows = 0, totalSymbols = 0;
    for (const u of units) {
      for (const s of u.symbols) { freq.set(s, (freq.get(s) ?? 0) + 1); totalSymbols++; }
      for (let i = 0; i + n <= u.symbols.length; i++) {
        if (u.gaps.slice(i + 1, i + n).some(Boolean)) continue;
        windows++;
        const grams = u.symbols.slice(i, i + n), key = grams.join(',');
        let e = map.get(key);
        if (!e) { e = { key, symbols: grams, length: n, count: 0, unitIds: new Set(), unitKeys: new Set(), positions: [], positionsTruncated: false }; map.set(key, e); }
        e.count++; e.unitIds.add(`${u.pageId}:${u.unitIndex}`); e.unitKeys.add(u.key);
        if (e.positions.length < maxPositions) e.positions.push(PageCorpus.ref(u, i)); else e.positionsTruncated = true;
      }
    }
    const rows = [...map.values()].filter((e) => e.count >= minCount).map((e) => {
      const expected = e.symbols.reduce((p, s) => p * (freq.get(s) / totalSymbols), windows);
      return { key: e.key, symbols: e.symbols, length: n, count: e.count, units: e.unitIds.size, distinctUnits: e.unitKeys.size,
        expected, lift: expected > 0 ? e.count / expected : null, positions: e.positions, positionsTruncated: e.positionsTruncated };
    }).sort((a, b) => rankers[rankBy](a, b) || b.count - a.count || a.key.localeCompare(b.key));
    return { n, minCount, rankBy, windows, total: rows.length, truncated: rows.length > maxResults, results: rows.slice(0, maxResults) };
  }

  static multiUnitNgrams(units, { n = 2, minCount = 2, maxResults = 200, maxPositions = 20 } = {}) {
    if (!Number.isInteger(n) || n < 2) throw new RangeError('multi-unit n must be >= 2');
    const map = new Map(), pages = new Map();
    for (const u of units) { if (!pages.has(u.pageId)) pages.set(u.pageId, []); pages.get(u.pageId).push(u); }
    for (const list of pages.values()) {
      list.sort((a, b) => a.unitIndex - b.unitIndex);
      for (let i = 0; i + n <= list.length; i++) {
        const win = list.slice(i, i + n), key = win.map((u) => u.key).join('|');
        let e = map.get(key);
        if (!e) { e = { key, units: win.map((u) => u.symbols), count: 0, positions: [], positionsTruncated: false }; map.set(key, e); }
        e.count++;
        if (e.positions.length < maxPositions) e.positions.push({ pageId: list[i].pageId, firstUnitIndex: list[i].unitIndex, columns: win.map((u) => u.column) });
        else e.positionsTruncated = true;
      }
    }
    const rows = [...map.values()].filter((e) => e.count >= minCount).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    return { n, minCount, total: rows.length, truncated: rows.length > maxResults, results: rows.slice(0, maxResults) };
  }

  /** key -> count over plain symbol arrays (used by permutation tests). */
  static countMap(sequences, n) {
    const m = new Map();
    for (const s of sequences) for (let i = 0; i + n <= s.length; i++) {
      const k = s.slice(i, i + n).join(',');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }
}
