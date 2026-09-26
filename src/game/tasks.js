// The tasks the main loop runs ($23A8 table), queued with RST 28 / $0042 as
// (task, parameter): screen and colour set-up, the maze and dots, text,
// scores, lives and fruit, and the ghosts' choice of target.
import { fill, word, bcdAdd } from './core.js';
import { levelSetup } from './modes.js';
import {
  blinkyTarget, pinkyTarget, inkyTarget, clydeTarget,
  blinkyRandom, pinkyRandom, inkyRandom, clydeRandom, demoPacman,
} from './actors.js';

export const TASKS = [
  clearScreen,      // 00 $23ED
  setColours,       // 01 $24D7
  drawMaze,         // 02 $2419
  drawDots,         // 03 $2448
  placeActors,      // 04 $253D
  houseFlags,       // 05 $268B
  clearColours,     // 06 $240D
  toAttract,        // 07 $2698
  blinkyTarget,     // 08 $2730
  pinkyTarget,      // 09 $276C
  inkyTarget,       // 0A $27A9
  clydeTarget,      // 0B $27F1
  blinkyRandom,     // 0C $283B
  pinkyRandom,      // 0D $2865
  inkyRandom,       // 0E $288F
  clydeRandom,      // 0F $28B9
  levelSetup,       // 10 $070E
  clearActors,      // 11 $26A2
  resetDots,        // 12 $24C9
  eraseDots,        // 13 $2A35
  readDips,         // 14 $26D0
  saveDots,         // 15 $2487
  (g) => { g.m[0x4e04]++; }, // 16 $23E8
  demoPacman,       // 17 $28E3
  drawScores,       // 18 $2AE0
  addScore,         // 19 $2A5A
  drawLivesTask,    // 1A $2B6A
  drawFruitRow,     // 1B $2BEA
  message,          // 1C $2C5E
  drawCredits,      // 1D $2BA1
  hideActors,       // 1E $2675
  drawBonusValue,   // 1F $26B2
];

/** $23ED: b=0 clears the whole screen, b=1 just the playfield ($4040-$43BF). */
export function clearScreen(g, b) {
  if (b === 0) fill(g, 0x4000, 0, 0x40), g.m.fill(0x40, 0x4000, 0x4400);
  else g.m.fill(0x40, 0x4040, 0x43c0);
}

/**
 * $24D7: colour the playfield: $10 (b=0 or 1; the maze colour) or $1F (b=2, the
 * white flash at a level's end), and the bottom rows $0F. b=1 also marks the
 * tunnel ($1B: ghosts slow down) and the four spots where ghosts may not turn
 * upward ($1A), and colours the ghost-house door ($18).
 */
function setColours(g, b) {
  const m = g.m;
  m.fill(b === 2 ? 0x1f : 0x10, 0x4440, 0x47c0);
  m.fill(0x0f, 0x47c0, 0x4800);
  if (b !== 1) return;
  for (let k = 0, ix = 0x45a0; k < 6; k++, ix += 0x20) { m[ix + 0x0c] = 0x1a; m[ix + 0x18] = 0x1a; }
  for (let k = 0, ix = 0x4440; k < 5; k++, ix += 0x20) { m[ix + 0x0e] = 0x1b; m[ix + 0x0f] = 0x1b; m[ix + 0x10] = 0x1b; }
  for (let k = 0, ix = 0x4720; k < 5; k++, ix += 0x20) { m[ix + 0x0e] = 0x1b; m[ix + 0x0f] = 0x1b; m[ix + 0x10] = 0x1b; }
  m[0x45ed] = 0x18;
  m[0x460d] = 0x18;
}

/**
 * $2419: draw the maze from the run-length table at $3435: a byte below $80
 * skips that many cells, then comes a tile. Each tile is also drawn at its
 * mirror position on the other half of the screen with bit 0 flipped (the
 * mirror-image piece).
 */
