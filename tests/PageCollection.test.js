import GridModel from '../js/GridModel.js';
import PageCollection from '../js/PageCollection.js';
import PngCodec from '../js/PngCodec.js';

export default function register(t) {
  t.suite('PageCollection');

  t.test('pages keep independent state when switching', () => {
    const c = new PageCollection();
    const a = c.create(2, 2), b = c.create(3, 3);
    a.write(1); c.select(a.id);
    t.equal(a.grid.get(0, 0), 1); t.assert(b.isPristine, 'other page untouched');
    t.equal(c.selected.id, a.id);
  });

  t.test('importing a structurally invalid PNG gives a read-only invalid page', async () => {
    const cells = new Uint8Array(4); cells[3] = 2;                        // data below white cells
    const bytes = await PngCodec.encode(GridModel.fromCells(2, 2, cells));
    const { page, reason } = await new PageCollection().importPng(bytes, 'bad');
    t.equal(page.status, 'invalid'); t.assert(reason.length > 0, 'reason');
    t.throws(() => page.write(1), 'invalid pages are not writable');
  });

  t.test('garbage files create no page', async () => {
    const { page, reason } = await new PageCollection().importPng(new Uint8Array([1, 2, 3]), 'x');
    t.equal(page, null); t.assert(reason.length > 0, 'reason');
  });

  t.test('export then import rebuilds the same page from pixels only', async () => {
    const c = new PageCollection(), p = c.create(2, 3);
    p.write(3); p.write(6);
    const { page } = await c.importPng(await c.exportPng(p.id), 'copy');
    t.assert(page.grid.equals(p.grid), 'grid'); t.equal(page.status, p.status);
    t.equal(page.peekTarget().col, p.peekTarget().col);
  });

  t.test('page order can be changed and dimensions lock after writing', () => {
    const c = new PageCollection(), a = c.create(2, 2), b = c.create(2, 2);
    c.move(b.id, -1); t.equal(c.pages[0].id, b.id);
    a.write(1);
    t.throws(() => c.resizePristine(a.id, 4, 4), 'locked after the first write');
    t.equal(c.resizePristine(b.id, 4, 4).grid.width, 4);
  });
}
