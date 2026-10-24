/** Levenshtein.js - edit distance, normalized similarity, Hamming distance, alignment. */
export default class Levenshtein {
  static distance(a, b) {
    if (a.length < b.length) [a, b] = [b, a];
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }

  /** 1 - distance / max length; two empty sequences are identical (1). */
  static similarity(a, b) {
    const m = Math.max(a.length, b.length);
    return m === 0 ? 1 : 1 - Levenshtein.distance(a, b) / m;
  }

  /** Hamming distance, or null when lengths differ. */
  static hamming(a, b) {
    if (a.length !== b.length) return null;
    return a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
  }

  /** One optimal edit script (ties prefer match/substitute, then delete, then insert). */
  static alignment(a, b) {
    const n = a.length, m = b.length, d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) d[i][0] = i;
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const ops = [];
    for (let i = n, j = m; i > 0 || j > 0;) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
        ops.push({ op: a[i - 1] === b[j - 1] ? 'match' : 'substitute', aIndex: i - 1, bIndex: j - 1, a: a[i - 1], b: b[j - 1] }); i--; j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'delete', aIndex: i - 1, a: a[i - 1] }); i--; }
      else { ops.push({ op: 'insert', bIndex: j - 1, b: b[j - 1] }); j--; }
    }
    return ops.reverse();
  }
}
