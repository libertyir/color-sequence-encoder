import GridModel from '../js/GridModel.js';
import WritingEngine from '../js/WritingEngine.js';
import CursorManager from '../js/CursorManager.js';
import Limits from '../js/Limits.js';
import { mulberry32, writeAll } from './helpers.js';

const S = CursorManager.STATUS;

function tamper(grid, row, col, code) {
  const cells = grid.toCells();
  cells[row * grid.width + col] = code;
  return GridModel.fromCells(grid.width, grid.height, cells);
}

export default function register(t) {
  t.suite('CursorManager');

  t.test('an all-white image is an open, empty page starting at (1,1)', () => {
    const res = CursorManager.reconstruct(new GridModel(5, 7));
    t.assert(res.ok, res.reason); t.equal(res.status, S.OPEN);
    t.equal(res.target.row, 0); t.equal(res.target.col, 0); t.assert(!res.unitOpen, 'no open unit');
  });

  t.test('state is reconstructed from the grid alone after every step of many histories', () => {
    for (const seed of [1, 2, 3, 4]) for (const W of [1, 2, 3, 5]) for (const H0 of [1, 2, 4]) {
      const rng = mulberry32(seed * 100 + W * 10 + H0);
      const e = WritingEngine.fromEmpty(W, H0);
      for (let i = 0; i < 60 && !e.isClosed; i++) {
        e.write(1 + Math.floor(rng() * 6));
        const res = CursorManager.reconstruct(e.grid.clone());
        const tag = `seed ${seed} W ${W} H0 ${H0} step ${i}`;
        t.assert(res.ok, `${tag}: ${res.reason}`);
        t.equal(res.engine.activeColumn, e.activeColumn, `${tag} column`);
        t.equal(res.engine.unitOpen, e.unitOpen, `${tag} unitOpen`);
        t.equal(res.status, e.status, `${tag} status`);
      }
    }
  });

  t.test('a fully consumed page is reconstructed as permanently closed', () => {
    const e = WritingEngine.fromEmpty(1, 1);
    e.write(6);
    const res = CursorManager.reconstruct(e.grid.clone());
    t.assert(res.ok, res.reason); t.equal(res.status, S.CLOSED); t.equal(res.target, null);
  });

  t.test('a page at the height limit is reconstructed as halted, not closed', () => {
    const e = WritingEngine.fromEmpty(1, 1);
    for (let i = 0; i < Limits.MAX_HEIGHT; i++) e.write(1);
    const res = CursorManager.reconstruct(e.grid.clone());
    t.assert(res.ok, res.reason); t.equal(res.status, S.HALTED);
  });

  t.test('a hole (required data cell changed to white) is rejected', () => {
    const e = WritingEngine.fromEmpty(2, 4);
    writeAll(e, 1, 2, 6, 3, 6);
    const res = CursorManager.reconstruct(tamper(e.grid, 1, 0, 0));
    t.equal(res.status, S.INVALID); t.assert(res.reason.length > 0, 'reason required');
  });

  t.test('a replaced terminator is rejected', () => {
    const e = WritingEngine.fromEmpty(2, 4);
    writeAll(e, 1, 2, 6, 3, 6);
    t.equal(CursorManager.reconstruct(tamper(e.grid, 2, 0, 1)).status, S.INVALID);
  });

  t.test('data placed after an unwritten cell is rejected', () => {
    const e = WritingEngine.fromEmpty(2, 4);
    e.write(1);
    t.equal(CursorManager.reconstruct(tamper(e.grid, 3, 0, 2)).status, S.INVALID);
  });

  t.test('illegally placed NULL cells are rejected', () => {
    const g = new GridModel(2, 3);
    t.equal(CursorManager.reconstruct(tamper(g, 0, 1, 7)).status, S.INVALID);
    const e = WritingEngine.fromEmpty(2, 2);
    writeAll(e, 6);
    t.equal(CursorManager.reconstruct(tamper(e.grid, 1, 0, 7)).status, S.INVALID);
  });
}
