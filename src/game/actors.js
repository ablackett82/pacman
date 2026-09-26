// Actors: Pac-Man's and the ghosts' movement, collisions, the ghosts' choice
// of direction (their targets, and the random walk when frightened), leaving
// the house, Cruise Elroy.
//
// Positions are (l, h) byte pairs: $4D00-$4D07 the four ghosts, $4D08 Pac-Man,
// $4DD2 the fruit. Tiles are (l, h) too, offset so the maze is $20-$3F x
// $1E-$3D. Directions 0-3 index the vector table at $32FF: 0 = h-1, 1 = l+1,
// 2 = h+1, 3 = l-1 (right, down, left, up on the screen).
import { queue, word, timed } from './core.js';
import { addScore } from './tasks.js';

// ---------------------------------------------------------------------------
// Helpers ($2000-$2068)
// ---------------------------------------------------------------------------

/** $2000: the pair at iy plus the pair at ix, each byte on its own. */
export function step(g, ix, iy) {
  const m = g.m;
  return (((m[iy + 1] + m[ix + 1]) & 0xff) << 8) | ((m[iy] + m[ix]) & 0xff);
}

/** $202D (via $0065): the video RAM address of tile hl. */
export function vramAddr(hl) {
  const l = ((hl & 0xff) - 0x20) & 0xff;
  const h = ((hl >> 8) - 0x20) & 0xff;
  return (0x4040 + h * 32 + l) & 0xffff;
}

/** $200F: the tile one step (vector at ix) from the tile at iy. */
export const tileAt = (g, ix, iy) => g.m[vramAddr(step(g, ix, iy))];

const isWall = (t) => (t & 0xc0) === 0xc0;

/** $2018: the tile a position is in. */
export const toTile = (hl) => ((((hl >> 8) >> 3) + 0x1e) << 8) | (((hl & 0xff) >> 3) + 0x20);

/** $205A: set flag bc if tile hl is in the tunnel (colour $1B). */
function tunnelFlag(g, hl, bc) {
  g.m[bc] = g.m[(vramAddr(hl) + 0x400) & 0xffff] === 0x1b ? 1 : 0;
}

/**
 * Rotate the 32-bit speed pattern whose high word is at hi and low word at lo
 * one bit left; the actor moves this tick if the bit that came round is 1.
 */
function speedBit(g, hi, lo) {
  const l2 = g.w(lo) * 2;
  g.sw(lo, l2);
  const h2 = g.w(hi) * 2 + (l2 > 0xffff ? 1 : 0);
  g.sw(hi, h2);
  if (h2 <= 0xffff) return false;
  g.m[lo] = (g.m[lo] + 1) & 0xff;
  return true;
}

/**
 * $1ED0: is actor a's next tile (column at $4D09 + 2a) in or beyond the
 * tunnel? Wraps it from one end to the other on the way.
 */
function inTunnel(g, a) {
  const m = g.m, hl = 0x4d09 + 2 * a;
  const v = m[hl];
  if (v === 0x1d) { m[hl] = 0x3d; return true; }
  if (v === 0x3e) { m[hl] = 0x1e; return true; }
  return v < 0x21 || v >= 0x3b;
}

// ---------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------

/** $171D: a ghost (not eyes) in Pac-Man's tile. */
export function tileCollision(g) {
  const m = g.m, pac = g.w(0x4d39);
  let b = 4;
  for (let k = 3; k >= 0; k--, b--) {
    if (!m[0x4dac + k] && g.w(0x4d31 + 2 * k) === pac) return caught(g, b);
  }
  caught(g, 0);
}

/** $1789: while frightened, also a ghost within 4 pixels (0-3 ahead in both bytes). */
export function pixelCollision(g) {
  const m = g.m;
  if (m[0x4da4] || !m[0x4da6]) return;
  let b = 4;
  for (let k = 3; k >= 0; k--, b--) {
    if (m[0x4dac + k]) continue;
    const p = 0x4d00 + 2 * k;
    if (((m[p] - m[0x4d08]) & 0xff) < 4 && ((m[p + 1] - m[0x4d09]) & 0xff) < 4) return caught(g, b);
  }
  caught(g, 0);
}

