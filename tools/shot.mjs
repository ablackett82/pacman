#!/usr/bin/env node
// Renders frames of the engine to PNG for checking the pictures:
//   node tools/shot.mjs out.png frame [coin] [scale]
// runs the engine from power-on for `frame` frames (optionally coining up and
// starting a game on the way, with a bot steering) and saves that frame.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster } from './png.js';
import { Machine } from '../src/game/machine.js';
import { Screen, SCREEN_W, SCREEN_H } from '../src/render/screen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tables = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tables.json'), 'utf8'));

export function shoot(g, file, scale = 2) {
  const img = new Screen().draw(g);
  const r = new Raster(SCREEN_W, SCREEN_H);
  for (let y = 0; y < SCREEN_H; y++) for (let x = 0; x < SCREEN_W; x++) {
    const p = (y * SCREEN_W + x) * 4;
    r.set(x, y, [img[p], img[p + 1], img[p + 2]]);
  }
  fs.writeFileSync(file, r.encode(scale));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, frames = '600', coin = '0', scale = '2'] = process.argv.slice(2);
  const g = new Machine(tables);
  const { botInput } = await import('./emu/diff.mjs');
  const bot = botInput(1);
  for (let f = 0; f < Number(frames); f++) {
    let in0 = 0xff, in1 = 0xff;
    if (coin !== '0') {
      if (f >= 300 && f < 304) in0 &= ~0x20;   // coin
      if (f >= 360 && f < 364) in1 &= ~0x20;   // 1P start
      if (g.m[0x4e00] === 3) in0 = bot(f, { mem: g.m });
    }
    g.frame(in0, in1);
  }
  shoot(g, file, Number(scale));
  console.log(`wrote ${file}`);
}
