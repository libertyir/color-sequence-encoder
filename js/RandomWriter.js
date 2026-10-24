/**
 * RandomWriter.js - timed random symbol generator.
 * Writes only through target.write(symbol) / target.status (a Page or a
 * WritingEngine), i.e. the same engine API as manual mode. One timer at most.
 */
import Palette from './Palette.js';

export default class RandomWriter {
  static STATE = Object.freeze({ IDLE: 'idle', RUNNING: 'running', PAUSED: 'paused' });

  #target; #rng; #scheduler; #onStep; #onStop;
  #timer = null; #state = RandomWriter.STATE.IDLE; #speed; #stopReason = null;

  constructor(target, {
    rng = Math.random, speed = 20, onStep = () => {}, onStop = () => {},
    scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  } = {}) {
    this.#target = target; this.#rng = rng; this.#onStep = onStep; this.#onStop = onStop;
    this.#scheduler = scheduler; this.setSpeed(speed);
  }

  get state() { return this.#state; }
  get stopReason() { return this.#stopReason; }
  get speed() { return this.#speed; }
  setSpeed(writesPerSecond) { this.#speed = Math.min(1000, Math.max(1, Math.round(writesPerSecond) || 1)); }

  start() {
    if (this.#state !== RandomWriter.STATE.IDLE) return false;
    if (this.#target.status !== 'open') { this.#finish(this.#target.status); return false; }
    this.#state = RandomWriter.STATE.RUNNING; this.#stopReason = null; this.#schedule();
    return true;
  }
  pause() {
    if (this.#state !== RandomWriter.STATE.RUNNING) return;
    this.#cancel(); this.#state = RandomWriter.STATE.PAUSED;
  }
  resume() {
    if (this.#state !== RandomWriter.STATE.PAUSED) return;
    this.#state = RandomWriter.STATE.RUNNING; this.#schedule();
  }
  stop() { if (this.#state !== RandomWriter.STATE.IDLE) this.#finish('stopped'); }

  #interval() { return Math.max(4, 1000 / this.#speed); }
  #cancel() { if (this.#timer !== null) { this.#scheduler.clear(this.#timer); this.#timer = null; } }
  #schedule() { this.#cancel(); this.#timer = this.#scheduler.set(() => this.#tick(), this.#interval()); }
  #finish(reason) {
    this.#cancel(); this.#state = RandomWriter.STATE.IDLE; this.#stopReason = reason; this.#onStop(reason);
  }

  #tick() {
    this.#timer = null;
    if (this.#state !== RandomWriter.STATE.RUNNING) return;
    const batch = Math.max(1, Math.round(this.#speed * this.#interval() / 1000));
    const codes = Palette.writableCodes();
    for (let i = 0; i < batch; i++) {
      if (this.#target.status !== 'open') return this.#finish(this.#target.status);
      try { this.#onStep(this.#target.write(codes[Math.floor(this.#rng() * codes.length)])); }
      catch (e) { return this.#finish(`error: ${e.message}`); }
    }
    if (this.#target.status !== 'open') return this.#finish(this.#target.status);
    this.#schedule();
  }
}
