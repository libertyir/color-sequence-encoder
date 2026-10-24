/**
 * Limits.js
 * Documented implementation limits and the canonical PNG cell size.
 */
export default class Limits {
  static MAX_WIDTH = 256;            // columns (W is fixed once writing starts)
  static MAX_INITIAL_HEIGHT = 512;   // rows the user may choose before writing
  static MAX_HEIGHT = 15000;         // rows reachable through automatic expansion (a 1024-character word needs up to ~14,120)
  static CELL_SIZE = 8;              // canonical PNG cell edge, in pixels

  static isValidInitialSize(width, height) {
    return Number.isInteger(width) && Number.isInteger(height) &&
      width >= 1 && width <= Limits.MAX_WIDTH &&
      height >= 1 && height <= Limits.MAX_INITIAL_HEIGHT;
  }
}
