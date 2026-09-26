// Core routines: the vblank interrupt, the frame timers and timed tasks, the
// task queue and the main loop that runs it, coins and credits, the lamps and
// the flashing 1UP / 2UP, and the mode dispatcher.
import { TASKS } from './tasks.js';
import { resetMode, attractMode, coinMode, playMode } from './modes.js';
import { advanceMode, advanceCoinMode, advanceAttract, eraseReady } from './modes.js';
import { deathTick, clearFruit, clearFruitScore } from './play.js';
import { intermission1Step, intermission2Step, intermission3Step } from './intermission.js';
import { spriteCodes, bigPacmanPositions } from './sprites.js';
import { soundEffects, soundSongs } from './sound.js';

// ---------------------------------------------------------------------------
// Helpers for the RST instructions and BCD arithmetic
// ---------------------------------------------------------------------------

/** RST 8: fill b bytes (0 = 256) from hl with a; returns hl after them. */
export function fill(g, hl, b, a) {
  const m = g.m;
  let n = b || 256;
  while (n-- > 0) { m[hl] = a; hl = (hl + 1) & 0xffff; }
  return hl;
}

/** RST 18: the word at hl + 2*b. */
export const word = (g, hl, b) => g.w((hl + 2 * b) & 0xffff);

/** $0042 (and RST 28): queue task b with parameter c for the main loop. */
export function queue(g, b, c) {
  const m = g.m;
  let hl = g.w(0x4c80);
  m[hl] = b;
  hl = (hl & 0xff00) | ((hl + 1) & 0xff);
  m[hl] = c;
  hl = (hl & 0xff00) | ((hl + 1) & 0xff);
  if ((hl & 0xff) === 0) hl = (hl & 0xff00) | 0xc0;
  g.sw(0x4c80, hl);
}

/**
 * RST 30 ($0051): start a timed task: `timer` counts down in the unit given by
 * its top two bits (0 frames, 1 tenths, 2 seconds, 3 tens of seconds), then
 * routine `id` of TIMED runs with parameter `param`. Up to 16 at once.
 */
export function timed(g, timer, id, param) {
  const m = g.m;
  for (let de = 0x4c90; de < 0x4cc0; de += 3) {
    if (m[de] === 0) { m[de] = timer; m[de + 1] = id; m[de + 2] = param; return; }
  }
}

