// Differential runner: plays the original program (in the emulator) and
// src/game side by side from the same state with the same inputs, and reports
// the first frame where their memory differs.
//
// Frames line up at vblank: the emulator is stopped as the interrupt is raised,
// which is normally when its main loop sits idle with the task queue empty; the
// engine's frame() is the interrupt plus the queue. When a vblank lands in the
// middle of a task (the maze and screen clears can overrun a frame), the
// original finishes that task in the next frame; the two are resynced at the
// next vblank where it is idle again, and the frames in between are not checked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Host } from './host.mjs';
import { Machine } from '../../src/game/machine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tables = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tables.json'), 'utf8'));

// compared every frame: video and colour RAM, work RAM ($4F00-$4FEF is the stack), the sprite registers
const RANGES = [[0x4000, 0x4800], [0x4c00, 0x4f00], [0x4ff0, 0x5000], [0x5060, 0x5070]];

/** Deterministic PRNG for generated input. */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** Random joystick input as an IN0 byte (active low): runs of held directions. */
export function randomInput(seed) {
  const r = lcg(seed);
  let held = 0, left = 0;
  return () => {
    if (left-- <= 0) {
      left = 5 + Math.floor(r() * 60);
      held = [0, 1, 2, 4, 8, 1, 2, 4, 8][Math.floor(r() * 9)];
    }
    return 0xff & ~held;
  };
}

/**
 * A player that clears levels: at each tile it heads (breadth-first through
 * the maze) for the nearest blue ghost, else the fruit, else the nearest dot or energizer,
 * steering around the other ghosts; `seed` adds some wandering.
 */
export function botInput(seed) {
  const r = lcg(seed);
  const VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // dir 0-3 as (dl, dh): right, down, left, up
  const BIT = [0x04, 0x08, 0x02, 0x01];
  let held = 0, wander = 0;
  const vram = (l, h) => 0x4040 + ((h - 0x20) & 0xff) * 32 + ((l - 0x20) & 0xff);
  return (f, host) => {
    const m = host.mem;
    if (wander > 0) { wander--; return 0xff & ~held; }
    if (r() < 0.01) { wander = 20 + Math.floor(r() * 40); held = BIT[Math.floor(r() * 4)]; return 0xff & ~held; }
    const pl = m[0x4d39], ph = m[0x4d3a];
    const blue = [], danger = new Set();
    for (let k = 0; k < 4; k++) {
      const gl = m[0x4d31 + 2 * k], gh = m[0x4d32 + 2 * k];
      if (m[0x4dac + k]) continue;
      if (m[0x4da7 + k] && m[0x4da6]) blue.push(`${gl},${gh}`);
      else for (const [dl, dh] of [[0, 0], ...VEC]) danger.add(`${gl + dl},${gh + dh}`);
    }
    const fruit = m[0x4dd2] && m[0x4dd4] ? '50,46' : null; // the fruit's tile, $2E32
    const seen = new Map([[`${pl},${ph}`, -1]]);
    const q = [[pl, ph, -1]];
    while (q.length) {
      const [l, h, first] = q.shift();
      const key = `${l},${h}`;
      const t = m[vram(l, h)];
      const want = blue.length ? blue.includes(key) : fruit ? key === fruit : t === 0x10 || t === 0x14;
      if (first >= 0 && want) { held = BIT[first]; break; }
      for (let d = 0; d < 4; d++) {
        let nl = l + VEC[d][0], nh = h + VEC[d][1];
        if (nh < 0x1e) nh = 0x3d; else if (nh > 0x3d) nh = 0x1e;
        const nk = `${nl},${nh}`;
        if (seen.has(nk) || danger.has(nk)) continue;
        if (nl < 0x22 || nl > 0x3e) continue;
        if ((m[vram(nl, nh)] & 0xc0) === 0xc0) continue;
        seen.set(nk, 1);
        q.push([nl, nh, first < 0 ? d : first]);
      }
    }
    return 0xff & ~held;
  };
}

const idle = (h) => h.pc >= 0x238d && h.pc < 0x2395;
// past the power-on tests (whose RAM patterns can look like anything) and into the attract mode
export const booted = (h) => idle(h) && h.mem[0x4e00] === 1 && h.mem[0x4e02] > 0;

