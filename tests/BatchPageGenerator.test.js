import PageCollection from '../js/PageCollection.js';
import BatchPageGenerator from '../js/BatchPageGenerator.js';
import { mulberry32 } from './helpers.js';

const fast = { chunkSize: 50, yieldControl: () => Promise.resolve() };

export default function register(t) {
  t.suite('BatchPageGenerator');

  t.test('pages are created and filled strictly one after another', async () => {
    const c = new PageCollection(), log = [];
    const g = new BatchPageGenerator(c, { rng: mulberry32(1), ...fast });
    const res = await g.run({ count: 4, width: 3, height: 3,
      onPageStart: (p, i) => { log.push(`start${i}`); t.equal(c.pages.length, i, 'previous pages exist, no later page yet'); },
      onPageDone: (p, i, n, outcome) => { log.push(`done${i}`); t.equal(c.pages.length, i, 'no next page created before this one is done'); t.equal(outcome, 'closed'); t.equal(p.status, 'closed'); } });
    t.equal(log.join(), 'start1,done1,start2,done2,start3,done3,start4,done4');
    t.equal(res.created, 4); t.equal(c.pages.map((p) => p.name).join(), 'Batch 1,Batch 2,Batch 3,Batch 4');
    t.assert(c.pages.every((p) => !p.grid.hasEmptyCell() && p.grid.width === 3), 'every page fully consumed, width fixed');
    t.assert(!g.running, 'not running afterwards');
  });

  t.test('all writes go through Page.write (counts match) and a seed makes the run repeatable', async () => {
    const run = async () => { const c = new PageCollection(); await new BatchPageGenerator(c, { rng: mulberry32(5), ...fast }).run({ count: 3, width: 4, height: 2 }); return c; };
    const a = await run(), b = await run();
    a.pages.forEach((p, i) => { t.assert(p.grid.equals(b.pages[i].grid), `page ${i} differs`); t.assert(p.writtenCount > 0, 'counted writes'); });
  });

  t.test('stop ends the run; the interrupted page is reported as stopped and left as written so far', async () => {
    const c = new PageCollection();
    const g = new BatchPageGenerator(c, { rng: mulberry32(2), chunkSize: 2, yieldControl: () => Promise.resolve() });
    const res = await g.run({ count: 5, width: 20, height: 20, onProgress: (p, i) => { if (i === 2) g.stop(); } });
    t.assert(res.stopped && res.created === 2, `created ${res.created}`);
    t.equal(res.results[0].outcome, 'closed'); t.equal(res.results[1].outcome, 'stopped'); t.equal(c.pages[1].status, 'open');
  });

  t.test('a per-page safety limit is reported, and invalid requests are rejected', async () => {
    const c = new PageCollection();
    const res = await new BatchPageGenerator(c, { rng: mulberry32(3), maxWritesPerPage: 5, ...fast }).run({ count: 2, width: 10, height: 10 });
    t.equal(res.results[0].outcome, 'limit'); t.equal(res.created, 2);
    const g = new BatchPageGenerator(new PageCollection(), fast);
    for (const bad of [{ count: 0, width: 3, height: 3 }, { count: 501, width: 3, height: 3 }, { count: 1.5, width: 3, height: 3 }, { count: 1, width: 0, height: 3 }, { count: 1, width: 3, height: 999 }]) {
      let failed = false; try { await g.run(bad); } catch { failed = true; }
      t.assert(failed, `rejects ${JSON.stringify(bad)}`);
    }
  });

  t.test('two runs cannot overlap', async () => {
    const g = new BatchPageGenerator(new PageCollection(), { rng: mulberry32(4), chunkSize: 1, yieldControl: () => new Promise((r) => setTimeout(r, 1)) });
    const first = g.run({ count: 1, width: 8, height: 8 });
    let failed = false; try { await g.run({ count: 1, width: 3, height: 3 }); } catch { failed = true; }
    t.assert(failed, 'second run must be refused'); await first;
  });
}
