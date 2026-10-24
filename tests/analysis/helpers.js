import WritingEngine from '../../js/WritingEngine.js';
import PageCorpus from '../../js/analysis/PageCorpus.js';

/** Build a valid page whose units are exactly `units` (one unit per column, in order). */
export function pageFromUnits(units, id = 1) {
  const height = Math.max(1, ...units.map((u) => u.length + 1));
  const engine = WritingEngine.fromEmpty(Math.max(1, units.length), height);
  for (const u of units) { for (const s of u) engine.write(s); engine.write(6); }
  return { id, name: `P${id}`, grid: engine.grid };
}
export const corpusOf = (units, id = 1) => PageCorpus.fromPages([pageFromUnits(units, id)]);
export const unitsOf = (units) => PageCorpus.units(corpusOf(units));
