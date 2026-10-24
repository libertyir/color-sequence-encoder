import Palette from '../js/Palette.js';
import GridModel from '../js/GridModel.js';
import WritingEngine from '../js/WritingEngine.js';
import { mulberry32, writeAll } from './helpers.js';

const E = Palette.EMPTY, N = Palette.NULL, T = Palette.TERMINATOR;

export default function register(t) {
  t.suite('WritingEngine');

  t.test('each of the six writable symbols is written at (1,1) of a fresh page', () => {
    for (const code of Palette.writableCodes()) {
      const e = WritingEngine.fromEmpty(3, 3);
      const r = e.write(code);
      t.equal(e.grid.get(0, 0), code); t.equal(r.row, 0); t.equal(r.col, 0);
    }
    t.throws(() => WritingEngine.fromEmpty(2, 2).write(Palette.NULL));
    t.throws(() => WritingEngine.fromEmpty(2, 2).write(Palette.EMPTY));
  });

  t.test('milky cream is a data symbol and is never confused with unwritten white', () => {
    t.equal(Palette.codeFromRgb(255, 255, 255), E);
    t.equal(Palette.codeFromRgb(255, 244, 214), 5);
    t.equal(Palette.codeFromRgb(255, 244, 215), -1);
    const e = WritingEngine.fromEmpty(2, 2);
    e.write(5);
    t.assert(e.grid.get(0, 0) !== E, 'cream cell must not read as empty');
    t.assert(Palette.isDigit(5) && Palette.isEmpty(E), 'roles differ');
  });

  t.test('a unit is written vertically and never leaves its column before the terminator', () => {
    const e = WritingEngine.fromEmpty(3, 5);
    writeAll(e, 1, 2, 3, 4);
    for (let r = 0; r < 4; r++) t.equal(e.grid.get(r, 0), r + 1);
    t.equal(e.activeColumn, 0); t.assert(e.unitOpen, 'unit should still be open');
    const res = e.write(T);
    t.assert(res.unitCompleted, 'terminator completes the unit');
    t.equal(e.activeColumn, 1);
  });

  t.test('height grows only when required; a terminator fits in the last existing row', () => {
    const e = WritingEngine.fromEmpty(2, 2);
    writeAll(e, 1);
    t.equal(e.write(T).rowsAdded, 0); t.equal(e.grid.height, 2);
    const f = WritingEngine.fromEmpty(2, 2);
    writeAll(f, 1, 2); t.equal(f.grid.height, 2);
    t.equal(f.write(3).rowsAdded, 1); t.equal(f.grid.height, 3);
  });

  t.test('expansion: processed columns get NULL, active and future columns get white', () => {
    const e = WritingEngine.fromEmpty(3, 1);
    e.write(T);               // column 0 done
    writeAll(e, 1, 2);        // column 1 needs a second row
    t.equal(e.grid.height, 2);
    t.equal(e.grid.get(1, 0), N);
    t.equal(e.grid.get(1, 1), 2);
    t.equal(e.grid.get(1, 2), E);
  });

  t.test('wrap-around returns to the earliest column that still has a white cell', () => {
    const e = WritingEngine.fromEmpty(2, 3);
    e.write(T);               // column 0: row 0, rows 1-2 stay white
    const r = e.write(T);     // column 1 done -> wrap
    t.equal(r.nextColumn, 0);
    const target = e.peekTarget();
    t.equal(target.col, 0); t.equal(target.row, 1); t.assert(!target.expands, 'no expansion needed');
  });

  t.test('expansion turns EVERY white cell left of the active column into NULL', () => {
    const e = WritingEngine.fromEmpty(3, 4);
    e.write(T);                          // col 0: terminator at row 0, rows 1-3 still white
    writeAll(e, 1, 1, 1, 1);             // col 1 fills rows 0-3
    t.equal(e.grid.get(1, 0), E);        // no expansion yet: pocket still white
    const r = e.write(2);                // 5th symbol -> expansion
    t.equal(r.rowsAdded, 1);
    t.equal(e.grid.get(0, 0), T);
    for (let row = 1; row < 5; row++) t.equal(e.grid.get(row, 0), N, `col 0 row ${row}`);
    for (let row = 0; row < 5; row++) t.equal(e.grid.get(row, 2), E, `col 2 row ${row}`);
  });

  t.test('worked example: later expansions blacken the pockets of all earlier columns and the page closes', () => {
    const e = WritingEngine.fromEmpty(3, 3);
    e.write(T);                          // col 0 done (rows 1-2 white)
    writeAll(e, 1, T);                   // col 1: rows 0-1, row 2 white
    writeAll(e, 1, 1, 1, 1);             // col 2 needs a 4th row -> cols 0 and 1 lose all white cells
    for (let row = 0; row < 4; row++) for (const c of [0, 1]) t.assert(e.grid.get(row, c) !== E, `white left at ${row},${c}`);
    t.equal(e.grid.get(2, 1), N);
    const r = e.write(T);                // another row for the terminator
    t.equal(e.grid.height, 5); t.assert(r.closed && e.isClosed, 'no white cell anywhere -> closed');
  });

  t.test('data and NULL cells are never changed across a long deterministic run (only white cells left of an expansion become NULL)', () => {
    const rng = mulberry32(42);
    const e = WritingEngine.fromEmpty(4, 3);
    for (let i = 0; i < 400 && !e.isClosed; i++) {
      const before = e.grid.clone();
      const res = e.write(1 + Math.floor(rng() * 6));
      t.assert(e.grid.height - before.height <= 1, 'at most one row per write');
      for (let c = 0; c < 4; c++) {
        let seenEmpty = false;
        for (let r = 0; r < e.grid.height; r++) {
          const v = e.grid.get(r, c);
          if (v === E) seenEmpty = true; else t.assert(!seenEmpty, `white above non-white in column ${c}`);
          if (res.rowsAdded && c < res.col) t.assert(v !== E, `white left of the expanding column ${c}`);
        }
      }
      for (let r = 0; r < before.height; r++) for (let c = 0; c < 4; c++) {
        const was = before.get(r, c), now = e.grid.get(r, c);
        if (r === res.row && c === res.col) t.equal(was, E, 'target must have been empty');
        else if (was === E && res.rowsAdded && c < res.col) t.equal(now, N, `white cell (${r},${c}) must become NULL`);
        else t.equal(now, was, `cell (${r},${c}) changed`);
      }
    }
  });

  t.test('the page closes permanently when no writable cell remains', () => {
    const e = WritingEngine.fromEmpty(1, 1);
    const r = e.write(T);
    t.assert(r.closed && e.isClosed, 'page should be closed');
    t.equal(e.status, WritingEngine.STATUS.CLOSED);
    t.throws(() => e.write(1), 'writing after closure must fail');
    t.equal(e.grid.height, 1);
  });

  t.test('reaching the height limit halts writing without closing the page', () => {
    const e = WritingEngine.fromEmpty(1, 1, { maxHeight: 2 });
    writeAll(e, 1, 1);
    t.equal(e.status, WritingEngine.STATUS.HALTED);
    t.throws(() => e.write(1), 'halted engine must refuse writes');
    t.assert(!e.isClosed, 'halted is not closed');
    t.equal(e.grid.height, 2);
  });
}
