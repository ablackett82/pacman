#!/usr/bin/env node
// Rebuilds the Pac-Man program ROM ($0000-$3FFF) from the byte column of the
// commented disassembly (reference/pacman.asm, from
// http://cubeman.org/arcade-source/pacman.asm) and checks each 4K chip
// against the SHA1 that MAME publishes for the Midway "pacman" set. Writes
// reference/program.bin (gitignored: it is Namco's code, used only by the
// local emulator tests and the extractor).
//
// The listing is hand-edited, so a few lines carry typo'd addresses or bytes;
// FIXES corrects them, and SCORE_TABLE restores the points table at $2B17,
// which the listing writes as points/10 rather than as its BCD bytes (the
// score routine at $2A5A adds the entry's low byte to the score's last two
// digits, so 10 points is 10 00). With those, all four chips match MAME.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASM = path.join(ROOT, 'reference', 'pacman.asm');
const OUT = path.join(ROOT, 'reference', 'program.bin');

// MAME src/mame/pacman/pacman.cpp, ROM_START( pacman )
const CHIPS = [
  ['pacman.6e', 0x0000, 'e87e059c5be45753f7e9f33dff851f16d6751181'],
  ['pacman.6f', 0x1000, '674d3a7f00d8be5e38b1fdc208ebef5a92d38329'],
  ['pacman.6h', 0x2000, '8e47e8c2c4d6117d174cdac150392042d3e0a881'],
  ['pacman.6j', 0x3000, 'd4a70d56bb01d27d094d73db8667ffb00ca69cb9'],
];
// $2B17: dot, energizer, ghosts 1-4, the eight bonus fruit
const SCORE_TABLE = [10, 50, 200, 400, 800, 1600, 100, 300, 500, 700, 1000, 2000, 3000, 5000];

// line number (1-based) -> [wrong text, right text]
const FIXES = {
  218: ['0131 ', '0132 '],   // ld (#4c24),a follows the 3-byte ld a,(ix+0) at $012F
  6731: ['53033', '3033 '],  // stray digit
  7809: ['36f8', '36f9'],    // text pointer table: 2-byte entries from $36E7
  7820: ['3711', '370f'],    // same table
  8050: ['28R29', '2829 '],  // stray letter in jr z,#3818 (displacement $29)
};

export function buildRom() {
  const lines = fs.readFileSync(ASM, 'latin1').split(/\r?\n/);
  const rom = new Int16Array(0x4000).fill(-1);
  const src = new Int32Array(0x4000);
  const problems = [];
  lines.forEach((raw, i) => {
    const ln = i + 1;
    let line = raw;
    const fix = FIXES[ln];
    if (fix) {
      if (!line.includes(fix[0])) problems.push(`line ${ln}: expected "${fix[0]}"`);
      line = line.replace(fix[0], fix[1]);
    }
    const m = /^([0-9a-fA-F]{4})\s+([0-9a-fA-F]{2,8})(?:\s|$)/.exec(line);
    if (!m) return;
    const a = parseInt(m[1], 16);
    for (let k = 0; k < m[2].length; k += 2) {
      const at = a + k / 2, v = parseInt(m[2].slice(k, k + 2), 16);
      if (at >= 0x4000) continue;
      if (rom[at] >= 0 && rom[at] !== v) problems.push(`line ${ln}: $${at.toString(16)} = ${v.toString(16)} but line ${src[at]} says ${rom[at].toString(16)}`);
      rom[at] = v; src[at] = ln;
    }
  });
  SCORE_TABLE.forEach((p, i) => {
    const bcd = parseInt(String(p), 16);
    rom[0x2b17 + 2 * i] = bcd & 0xff;
    rom[0x2b18 + 2 * i] = bcd >> 8;
  });
  const missing = [];
  for (let a = 0; a < 0x4000; a++) if (rom[a] < 0) missing.push(a);
  const bin = Buffer.from(Array.from(rom, (v) => Math.max(0, v)));
  const chips = CHIPS.map(([name, base, sha]) => {
    const got = crypto.createHash('sha1').update(bin.subarray(base, base + 0x1000)).digest('hex');
    return { name, base, ok: got === sha };
  });
  return { bin, missing, problems, chips };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(ASM)) {
    console.log('reference/pacman.asm missing: curl -o reference/pacman.asm http://cubeman.org/arcade-source/pacman.asm');
    process.exit(1);
  }
  const r = buildRom();
  for (const p of r.problems) console.log(p);
  console.log('missing:', r.missing.length ? r.missing.map((a) => a.toString(16)).join(' ') : 'none');
  for (const c of r.chips) console.log(`${c.name} $${c.base.toString(16).padStart(4, '0')}: ${c.ok ? 'OK' : 'MISMATCH'}`);
  if (!r.problems.length && !r.missing.length && r.chips.every((c) => c.ok)) {
    fs.writeFileSync(OUT, r.bin);
    console.log(`wrote ${path.relative(ROOT, OUT)}`);
  } else process.exitCode = 1;
}
