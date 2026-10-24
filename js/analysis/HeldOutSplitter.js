/** HeldOutSplitter.js - reproducible train/test split by page (default) or by unit. */
import SeededRandom from './SeededRandom.js';

export default class HeldOutSplitter {
  static split(units, { mode = 'page', testFraction = 0.3, seed = 1, trainPages = null, testPages = null } = {}) {
    if (mode !== 'page' && mode !== 'unit') throw new RangeError('mode must be "page" or "unit"');
    if (trainPages && testPages) { // explicit user-chosen split
      const tr = new Set(trainPages), te = new Set(testPages);
      return { ok: true, mode: 'explicit', seed, trainPages, testPages, train: units.filter((u) => tr.has(u.pageId)), test: units.filter((u) => te.has(u.pageId)) };
    }
    const rng = new SeededRandom(seed);
    const pick = (items) => {
      const shuffled = rng.shuffle(items.slice()), count = Math.min(items.length - 1, Math.max(1, Math.round(testFraction * items.length)));
      return new Set(shuffled.slice(0, count));
    };
    if (mode === 'page') {
      const ids = [...new Set(units.map((u) => u.pageId))].sort((a, b) => a - b);
      if (ids.length < 2) return { ok: false, mode, seed, reason: 'a page-based split needs at least 2 pages' };
      const test = pick(ids);
      return { ok: true, mode, seed, testPages: [...test].sort((a, b) => a - b), trainPages: ids.filter((i) => !test.has(i)),
        train: units.filter((u) => !test.has(u.pageId)), test: units.filter((u) => test.has(u.pageId)) };
    }
    if (units.length < 2) return { ok: false, mode, seed, reason: 'a unit-based split needs at least 2 units' };
    const test = pick(units.map((_, i) => i));
    return { ok: true, mode, seed, train: units.filter((_, i) => !test.has(i)), test: units.filter((_, i) => test.has(i)) };
  }
}
