/**
 * VolumeBuilder.js - pure data model for the future/optional 3D view.
 * Each page is a layer; all layers share the origin at cell (1,1). NULL and
 * unwritten cells produce NO geometry (transparent/absent). Layer order is the
 * order of the given pages (session order, not stored in PNGs). Read-only.
 */
import Palette from '../Palette.js';

export default class VolumeBuilder {
  /** pages: [{ id, grid }] in layer order. */
  static build(pages) {
    const layers = [];
    let rows = 0, cols = 0, voxels = 0;
    pages.forEach(({ id, grid }, z) => {
      const cells = [];
      for (let r = 0; r < grid.height; r++) for (let c = 0; c < grid.width; c++) {
        const code = grid.get(r, c);
        if (Palette.isDigit(code) || Palette.isTerminator(code)) cells.push({ row: r, col: c, code });
      }
      layers.push({ pageId: id, z, cells }); voxels += cells.length;
      rows = Math.max(rows, grid.height); cols = Math.max(cols, grid.width);
    });
    const depth = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (const l of layers) for (const c of l.cells) depth[c.row][c.col]++;
    return { layers, bounds: { rows, cols, layers: layers.length }, voxels, depth };
  }
}
