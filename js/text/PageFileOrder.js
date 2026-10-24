/** PageFileOrder.js - orders selected files by the number in their names (page_0007.png). */
export default class PageFileOrder {
  static numberOf(name) { const m = /(\d+)(?!.*\d)/.exec(name); return m ? Number(m[1]) : null; }

  /** Numeric ascending when EVERY name has a number; otherwise the given order is kept (byNumber = false). */
  static sort(files) {
    const nums = files.map((f) => PageFileOrder.numberOf(f.name));
    if (!files.length || nums.some((n) => n === null)) return { ordered: [...files], byNumber: false };
    const ordered = files.map((f, i) => ({ f, n: nums[i] })).sort((a, b) => a.n - b.n || a.f.name.localeCompare(b.f.name)).map((x) => x.f);
    return { ordered, byNumber: true };
  }
}
