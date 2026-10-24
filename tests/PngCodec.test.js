import Palette from '../js/Palette.js';
import WritingEngine from '../js/WritingEngine.js';
import PngCodec from '../js/PngCodec.js';
import { mulberry32 } from './helpers.js';

function pixels(grid, channels, edit) {
  const W = grid.width * 8, H = grid.height * 8;
  const px = new Uint8Array(W * H * channels).fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.set(Palette.rgbOf(grid.get(y >> 3, x >> 3)), (y * W + x) * channels);
  edit?.(px, W, channels);
  return { width: W, height: H, channels, pixels: px };
}

export default function register(t) {
  t.suite('PngCodec');

  t.test('export then import preserves every exact cell color and the dimensions', async () => {
    const rng = mulberry32(7), e = WritingEngine.fromEmpty(3, 2);
    for (let i = 0; i < 40; i++) e.write(1 + Math.floor(rng() * 6));
    const bytes = await PngCodec.encode(e.grid);
    t.equal(new DataView(bytes.buffer).getUint32(16), 24, 'PNG width');
    t.equal(new DataView(bytes.buffer).getUint32(20), e.grid.height * 8, 'PNG height');
    const d = await PngCodec.decode(bytes);
    t.assert(d.ok, d.reason); t.assert(d.grid.equals(e.grid), 'grids differ');
  });

  t.test('RGBA images with fully opaque pixels are accepted', async () => {
    const e = WritingEngine.fromEmpty(2, 2); e.write(5);
    const d = await PngCodec.decode(await PngCodec.encodeRaw(pixels(e.grid, 4)));
    t.assert(d.ok && d.grid.equals(e.grid), d.reason);
  });

  t.test('unknown colors are rejected, never approximated', async () => {
    const e = WritingEngine.fromEmpty(2, 2);
    const img = pixels(e.grid, 3, (px, W) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px.set([1, 2, 3], (y * W + x) * 3); });
    const d = await PngCodec.decode(await PngCodec.encodeRaw(img));
    t.assert(!d.ok && /Unknown color/.test(d.reason), d.reason);
  });

  t.test('a nonuniform cell is rejected', async () => {
    const e = WritingEngine.fromEmpty(2, 2);
    const img = pixels(e.grid, 3, (px) => px.set([0, 0, 0], 0));
    const d = await PngCodec.decode(await PngCodec.encodeRaw(img));
    t.assert(!d.ok && /uniform/.test(d.reason), d.reason);
  });

  t.test('unexpected transparency is rejected', async () => {
    const e = WritingEngine.fromEmpty(2, 2);
    const img = pixels(e.grid, 4, (px) => { px[3] = 254; });
    const d = await PngCodec.decode(await PngCodec.encodeRaw(img));
    t.assert(!d.ok && /Transparent/.test(d.reason), d.reason);
  });

  t.test('wrong geometry and non-PNG data are rejected', async () => {
    const bad = await PngCodec.encodeRaw({ width: 10, height: 8, channels: 3, pixels: new Uint8Array(240).fill(255) });
    t.assert(!(await PngCodec.decode(bad)).ok, 'size not a multiple of 8');
    t.assert(!(await PngCodec.decode(new Uint8Array([1, 2, 3]))).ok, 'garbage');
    const good = await PngCodec.encode(WritingEngine.fromEmpty(1, 1).grid);
    good[good.length - 20] ^= 1;
    t.assert(!(await PngCodec.decode(good)).ok, 'corrupted chunk');
  });
}
