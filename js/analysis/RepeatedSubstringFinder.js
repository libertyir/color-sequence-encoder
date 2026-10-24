/**
 * RepeatedSubstringFinder.js - long repeated substrings over a corpus using
 * SuffixArray. Every gap-free segment is separated by a UNIQUE negative
 * sentinel, so no match can cross a unit boundary or NULL gap.
 * Reports all occurrences AND the non-overlapping count (greedy, left to right).
 * Patterns are right-maximal; shorter prefixes of them are not listed separately.
 */
import SuffixArray from './SuffixArray.js';
import PageCorpus from './PageCorpus.js';

export default class RepeatedSubstringFinder {
  static find(units, { minLength = 2, minCount = 2, maxResults = 100, maxPositions = 20 } = {}) {
    const segments = PageCorpus.segments(units);
    const text = [], starts = [];
    segments.forEach((seg, i) => { starts.push(text.length); text.push(...seg.symbols, -(i + 1)); });
    const found = new SuffixArray(text).repeats({ minLength, minCount });
    const segmentAt = (pos) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= pos) lo = m; else hi = m - 1; } return lo; };

    const rows = found.map(({ length, positions }) => {
      let nonOverlapping = 0, lastEnd = -1;
      for (const p of positions) if (p >= lastEnd) { nonOverlapping++; lastEnd = p + length; }
      const segIdx = positions.map(segmentAt);
      const refs = positions.slice(0, maxPositions).map((p, i) => {
        const seg = segments[segIdx[i]];
        return PageCorpus.ref(seg.unit, seg.offset + (p - starts[segIdx[i]]));
      });
      const first = positions[0];
      return {
        symbols: text.slice(first, first + length), length, occurrences: positions.length, nonOverlapping,
        segmentsContaining: new Set(segIdx).size,
        distinctUnitsContaining: new Set(segIdx.map((i) => segments[i].unit.key)).size,
        refs, refsTruncated: positions.length > maxPositions,
      };
    }).sort((a, b) => b.length - a.length || b.occurrences - a.occurrences);
    return { minLength, minCount, total: rows.length, truncated: rows.length > maxResults, results: rows.slice(0, maxResults) };
  }
}