function drawMaze(g) {
  const m = g.m;
  let hl = 0x4000, bc = 0x3435;
  for (;;) {
    let a = m[bc];
    if (a === 0) return;
    if (!(a & 0x80)) {
      hl = (hl + a - 1) & 0xffff;
      bc++;
      a = m[bc];
    }
    hl = (hl + 1) & 0xffff;
    m[hl & 0x7fff] = a;
    const mirror = (0x83e0 + 2 * (hl & 0x1f) - hl) & 0xffff;
    m[mirror & 0x7fff] = a ^ 1;
    bc++;
  }
}

/** $2448: draw the dots still uneaten per the bitmap at $4E16, and the four energizers from $4E34. */
function drawDots(g) {
  const m = g.m;
  let hl = 0x4000, iy = 0x35b5;
  for (let ix = 0x4e16; ix < 0x4e16 + 0x1e; ix++) {
    let a = m[ix];
    for (let c = 0; c < 8; c++) {
      hl = (hl + m[iy]) & 0xffff;
      if (a & 0x80) m[hl] = 0x10;
      a = (a << 1) & 0xff;
      iy++;
    }
  }
  m[0x4064] = m[0x4e34];
  m[0x4078] = m[0x4e35];
  m[0x4384] = m[0x4e36];
  m[0x4398] = m[0x4e37];
}

/** $2487: the reverse: record which dots are left, into the bitmap at $4E16, and the energizers. */
function saveDots(g) {
  const m = g.m;
  let hl = 0x4000, iy = 0x35b5;
  for (let ix = 0x4e16; ix < 0x4e16 + 0x1e; ix++) {
    for (let c = 0; c < 8; c++) {
      hl = (hl + m[iy]) & 0xffff;
      m[ix] = ((m[ix] << 1) | (m[hl] === 0x10 ? 1 : 0)) & 0xff;
      iy++;
    }
  }
  m[0x4e34] = m[0x4064];
  m[0x4e35] = m[0x4078];
  m[0x4e36] = m[0x4384];
  m[0x4e37] = m[0x4398];
}

/** $24C9: every dot uneaten, energizers in place. */
function resetDots(g) {
  g.m.fill(0xff, 0x4e16, 0x4e16 + 0x1e);
  g.m.fill(0x14, 0x4e34, 0x4e38);
}

/** $2A35: wipe every dot and energizer off the playfield. */
function eraseDots(g) {
  const m = g.m;
  for (let de = 0x4040; de !== 0x43c0; de++) {
    const a = m[de];
    if (a === 0x10 || a === 0x12 || a === 0x14) m[de] = 0x40;
  }
}

/**
 * $253D: set the sprites to the ghosts, Pac-Man and (hidden) fruit, and put
 * the actors at their starting places: b=0 in the maze, otherwise lined up
 * off-screen for the attract mode's chase.
 */
