// Runs the original arcade program (reference/program.bin, rebuilt and
// checksum-verified by tools/buildrom.mjs) in a Z80 core with just enough of the
// board around it: video/colour RAM, work RAM, the sprite registers, the input
// ports, the DIP switches and the vblank interrupt. Used for the differential
// tests that check src/game against the real thing. Graphics and sound are not
// emulated; the sound registers are kept so tests can compare them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Z80 } from 'z80-emulator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROGRAM = path.join(ROOT, 'reference', 'program.bin');
export const available = () => fs.existsSync(PROGRAM);

// 3.072 MHz Z80; the video timing is 384 x 264 pixels at 6.144 MHz, so one
// frame (and one vblank interrupt) every 384*264/2 = 50688 CPU cycles, 60.61 Hz.
export const T_FRAME = 50688;

// IN0 / IN1 are active low; these are the bits a pressed control clears.
export const IN = { up: 0x01, left: 0x02, right: 0x04, down: 0x08 };
const IN0_COIN1 = 0x20, IN1_START1 = 0x20, IN1_START2 = 0x40;
// DSW1: ghost names normal, difficulty normal, bonus life at 10000, 3 lives, 1 coin 1 credit
export const DSW_DEFAULT = 0xc9;

export class Host {
  constructor({ dsw = DSW_DEFAULT } = {}) {
    const mem = this.mem = new Uint8Array(0x10000);
    mem.set(fs.readFileSync(PROGRAM), 0);
    this.dsw = dsw;
    this.in0 = 0xff;
    this.in1 = 0xff;
    this.latch = new Uint8Array(8); // $5000-$5007: irq enable, sound enable, -, flip, lamps, coin lockout, coin counter
    this.sound = new Uint8Array(0x20); // $5040-$505F
    this.vector = 0;
    this.frame = 0;
    const self = this;
    this.hal = {
      tStateCount: 0,
      readMemory(a) {
        a &= 0x7fff; // A15 is not decoded
        if (a < 0x5000) return a >= 0x4800 && a < 0x4c00 ? 0xbf : mem[a];
        switch (a & 0x50c0) {
          case 0x5000: return self.in0;
          case 0x5040: return self.in1;
          case 0x5080: return self.dsw;
          default: return 0xff;
        }
      },
      writeMemory(a, v) {
        a &= 0x7fff;
        if (a >= 0x4000 && a < 0x5000) { if (a < 0x4800 || a >= 0x4c00) mem[a] = v; return; }
        if (a >= 0x5000 && a < 0x5008) { self.latch[a - 0x5000] = v & 1; return; }
        if (a >= 0x5040 && a < 0x5060) { self.sound[a - 0x5040] = v & 0x0f; return; }
        if (a >= 0x5060 && a < 0x5070) { mem[a] = v; return; } // sprite positions
      },
      contendMemory() {},
      readPort() { return 0xff; },
      writePort(port, v) { if ((port & 0xff) === 0) self.vector = v; },
      contendPort() {},
    };
    this.cpu = new Z80(this.hal);
    this.cpu.reset();
    this.nextVblank = T_FRAME;
    this.irq = false;
  }

  get t() { return this.hal.tStateCount; }
  get pc() { return this.cpu.regs.pc; }

  step() {
    const r = this.cpu.regs;
    // the vblank interrupt is a level held until the program clears the enable latch
    if (!this.latch[0]) this.irq = false;
    if (this.irq && r.iff1) this.takeInterrupt();
    else this.cpu.step();
  }

  /** Z80 interrupt acknowledge in mode 2, using the vector latched by OUT (0),a. */
  takeInterrupt() {
    const cpu = this.cpu, r = cpu.regs;
    if (r.halted) { r.pc = (r.pc + 1) & 0xffff; r.halted = 0; }
    cpu.incTStateCount(7);
    r.r = (r.r + 1) & 0x7f;
    r.iff1 = 0; r.iff2 = 0;
    cpu.pushWord(r.pc);
    if (r.im === 2) r.pc = cpu.readWord((r.i << 8) | this.vector);
    else r.pc = 0x38;
  }

  /** Run to the next vblank and raise the interrupt there. */
  runFrame() {
    while (this.hal.tStateCount < this.nextVblank) this.step();
    this.nextVblank += T_FRAME;
    this.frame++;
    if (this.latch[0]) this.irq = true;
  }

  runFrames(n) { for (let i = 0; i < n; i++) this.runFrame(); }

  /** Run frames until pred() holds; returns frames run, or throws after max. */
  runUntil(pred, max = 10000) {
    for (let i = 0; i < max; i++) { if (pred(this)) return i; this.runFrame(); }
    throw new Error(`runUntil: condition not met after ${max} frames`);
  }

  /** Set player-1 controls from an {up,down,left,right} object. */
  setInput(input) {
    let v = 0xff;
    for (const k in IN) if (input[k]) v &= ~IN[k];
    this.in0 = (this.in0 & 0xf0) | (v & 0x0f);
  }

  coin() { this.in0 &= ~IN0_COIN1; this.runFrames(4); this.in0 |= IN0_COIN1; this.runFrames(8); }
  start1() { this.in1 &= ~IN1_START1; this.runFrames(4); this.in1 |= IN1_START1; }
  start2() { this.in1 &= ~IN1_START2; this.runFrames(4); this.in1 |= IN1_START2; }

  // ---- screen helpers (for debugging and tests) ----

  /**
   * The tile map as text, 28 x 36 as seen on the monitor. Video RAM is laid out
   * for a monitor on its side: the playfield $4040-$43BF runs in columns from
   * the right, and the top and bottom two rows sit at $43C0 and $4000.
   */
  screenText() {
    const rows = [];
    for (let y = 0; y < 36; y++) {
      let s = '';
      for (let x = 0; x < 28; x++) s += tileChar(this.mem[tileAddr(x, y)]);
      rows.push(s);
    }
    return rows.join('\n');
  }
}

/** Video RAM offset (from $4000) of screen tile (x, y), 28 x 36. */
export function tileOffset(x, y) {
  if (y < 2) return 0x3dd + y * 0x20 - x;         // top rows: $43DD.. right to left
  if (y >= 34) return 0x01d + (y - 34) * 0x20 - x; // bottom rows: $401D..
  return 0x040 + (27 - x) * 0x20 + (y - 2);        // playfield: columns from the right
}
export const tileAddr = (x, y) => 0x4000 + tileOffset(x, y);

export function tileChar(t) {
  if (t >= 0x30 && t <= 0x39) return String.fromCharCode(t);
  if (t >= 0x41 && t <= 0x5a) return String.fromCharCode(t);
  if (t === 0x40) return ' ';
  if (t === 0x10) return '.';
  if (t === 0x14) return 'o';
  if (t === 0x3b) return '-';
  if (t >= 0xc0) return '#';
  return '?';
}
