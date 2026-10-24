import WritingEngine from '../js/WritingEngine.js';
import RandomWriter from '../js/RandomWriter.js';
import { mulberry32 } from './helpers.js';

function manualScheduler() {
  const q = []; let n = 0;
  return {
    set: (fn) => { q.push({ id: ++n, fn }); return n; },
    clear: (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); },
    get pending() { return q.length; },
    run() { q.shift()?.fn(); },
  };
}

export default function register(t) {
  t.suite('RandomWriter');

  t.test('start writes through the engine; pause cancels the timer; resume continues', () => {
    const s = manualScheduler(), e = WritingEngine.fromEmpty(3, 3);
    const w = new RandomWriter(e, { speed: 1, rng: mulberry32(1), scheduler: s });
    t.assert(w.start(), 'start'); t.equal(s.pending, 1);
    s.run(); t.equal(e.grid.get(0, 0) > 0, true);
    w.pause(); t.equal(s.pending, 0); t.equal(w.state, 'paused');
    w.resume(); t.equal(s.pending, 1); t.equal(w.state, 'running');
  });

  t.test('starting twice never creates a second timer; stop cancels pending work', () => {
    const s = manualScheduler(), w = new RandomWriter(WritingEngine.fromEmpty(2, 2), { speed: 1, scheduler: s });
    w.start(); w.start(); t.equal(s.pending, 1);
    w.stop(); t.equal(s.pending, 0); t.equal(w.state, 'idle');
  });

  t.test('random mode stops automatically when the page closes', () => {
    const s = manualScheduler(), e = WritingEngine.fromEmpty(1, 1);
    const w = new RandomWriter(e, { speed: 1, rng: () => 0.99, scheduler: s });   // always symbol 6
    w.start(); s.run();
    t.equal(w.state, 'idle'); t.equal(w.stopReason, 'closed'); t.assert(e.isClosed, 'closed'); t.equal(s.pending, 0);
  });

  t.test('a long random run never throws or overwrites, and ends closed or still open', () => {
    const s = manualScheduler(), e = WritingEngine.fromEmpty(3, 2);
    const w = new RandomWriter(e, { speed: 1, rng: mulberry32(5), scheduler: s });
    w.start();
    for (let i = 0; i < 500 && s.pending; i++) s.run();
    t.assert(!String(w.stopReason).startsWith('error'), String(w.stopReason));
  });
}