function placeActors(g, b) {
  const m = g.m;
  m[0x4c02] = m[0x4c04] = m[0x4c06] = m[0x4c08] = 0x20;
  m[0x4c0a] = 0x2c;
  m[0x4c0c] = 0x3f;
  m[0x4c03] = 1; m[0x4c05] = 3; m[0x4c07] = 5; m[0x4c09] = 7; m[0x4c0b] = 9; m[0x4c0d] = 0;
  if (b === 0) {
    g.sw(0x4d00, 0x8064); g.sw(0x4d02, 0x807c); g.sw(0x4d04, 0x907c); g.sw(0x4d06, 0x707c); g.sw(0x4d08, 0x80c4);
    g.sw(0x4d0a, 0x2e2c); g.sw(0x4d31, 0x2e2c);
    g.sw(0x4d0c, 0x2e2f); g.sw(0x4d33, 0x2e2f);
    g.sw(0x4d0e, 0x302f); g.sw(0x4d35, 0x302f);
    g.sw(0x4d10, 0x2c2f); g.sw(0x4d37, 0x2c2f);
    g.sw(0x4d12, 0x2e38); g.sw(0x4d39, 0x2e38);
    g.sw(0x4d14, 0x0100); g.sw(0x4d1e, 0x0100);
    g.sw(0x4d16, 0x0001); g.sw(0x4d20, 0x0001);
    g.sw(0x4d18, 0x00ff); g.sw(0x4d22, 0x00ff);
    g.sw(0x4d1a, 0x00ff); g.sw(0x4d24, 0x00ff);
    g.sw(0x4d1c, 0x0100); g.sw(0x4d26, 0x0100);
    g.sw(0x4d28, 0x0102); g.sw(0x4d2c, 0x0102);
    g.sw(0x4d2a, 0x0303); g.sw(0x4d2e, 0x0303);
    m[0x4d30] = 2; m[0x4d3c] = 2;
    g.sw(0x4dd2, 0);
    return;
  }
  // $260F
  for (const a of [0x4d00, 0x4d02, 0x4d04, 0x4d06]) g.sw(a, 0x0094);
  for (const a of [0x4d0a, 0x4d0c, 0x4d0e, 0x4d10, 0x4d31, 0x4d33, 0x4d35, 0x4d37]) g.sw(a, 0x1e32);
  for (const a of [0x4d14, 0x4d16, 0x4d18, 0x4d1a, 0x4d1e, 0x4d20, 0x4d22, 0x4d24, 0x4d1c, 0x4d26]) g.sw(a, 0x0100);
  m.fill(2, 0x4d28, 0x4d31);
  m[0x4d3c] = 2;
  g.sw(0x4d08, 0x0894);
  g.sw(0x4d12, 0x1f32); g.sw(0x4d39, 0x1f32);
}

/** $268B: reset the ghost-house pacing pattern; b=0 also marks Blinky as out of the house. */
function houseFlags(g, b) {
  g.m[0x4d94] = 0x55;
  if (((b - 1) & 0xff) === 0) return;
  g.m[0x4da0] = 1;
}

/** $240D: colour RAM all 0. */
function clearColours(g) { g.m.fill(0, 0x4400, 0x4800); }

/** $2698: go to the attract mode. */
function toAttract(g) { g.m[0x4e00] = 1; g.m[0x4e01] = 0; }

/** $26A2: clear $4D00-$4DFF, the actors and their state. */
function clearActors(g) { g.m.fill(0, 0x4d00, 0x4e00); }

/**
 * $26D0: read the DIP switches: coins per credit and credits per coin (or free
 * play), lives, the bonus-life score, the ghosts' names, the difficulty (which
 * picks the level table) and the cabinet type.
 */
function readDips(g) {
  const m = g.m, b = g.dsw;
  const a = b & 3;
  if (a === 0) m[0x4e6e] = 0xff;
  const perCredit = (a >> 1) + (a & 1);
  m[0x4e6b] = perCredit;
  m[0x4e6d] = (perCredit & 2) ^ a;
  let lives = ((b >> 2) & 3) + 1;
  if (lives === 4) lives = 5;
  m[0x4e6f] = lives;
  m[0x4e71] = m[0x2728 + ((b >> 4) & 3)];
  m[0x4e75] = (~b >> 7) & 1;
  g.sw(0x4e73, word(g, 0x272c, (~b >> 6) & 1));
  m[0x4e72] = (~g.in1 >> 7) & 1;
}

/** $2AE0: HIGH SCORE, then clear both players' scores and draw them. */
function drawScores(g) {
  message(g, 0);
  g.m.fill(0, 0x4e80, 0x4e88);
  drawBcd(g, 0x4e82, 3, 4, 0x43fc);
  drawBcd(g, 0x4e86, 3, g.m[0x4e70] ? 4 : 6, 0x43e9);
}

/**
 * $2ABE: draw b BCD bytes from de (most significant first, working down)
 * right to left from hl; the first c zero digits are blanked. Returns
 * {de, hl} after the last digit.
 */
