// The three intermissions, run every frame from play step $20 ($0A2C): after
// level 2 (Blinky chases Pac-Man across and back, and a giant Pac-Man chases
// him), after level 5 (Blinky's cloak snags on a nail and tears), and after
// levels 9, 13 and 17 (Blinky, patched up, chases him across and returns
// with his cloak dragging).
import { timed } from './core.js';
import { movePacman, moveBlinky, frighten, reverse } from './actors.js';
import { ghostAnim } from './play.js';

/** $0506: the corridor walls ($FC tiles) the chases run along. */
function corridor(g) {
  const m = g.m;
  for (let k = 0, ix = 0x4040; k < 0x1c; k++, ix += 0x20) { m[ix + 0x11] = 0xfc; m[ix + 0x13] = 0xfc; }
}

/** $2130: Pac-Man and Blinky each take two steps; the ghost animates. */
function chase(g) {
  movePacman(g);
  movePacman(g);
  blinkyOnly(g);
}

/** $2136: just Blinky. */
function blinkyOnly(g) {
  moveBlinky(g);
  moveBlinky(g);
  ghostAnim(g);
}

/** $2237: Pac-Man twice, Blinky once (the snagged Blinky crawls). */
function crawl(g) {
  movePacman(g);
  movePacman(g);
  moveBlinky(g);
  ghostAnim(g);
}

export function intermission1Step(g) { g.m[0x4e06]++; }
export function intermission2Step(g) { g.m[0x4e07]++; }
export function intermission3Step(g) { g.m[0x4e08]++; }

/** $2108 */
export function intermission1(g) {
  const m = g.m;
  switch (m[0x4e06]) {
    case 0: // $211A: when Pac-Man enters, let Blinky go (at Elroy 2 speed)
      if (m[0x4d3a] !== 0x21) return chase(g);
      m[0x4da0] = 1; m[0x4db7] = 1;
      corridor(g);
      m[0x4e06]++;
      break;
    case 1: // $2140
      if (m[0x4d3a] !== 0x1e) return chase(g);
      m[0x4e06]++;
      break;
    case 2: { // $214B: Blinky turns blue and flees; Pac-Man turns round
      if (m[0x4d32] !== 0x1e) return blinkyOnly(g);
      frighten(g);
      m[0x4eac] = 0; m[0x4ebc] = 0;
      m[0x4db5] = 0;
      const a = m[0x4d30] ^ 2;
      m[0x4d3c] = a;
      const hl = g.w(0x32ff + 2 * a);
      g.sw(0x4d26, hl);
      g.sw(0x4d1c, hl);
      m[0x4d30] = m[0x4d3c];
      timed(g, 0x45, 7, 0);
      m[0x4e06]++;
      break;
    }
    case 4: // $2170
      if (m[0x4d32] !== 0x2f) return blinkyOnly(g);
      m[0x4e06]++;
      break;
    case 5: // $217B
      if (m[0x4d32] !== 0x3d) return chase(g);
      m[0x4e06]++;
      break;
    case 6: // $2186: the giant Pac-Man crosses
      movePacman(g);
      movePacman(g);
      if (m[0x4d3a] !== 0x3d) return;
      m[0x4e06] = 0;
      timed(g, 0x45, 0, 0);
      m[0x4e04]++;
      break;
    default: break;
  }
}

/** $219E: tiles at $41D2 draw the nail and, as Blinky pulls, his stretching cloak. */
export function intermission2(g) {
  const m = g.m, iy = 0x41d2;
  switch (m[0x4e07]) {
    case 0: // $21C2: the nail
      m[0x45d2] = 1; m[0x45d3] = 1; m[0x45f2] = 1; m[0x45f3] = 1;
      corridor(g);
      m[iy] = 0x60; m[iy + 1] = 0x61;
      timed(g, 0x43, 8, 0);
      m[0x4e07]++;
      break;
    case 2: // $21E1
      if (m[0x4d3a] !== 0x2c) return chase(g);
      m[0x4da0] = 1; m[0x4db7] = 1;
      m[0x4e07]++;
      break;
    case 3: // $21F5: Blinky reaches the nail and slows
      if (m[0x4d01] !== 0x77 && m[0x4d01] !== 0x78) return chase(g);
      g.sw(0x4d4e, 0x2084); g.sw(0x4d50, 0x2084);
      m[0x4e07]++;
      break;
    case 4: // $220C
      if (m[0x4d01] !== 0x78) return crawl(g);
      m[iy] = 0x62; m[iy + 1] = 0x63;
      m[0x4e07]++;
      break;
    case 5: // $221E
      if (m[0x4d01] !== 0x7b) return crawl(g);
      m[iy] = 0x64; m[iy + 1] = 0x65; m[iy + 0x20] = 0x66; m[iy + 0x21] = 0x67;
      m[0x4e07]++;
      break;
    case 6: // $2244
      if (m[0x4d01] !== 0x7e) return crawl(g);
      m[iy] = 0x68; m[iy + 1] = 0x69; m[iy + 0x20] = 0x6a; m[iy + 0x21] = 0x6b;
      m[0x4e07]++;
      break;
    case 7: // $225D
      if (m[0x4d01] !== 0x80) return crawl(g);
      timed(g, 0x4f, 8, 0);
      m[0x4e07]++;
      break;
    case 9: // $226A: the cloak tears
      m[0x4d01] = (m[0x4d01] + 2) & 0xff;
      m[iy] = 0x6c; m[iy + 1] = 0x6d; m[iy + 0x20] = 0x40; m[iy + 0x21] = 0x40;
      timed(g, 0x4a, 8, 0);
      m[0x4e07]++;
      break;
    case 11: // $2286
      timed(g, 0x54, 8, 0);
      m[0x4e07]++;
      break;
    case 13: // $228D
      m[0x4e07] = 0;
      m[0x4e04] += 2;
      break;
    default: break;
  }
}

/** $2297 */
export function intermission3(g) {
  const m = g.m;
  switch (m[0x4e08]) {
    case 0: // $22A7
      if (m[0x4d3a] !== 0x25) return chase(g);
      m[0x4da0] = 1; m[0x4db7] = 1;
      corridor(g);
      m[0x4e08]++;
      break;
    case 1: // $22BE: Blinky gets to the edge and turns back
      if (m[0x4d01] !== 0xff && m[0x4d01] !== 0xfe) return chase(g);
      m[0x4d01] = (m[0x4d01] + 2) & 0xff;
      m[0x4db1] = 1;
      m[0x4db1] = 0;
      reverse(g, 0);
      timed(g, 0x4a, 9, 0);
      m[0x4e08]++;
      break;
    case 3: // $22DD: dragging the cloak (drawn by the fruit sprite behind him)
      if (m[0x4d32] === 0x2d) { m[0x4e08]++; break; }
      dragCloak(g);
      break;
    case 4: // $22F5
      if (m[0x4d32] === 0x1e) { m[0x4e08]++; break; }
      dragCloak(g);
      break;
    case 5: // $22FE
      m[0x4e08] = 0;
      timed(g, 0x45, 0, 0);
      m[0x4e04]++;
      break;
    default: break;
  }
}

/** $22E4 */
function dragCloak(g) {
  const m = g.m;
  m[0x4dd2] = m[0x4d00];
  m[0x4dd3] = (m[0x4d01] - 8) & 0xff;
  chase(g);
}
