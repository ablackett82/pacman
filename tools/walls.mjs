#!/usr/bin/env node
// Generates the maze wall tiles (src/render/walls.js) from the maze itself:
// the engine draws the maze into video RAM, every wall tile is marked solid,
// and the walls are drawn as lines a fixed distance in from the corridors:
// one line 4 pixels in for the blocks inside the maze, and a second one 7
// pixels in for the outer wall and the ghost house, with the corners cut.
// Each tile code must come out the same wherever the maze uses it; a clash is
// an error. `--png out.png` also writes a preview of the whole maze.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Machine } from '../src/game/machine.js';
import { TASKS } from '../src/game/tasks.js';
import { Raster } from './png.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tables = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tables.json'), 'utf8'));

// screen tile (x, y), 28 x 36, to its video RAM offset (as tools/emu/host.mjs)
const offset = (x, y) => (y < 2 ? 0x3dd + y * 0x20 - x : y >= 34 ? 0x01d + (y - 34) * 0x20 - x : 0x040 + (27 - x) * 0x20 + (y - 2));

const g = new Machine(tables);
TASKS[2](g, 0);
const W = 28, H = 36;
const code = (x, y) => g.m[0x4000 + offset(x, y)];
const isWall = (x, y) => code(x, y) >= 0xc0;
const DOOR = new Set([0xce, 0xcf]);

// which wall tiles belong to the outer wall or the ghost house (double lines)
const doubled = new Set();
{
  const seen = new Set();
  const flood = (sx, sy) => {
    const comp = [], stack = [[sx, sy]];
    seen.add(`${sx},${sy}`);
    let edge = false, house = false;
    while (stack.length) {
      const [x, y] = stack.pop();
      comp.push([x, y]);
      if (x === 0 || x === W - 1 || y === 3 || y === 33) edge = true;
      if (DOOR.has(code(x, y))) house = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 3 || ny > 33 || !isWall(nx, ny) || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        stack.push([nx, ny]);
      }
    }
    if (edge || house) for (const [x, y] of comp) doubled.add(`${x},${y}`);
  };
  for (let y = 3; y <= 33; y++) for (let x = 0; x < W; x++) if (isWall(x, y) && !seen.has(`${x},${y}`)) flood(x, y);
}

// pixel grid: open = corridor (including off-screen beyond the tunnel), solid = wall
const PW = W * 8, PH = H * 8;
const open = (px, py) => {
  const tx = Math.floor(px / 8), ty = Math.floor(py / 8);
  if (ty < 3 || ty > 33) return false;
  if (tx < 0 || tx >= W) return !isWall(tx < 0 ? 0 : W - 1, ty);
  return !isWall(tx, ty);
};
// Chebyshev distance from each wall pixel to the nearest corridor pixel (capped)
const CAP = 9;
const dist = new Uint8Array(PW * PH).fill(0);
for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
  if (open(px, py)) continue;
  let d = CAP;
  for (let r = 1; r < CAP && d === CAP; r++) {
    for (let k = -r; k <= r && d === CAP; k++) {
      if (open(px + k, py - r) || open(px + k, py + r) || open(px - r, py + k) || open(px + r, py + k)) d = r;
    }
  }
  dist[py * PW + px] = d;
}
// the outer line runs only where the wall goes on beyond it (not down the
// middle of a 16-pixel stub like the one hanging from the top wall)
const deeper = (px, py) => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = px + dx, y = py + dy;
    if (x >= 0 && y >= 0 && x < PW && y < PH && dist[y * PW + x] >= CAP) return true;
    if ((x < 0 || x >= PW) && !open(x, y)) return true;
  }
  return false;
};
const line = new Uint8Array(PW * PH);
for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
  const tx = Math.floor(px / 8), ty = Math.floor(py / 8);
  if (ty < 3 || ty > 33 || !isWall(tx, ty)) continue;
  const d = dist[py * PW + px];
  if (d === 5) line[py * PW + px] = 1;
  else if (d === 8 && doubled.has(`${tx},${ty}`) && deeper(px, py)) line[py * PW + px] = 2;
}
// cut the corners: the inner line by two pixels, the outer by one
const at = (x, y, v) => x >= 0 && y >= 0 && x < PW && y < PH && line[y * PW + x] === v;
const cuts = [];
for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
  const v = line[py * PW + px];
  if (!v) continue;
  const hx = at(px - 1, py, v) ? -1 : at(px + 1, py, v) ? 1 : 0;
  const vy = at(px, py - 1, v) ? -1 : at(px, py + 1, v) ? 1 : 0;
  if (!hx || !vy || (at(px - 1, py, v) && at(px + 1, py, v)) || (at(px, py - 1, v) && at(px, py + 1, v))) continue;
  cuts.push([px, py, hx, vy, v]);
}
for (const [px, py, hx, vy, v] of cuts) {
  line[py * PW + px] = 0;
  if (v === 1) {
    line[py * PW + px + hx] = 0;
    line[(py + vy) * PW + px] = 0;
    line[(py + vy) * PW + px + hx] = v;
  }
}

// slice into tiles and check each code is consistent
const art = {};
const clashes = [];
for (let ty = 3; ty <= 33; ty++) for (let tx = 0; tx < W; tx++) {
  const c = code(tx, ty);
  if (c < 0xc0) continue;
  const rows = [];
  for (let y = 0; y < 8; y++) {
    let s = '';
    for (let x = 0; x < 8; x++) s += line[(ty * 8 + y) * PW + tx * 8 + x] ? '1' : '.';
    rows.push(s);
  }
  if (DOOR.has(c)) { rows.fill('........'); rows[5] = rows[6] = '33333333'; }
  if (art[c] && art[c].join() !== rows.join()) { clashes.push(`$${c.toString(16)} at ${tx},${ty}`); if (process.env.SHOW === c.toString(16)) console.log(tx, ty, rows.join(' '), '| first', art[c].join(' '), art[c].at); }
  else if (!art[c]) { art[c] = rows; art[c].at = `${tx},${ty}`; }
}
if (clashes.length) console.log('clashes (first use kept):', clashes.join(', '));

const out = ['// Generated by tools/walls.mjs from the maze layout: do not edit.',
  '// The maze wall tiles, 8 rows of 8 pixels (1 = wall colour, 3 = the door).',
  'export const WALLS = {'];
for (const c of Object.keys(art).map(Number).sort((a, b) => a - b)) out.push(`  0x${c.toString(16)}: ${JSON.stringify(art[c])},`);
out.push('};', '');
fs.writeFileSync(path.join(ROOT, 'src', 'render', 'walls.js'), out.join('\n'));
console.log(`src/render/walls.js: ${Object.keys(art).length} tiles`);

const pngAt = process.argv.indexOf('--png');
if (pngAt > 0) {
  const r = new Raster(PW, PH);
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const t = art[code(tx, ty)];
    if (!t) continue;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = t[y][x];
      if (v === '1') r.set(tx * 8 + x, ty * 8 + y, [0x21, 0x21, 0xff]);
      if (v === '3') r.set(tx * 8 + x, ty * 8 + y, [0xff, 0xb8, 0xff]);
    }
  }
  fs.writeFileSync(process.argv[pngAt + 1], r.encode(3));
}
