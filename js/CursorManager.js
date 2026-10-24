/**
 * CursorManager.js
 * Reconstructs page state (status, active column, open unit, next target)
 * from a grid ALONE, by replaying the grid through the real WritingEngine.
 * There is no second algorithm: the engine decides every target and expansion.
 *
 * The initial height H0 is not stored in the image, so a bounded candidate
 * set is replayed with early abort:
 *   1 <= H0 <= min(MAX_INITIAL_HEIGHT, image height), and if H0 < height, row H0
 *   (the first expansion row) must start with NULLs followed by a data cell.
 * The image is accepted only if at least one candidate reproduces it exactly
 * AND all such candidates agree on the resulting state.
 */
import Palette from './Palette.js';
import GridModel from './GridModel.js';
import WritingEngine from './WritingEngine.js';
import Limits from './Limits.js';

export default class CursorManager {
  static STATUS = Object.freeze({ ...WritingEngine.STATUS, INVALID: 'invalid' });

  /** @param {GridModel} image  @returns frozen result (never throws for bad data) */
  static reconstruct(image) {
    if (!(image instanceof GridModel)) throw new TypeError('image must be a GridModel');
    const W = image.width;
    const H = image.height;
    if (W > Limits.MAX_WIDTH || H > Limits.MAX_HEIGHT) {
      return CursorManager.#invalid(`Grid ${W}x${H} exceeds the supported limits`);
    }

    const maxH0 = Math.min(Limits.MAX_INITIAL_HEIGHT, H);

    let accepted = null;
    const heights = [];
    let bestFail = { steps: -1, reason: 'No initial height reproduces this image' };

    for (let h0 = 1; h0 <= maxH0; h0++) {
      if (h0 < H && !CursorManager.#plausibleExpansionRow(image, h0)) continue;
      const attempt = CursorManager.#replay(image, h0);
      if (!attempt.ok) {
        if (attempt.steps > bestFail.steps) bestFail = attempt;
        continue;
      }
      const key = `${attempt.engine.activeColumn}:${attempt.engine.unitOpen}:${attempt.engine.status}`;
      if (accepted && accepted.key !== key) {
        return CursorManager.#invalid('Ambiguous image: different initial heights lead to different writing states');
      }
      if (!accepted) accepted = { key, engine: attempt.engine };
      heights.push(h0);
    }

    if (!accepted) return CursorManager.#invalid(bestFail.reason);
    return Object.freeze({
      ok: true,
      status: accepted.engine.status,
      reason: null,
      engine: accepted.engine,
      target: accepted.engine.peekTarget(),
      unitOpen: accepted.engine.unitOpen,
      consistentInitialHeights: Object.freeze(heights),
    });
  }

  static #invalid(reason) {
    return Object.freeze({
      ok: false, status: CursorManager.STATUS.INVALID, reason,
      engine: null, target: null, unitOpen: false, consistentInitialHeights: Object.freeze([]),
    });
  }

  /** Row h0 can be the first expansion row only if its first non-NULL cell is a data cell. */
  static #plausibleExpansionRow(image, row) {
    for (let c = 0; c < image.width; c++) {
      const code = image.get(row, c);
      if (code !== Palette.NULL) return Palette.isWritable(code);
    }
    return false;
  }

  /** Replay `image` from an empty page of initial height h0. */
  static #replay(image, h0) {
    const H = image.height;
    const engine = WritingEngine.fromEmpty(image.width, h0);
    let steps = 0;
    const fail = (reason) => ({ ok: false, steps, reason });

    for (;;) {
      const target = engine.peekTarget();
      if (target === null) break; // closed
      const code = target.row < H ? image.get(target.row, target.col) : Palette.EMPTY;
      if (code === Palette.EMPTY) break; // frontier: the next unwritten position
      if (!Palette.isWritable(code)) {
        return fail(`Cell (row ${target.row + 1}, column ${target.col + 1}) is NULL where the algorithm requires a writable position`);
      }
      const result = engine.write(code);
      steps++;
      if (result.rowsAdded) {
        const newRow = engine.grid.height - 1;
        for (let c = 0; c < result.col; c++) {
          if (image.get(newRow, c) !== Palette.NULL) {
            return fail(`Row ${newRow + 1} does not follow the height-expansion pattern (column ${c + 1})`);
          }
          for (let r = result.nulledFrom[c]; r >= 0 && r < newRow; r++) {
            if (image.get(r, c) !== Palette.NULL) {
              return fail(`Cell (row ${r + 1}, column ${c + 1}) must be NULL after the height expansion`);
            }
          }
        }
      }
    }

    if (!engine.grid.equals(image)) {
      return fail(CursorManager.#describeDifference(engine.grid, image));
    }
    return { ok: true, steps, engine };
  }

  static #describeDifference(replayed, image) {
    if (replayed.height !== image.height) {
      return `Image has ${image.height} rows but its writing sequence only accounts for ${replayed.height}`;
    }
    for (let r = 0; r < image.height; r++) {
      for (let c = 0; c < image.width; c++) {
        if (replayed.get(r, c) !== image.get(r, c)) {
          return `Cell (row ${r + 1}, column ${c + 1}) is inconsistent with the writing sequence`;
        }
      }
    }
    return 'Image is inconsistent with the writing sequence';
  }
}
