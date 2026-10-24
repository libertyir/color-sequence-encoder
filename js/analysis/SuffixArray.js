/**
 * SuffixArray.js - suffix array (prefix doubling), Kasai LCP, and enumeration
 * of right-maximal repeats via LCP intervals. Works on integer arrays.
 */
export default class SuffixArray {
  #text; #sa; #lcp;

  constructor(text) {
    this.#text = Array.from(text);
    this.#sa = SuffixArray.#build(this.#text);
    this.#lcp = SuffixArray.#kasai(this.#text, this.#sa);
  }

  get text() { return this.#text; }
  get sa() { return this.#sa; }
  /** lcp[i] = longest common prefix of suffixes sa[i-1] and sa[i]; lcp[0] = 0. */
  get lcp() { return this.#lcp; }

  static #build(s) {
    const n = s.length;
    if (n === 0) return [];
    const uniq = [...new Set(s)].sort((a, b) => a - b), dense = new Map(uniq.map((v, i) => [v, i]));
    let rank = s.map((v) => dense.get(v));
    const sa = Array.from({ length: n }, (_, i) => i);
    for (let k = 1; ; k <<= 1) {
      const key2 = (i) => (i + k < n ? rank[i + k] : -1);
      const cmp = (a, b) => rank[a] - rank[b] || key2(a) - key2(b);
      sa.sort(cmp);
      const next = new Array(n);
      next[sa[0]] = 0;
      for (let i = 1; i < n; i++) next[sa[i]] = next[sa[i - 1]] + (cmp(sa[i - 1], sa[i]) < 0 ? 1 : 0);
      rank = next;
      if (rank[sa[n - 1]] === n - 1) break;
    }
    return sa;
  }

  static #kasai(s, sa) {
    const n = s.length, rank = new Array(n), lcp = new Array(n).fill(0);
    sa.forEach((p, i) => { rank[p] = i; });
    for (let i = 0, h = 0; i < n; i++) {
      if (rank[i] > 0) {
        const j = sa[rank[i] - 1];
        while (i + h < n && j + h < n && s[i + h] === s[j + h]) h++;
        lcp[rank[i]] = h;
        if (h > 0) h--;
      } else h = 0;
    }
    return lcp;
  }

  /** Right-maximal repeated substrings: [{ length, positions (sorted) }]. */
  repeats({ minLength = 1, minCount = 2 } = {}) {
    const n = this.#sa.length, out = [], stack = [{ lcp: 0, lb: 0 }];
    for (let i = 1; i <= n; i++) {
      const cur = i < n ? this.#lcp[i] : 0;
      let lb = i - 1;
      while (cur < stack[stack.length - 1].lcp) {
        const top = stack.pop();
        lb = top.lb;
        if (top.lcp >= minLength && i - top.lb >= minCount) {
          out.push({ length: top.lcp, positions: this.#sa.slice(top.lb, i).sort((a, b) => a - b) });
        }
      }
      if (cur > stack[stack.length - 1].lcp) stack.push({ lcp: cur, lb });
    }
    return out;
  }
}
