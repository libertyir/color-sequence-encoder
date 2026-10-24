import GridModel from '../js/GridModel.js';
import WritingEngine from '../js/WritingEngine.js';
import Base5Converter from '../js/Base5Converter.js';
import { writeAll } from './helpers.js';

export default function register(t) {
  t.suite('Base5Converter');

  t.test('leading zeros are preserved in the digit string; decimal is correct', () => {
    const e = WritingEngine.fromEmpty(2, 5);
    writeAll(e, 1, 1, 5, 6);            // digits 0,0,4
    const [u] = Base5Converter.extractUnits(e.grid);
    t.equal(u.digits, '004'); t.equal(u.decimal, 4n); t.assert(u.complete, 'complete');
  });

  t.test('units never combine columns; incomplete units are labeled', () => {
    const e = WritingEngine.fromEmpty(2, 5);
    writeAll(e, 2, 6, 3, 3);            // col0 = "1"; col1 open = "22"
    const units = Base5Converter.extractUnits(e.grid);
    t.equal(units.length, 2);
    t.equal(units[0].digits, '1'); t.equal(units[0].column, 1);
    t.equal(units[1].digits, '22'); t.assert(!units[1].complete && units[1].decimal === null, 'incomplete');
  });

  t.test('an empty unit has no numeric value (not zero)', () => {
    const e = WritingEngine.fromEmpty(1, 2); e.write(6);
    const [u] = Base5Converter.extractUnits(e.grid);
    t.assert(u.isEmpty && u.complete && u.decimal === null, 'empty unit');
  });

  t.test('NULL and white cells are excluded from the digits', () => {
    const g = GridModel.fromCells(1, 5, [2, 7, 4, 0, 0]);
    const [u] = Base5Converter.extractUnits(g);
    t.equal(u.digits, '13'); t.assert(!u.complete, 'no terminator yet');
  });

  t.test('very long units use BigInt exactly', () => {
    t.equal(Base5Converter.toDecimal('4'.repeat(100)), 5n ** 100n - 1n);
    t.throws(() => Base5Converter.toDecimal('5'));
  });
}