/** $1763: ghost b met Pac-Man: if it is blue it is eaten (200, 400, 800, 1600), otherwise he dies. */
function caught(g, b) {
  const m = g.m;
  m[0x4da4] = b;
  m[0x4da5] = b;
  if (!b) return;
  if (!m[0x4da6 + b]) {
    if (g.assist.invincible) { m[0x4da4] = 0; m[0x4da5] = 0; } // cheat: ghosts pass through him
    return;
  }
  m[0x4da5] = 0;
  m[0x4dd0]++;
  addScore(g, m[0x4dd0] + 1);
  m[0x4ebc] |= 0x08;
}

// ---------------------------------------------------------------------------
// Pac-Man ($1806)
// ---------------------------------------------------------------------------

export function movePacman(g) {
  const m = g.m;
  if (m[0x4d9d] !== 0xff) { m[0x4d9d]--; return; } // a pause after each dot
  const moves = m[0x4da6] ? speedBit(g, 0x4d4a, 0x4d4c) : speedBit(g, 0x4d46, 0x4d48);
  if (!moves) return;
  m[0x4d9e] = m[0x4e0e];
  const x = m[0x4d3a];
  const auto = m[0x4e00] === 1 || m[0x4e04] >= 0x10; // the demo and intermissions steer him
  const in0 = g.in0;
  if (x < 0x21 || x >= 0x3b) {
    // $1864: in the tunnel only left and right count
    m[0x4dbf] = 1;
    if (auto) return autoMove(g);
    if (!(in0 & 0x02)) { m[0x4d30] = 2; g.sw(0x4d1c, g.w(0x3303)); }
    else if (!(in0 & 0x04)) { m[0x4d30] = 0; g.sw(0x4d1c, g.w(0x32ff)); }
    return advance(g);
  }
  if (auto) return autoMove(g);
  // $18C5: the joystick picks a wanted direction (b=0), or keep going (b=1)
  let b = 0;
  if (!(in0 & 0x02)) { g.sw(0x4d26, g.w(0x3303)); m[0x4d3c] = 2; }
  else if (!(in0 & 0x04)) { g.sw(0x4d26, g.w(0x32ff)); m[0x4d3c] = 0; }
  else if (!(in0 & 0x01)) { g.sw(0x4d26, g.w(0x3305)); m[0x4d3c] = 3; }
  else if (!(in0 & 0x08)) { g.sw(0x4d26, g.w(0x3301)); m[0x4d3c] = 1; }
  else { g.sw(0x4d26, g.w(0x4d1c)); b = 1; }
  if (isWall(tileAt(g, 0x4d26, 0x4d39))) {
    b = (b - 1) & 0xff;
    if (b !== 0) {
      // $1916: can't go the wanted way: carry on, stopping at a wall
      if (isWall(tileAt(g, 0x4d1c, 0x4d39)) && centred(g)) return;
      return advance(g);
    }
    if (centred(g)) return; // $18F9: nothing held, wall ahead: stop in the middle of the tile
  }
  // $1940: take the wanted direction
  g.sw(0x4d1c, g.w(0x4d26));
  b = (b - 1) & 0xff;
  if (b !== 0) m[0x4d30] = m[0x4d3c];
  advance(g);
}

/** Is Pac-Man in the middle of his tile across his direction of travel? */
function centred(g) {
  const m = g.m;
  return ((m[0x4d30] & 1 ? m[0x4d08] : m[0x4d09]) & 7) === 4;
}

/**
 * $1950: one pixel along, plus one pixel toward the middle of the lane across
 * it: this is how he cuts corners.
 */
function advance(g) {
  const m = g.m;
  const hl = step(g, 0x4d1c, 0x4d08);
  let l = hl & 0xff, h = hl >> 8;
  if (m[0x4d30] & 1) {
    const a = h & 7;
    if (a !== 4) h = (a < 4 ? h + 1 : h - 1) & 0xff;
  } else {
    const a = l & 7;
    if (a !== 4) l = (a < 4 ? l + 1 : l - 1) & 0xff;
  }
  moved(g, (h << 8) | l);
}

