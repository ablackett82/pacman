#!/usr/bin/env node
// Coverage tracer: plays the original through the attract mode, one- and
// two-player games, deaths, level clears and the intermissions, recording
// which ROM bytes run as code and which are read as data. Writes
// reference/coverage.json ({code: [...addresses], data: [...addresses]}),
// used by tools/listing.mjs and tools/extract.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Host } from './host.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const code = new Uint8Array(0x4000), data = new Uint8Array(0x4000);

function traced(opts) {
  const h = new Host(opts);
  const rd = h.hal.readMemory;
  let pc = 0;
  // reads outside the executing instruction's own bytes (at most 4) are data
  h.hal.readMemory = (a) => {
    a &= 0x7fff;
    if (a < 0x4000 && (a < pc || a >= pc + 4) && (pc < 0x3000 || pc >= 0x3100)) data[a] = 1; // not the power-on ROM checksum
    return rd(a);
  };
  const step = h.cpu.step.bind(h.cpu);
  h.cpu.step = () => {
    pc = h.cpu.regs.pc;
    if (pc < 0x4000) code[pc] = 1;
    step();
  };
  return h;
}

// Random joystick: runs of held directions.
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
function wander(h, frames, seed) {
  const r = lcg(seed);
  let left = 0, dir = 0;
  for (let f = 0; f < frames; f++) {
    if (left-- <= 0) { left = 10 + Math.floor(r() * 50); dir = [0, 1, 2, 4, 8][Math.floor(r() * 5)]; }
    h.in0 = (h.in0 & 0xf0) | (0x0f & ~dir);
    h.runFrame();
  }
}

// 1: long attract mode (intro, demo game), then a one-player game
{
  const h = traced();
  h.runFrames(4000);
  h.coin(); h.coin(); h.runFrames(60); h.start1();
  wander(h, 20000, 1);
}
// 2: two-player game
{
  const h = traced();
  h.runFrames(300); h.coin(); h.coin(); h.runFrames(60); h.start2();
  wander(h, 20000, 2);
}
// 3: levels 1-21 cleared by eating every dot (intermissions after 2, 5, 9, 13, 17)
{
  const h = traced({ dsw: 0xcd }); // 5 lives
  h.runFrames(300); h.coin(); h.runFrames(60); h.start1();
  for (let lv = 0; lv < 22; lv++) {
    h.runUntil((x) => x.mem[0x4e04] === 3, 3000);   // play in progress
    h.runFrames(120);
    h.mem[0x4e0e] = 0xf4;                            // dots eaten: one short of 244
    h.mem[0x4e14] = 5;                               // lives
    wander(h, 1500, 100 + lv);
  }
  console.log('clearing run reached level', h.mem[0x4e13] + 1, 'mode', h.mem[0x4e00], h.mem[0x4e04]);
}
// 4: free play, rack test, bonus none, cocktail, hard difficulty, alternate names
{
  const h = traced({ dsw: 0x30 | 0x00 });
  h.in1 &= 0x7f;
  h.runFrames(3000); h.start1(); wander(h, 8000, 4);
}

const list = (a) => [...a.keys()].filter((i) => a[i]);
const out = { code: list(code), data: list(data).filter((i) => !code[i]) };
fs.writeFileSync(path.join(ROOT, 'reference', 'coverage.json'), JSON.stringify(out));
console.log(`code ${out.code.length} bytes (instruction starts), data ${out.data.length} bytes`);
