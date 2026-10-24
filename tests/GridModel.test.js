import Palette from '../js/Palette.js';
import GridModel from '../js/GridModel.js';

export default function register(t) {
  t.suite('GridModel');

  t.test('a new grid contains only pure-white (EMPTY) cells', () => {
    const g = new GridModel(4, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) t.equal(g.get(r, c), Palette.EMPTY);
    t.assert(g.isPristine(), 'new grid should be pristine');
  });

  t.test('cells are write-once and only accept the six writable symbols', () => {
    const g = new GridModel(2, 2);
    g.write(0, 0, 1);
    t.throws(() => g.write(0, 0, 2), 'overwrite must be refused');
    t.equal(g.get(0, 0), 1);
    t.throws(() => g.write(1, 1, Palette.NULL), 'NULL is not a writable symbol');
    t.throws(() => g.write(1, 1, Palette.EMPTY), 'EMPTY is not a writable symbol');
    t.assert(!g.isPristine(), 'writing cell (1,1) ends the pristine state');
  });

  t.test('appendRows keeps every existing cell and fills new rows as requested', () => {
    const g = new GridModel(3, 2);
    g.write(0, 0, 5); g.write(1, 0, 6);
    g.appendRows(2, (c) => (c === 0 ? Palette.NULL : Palette.EMPTY));
    t.equal(g.height, 4);
    t.equal(g.get(0, 0), 5); t.equal(g.get(1, 0), 6);
    t.equal(g.get(2, 0), Palette.NULL); t.equal(g.get(3, 0), Palette.NULL);
    t.equal(g.get(3, 2), Palette.EMPTY);
  });

  t.test('appendRows refuses data codes in new rows', () => {
    t.throws(() => new GridModel(2, 1).appendRows(1, () => 3));
  });

  t.test('firstEmptyRow follows writes and appended rows', () => {
    const g = new GridModel(1, 2);
    t.equal(g.firstEmptyRow(0), 0);
    g.write(0, 0, 1); g.write(1, 0, 1);
    t.equal(g.firstEmptyRow(0), -1);
    g.appendRows(1, () => Palette.EMPTY);
    t.equal(g.firstEmptyRow(0), 2);
  });

  t.test('fromCells rejects unknown codes and wrong lengths', () => {
    t.throws(() => GridModel.fromCells(1, 1, [9]));
    t.throws(() => GridModel.fromCells(2, 2, [0, 0, 0]));
  });
}