export function drawBcd(g, de, b, c, hl) {
  const m = g.m;
  const digit = (a) => {
    a &= 0x0f;
    if (a) c = 0;
    else if (c) { a = 0x40; c--; }
    m[hl] = a;
    hl = (hl - 1) & 0xffff;
  };
  for (; b > 0; b--) {
    digit(m[de] >> 4);
    digit(m[de]);
    de = (de - 1) & 0xffff;
  }
  return { de, hl };
}

/** $2B0B: the current player's score ($4E80, or $4E84 for player 2). */
const scoreAddr = (g) => (g.m[0x4e09] ? 0x4e84 : 0x4e80);

/**
 * $2A5A: add the points for item b (the table at $2B17: dot, energizer, ghosts,
 * fruit) to the current player's score, award the bonus life when it passes
 * the DIP-switch value, redraw it, and update the high score.
 */
export function addScore(g, b) {
  const m = g.m;
  if (m[0x4e00] === 1) return;
  const pts = word(g, 0x2b17, b);
  const hl = scoreAddr(g);
  let r = bcdAdd(pts & 0xff, m[hl]);
  m[hl] = r.v;
  r = bcdAdd(pts >> 8, m[hl + 1], r.c);
  m[hl + 1] = r.v;
  const e = r.v;
  r = bcdAdd(0, m[hl + 2], r.c);
  m[hl + 2] = r.v;
  const d = r.v;
  let de = hl + 2;
  const thousands = ((((d << 8) | e) << 4) >> 8) & 0xff;
  if (((m[0x4e71] - 1) & 0xff) < thousands) extraLife(g, de);
  drawBcd(g, de, 3, 4, m[0x4e09] ? 0x43e9 : 0x43fc);
  // $2A8C: compare with the high score, most significant byte first
  let hs = 0x4e8a;
  for (let k = 0; k < 3; k++, de--, hs--) {
    if (m[de] < m[hs]) return;
    if (m[de] !== m[hs]) {
      m.copyWithin(0x4e88, scoreAddr(g), scoreAddr(g) + 3);
      drawBcd(g, 0x4e8a, 3, 4, 0x43f2);
      return;
    }
  }
}

/** $2B33: the bonus life, once per player (flag in the score's 4th byte). */
function extraLife(g, de) {
  const m = g.m;
  const flag = de + 1;
  if (m[flag] & 1) return;
  m[flag] |= 1;
  m[0x4e9c] |= 1;
  m[0x4e14]++;
  m[0x4e15]++;
  drawLives(g, m[0x4e15]);
}

/** $2B4A: draw b spare-life icons (up to 5) at the bottom left, blanking the rest. */
export function drawLives(g, b) {
  let hl = 0x401a, c = 5;
  if (b !== 0 && b < 6) {
    for (; b > 0; b--) { draw2x2(g, hl, 0x20); hl -= 2; c--; }
  }
  for (;;) {
    c--;
    if (c < 0) return;
    fill2x2(g, hl, 0x40);
    hl -= 2;
  }
}

/** $2B6A: colour the lives area and draw the lives. */
function drawLivesTask(g) {
  const m = g.m;
  if (m[0x4e00] === 1) return;
  fillBox(g, 0x4412, 0x09, 0x0a, 0x02);
  drawLives(g, m[0x4e15]);
}

/** $2BCD: fill a boxes of b bytes of c, $20 apart, from hl. */
function fillBox(g, hl, c, b, a) {
  for (; a > 0; a--, hl += 0x20) g.m.fill(c, hl, hl + b);
}

/** $2B80: fill a 2x2 block of tiles with a. */
export function fill2x2(g, hl, a) {
  const m = g.m;
  m[hl] = a; m[hl + 1] = a; m[hl + 0x20] = a; m[hl + 0x21] = a;
}

/** $2B8F: draw the 2x2 picture made of tiles a..a+3 at hl. */
export function draw2x2(g, hl, a) {
  const m = g.m;
  m[hl] = a; m[hl + 1] = a + 1; m[hl + 0x20] = a + 2; m[hl + 0x21] = a + 3;
}

