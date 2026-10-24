/** SeededRandom.js - reproducible PRNG (mulberry32) with Fisher-Yates shuffle. */
export default class SeededRandom {
  #a;
  constructor(seed = 1) { this.#a = seed >>> 0; }
  next() {
    this.#a = (this.#a + 0x6D2B79F5) >>> 0;
    let t = this.#a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
}
