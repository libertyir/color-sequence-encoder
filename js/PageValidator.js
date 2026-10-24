/**
 * PageValidator.js - validates grids and PNG images without modifying them.
 * All structural rules live in WritingEngine; validation = faithful replay
 * through CursorManager. Results are in-memory only.
 */
import CursorManager from './CursorManager.js';
import PngCodec from './PngCodec.js';

export default class PageValidator {
  static validateGrid(grid) {
    const res = CursorManager.reconstruct(grid);
    return Object.freeze({
      valid: res.ok, status: res.status, reason: res.reason,
      target: res.target, unitOpen: res.unitOpen, engine: res.engine, grid,
    });
  }

  static async validatePng(bytes) {
    const decoded = await PngCodec.decode(bytes);
    if (!decoded.ok) {
      return Object.freeze({ valid: false, status: CursorManager.STATUS.INVALID, reason: decoded.reason, target: null, unitOpen: false, engine: null, grid: null });
    }
    return PageValidator.validateGrid(decoded.grid);
  }
}
