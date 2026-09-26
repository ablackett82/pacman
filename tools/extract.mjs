#!/usr/bin/env node
// Writes data/tables.json: the parts of the arcade program the engine reads
// as data, loaded at their original addresses so its table lookups read
// exactly what the original did:
//   $0000-$1FFF  the frightened ghosts' random numbers: the generator at $2A23
//                walks a pointer through these 8K and reads whatever is there
//                (it also holds the level tables at $0068, $0219, $0796-$0876
//                and $0EFD)
//   and the data tables in $2000-$3FFF: bonus-life values, the points table,
//   direction vectors, speed patterns, the maze and dot layout, the text,
//   the fruit row, and the sound effects and songs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRom } from './buildrom.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = buildRom();
if (!r.chips.every((c) => c.ok)) throw new Error('program rebuild does not match the MAME checksums; run tools/buildrom.mjs');

const RANGES = [
  [0x0000, 0x2000], // random numbers (and level tables)
  [0x2728, 0x2730], // bonus life values, level table pointers
  [0x2b17, 0x2b33], // points
  [0x32ff, 0x3af4], // direction vectors, speed patterns, maze, dots, text
  [0x3b08, 0x3cde], // fruit row, sound effects, note tables, songs
  [0x3d00, 0x3e5c], // more text
];
const runs = RANGES.map(([a, b]) => [a, r.bin.subarray(a, b).toString('hex')]);
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'tables.json'), JSON.stringify({ runs }) + '\n');
console.log(`data/tables.json: ${runs.length} runs, ${runs.reduce((n, [, h]) => n + h.length / 2, 0)} bytes`);