/**
 * Boot the original to the attract mode, optionally start a game, apply
 * `steps` ({until(host), setup(host)} run in order), then copy its state into
 * a fresh engine and run both for up to maxFrames with input(frame) as IN0;
 * poke(frame, host, write) may change memory in both before a frame.
 * Returns {frames, resyncs, mismatch: null | {...}, host, game}.
 */
export function runDiff({ input = () => 0xff, maxFrames = 5000, start = 0, dsw, steps = [], stopWhen = null, poke = null } = {}) {
  const host = new Host({ dsw });
  host.runUntil(booted, 3000);
  if (start) {
    host.runFrames(60);
    host.coin();
    if (start === 2) host.coin();
    host.runFrames(30);
    if (start === 2) host.start2(); else host.start1();
    host.runUntil((h) => h.mem[0x4e00] === 3, 600);
  }
  for (const st of steps) {
    if (st.until) host.runUntil(st.until, st.max || 30000);
    if (st.setup) st.setup(host);
  }
  host.runUntil(idle, 10);

  const game = new Machine(tables, { dsw });
  sync(host, game);
  let resyncs = 0, dirty = false;
  for (let f = 0; f < maxFrames; f++) {
    const in0 = input(f, host);
    host.in0 = in0;
    // poke(frame, write): changes made through write(addr, value) land in both
    if (poke) poke(f, host, (a, v) => { host.mem[a] = v; game.m[a] = v; });
    host.runFrame();
    game.frame(in0, host.in1);
    if (!idle(host)) { dirty = true; continue; }
    if (dirty) { resyncs++; dirty = false; sync(host, game); continue; }
    const bad = compare(host, game);
    if (bad) return { frames: f + 1, resyncs, mismatch: { frame: f, ...bad, mode: host.mem[0x4e00], step: [host.mem[0x4e02], host.mem[0x4e03], host.mem[0x4e04]] }, host, game };
    if (stopWhen && stopWhen(host, game)) return { frames: f + 1, resyncs, mismatch: null, host, game, stopped: true };
  }
  return { frames: maxFrames, resyncs, mismatch: null, host, game };
}

export function sync(host, game) {
  for (const [a, b] of RANGES) game.m.set(host.mem.subarray(a, b), a);
  game.m.set(host.mem.subarray(0x4fc0, 0x4ff0), 0x4fc0);
  game.sound.set(host.sound);
  game.latch.set(host.latch);
  game.in1 = host.in1;
}

function compare(host, game) {
  const diffs = [];
  for (const [a, b] of RANGES) {
    for (let i = a; i < b; i++) if (host.mem[i] !== game.m[i]) diffs.push(i);
  }
  for (let i = 0; i < 0x20; i++) if (host.sound[i] !== game.sound[i]) diffs.push(0x5040 + i);
  if (!diffs.length) return null;
  const hex = (v, n = 2) => v.toString(16).padStart(n, '0');
  const val = (mem, i) => (i >= 0x5040 && i < 0x5060 ? mem.sound[i - 0x5040] : mem.m[i]);
  return {
    addrs: diffs.slice(0, 16).map((i) => `${hex(i, 4)}: emu ${hex(i >= 0x5040 && i < 0x5060 ? host.sound[i - 0x5040] : host.mem[i])} js ${hex(val(game, i))}`),
    count: diffs.length,
  };
}

// CLI: node tools/emu/diff.mjs [seed] [frames] [start: 0 attract, 1 or 2 players]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const seed = Number(process.argv[2] || 1);
  const frames = Number(process.argv[3] || 5000);
  const start = Number(process.argv[4] || 0);
  const r = runDiff({ input: randomInput(seed), maxFrames: frames, start });
  const m = r.host.mem;
  console.log(r.mismatch ? { frames: r.frames, resyncs: r.resyncs, ...r.mismatch } : `ok: ${r.frames} frames (${r.resyncs} resyncs), mode ${m[0x4e00]} steps ${m[0x4e02]}/${m[0x4e03]}/${m[0x4e04]} level ${m[0x4e13] + 1}`);
}