/** $1A19: the demo game's and intermissions' Pac-Man, steered by task $17 at each tile. */
function autoMove(g) {
  const m = g.m;
  const c = m[0x4d1c] === 0 ? (m[0x4d09] & 7) === 4 : (m[0x4d08] & 7) === 4;
  if (c) {
    if (!inTunnel(g, 5)) queue(g, 0x17, 0x00);
    g.sw(0x4d12, step(g, 0x4d26, 0x4d12));
    g.sw(0x4d1c, g.w(0x4d26));
    m[0x4d30] = m[0x4d3c];
  }
  moved(g, step(g, 0x4d1c, 0x4d08));
}

/** $1985: store the new position; eat the fruit, a dot or an energizer. */
function moved(g, hl) {
  const m = g.m;
  g.sw(0x4d08, hl);
  g.sw(0x4d39, toTile(hl));
  const tunnel = m[0x4dbf];
  m[0x4dbf] = 0;
  if (tunnel) return;
  if (m[0x4dd2] && m[0x4dd4] && g.w(0x4d08) === 0x8094) {
    const a = m[0x4dd4];
    queue(g, 0x19, a);
    queue(g, 0x1c, (a + 0x15) & 0xff);
    g.sw(0x4dd2, 0);
    timed(g, 0x54, 5, 0);
    m[0x4ebc] |= 0x04;
  }
  m[0x4d9d] = 0xff;
  const addr = vramAddr(g.w(0x4d39));
  const t = m[addr];
  if (t !== 0x10 && t !== 0x14) return;
  m[0x4e0e]++;
  let a = (t & 0x0f) >> 1;
  m[addr] = 0x40;
  queue(g, 0x19, a >> 1);
  a++;
  if (a !== 1) a *= 2;
  m[0x4d9d] = a;
  dotCounters(g);
  if (m[0x4d9d] === 6) frighten(g);
  if (m[0x4e0e] & 1) m[0x4ebc] = (m[0x4ebc] & ~0x01) | 0x02;
  else m[0x4ebc] = (m[0x4ebc] & ~0x02) | 0x01;
}

/** $1A70: an energizer: every ghost blue and turning round, for the level's time. */
export function frighten(g) {
  const m = g.m;
  g.sw(0x4dcb, Math.min(0xffff, g.w(0x4dbd) * (g.assist.frightScale || 1))); // cheat: longer when set
  m.fill(1, 0x4da6, 0x4dab);
  m.fill(1, 0x4db1, 0x4db6);
  m[0x4dc8] = 0;
  m[0x4dd0] = 0;
  m[0x4c02] = m[0x4c04] = m[0x4c06] = m[0x4c08] = 0x1c;
  m[0x4c03] = m[0x4c05] = m[0x4c07] = m[0x4c09] = 0x11;
  m[0x4eac] = (m[0x4eac] | 0x20) & ~0x80;
}

/** $1B08: count the dot toward the next ghost's release (or the shared count after a death). */
function dotCounters(g) {
  const m = g.m;
  if (m[0x4e12]) { m[0x4d9f]++; return; }
  if (m[0x4da3]) return;
  if (m[0x4da2]) { m[0x4e11]++; return; }
  if (m[0x4da1]) { m[0x4e10]++; return; }
  m[0x4e0f]++;
}

// ---------------------------------------------------------------------------
// Ghosts ($1B36, $1C4B, $1D22, $1DF9)
// ---------------------------------------------------------------------------

/** Blinky: out of the house and not eyes; speed per tunnel, fright, Elroy 2, Elroy 1 or normal. */
export function moveBlinky(g) {
  const m = g.m;
  if (!m[0x4da0] || m[0x4dac]) return;
  elroy(g);
  tunnelFlag(g, g.w(0x4d31), 0x4d99);
  let go;
  if (m[0x4d99]) go = speedBit(g, 0x4d5e, 0x4d60);
  else if (m[0x4da7]) go = speedBit(g, 0x4d5a, 0x4d5c);
  else if (m[0x4db7]) go = speedBit(g, 0x4d4e, 0x4d50);
  else if (m[0x4db6]) go = speedBit(g, 0x4d52, 0x4d54);
  else go = speedBit(g, 0x4d56, 0x4d58);
  if (go) blinkyMoveBody(g);
}