/** Z80 DAA after an 8-bit add of x + y + cin: the BCD sum and its carry. */
export function bcdAdd(x, y, cin = 0) {
  const s = x + y + cin;
  const h = (x & 0x0f) + (y & 0x0f) + cin > 0x0f;
  let a = s & 0xff, c = s > 0xff, corr = 0;
  if (h || (a & 0x0f) > 9) corr |= 0x06;
  if (c || a > 0x99) { corr |= 0x60; c = true; }
  return { v: (a + corr) & 0xff, c: c ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// The vblank interrupt ($008D), where all the game logic runs
// ---------------------------------------------------------------------------

export function interrupt(g) {
  const m = g.m, snd = g.sound;
  // $009D: frequencies and volumes, then each voice's waveform: the effect's
  // while one plays ($4ECC/$4EDC/$4EEC), otherwise the song's
  for (let i = 0; i < 16; i++) snd[0x10 + i] = m[0x4e8c + i] & 0x0f;
  snd[0x05] = (m[0x4ecc] ? m[0x4ecf] : m[0x4e9f]) & 0x0f;
  snd[0x0a] = (m[0x4edc] ? m[0x4edf] : m[0x4eaf]) & 0x0f;
  snd[0x0f] = (m[0x4eec] ? m[0x4eef] : m[0x4ebf]) & 0x0f;

  // $00D5: the sprite list, from the game's copy at $4C02 into $4C22, with
  // the code bytes' flip bits (7, 6) rotated down to where the hardware wants them
  m.copyWithin(0x4c22, 0x4c02, 0x4c02 + 0x1c);
  for (let a = 0x4c22; a <= 0x4c2c; a += 2) m[a] = ((m[a] << 2) | (m[a] >> 6)) & 0xff;
  // $0114: while a ghost's points show, its sprite swaps places with sprite 2
  if (m[0x4dd1] === 1) {
    const ix = 0x4c20 + 2 * m[0x4da4];
    const hl = g.w(0x4c24), de = g.w(0x4c34);
    m[0x4c24] = m[ix]; m[0x4c25] = m[ix + 1];
    m[0x4c34] = m[ix + 0x10]; m[0x4c35] = m[ix + 0x11];
    g.sw(ix, hl); g.sw(ix + 0x10, de);
  }
  // $0153: while the ghosts are blue, Pac-Man's sprite swaps with sprite 1 so he is drawn over them
  if (m[0x4da6]) {
    const bc = g.w(0x4c22), de = g.w(0x4c32);
    g.sw(0x4c22, g.w(0x4c2a)); g.sw(0x4c32, g.w(0x4c3a));
    g.sw(0x4c2a, bc); g.sw(0x4c3a, de);
  }
  m.copyWithin(0x4ff2, 0x4c22, 0x4c22 + 12);
  m.copyWithin(0x5062, 0x4c32, 0x4c32 + 12);

  frameTimers(g);
  runTimed(g);
  dispatch(g);
  if (m[0x4e00] !== 0) {
    bigPacmanPositions(g);
    spriteCodes(g);
    coinLockout(g);
    coinCounter(g);
    lamps(g);
  }
  if (m[0x4e00] === 1) { m[0x4eac] = 0; m[0x4ebc] = 0; } // no effects in the attract mode
  soundEffects(g);
  soundSongs(g);
}

/**
 * $01DC: $4C84 counts up and $4C85 down every frame; $4C86-$4C89 are a
 * cascade of timers (frames to 6, tenths to 10, seconds to 6... in BCD-ish
 * nibbles, per the table at $0219). $4C8A is how many of them rolled over
 * this frame, plus one; $4C8B and $4C8C are two free-running random numbers.
 */
function frameTimers(g) {
  const m = g.m;
  m[0x4c84] = (m[0x4c84] + 1) & 0xff;
  m[0x4c85] = (m[0x4c85] - 1) & 0xff;
  let c = 1;
  for (let i = 0; i < 4; i++) {
    const hl = 0x4c86 + i, t = 0x0219 + 2 * i;
    m[hl] = (m[hl] + 1) & 0xff;
    if ((m[hl] & 0x0f) !== m[t]) break;
    c++;
    const a = ((m[hl] + 0x10) & 0xf0);
    m[hl] = a;
    if (a !== m[t + 1]) break;
    c++;
    m[hl] = 0;
  }
  m[0x4c8a] = c;
  m[0x4c8b] = (m[0x4c8b] * 5 + 1) & 0xff;
  m[0x4c8c] = (m[0x4c8c] * 13 + 1) & 0xff;
}

// $0247: the routines a timed task can run
const TIMED = [
  advanceMode,        // 0 $0894: next step of the play sequence ($4E04)
  advanceCoinMode,    // 1 $06A3: next step of the start sequence ($4E03)
  advanceAttract,     // 2 $058E: next step of the attract mode ($4E02)
  deathTick,          // 3 $1272: next step after eating a ghost ($4DD1)
  clearFruit,         // 4 $1000: the fruit's time is up
  clearFruitScore,    // 5 $100B: take the fruit's points off the screen
  eraseReady,         // 6 $0263: take READY! off the screen
  intermission1Step,  // 7 $212B
  intermission2Step,  // 8 $21F0
  intermission3Step,  // 9 $22B9
];

/** $0221: count down the timed tasks and run those that are due. */
function runTimed(g) {
  const m = g.m;
  const c = m[0x4c8a];
  for (let hl = 0x4c90; hl < 0x4cc0; hl += 3) {
    const a = m[hl];
    if (a === 0) continue;
    if ((a >> 6) >= c) continue;
    m[hl] = (a - 1) & 0xff;
    if (m[hl] & 0x3f) continue;
    m[hl] = 0;
    TIMED[m[hl + 1]](g, m[hl + 2]);
  }
}

/** $03C8: run the current game mode ($4E00): reset, attract, coins/start, play. */
function dispatch(g) {
  switch (g.m[0x4e00]) {
    case 0: resetMode(g); break;
    case 1: attractMode(g); break;
    case 2: coinMode(g); break;
    case 3: playMode(g); break;
  }
}

// ---------------------------------------------------------------------------
// The main loop ($238D): run queued tasks
// ---------------------------------------------------------------------------

/** Run every task in the queue at $4CC0-$4CFF, oldest first. */
export function runTasks(g) {
  const m = g.m;
  for (let guard = 0; guard < 64; guard++) {
    let hl = g.w(0x4c82);
    const a = m[hl];
    if (a & 0x80) return;
    m[hl] = 0xff;
    hl = (hl & 0xff00) | ((hl + 1) & 0xff);
    const b = m[hl];
    m[hl] = 0xff;
    hl = (hl & 0xff00) | ((hl + 1) & 0xff);
    if ((hl & 0xff) === 0) hl = (hl & 0xff00) | 0xc0;
    g.sw(0x4c82, hl);
    TASKS[a](g, b);
  }
}

// ---------------------------------------------------------------------------
// Coins, credits and lamps
// ---------------------------------------------------------------------------

/** $0267: lock the coin slots at 99 credits; otherwise debounce the coin inputs. */
function coinLockout(g) {
  const m = g.m;
  const under = m[0x4e6e] < 0x99 ? 1 : 0;
  g.latch[6] = under;
  if (!under) return;
  // $0272: each input's last four samples; 1100 (two up, two down) is a fresh press
  let b = g.in0;
  const sample = (addr) => {
    const bit = (b >> 7) & 1;
    b = ((b << 1) | bit) & 0xff;
    const v = ((m[addr] << 1) | bit) & 0x0f;
    m[addr] = v;
    return v === 0x0c;
  };
  if (sample(0x4e66)) addCoin(g);             // service button: a free credit
  if (sample(0x4e67)) m[0x4e69] = (m[0x4e69] + 1) & 0xff; // coin 2
  if (sample(0x4e68)) m[0x4e69] = (m[0x4e69] + 1) & 0xff; // coin 1
}

/** $02AD: work through coins inserted: pulse the coin counter and credit each one. */
function coinCounter(g) {
  const m = g.m;
  const b = m[0x4e69];
  if (!b) return;
  let e = m[0x4e6a];
  if (e === 0) { g.latch[7] = 1; addCoin(g); }
  if (e === 8) g.latch[7] = 0;
  e = (e + 1) & 0xff;
  m[0x4e6a] = e;
  if (e !== 0x10) return;
  m[0x4e6a] = 0;
  m[0x4e69] = (b - 1) & 0xff;
}

/** $02DF: one coin: when enough are in, add credits (BCD, at most 99) and play the coin sound. */
export function addCoin(g) {
  const m = g.m;
  m[0x4e6c] = (m[0x4e6c] + 1) & 0xff;
  if (((m[0x4e6b] - m[0x4e6c]) & 0xff) !== 0) return;
  m[0x4e6c] = 0;
  const r = bcdAdd(m[0x4e6d], m[0x4e6e]);
  m[0x4e6e] = r.c ? 0x99 : r.v;
  m[0x4e9c] |= 0x02;
}

/** $02FD: the start-button lamps, and the 1UP / 2UP that flash for the player whose turn it is. */
function lamps(g) {
  const m = g.m;
  m[0x4dce] = (m[0x4dce] + 1) & 0xff;
  if ((m[0x4dce] & 0x0f) === 0) {
    const b = (m[0x4dce] >> 4) | ((m[0x4dce] << 4) & 0xf0);
    let c = (~m[0x4dd6] & 0xff) | b;
    let a;
    const credits = m[0x4e6e];
    if (credits === 0) { a = 0; c = 0; }
    else if (credits === 1) a = 0;
    else a = c;
    g.latch[5] = a & 1;
    g.latch[4] = c & 1;
  }
  const ix = 0x43d8, iy = 0x43c5;
  const up1 = () => { m[ix] = 0x50; m[ix + 1] = 0x55; m[ix + 2] = 0x31; };
  const up2 = () => { m[iy] = 0x50; m[iy + 1] = 0x55; m[iy + 2] = 0x32; };
  const off1 = () => { m[ix] = 0x40; m[ix + 1] = 0x40; m[ix + 2] = 0x40; };
  const off2 = () => { m[iy] = 0x40; m[iy + 1] = 0x40; m[iy + 2] = 0x40; };
  if (m[0x4e00] !== 3 && m[0x4e03] < 2) { up1(); up2(); return; }
  const blink = m[0x4dce] & 0x10;
  if (m[0x4e09] === 0) { if (!blink) up1(); else off1(); }
  else if (!blink) up2(); else off2();
  if (m[0x4e70] === 0) off2();
}
