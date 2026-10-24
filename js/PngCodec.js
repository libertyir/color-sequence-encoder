/**
 * PngCodec.js - exact, dependency-free PNG encoding/decoding of a grid.
 * Encoder: 8-bit RGB, filter 0, only IHDR/IDAT/IEND (no profiles, no alpha).
 * Decoder: own parser (8-bit RGB/RGBA, non-interlaced), so pixel bytes are
 * never touched by browser color management. Everything else is rejected.
 * Cells are Limits.CELL_SIZE x Limits.CELL_SIZE pixels. decode() never throws.
 */
import Palette from './Palette.js';
import GridModel from './GridModel.js';
import Limits from './Limits.js';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const pipe = async (bytes, transform) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
const fail = (reason) => Object.freeze({ ok: false, reason, grid: null });

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export default class PngCodec {
  /** Grid -> PNG bytes (one exact solid color per 8x8 block). */
  static async encode(grid) {
    const S = Limits.CELL_SIZE;
    const width = grid.width * S, height = grid.height * S;
    const stride = 1 + width * 3;
    const raw = new Uint8Array(height * stride); // filter byte 0 already zero
    for (let r = 0; r < grid.height; r++) {
      const first = r * S * stride;
      for (let c = 0; c < grid.width; c++) {
        const rgb = Palette.rgbOf(grid.get(r, c));
        for (let x = 0; x < S; x++) raw.set(rgb, first + 1 + (c * S + x) * 3);
      }
      for (let y = 1; y < S; y++) raw.copyWithin(first + y * stride, first, first + stride);
    }
    return PngCodec.#finish(width, height, 2, raw);
  }

  /** Test helper: build a PNG from arbitrary pixels (channels 3 or 4). */
  static async encodeRaw({ width, height, channels, pixels }) {
    const stride = 1 + width * channels;
    const raw = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width * channels, (y + 1) * width * channels), y * stride + 1);
    return PngCodec.#finish(width, height, channels === 4 ? 6 : 2, raw);
  }

  static async #finish(width, height, colorType, raw) {
    const ihdr = new Uint8Array(13);
    const v = new DataView(ihdr.buffer);
    v.setUint32(0, width); v.setUint32(4, height);
    ihdr[8] = 8; ihdr[9] = colorType;
    const idat = await pipe(raw, new CompressionStream('deflate'));
    const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  /** PNG bytes -> { ok, reason, grid }. */
  static async decode(bytes) {
    try { return await PngCodec.#decode(bytes); }
    catch (e) { return fail(`Not a readable PNG: ${e.message}`); }
  }

  static async #decode(bytes) {
    if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) return fail('Not a PNG file (bad signature)');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const idats = [];
    let ihdr = null, pos = 8, ended = false;
    while (pos + 12 <= bytes.length && !ended) {
      const len = view.getUint32(pos);
      const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
      if (pos + 12 + len > bytes.length) return fail('Truncated PNG');
      const data = bytes.subarray(pos + 8, pos + 8 + len);
      if (crc32(bytes.subarray(pos + 4, pos + 8 + len)) !== view.getUint32(pos + 8 + len)) return fail(`Corrupt PNG chunk ${type}`);
      if (type === 'IHDR') ihdr = data;
      else if (type === 'IDAT') idats.push(data);
      else if (type === 'tRNS') return fail('PNG declares transparency (tRNS), which is not allowed');
      else if (type === 'IEND') ended = true;
      pos += 12 + len;
    }
    if (!ihdr || !idats.length || !ended) return fail('Incomplete PNG');
    const hv = new DataView(ihdr.buffer, ihdr.byteOffset, 13);
    const width = hv.getUint32(0), height = hv.getUint32(4);
    const [depth, colorType, comp, filt, interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
    if (depth !== 8 || (colorType !== 2 && colorType !== 6) || comp || filt || interlace) {
      return fail('Unsupported PNG variant: only 8-bit RGB/RGBA, non-interlaced images are accepted');
    }
    const S = Limits.CELL_SIZE;
    if (!width || !height || width % S || height % S) return fail(`Image size ${width}x${height} is not a multiple of the ${S}px cell size`);
    if (width / S > Limits.MAX_WIDTH || height / S > Limits.MAX_HEIGHT) return fail('Image exceeds the supported grid size');
    const ch = colorType === 6 ? 4 : 3;
    const joined = new Uint8Array(idats.reduce((n, d) => n + d.length, 0));
    let o = 0;
    for (const d of idats) { joined.set(d, o); o += d.length; }
    const raw = await pipe(joined, new DecompressionStream('deflate'));
    if (raw.length !== height * (1 + width * ch)) return fail('PNG pixel data has an unexpected length');
    return PngCodec.decodePixels(PngCodec.#unfilter(raw, width, height, ch), width, height, ch);
  }

  static #unfilter(raw, width, height, ch) {
    const stride = width * ch;
    const out = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
      const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? out[dst + x - ch] : 0;
        const b = y > 0 ? out[dst - stride + x] : 0;
        const c = x >= ch && y > 0 ? out[dst - stride + x - ch] : 0;
        let v = raw[src + x];
        if (f === 1) v += a;
        else if (f === 2) v += b;
        else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        } else if (f !== 0) throw new Error('bad filter type');
        out[dst + x] = v & 255;
      }
    }
    return out;
  }

  /** Strict pixel -> grid conversion: uniform cells, exact palette colors, opaque. */
  static decodePixels(px, width, height, ch) {
    const S = Limits.CELL_SIZE;
    const rows = height / S, cols = width / S;
    const cells = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const base = ((r * S) * width + c * S) * ch;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = (((r * S + y) * width) + c * S + x) * ch;
        if (ch === 4 && px[i + 3] !== 255) return fail(`Transparent pixel in cell (row ${r + 1}, column ${c + 1})`);
        if (px[i] !== px[base] || px[i + 1] !== px[base + 1] || px[i + 2] !== px[base + 2]) {
          return fail(`Cell (row ${r + 1}, column ${c + 1}) is not a uniform color`);
        }
      }
      const code = Palette.codeFromRgb(px[base], px[base + 1], px[base + 2]);
      if (code < 0) return fail(`Unknown color rgb(${px[base]}, ${px[base + 1]}, ${px[base + 2]}) in cell (row ${r + 1}, column ${c + 1})`);
      cells[r * cols + c] = code;
    }
    return Object.freeze({ ok: true, reason: null, grid: GridModel.fromCells(cols, rows, cells) });
  }
}
