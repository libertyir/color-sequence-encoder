/**
 * Minimal dependency-free test runner. Works in the browser (tests/test-runner.html)
 * and in Node:  node tests/test-runner.js
 */
import gridModelTests from './GridModel.test.js';
import writingEngineTests from './WritingEngine.test.js';
import cursorManagerTests from './CursorManager.test.js';
import pngCodecTests from './PngCodec.test.js';
import pageValidatorTests from './PageValidator.test.js';
import base5Tests from './Base5Converter.test.js';
import randomWriterTests from './RandomWriter.test.js';
import pageCollectionTests from './PageCollection.test.js';
import analysisTests from './analysis/Analysis.test.js';
import informationTests from './analysis/Information.test.js';
import spatialTests from './analysis/Spatial.test.js';
import hypothesisTests from './analysis/Hypotheses.test.js';
import runnerTests from './analysis/Runner.test.js';
import reportTests from './analysis/Report.test.js';
import batchTests from './BatchPageGenerator.test.js';
import textTests from './text/Text.test.js';

export class TestRunner {
  #current = '';
  #tests = [];

  suite(name) { this.#current = name; }
  test(name, fn) { this.#tests.push({ suite: this.#current, name, fn }); }

  assert(cond, message = 'Assertion failed') { if (!cond) throw new Error(message); }
  equal(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`${message} expected ${String(expected)} but got ${String(actual)}`.trim());
    }
  }
  throws(fn, message = 'Expected an exception') {
    try { fn(); } catch { return; }
    throw new Error(message);
  }

  async run() {
    const results = [];
    for (const { suite, name, fn } of this.#tests) {
      try { await fn(); results.push({ suite, name, ok: true }); }
      catch (error) { results.push({ suite, name, ok: false, error: error.message }); }
    }
    return results;
  }
}

function report(results) {
  const failed = results.filter((r) => !r.ok).length;
  const summary = `${results.length - failed} passed, ${failed} failed`;
  if (typeof document === 'undefined') {
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.suite}] ${r.name}${r.ok ? '' : ' -> ' + r.error}`);
    console.log(summary);
    process.exitCode = failed ? 1 : 0;
    return;
  }
  document.getElementById('summary').textContent = summary;
  const list = document.getElementById('results');
  for (const r of results) {
    const item = document.createElement('li');
    item.className = r.ok ? 'test-pass' : 'test-fail';
    item.textContent = `[${r.suite}] ${r.name}${r.ok ? '' : ' - ' + r.error}`;
    list.appendChild(item);
  }
}

const runner = new TestRunner();
for (const register of [gridModelTests, writingEngineTests, cursorManagerTests, pngCodecTests, pageValidatorTests, base5Tests, randomWriterTests, pageCollectionTests, analysisTests, informationTests, spatialTests, hypothesisTests, runnerTests, reportTests, batchTests, textTests]) register(runner);
report(await runner.run());
