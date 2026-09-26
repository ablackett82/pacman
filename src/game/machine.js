// The game engine: a routine-by-routine reimplementation of the arcade
// program, traced from the commented disassembly (reference/pacman.asm; see
// tools/buildrom.mjs) and a coverage-guided listing of it.
//
// State lives in `m`, a 64K byte array laid out exactly like the original's
// address space: video RAM at $4000-$43FF, colour RAM at $4400-$47FF, work RAM
// at $4C00-$4FEF, the sprite list at $4FF0 (codes) and $5060 (positions), and
// the program's data tables at their ROM addresses (loaded from
// data/tables.json). Keeping the original layout means the engine can be
// checked byte-for-byte against the real program running in an emulator
// (test/differential.test.js), and the renderer draws straight from video RAM
// and the sprite registers just as the video hardware did.
//
// One call to frame() is one vblank: the interrupt handler ($008D) followed by
// the main loop working through its task queue ($238D).
//
// Routines live in the other modules in this folder as plain functions of the
// machine `g`, named for what they do and tagged with their original address.

import { interrupt, runTasks } from './core.js';

export const T_FRAME = 50688;       // CPU cycles per frame (384 x 264 pixels at 6.144 MHz / 2)
export const FRAME_HZ = 3072000 / T_FRAME;

// Input bits, as read from IN0 (active low: a pressed control reads 0)
export const IN_UP = 0x01, IN_LEFT = 0x02, IN_RIGHT = 0x04, IN_DOWN = 0x08;
export const IN0_COIN = 0x20, IN1_START1 = 0x20, IN1_START2 = 0x40;
// DSW1: ghost names normal, difficulty normal, bonus life at 10000, 3 lives, 1 coin 1 credit
export const DSW_DEFAULT = 0xc9;

export class Machine {
  /**
   * @param {{runs: [number, string][]}} tables  data/tables.json
   * @param {{dsw?: number}} [opts]
   */
  constructor(tables, opts = {}) {
    this.m = new Uint8Array(0x10000);
    for (const [addr, hex] of tables.runs) {
      for (let i = 0; i < hex.length; i += 2) this.m[addr + i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    this.in0 = 0xff;     // $5000: joystick, coins (active low)
    this.in1 = 0xff;     // $5040: start buttons, upright cabinet
    this.dsw = opts.dsw ?? DSW_DEFAULT; // $5080
    this.latch = new Uint8Array(8);     // $5000-$5007: irq enable, sound enable, -, flip, lamps, coin lockout, coin counter
    this.sound = new Uint8Array(0x20);  // $5040-$505F: the three voices' waveform, frequency and volume
    // cheats (all off = the arcade exactly); set by main.js
    this.assist = { invincible: false, frightScale: 1 };
    powerOn(this);
  }

  /** Advance one frame with the given input port values. */
  frame(in0 = this.in0, in1 = this.in1) {
    this.in0 = in0;
    this.in1 = in1;
    interrupt(this);
    runTasks(this);
  }

  // ---- memory helpers ----
  w(a) { return this.m[a] | (this.m[a + 1] << 8); }
  sw(a, v) { this.m[a] = v & 0xff; this.m[a + 1] = (v >> 8) & 0xff; }
}

/**
 * $234B: after the power-on tests, clear the latches, work RAM, sound and
 * sprite registers, colour and video RAM, empty the task queue ($4CC0-$4CFF)
 * and start the main loop with the game mode at 0 (reset).
 */
function powerOn(g) {
  const m = g.m;
  g.latch.fill(0);
  m.fill(0, 0x4c00, 0x4fbe);         // rst 8 four times from b=$BE: $BE + 3 x 256 bytes
  g.sound.fill(0);                   // $5040-$507F
  m.fill(0, 0x5060, 0x5080);
  m.fill(0, 0x4400, 0x4800);         // $240D: colour RAM
  m.fill(0x40, 0x4000, 0x4400);      // $23ED b=0: video RAM
  g.sw(0x4c80, 0x4cc0);
  g.sw(0x4c82, 0x4cc0);
  m.fill(0xff, 0x4cc0, 0x4d00);
  g.latch[0] = 1;
}
