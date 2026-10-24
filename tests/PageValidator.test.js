import GridModel from '../js/GridModel.js';
import WritingEngine from '../js/WritingEngine.js';
import PageValidator from '../js/PageValidator.js';
import PngCodec from '../js/PngCodec.js';
import { writeAll } from './helpers.js';

export default function register(t) {
  t.suite('PageValidator');

  t.test('a valid partial page is accepted and does not modify the grid', () => {
    const e = WritingEngine.fromEmpty(3, 3);
    writeAll(e, 1, 2, 6, 3);
    const copy = e.grid.clone();
    const v = PageValidator.validateGrid(e.grid);
    t.assert(v.valid, v.reason); t.equal(v.status, 'open'); t.assert(v.unitOpen, 'unit is open');
    t.equal(v.target.col, 1); t.equal(v.target.row, 1);
    t.assert(e.grid.equals(copy), 'validator must not modify');
  });

  t.test('PNG round trip reconstructs the next writing position without extra files', async () => {
    const e = WritingEngine.fromEmpty(2, 2);
    writeAll(e, 1, 1, 1, 6);
    const v = await PageValidator.validatePng(await PngCodec.encode(e.grid));
    t.assert(v.valid, v.reason);
    t.equal(v.target.col, e.peekTarget().col); t.equal(v.target.row, e.peekTarget().row);
  });

  t.test('a closed page stays closed after export and reimport', async () => {
    const e = WritingEngine.fromEmpty(1, 1); e.write(6);
    const v = await PageValidator.validatePng(await PngCodec.encode(e.grid));
    t.assert(v.valid, v.reason); t.equal(v.status, 'closed');
  });

  t.test('a structurally invalid PNG is rejected with a reason', async () => {
    const e = WritingEngine.fromEmpty(2, 4);
    writeAll(e, 1, 2, 6, 3, 6);
    const cells = e.grid.toCells(); cells[1 * 2 + 0] = 0;
    const v = await PageValidator.validatePng(await PngCodec.encode(GridModel.fromCells(2, 4, cells)));
    t.assert(!v.valid && v.reason.length > 0 && v.status === 'invalid', 'should be invalid');
  });

  t.test('non-PNG bytes are invalid', async () => {
    const v = await PageValidator.validatePng(new Uint8Array([9, 9, 9]));
    t.assert(!v.valid && v.grid === null, 'garbage must be rejected');
  });
}