/**
 * $2BEA: the row of fruit at the bottom right: the fruit of the last seven
 * levels, from the table of (tile, colour) at $3B08.
 */
export function drawFruitRow(g) {
  const m = g.m;
  if (m[0x4e00] === 1) return;
  let a = m[0x4e13] + 1;
  let de, b;
  if (a < 8) { de = 0x3b08; b = a; }
  else {
    if (a >= 0x13) a = 0x13;
    de = 0x3b08 + 2 * (a - 7);
    b = 7;
  }
  let c = 7, hl = 0x4004;
  for (; b > 0; b--) {
    draw2x2(g, hl, m[de]); de++;
    fill2x2(g, hl + 0x400, m[de]); de++;
    hl += 2; c--;
  }
  for (;;) {
    c--;
    if (c < 0) return;
    fill2x2(g, hl, 0x40);
    fill2x2(g, hl + 0x400, 0);
    hl += 2;
  }
}

/**
 * $2C5E: message b from the table at $36A5: a screen offset, the text (to $2F),
 * then the colours: one per character, or a single one with bit 7 set.
 * Messages $80 and up erase the text instead, using the second colour.
 */
export function message(g, b) {
  const m = g.m;
  let hl = word(g, 0x36a5, (2 * b & 0xff) / 2);
  const off = g.w(hl);
  let colour = (0x4400 + off) & 0xffff;
  let vram = (colour + 0xfc00) & 0xffff;
  const step = m[hl + 1] & 0x80 ? -1 : -0x20;
  hl++;
  let n = 0;
  hl++;
  if (b & 0x80) {
    // $2CAC: blank the text, then skip to the second colour
    while (m[hl] !== 0x2f) { m[vram & 0x7fff] = 0x40; hl++; vram += step; n++; }
    hl++;
    n++;
    // cpir from hl for $2F with bc = n * 256
    let bc = n << 8;
    for (;;) { const hit = m[hl] === 0x2f; hl++; bc = (bc - 1) & 0xffff; if (hit || bc === 0) break; }
    n = bc >> 8;
  } else {
    while (m[hl] !== 0x2f) { m[vram & 0x7fff] = m[hl]; hl++; vram += step; n++; }
    hl++;
  }
  // $2C93: colours
  if (m[hl] & 0x80) {
    const a = m[hl];
    for (let k = 0; k < (n || 256); k++) { m[colour & 0x7fff] = a; colour += step; }
  } else {
    for (let k = 0; k < (n || 256); k++) { m[colour & 0x7fff] = m[hl]; hl++; colour += step; }
  }
}

/** $2BA1: CREDIT and the number, or FREE PLAY. */
export function drawCredits(g) {
  const m = g.m;
  const cr = m[0x4e6e];
  if (cr === 0xff) { message(g, 2); return; }
  message(g, 1);
  if (cr & 0xf0) m[0x4034] = (cr >> 4) + 0x30;
  m[0x4033] = (cr & 0x0f) + 0x30;
}

/** $2675: take every actor off the screen. */
export function hideActors(g) {
  g.sw(0x4dd2, 0);
  g.sw(0x4d08, 0);
  setActorPositions(g, 0);
}

/** $267E: put the ghosts at hl (0 hides them). */
export function setActorPositions(g, hl) {
  g.sw(0x4d00, hl); g.sw(0x4d02, hl); g.sw(0x4d04, hl); g.sw(0x4d06, hl);
}

/** $26B2: the bonus-life score on the attract screen (thousands, BCD). */
function drawBonusValue(g) {
  const m = g.m;
  m[0x4136] = (m[0x4e71] & 0x0f) + 0x30;
  const hi = (m[0x4e71] >> 4) & 0x0f;
  if (!hi) return;
  m[0x4156] = hi + 0x30;
}