export function movePinky(g) {
  const m = g.m;
  if (m[0x4da1] !== 1 || m[0x4dad]) return;
  tunnelFlag(g, g.w(0x4d33), 0x4d9a);
  let go;
  if (m[0x4d9a]) go = speedBit(g, 0x4d6a, 0x4d6c);
  else if (m[0x4da8]) go = speedBit(g, 0x4d66, 0x4d68);
  else go = speedBit(g, 0x4d62, 0x4d64);
  if (go) pinkyMoveBody(g);
}

export function moveInky(g) {
  const m = g.m;
  if (m[0x4da2] !== 1 || m[0x4dae]) return;
  tunnelFlag(g, g.w(0x4d35), 0x4d9b);
  let go;
  if (m[0x4d9b]) go = speedBit(g, 0x4d76, 0x4d78);
  else if (m[0x4da9]) go = speedBit(g, 0x4d72, 0x4d74);
  else go = speedBit(g, 0x4d6e, 0x4d70);
  if (go) inkyMoveBody(g);
}

export function moveClyde(g) {
  const m = g.m;
  if (m[0x4da3] !== 1 || m[0x4daf]) return;
  tunnelFlag(g, g.w(0x4d37), 0x4d9c);
  let go;
  if (m[0x4d9c]) go = speedBit(g, 0x4d82, 0x4d84);
  else if (m[0x4daa]) go = speedBit(g, 0x4d7e, 0x4d80);
  else go = speedBit(g, 0x4d7a, 0x4d7c);
  if (go) clydeMoveBody(g);
}

/**
 * $1BD8 (and $1CAF, $1D86, $1E5D): one pixel for ghost k. In the middle of a
 * tile it takes the direction chosen for this tile and queues the choice for
 * the next one (random when frightened; none in the tunnel, nor in the four
 * $1A no-turn-up tiles), turning round first if asked to.
 */
function ghostMoveBody(g, k) {
  const m = g.m;
  const vec = 0x4d14 + 2 * k, pos = 0x4d00 + 2 * k, next = 0x4d0a + 2 * k, nextDir = 0x4d1e + 2 * k;
  const c = m[vec] === 0 ? (m[pos + 1] & 7) === 4 : (m[pos] & 7) === 4;
  if (c) {
    if (!inTunnel(g, k + 1)) {
      if (m[0x4da7 + k]) queue(g, 0x0c + k, 0x00);
      else if (m[(vramAddr(g.w(next)) + 0x400) & 0xffff] !== 0x1a) queue(g, 0x08 + k, 0x00);
    }
    reverseIfAsked(g, k);
    g.sw(next, step(g, nextDir, next));
    g.sw(vec, g.w(nextDir));
    m[0x4d28 + k] = m[0x4d2c + k];
  }
  g.sw(pos, step(g, vec, pos));
  g.sw(0x4d31 + 2 * k, toTile(g.w(pos)));
}

export const blinkyMoveBody = (g) => ghostMoveBody(g, 0);
export const pinkyMoveBody = (g) => ghostMoveBody(g, 1);
export const inkyMoveBody = (g) => ghostMoveBody(g, 2);
export const clydeMoveBody = (g) => ghostMoveBody(g, 3);

/**
 * $1F07 (and $1F2E, $1F55, $1F7C): ghost k turns round: its next direction is
 * the reverse of its current one. In the attract chase it happens at once.
 * Returns the A register as the original leaves it.
 */
export function reverse(g, k) {
  const m = g.m;
  const a = m[0x4d28 + k] ^ 2;
  m[0x4d2c + k] = a;
  const hl = word(g, 0x32ff, a);
  g.sw(0x4d1e + 2 * k, hl);
  if (m[0x4e02] !== 0x22) return m[0x4e02];
  g.sw(0x4d14 + 2 * k, hl);
  m[0x4d28 + k] = a;
  return a;
}

/** $1EFE (and $1F25, $1F4C, $1F73): reverse ghost k if its flag at $4DB1 is set. */
function reverseIfAsked(g, k) {
  const m = g.m;
  if (!m[0x4db1 + k]) return;
  m[0x4db1 + k] = 0;
  reverse(g, k);
}

/** All four in turn (the attract chase). */
export function reverseRequests(g) {
  for (let k = 0; k < 4; k++) reverseIfAsked(g, k);
}

