/**
 * HierarchicalClusterer.js - agglomerative clustering (average linkage,
 * Lance-Williams update) of DISTINCT non-empty units. Distance = Levenshtein
 * distance / longer length (0 identical, 1 completely different). Merging stops
 * when the next merge distance exceeds cutDistance. Every cluster reports the
 * features behind the grouping (shared start/end, differing positions, lengths,
 * mean internal distance). No semantic labels are assigned.
 */
import Levenshtein from './Levenshtein.js';

export default class HierarchicalClusterer {
  static cluster(units, { maxDistinct = 200, cutDistance = 0.25 } = {}) {
    const counts = new Map();
    for (const u of units) if (u.symbols.length) { const e = counts.get(u.key) ?? { key: u.key, symbols: u.symbols, count: 0 }; e.count++; counts.set(u.key, e); }
    const all = [...counts.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)), items = all.slice(0, maxDistinct), n = items.length;
    const d = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) d[i][j] = d[j][i] = 1 - Levenshtein.similarity(items[i].symbols, items[j].symbols);
    const groups = items.map((_, i) => ({ id: i, members: [i], alive: true })), merges = [];
    for (;;) {
      let best = null;
      for (let i = 0; i < n; i++) if (groups[i].alive) for (let j = i + 1; j < n; j++) if (groups[j].alive && (best === null || d[i][j] < best.h)) best = { i, j, h: d[i][j] };
      if (!best || best.h > cutDistance + 1e-12) break;
      const { i, j, h } = best, ni = groups[i].members.length, nj = groups[j].members.length;
      for (let k = 0; k < n; k++) if (groups[k].alive && k !== i && k !== j) d[i][k] = d[k][i] = (ni * d[i][k] + nj * d[j][k]) / (ni + nj);
      merges.push({ left: groups[i].members.map((m) => items[m].key), right: groups[j].members.map((m) => items[m].key), height: h });
      groups[i].members.push(...groups[j].members); groups[j].alive = false;
    }
    const clusters = groups.filter((g) => g.alive && g.members.length > 1).map((g) => {
      const ms = g.members.map((m) => items[m]).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)), lens = ms.map((m) => m.symbols.length);
      let prefix = 0, suffix = 0;
      const first = ms[0].symbols, minLen = Math.min(...lens);
      while (prefix < minLen && ms.every((m) => m.symbols[prefix] === first[prefix])) prefix++;
      while (suffix < minLen - prefix && ms.every((m) => m.symbols[m.symbols.length - 1 - suffix] === first[first.length - 1 - suffix])) suffix++;
      const equal = lens.every((l) => l === lens[0]);
      const differing = equal ? [...Array(lens[0]).keys()].filter((p) => ms.some((m) => m.symbols[p] !== first[p])) : null;
      const idx = g.members; let sum = 0, pairs = 0;
      for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) { sum += 1 - Levenshtein.similarity(items[idx[a]].symbols, items[idx[b]].symbols); pairs++; }
      return { members: ms, size: ms.length, instances: ms.reduce((s, m) => s + m.count, 0), lengthRange: [Math.min(...lens), Math.max(...lens)],
        sharedPrefix: first.slice(0, prefix), sharedSuffix: suffix ? first.slice(first.length - suffix) : [], differingPositions: differing, meanDistance: sum / pairs };
    }).sort((a, b) => b.instances - a.instances || b.size - a.size);
    return { cutDistance, distinctUnits: all.length, considered: n, truncated: all.length > maxDistinct, merges, clusters };
  }
}
