#!/usr/bin/env node
// Renders the home-screen icons: icons/icon-180.png (iOS), icon-192.png,
// icon-512.png. Drawn as shapes at full resolution (4x4 supersampled) rather
// than scaled up from the 16-pixel sprite, so they stay smooth on the home
// screen: Pac-Man, mouth open, chasing a row of dots to a power pellet, on
// black. Everything sits inside the middle 80% so the maskable crop is safe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster } from './png.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLACK = [0, 0, 0], YELLOW = [255, 255, 0], DOT = [255, 184, 174];
const SS = 4;

/** Shapes in a 0..1 square, topmost first: [colour, inside(x, y)]. */
const MOUTH = (38 * Math.PI) / 180; // half-angle of the open mouth
const pac = { x: 0.40, y: 0.5, r: 0.28 };
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const SHAPES = [
  [YELLOW, (x, y) => {
    const dx = x - pac.x, dy = y - pac.y;
    if (dx * dx + dy * dy > pac.r * pac.r) return false;
    return !(dx > 0 && Math.abs(Math.atan2(dy, dx)) < MOUTH);
  }],
  [DOT, circle(0.64, 0.5, 0.028)],
  [DOT, circle(0.75, 0.5, 0.028)],
  [DOT, circle(0.86, 0.5, 0.062)], // the power pellet
];

function icon(size) {
  const r = new Raster(size, size);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const acc = [0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
      const hit = SHAPES.find(([, inside]) => inside(x, y));
      const c = hit ? hit[0] : BLACK;
      for (let i = 0; i < 3; i++) acc[i] += c[i];
    }
    r.set(px, py, acc.map((v) => Math.round(v / (SS * SS))));
  }
  return r.encode(1);
}

fs.mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
for (const size of [180, 192, 512]) fs.writeFileSync(path.join(ROOT, `icons/icon-${size}.png`), icon(size));
console.log('wrote icons/icon-{180,192,512}.png');