// ---------------------------------------------------------------------------
// Leaving the house ($2069-$20D6) and Cruise Elroy ($20D7)
// ---------------------------------------------------------------------------

export function releasePinky(g) { g.m[0x4da1] = 2; }
export function releaseInky(g) { g.m[0x4da2] = 3; }
export function releaseClyde(g) { g.m[0x4da3] = 3; }

/** $2069: Pinky leaves when her dot count reaches the level's limit (or the shared count 7 after a death). */
export function pinkyRelease(g) {
  const m = g.m;
  if (m[0x4da1]) return;
  if (m[0x4e12]) { if (m[0x4d9f] === 7) releasePinky(g); return; }
  if (m[0x4e0f] >= m[0x4db8]) releasePinky(g);
}

/** $208C: Inky (shared count 17). */
export function inkyRelease(g) {
  const m = g.m;
  if (m[0x4da2]) return;
  if (m[0x4e12]) { if (m[0x4d9f] === 0x11) releaseInky(g); return; }
  if (m[0x4e10] >= m[0x4db9]) releaseInky(g);
}

/** $20AF: Clyde; the shared count ends at 32 (and does not itself release him). */
export function clydeRelease(g) {
  const m = g.m;
  if (m[0x4da3]) return;
  if (m[0x4e12]) {
    if (m[0x4d9f] !== 0x20) return;
    m[0x4e12] = 0;
    m[0x4d9f] = 0;
    return;
  }
  if (m[0x4e11] >= m[0x4dba]) releaseClyde(g);
}

/** $20D7: once Clyde is out, Blinky speeds up as few dots remain (Elroy 1, then 2). */
function elroy(g) {
  const m = g.m;
  if (!m[0x4da3]) return;
  if (!m[0x4db6]) {
    if (m[0x4dbb] < ((0xf4 - m[0x4e0e]) & 0xff)) return;
    m[0x4db6] = 1;
  }
  if (m[0x4db7]) return;
  if (m[0x4dbc] < ((0xf4 - m[0x4e0e]) & 0xff)) return;
  m[0x4db7] = 1;
}

// ---------------------------------------------------------------------------
// Choosing directions (tasks $08-$0F, $17)
// ---------------------------------------------------------------------------

/** $29EA: squared distance between the tiles at ix and iy. */
function dist(g, ix, iy) {
  const m = g.m;
  const d0 = Math.abs(m[ix] - m[iy]), d1 = Math.abs(m[ix + 1] - m[iy + 1]);
  return (d0 * d0 + d1 * d1) & 0xffff;
}

/**
 * $2966: from tile hl, going in direction a, the direction whose next tile is
 * nearest target de, never reversing or into a wall; ties go to the later of
 * right, down, left, up. Returns the direction's vector and number.
 */
function choose(g, hl, de, a) {
  const m = g.m;
  g.sw(0x4d3e, hl);
  g.sw(0x4d40, de);
  m[0x4d3b] = a;
  m[0x4d3d] = a ^ 2;
  g.sw(0x4d44, 0xffff);
  let ix = 0x32ff;
  for (m[0x4dc7] = 0; m[0x4dc7] !== 4; m[0x4dc7]++, ix += 2) {
    if (m[0x4d3d] === m[0x4dc7]) continue;
    const nb = step(g, ix, 0x4d3e);
    g.sw(0x4d42, nb);
    if (isWall(m[vramAddr(nb)])) continue;
    const d = dist(g, 0x4d40, 0x4d42);
    if (g.w(0x4d44) < d) continue;
    g.sw(0x4d44, d);
    m[0x4d3b] = m[0x4dc7];
  }
  const dir = m[0x4d3b];
  return { hl: word(g, 0x32ff, dir), a: dir };
}

/** $2A23: the random number generator: steps a pointer through the first 8K of the program and reads it. */
function random(g) {
  let hl = g.w(0x4dc9);
  hl = (hl * 5 + 1) & 0x1fff;
  g.sw(0x4dc9, hl);
  return g.m[hl];
}

