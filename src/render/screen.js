// Draws the machine's video RAM ($4000-$43FF, colours at $4400) and sprite
// registers ($4FF0 codes and colours, $5060 positions) into a 224 x 288 RGBA
// image, as the video hardware did, with this project's own pictures.
//
// Geometry (the monitor is on its side): the playfield runs in columns from
// the right, $4040 + 32 * (27 - x) + (y - 2); the top two and bottom two rows
// run right to left from $43DD and $401D. A sprite with position bytes
// (p0, p1) has its top-left at x = 239 - p0 (238 for sprites 0-2, which the
// hardware shows a pixel over), y = 272 - p1; code bit 1 mirrors it
// left-right, bit 0 top-bottom. Lower-numbered sprites are drawn on top.
import { TILES, SPRITES, PALETTES } from './art.js';

export const SCREEN_W = 224, SCREEN_H = 288;

export function tileOffset(x, y) {
  if (y < 2) return 0x3dd + y * 0x20 - x;
  if (y >= 34) return 0x01d + (y - 34) * 0x20 - x;
  return 0x040 + (27 - x) * 0x20 + (y - 2);
}

function compile(rows, n) {
  const px = new Uint8Array(n * n);
  rows.forEach((r, y) => { for (let x = 0; x < n; x++) px[y * n + x] = r.charCodeAt(x) - 48; });
  return px;
}

export class Screen {
  constructor() {
    this.rgba = new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4);
    this.tiles = [];
    for (let c = 0; c < 256; c++) this.tiles[c] = TILES[c] ? compile(TILES[c], 8) : null;
    this.sprites = SPRITES.map((s) => compile(s, 16));
    this.offsets = [];
    for (let y = 0; y < 36; y++) for (let x = 0; x < 28; x++) this.offsets.push(tileOffset(x, y));
  }

  /** Render the machine's screen. */
  draw(g) {
    const m = g.m, out = this.rgba;
    out.fill(0);
    for (let i = 3; i < out.length; i += 4) out[i] = 255;
    // tiles
    for (let ty = 0, k = 0; ty < 36; ty++) {
      for (let tx = 0; tx < 28; tx++, k++) {
        const o = this.offsets[k];
        const px = this.tiles[m[0x4000 + o]];
        if (!px) continue;
        const pal = PALETTES[m[0x4400 + o] & 0x1f];
        for (let y = 0; y < 8; y++) {
          let p = ((ty * 8 + y) * SCREEN_W + tx * 8) * 4;
          for (let x = 0; x < 8; x++, p += 4) {
            const v = px[y * 8 + x];
            if (!v) continue;
            const c = pal[v - 1];
            if (!c) continue;
            out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2];
          }
        }
      }
    }
    // sprites, highest number first so the lower ones end up on top
    for (let i = 7; i >= 0; i--) {
      const code = m[0x4ff0 + 2 * i], pal = PALETTES[m[0x4ff1 + 2 * i] & 0x1f];
      const px = this.sprites[code >> 2];
      const left = (i <= 2 ? 238 : 239) - m[0x5060 + 2 * i];
      const top = 272 - m[0x5061 + 2 * i];
      const flipX = code & 2, flipY = code & 1;
      for (const top2 of [top, top - 256]) {
        for (let y = 0; y < 16; y++) {
          const sy = top2 + y;
          if (sy < 16 || sy >= SCREEN_H - 16) continue; // not over the score and fruit rows
          const row = (flipY ? 15 - y : y) * 16;
          for (let x = 0; x < 16; x++) {
            const sx = left + x;
            if (sx < 0 || sx >= SCREEN_W) continue;
            const v = px[row + (flipX ? 15 - x : x)];
            if (!v) continue;
            const c = pal[v - 1];
            if (!c) continue;
            const p = (sy * SCREEN_W + sx) * 4;
            out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2];
          }
        }
      }
    }
    return out;
  }
}
