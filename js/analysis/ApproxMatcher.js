/**
 * ApproxMatcher.js - groups DISTINCT non-empty units whose normalized
 * Levenshtein similarity >= threshold (single linkage via union-find).
 * Similarity is a surface measure only; it says nothing about meaning.
 */
import Levenshtein from './Levenshtein.js';

export default class ApproxMatcher {
  static group(units, { threshold = 0.75, maxDistinct = 1000 } = {}) {
    if (!(threshold > 0 && threshold <= 1)) throw new RangeError('threshold must be in (0, 1]');
    const counts = new Map();
    for (const u of units) if (u.symbols.length) {
      const e = counts.get(u.key) ?? { key: u.key, symbols: u.symbols, count: 0 };
      e.count++; counts.set(u.key, e);
    }
    let distinct = [...counts.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    const truncated = distinct.length > maxDistinct;
    distinct = distinct.slice(0, maxDistinct);

    const parent = distinct.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const edges = [];
    for (let i = 0; i < distinct.length; i++) for (let j = i + 1; j < distinct.length; j++) {
      const a = distinct[i].symbols, b = distinct[j].symbols;
      if (1 - Math.abs(a.length - b.length) / Math.max(a.length, b.length) < threshold) continue; // cannot reach threshold
      const distance = Levenshtein.distance(a, b), similarity = 1 - distance / Math.max(a.length, b.length);
      if (similarity < threshold) continue;
      edges.push({ i, j, a: distinct[i].key, b: distinct[j].key, distance, similarity, hamming: Levenshtein.hamming(a, b),
        differences: Levenshtein.alignment(a, b).filter((o) => o.op !== 'match') });
      parent[find(i)] = find(j);
    }
    const groups = new Map();
    distinct.forEach((e, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); });
    const clusters = [...groups.values()].filter((m) => m.length > 1).map((members) => {
      const keys = new Set(members.map((m) => m.key));
      return { representative: members[0].key, members, size: members.length, instances: members.reduce((n, m) => n + m.count, 0),
        edges: edges.filter((e) => keys.has(e.a) && keys.has(e.b)).map(({ a, b, distance, similarity, hamming, differences }) => ({ a, b, distance, similarity, hamming, differences })) };
    }).sort((a, b) => b.instances - a.instances || b.size - a.size);
    return { threshold, distinctUnitsConsidered: distinct.length, truncated, clusters };
  }
}