/** $291E: a random direction, trying clockwise from there past walls and the reverse. */
function randomDir(g, hl, a) {
  const m = g.m;
  g.sw(0x4d3e, hl);
  m[0x4d3d] = a ^ 2;
  m[0x4d3b] = random(g) & 3;
  let ix = 0x32ff + 2 * m[0x4d3b];
  for (;;) {
    if (m[0x4d3d] !== m[0x4d3b] && !isWall(tileAt(g, ix, 0x4d3e))) return { hl: g.w(ix), a: m[0x4d3b] };
    ix += 2;
    m[0x4d3b] = (m[0x4d3b] + 1) & 3;
  }
}

/** Is it a scatter phase ($4DC1 even) in play? */
const scatter = (g) => !(g.m[0x4dc1] & 1) && g.m[0x4e04] === 3;

function setNext(g, k, r) {
  g.sw(0x4d1e + 2 * k, r.hl);
  g.m[0x4d2c + k] = r.a;
}

/** Task $08 ($2730): Blinky heads for Pac-Man's tile; in scatter (unless Elroy) the top right corner. */
export function blinkyTarget(g) {
  const m = g.m;
  const de = scatter(g) && !m[0x4db6] ? 0x221d : g.w(0x4d39);
  setNext(g, 0, choose(g, g.w(0x4d0a), de, m[0x4d2c]));
}

/**
 * Task $09 ($276C): Pinky heads four tiles ahead of Pac-Man; the sum is done
 * on the whole 16-bit pair, so facing up it is also four to the left.
 */
export function pinkyTarget(g) {
  const m = g.m;
  let de;
  if (scatter(g)) de = 0x391d;
  else de = (g.w(0x4d1c) * 4 + g.w(0x4d39)) & 0xffff;
  setNext(g, 1, choose(g, g.w(0x4d0c), de, m[0x4d2d]));
}

/** Task $0A ($27A9): Inky: twice the vector from Blinky to two tiles ahead of Pac-Man. */
export function inkyTarget(g) {
  const m = g.m;
  let de;
  if (scatter(g)) de = 0x2040;
  else {
    const bc = g.w(0x4d0a);
    const hl = (g.w(0x4d1c) * 2 + g.w(0x4d39)) & 0xffff;
    const l = (2 * (hl & 0xff) - (bc & 0xff)) & 0xff;
    const h = (2 * (hl >> 8) - (bc >> 8)) & 0xff;
    de = (h << 8) | l;
  }
  setNext(g, 2, choose(g, g.w(0x4d0e), de, m[0x4d2e]));
}

/** Task $0B ($27F1): Clyde chases Pac-Man until within 8 tiles, then heads for his corner. */
export function clydeTarget(g) {
  const m = g.m;
  const de = scatter(g) || dist(g, 0x4d39, 0x4d10) < 0x40 ? 0x3b40 : g.w(0x4d39);
  setNext(g, 3, choose(g, g.w(0x4d10), de, m[0x4d2f]));
}

/** Tasks $0C-$0F ($283B...): frightened ghosts wander at random; eyes head for the door. */
function wander(g, k) {
  const m = g.m;
  const r = m[0x4dac + k]
    ? choose(g, g.w(0x4d0a + 2 * k), 0x2e2c, m[0x4d2c + k])
    : randomDir(g, g.w(0x4d0a + 2 * k), m[0x4d2c + k]);
  setNext(g, k, r);
}
export const blinkyRandom = (g) => wander(g, 0);
export const pinkyRandom = (g) => wander(g, 1);
export const inkyRandom = (g) => wander(g, 2);
export const clydeRandom = (g) => wander(g, 3);

/** Task $17 ($28E3): the demo's Pac-Man: away from Pinky, or after her when she is blue. */
export function demoPacman(g) {
  const m = g.m;
  let de;
  if (m[0x4da7]) de = g.w(0x4d0c);
  else {
    const hl = g.w(0x4d39), bc = g.w(0x4d0c);
    de = (((2 * (hl >> 8) - (bc >> 8)) & 0xff) << 8) | ((2 * (hl & 0xff) - (bc & 0xff)) & 0xff);
  }
  const r = choose(g, g.w(0x4d12), de, m[0x4d3c]);
  g.sw(0x4d26, r.hl);
  m[0x4d3c] = r.a;
}
