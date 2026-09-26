// The game modes run from the interrupt ($03C8): 0 reset, 1 attract
// (introductions, then a demo game), 2 coins and start, 3 play; and the level
// set-up task that loads each level's speeds and timers.
import { queue, timed, fill, word, bcdAdd } from './core.js';
import { drawCredits, message, setActorPositions, drawLives, drawFruitRow } from './tasks.js';
import { playStep, playExtras, ghostAnim, energizerBlink, eyesColour } from './play.js';
import { reverseRequests } from './actors.js';
import { intermission1, intermission2, intermission3 } from './intermission.js';

// ---------------------------------------------------------------------------
// Mode 0: reset
// ---------------------------------------------------------------------------

/** $03D4: after power-on, clear the screen, read the DIP switches and go to the attract mode. */
export function resetMode(g) {
  const m = g.m;
  if (m[0x4e01] !== 0) return;
  queue(g, 0x00, 0x00);
  queue(g, 0x06, 0x00);
  queue(g, 0x01, 0x00);
  queue(g, 0x14, 0x00);
  queue(g, 0x18, 0x00);
  queue(g, 0x04, 0x00);
  queue(g, 0x1e, 0x00);
  queue(g, 0x07, 0x00);
  m[0x4e01]++;
  g.latch[1] = 1;
}

// ---------------------------------------------------------------------------
// Mode 1: attract
// ---------------------------------------------------------------------------

/** $058E: next attract step. */
export function advanceAttract(g) { g.m[0x4e02]++; }

/** $0263: take READY! off the screen. */
export function eraseReady(g) { queue(g, 0x1c, 0x86); }

/** $0585: queue message c, then the next step after a second. */
function messageThenNext(g, c) {
  queue(g, 0x1c, c);
  timed(g, 0x4a, 2, 0);
  advanceAttract(g);
}

/** $0593: a ghost's name (or its alternate) and the next step half a second later. */
function nameThenNext(g, c) {
  c = (g.m[0x4e75] + c) & 0xff;
  queue(g, 0x1c, c);
  timed(g, 0x45, 2, 0);
  advanceAttract(g);
}

/** $05BF: the ghost picture in the introductions (tiles $B0-$B5) with colour a. */
function ghostPicture(g, hl, a) {
  const m = g.m;
  m[hl] = 0xb1; m[hl + 1] = 0xb3; m[hl + 2] = 0xb5;
  m[hl + 0x20] = 0xb0; m[hl + 0x21] = 0xb2; m[hl + 0x22] = 0xb4;
  for (const o of [0x422, 0x421, 0x420, 0x402, 0x401, 0x400]) m[hl + o] = a;
}

/**
 * $03FE: the attract mode: CHARACTER / NICKNAME with each ghost in turn, the
 * points table, the chase across the screen and a demo game. A credit ends it.
 */
export function attractMode(g) {
  const m = g.m;
  drawCredits(g);
  if (m[0x4e6e] !== 0) {
    m[0x4e04] = 0;
    m[0x4e02] = 0;
    m[0x4e00]++;
    return;
  }
  const step = m[0x4e02];
  switch (step) {
    case 0: // $045F
      queue(g, 0x00, 0x01); queue(g, 0x01, 0x00); queue(g, 0x04, 0x00); queue(g, 0x1e, 0x00);
      messageThenNext(g, 0x0c);
      break;
    case 2: ghostPicture(g, 0x4304, 1); messageThenNext(g, 0x0c); break;  // $0471
    case 4: nameThenNext(g, 0x14); break;                                // -SHADOW
    case 6: nameThenNext(g, 0x0d); break;                                // "BLINKY"
    case 8: ghostPicture(g, 0x4307, 3); messageThenNext(g, 0x0c); break;
    case 10: nameThenNext(g, 0x16); break;                               // -SPEEDY
    case 12: nameThenNext(g, 0x0f); break;                               // "PINKY"
    case 14: ghostPicture(g, 0x430a, 5); messageThenNext(g, 0x0c); break;
    case 16: nameThenNext(g, 0x33); break;                               // -BASHFUL
    case 18: nameThenNext(g, 0x2f); break;                               // "INKY"
    case 20: ghostPicture(g, 0x430d, 7); messageThenNext(g, 0x0c); break;
    case 22: nameThenNext(g, 0x35); break;                               // -POKEY
    case 24: messageThenNext(g, (m[0x4e75] + 0x31) & 0xff); break;        // "CLYDE" ($04D3)
    case 26: queue(g, 0x1c, 0x11); messageThenNext(g, 0x12); break;      // . 10 PTS, o 50 PTS
    case 28: attractChaseSetup(g); break;                                // $04E0
    case 30: chaseStep(g, 0x4da0, 0x21, m[0x4d3a]); break;               // $051C
    case 31: chaseStep(g, 0x4da1, 0x20, m[0x4d32]); break;               // $054B
    case 32: chaseStep(g, 0x4da2, 0x22, m[0x4d32]); break;               // $0556
    case 33: chaseStep(g, 0x4da3, 0x24, m[0x4d32]); break;               // $0561
    case 34: // $056C: until all four ghosts are eaten
      if (((m[0x4dd0] + m[0x4dd1]) & 0xff) === 6) advanceAttract(g);
      else chaseTick(g);
      break;
    case 35: playMode(g); break;                                         // $057C: the demo game
    default: break;                                                       // odd steps wait for the timer
  }
}

/** $04E0: the copyright line, then set up the chase: an energizer and a corridor. */
function attractChaseSetup(g) {
  const m = g.m;
  messageThenNext(g, 0x13);
  newGame(g);
  m[0x4e04]--;
  queue(g, 0x11, 0x00);
  queue(g, 0x05, 0x01);
  queue(g, 0x10, 0x14);
  queue(g, 0x04, 0x01);
  m[0x4e14] = 1;
  m[0x4e70] = 0;
  m[0x4e15] = 0;
  m[0x4332] = 0x14;
  for (let k = 0, ix = 0x4040; k < 0x1c; k++, ix += 0x20) { m[ix + 0x11] = 0xfc; m[ix + 0x13] = 0xfc; }
}

/** $0524: one chase step: when the watched actor reaches column b, set flag hl and move on. */
function chaseStep(g, hl, b, a) {
  if (((a - b) & 0xff) === 0) { g.m[hl] = 1; advanceAttract(g); return; }
  chaseTick(g);
}

/** $052C: the chase's movement, animation and blinking for one frame. */
function chaseTick(g) {
  playStep(g);
  playStep(g);
  ghostAnim(g);
  energizerBlink(g);
  eyesColour(g);
  pacmanReverse(g);
  reverseRequests(g);
}

/** $05A5: in the chase, Pac-Man turns round when he eats the energizer. */
function pacmanReverse(g) {
  const m = g.m;
  if (!m[0x4db5]) return;
  m[0x4db5] = 0;
  const a = m[0x4d30] ^ 2;
  m[0x4d3c] = a;
  g.sw(0x4d26, word(g, 0x32ff, a));
}

// ---------------------------------------------------------------------------
// Mode 2: coins and start
// ---------------------------------------------------------------------------

/** $06A3 */
export function advanceCoinMode(g) { g.m[0x4e03]++; }

/** $05E5 */
export function coinMode(g) {
  const m = g.m;
  switch (m[0x4e03]) {
    case 0: // $05F3: PUSH START BUTTON
      drawCredits(g);
      queue(g, 0x00, 0x01); queue(g, 0x01, 0x00); queue(g, 0x1c, 0x07); queue(g, 0x1c, 0x0b); queue(g, 0x1e, 0x00);
      m[0x4e03]++;
      m[0x4dd6] = 1;
      if (m[0x4e71] === 0xff) return;
      queue(g, 0x1c, 0x0a); queue(g, 0x1f, 0x00);
      break;
    case 1: { // $061B: 1 PLAYER ONLY / 1 OR 2 PLAYERS, and wait for a start button
      drawCredits(g);
      message(g, m[0x4e6e] === 1 ? 8 : 9);
      const in1 = g.in1;
      if (m[0x4e6e] !== 1 && !(in1 & 0x40)) m[0x4e70] = 1;
      else if (!(in1 & 0x20)) m[0x4e70] = 0;
      else return;
      if (m[0x4e6b] !== 0) {
        let a = m[0x4e6e];
        if (m[0x4e70]) a = bcdAdd(a, 0x99).v;
        a = bcdAdd(a, 0x99).v;
        m[0x4e6e] = a;
        drawCredits(g);
      }
      m[0x4e03]++;
      m[0x4dd6] = 0;
      m[0x4ecc] = 1;
      m[0x4edc] = 1;
      break;
    }
    case 2: // $0674: the maze, PLAYER ONE, READY!, scores, fruit, lives
      queue(g, 0x00, 0x01); queue(g, 0x01, 0x01); queue(g, 0x02, 0x00); queue(g, 0x12, 0x00);
      queue(g, 0x03, 0x00); queue(g, 0x1c, 0x03); queue(g, 0x1c, 0x06); queue(g, 0x18, 0x00);
      queue(g, 0x1b, 0x00);
      m[0x4e13] = 0;
      m[0x4e14] = m[0x4e6f];
      m[0x4e15] = m[0x4e6f];
      queue(g, 0x1a, 0x00);
      timed(g, 0x57, 1, 0);
      m[0x4e03]++;
      break;
    case 4: // $06A8: into play
      m[0x4e15]--;
      drawLivesNow(g);
      m[0x4e03] = 0;
      m[0x4e02] = 0;
      m[0x4e04] = 0;
      m[0x4e00]++;
      break;
    default: break;
  }
}

/** $2B6A called directly (not queued). */
function drawLivesNow(g) {
  const m = g.m;
  if (m[0x4e00] === 1) return;
  for (let a = 0, hl = 0x4412; a < 2; a++, hl += 0x20) m.fill(0x09, hl, hl + 0x0a);
  drawLives(g, m[0x4e15]);
}

// ---------------------------------------------------------------------------
// Mode 3: play (also the attract mode's demo game)
// ---------------------------------------------------------------------------

/** $0894: next step of the play sequence. */
export function advanceMode(g) { g.m[0x4e04]++; }

/** $0879: a new game: clear the per-player state, fill the dots, copy it for player 2. */
function newGame(g) {
  const m = g.m;
  fill(g, 0x4e09, 0x0b, 0);
  m.fill(0xff, 0x4e16, 0x4e16 + 0x1e);
  m.fill(0x14, 0x4e34, 0x4e38);
  g.sw(0x4e0a, g.w(0x4e73));
  m.copyWithin(0x4e38, 0x4e0a, 0x4e0a + 0x2e);
  advanceMode(g);
}

/** $06BE */
export function playMode(g) {
  const m = g.m;
  switch (m[0x4e04]) {
    case 0: newGame(g); break;
    case 1: // $0899: clear PLAYER ONE, place everyone, READY! for two seconds
      if (m[0x4e00] === 1) { m[0x4e04] = 9; return; }
      queue(g, 0x11, 0x00); queue(g, 0x1c, 0x83); queue(g, 0x04, 0x00); queue(g, 0x05, 0x00);
      queue(g, 0x10, 0x00); queue(g, 0x1a, 0x00);
      timed(g, 0x54, 0, 0);
      timed(g, 0x54, 6, 0);
      g.latch[3] = m[0x4e72] & m[0x4e09] & 1;
      advanceMode(g);
      break;
    case 3: play(g); break;
    case 4: afterDeath(g); break;         // $090D
    case 6: nextTurn(g); break;           // $0940
    case 8: // $0972: game over: back to the attract mode
      m[0x4e02] = 0; m[0x4e04] = 0; m[0x4e70] = 0; m[0x4e09] = 0;
      g.latch[3] = 0;
      m[0x4e00] = 1;
      break;
    case 9: startLife(g); break;          // $0988
    case 11: m[0x4e04] = 3; break;        // $09D2
    case 12: // $09D8: the last dot: a pause, and quiet
      timed(g, 0x54, 0, 0);
      m[0x4e04]++;
      m[0x4eac] = 0;
      m[0x4ebc] = 0;
      break;
    case 14: case 18: case 22: case 26: flashMaze(g, 2); break; // $09E8: white
    case 16: case 20: case 24: case 28: flashMaze(g, 0); break; // $09FE: blue
    case 30: // $0A0E: clear up for the intermission (or the next level)
      queue(g, 0x00, 0x01); queue(g, 0x06, 0x00); queue(g, 0x11, 0x00); queue(g, 0x13, 0x00);
      queue(g, 0x04, 0x01); queue(g, 0x05, 0x01); queue(g, 0x10, 0x13);
      timed(g, 0x43, 0, 0);
      m[0x4e04]++;
      break;
    case 32: intermissionStep(g); break;  // $0A2C
    case 34: nextLevel(g); break;         // $0A7C
    case 35: startLife(g); break;         // $0AA0
    case 37: m[0x4e04] = 3; break;        // $0AA3
    default: break;
  }
}

/** $08CD: one frame of play. */
function play(g) {
  const m = g.m;
  if (!(g.in0 & 0x10)) { // rack test switch: skip the level
    m[0x4e04] = 0x0e;
    queue(g, 0x13, 0x00);
    return;
  }
  if (m[0x4e0e] === 0xf4) { m[0x4e04] = 0x0c; return; }
  playStep(g);
  playStep(g);
  playExtras(g);
}

/** $090D: Pac-Man has died: save the dots; GAME OVER for this player if out of lives in a 2-player game. */
function afterDeath(g) {
  const m = g.m;
  m[0x4e12] = 1;
  saveDotsNow(g);
  m[0x4e04]++;
  if (m[0x4e14] === 0 && m[0x4e70] !== 0 && m[0x4e42] !== 0) {
    queue(g, 0x1c, (m[0x4e09] + 3) & 0xff);
    queue(g, 0x1c, 0x05);
    timed(g, 0x54, 0, 0);
    return;
  }
  m[0x4e04]++;
}

/** $0940: whose turn next, or game over. */
function nextTurn(g) {
  const m = g.m;
  if (m[0x4e70] !== 0 && m[0x4e42] !== 0) {
    swapPlayers(g);
    m[0x4e09] ^= 1;
    m[0x4e04] = 9;
    return;
  }
  if (m[0x4e14] !== 0) { m[0x4e04] = 9; return; }
  drawCredits(g);
  queue(g, 0x1c, 0x05);
  timed(g, 0x54, 0, 0);
  m[0x4e04]++;
}

/** $0AA6: swap the two players' saved state ($4E0A-$4E37 with $4E38-$4E65). */
function swapPlayers(g) {
  const m = g.m;
  for (let i = 0; i < 0x2e; i++) {
    const t = m[0x4e0a + i];
    m[0x4e0a + i] = m[0x4e38 + i];
    m[0x4e38 + i] = t;
  }
}

/** $0988: set up the maze, the dots left, the actors and READY!; in the demo, GAME OVER. */
function startLife(g) {
  const m = g.m;
  queue(g, 0x00, 0x01); queue(g, 0x01, 0x01); queue(g, 0x02, 0x00); queue(g, 0x11, 0x00);
  queue(g, 0x13, 0x00); queue(g, 0x03, 0x00); queue(g, 0x04, 0x00); queue(g, 0x05, 0x00);
  queue(g, 0x10, 0x00); queue(g, 0x1a, 0x00); queue(g, 0x1c, 0x06);
  if (m[0x4e00] !== 3) { queue(g, 0x1c, 0x05); queue(g, 0x1d, 0x00); }
  timed(g, 0x54, 0, 0);
  if (m[0x4e00] !== 1) timed(g, 0x54, 6, 0);
  g.latch[3] = m[0x4e72] & m[0x4e09] & 1;
  advanceMode(g);
}

/** $09EA: colour the maze (2 white, 0 blue), hide the ghosts, next step in a fifth of a second. */
function flashMaze(g, c) {
  queue(g, 0x01, c);
  timed(g, 0x42, 0, 0);
  setActorPositions(g, 0);
  g.m[0x4e04]++;
}

/** $0A2C: the intermission for this level, if any, every frame until it ends. */
function intermissionStep(g) {
  const m = g.m;
  m[0x4eac] = 0; m[0x4ebc] = 0;
  m[0x4ecc] = 2; m[0x4edc] = 2;
  const lv = Math.min(m[0x4e13], 0x14);
  if (lv === 1) return intermission1(g);
  if (lv === 4) return intermission2(g);
  if (lv === 8 || lv === 12 || lv === 16) return intermission3(g);
  // $0A6F: no intermission
  m[0x4e04] += 2;
  m[0x4ecc] = 0; m[0x4edc] = 0;
}

/** $0A7C: on to the next level: reset the counters and dots, step the level table. */
function nextLevel(g) {
  const m = g.m;
  m[0x4ecc] = 0; m[0x4edc] = 0;
  m.fill(0, 0x4e0c, 0x4e13);
  m.fill(0xff, 0x4e16, 0x4e16 + 0x1e);
  m.fill(0x14, 0x4e34, 0x4e38);
  m[0x4e04]++;
  m[0x4e13]++;
  const hl = g.w(0x4e0a);
  if (m[hl] === 0x14) return;
  g.sw(0x4e0a, hl + 1);
}

/** $2487 called directly. */
function saveDotsNow(g) {
  const m = g.m;
  let hl = 0x4000, iy = 0x35b5;
  for (let ix = 0x4e16; ix < 0x4e16 + 0x1e; ix++) {
    for (let c = 0; c < 8; c++) {
      hl = (hl + m[iy]) & 0xffff;
      m[ix] = ((m[ix] << 1) | (m[hl] === 0x10 ? 1 : 0)) & 0xff;
      iy++;
    }
  }
  m[0x4e34] = m[0x4064]; m[0x4e35] = m[0x4078]; m[0x4e36] = m[0x4384]; m[0x4e37] = m[0x4398];
}

// ---------------------------------------------------------------------------
// Task $10 ($070E): a level's speeds, timers and limits
// ---------------------------------------------------------------------------

/**
 * Pick the level's row of the table at $0796 (b, or the current level's entry
 * via $4E0A when b is 0), then copy: the speed bit-patterns (42 bytes from
 * $330F; see $0814), the frightened colour count ($4DB0), the ghosts' dot
 * limits for leaving the house ($4DB8), the Elroy dot counts ($4DBB), the
 * frightened time ($4DBD) and the no-dot release time ($4D95). Then the fruit row.
 */
export function levelSetup(g, b) {
  const m = g.m;
  const a = b || m[g.w(0x4e0a)];
  const ix = 0x0796 + ((a * 6) & 0xff);
  const src = 0x330f + ((m[ix] * 42) & 0xff);
  // $0814: 28 bytes, then the last 12 of those three more times, then 14 more
  m.copyWithin(0x4d46, src, src + 0x1c);
  m.copyWithin(0x4d62, src + 0x10, src + 0x1c);
  m.copyWithin(0x4d6e, src + 0x10, src + 0x1c);
  m.copyWithin(0x4d7a, src + 0x10, src + 0x1c);
  m.copyWithin(0x4d86, src + 0x1c, src + 0x2a);
  m[0x4db0] = m[ix + 1];
  const t = 0x0843 + ((m[ix + 2] * 3) & 0xff);
  m.copyWithin(0x4db8, t, t + 3);
  g.sw(0x4dbb, word(g, 0x084f, m[ix + 3]));
  g.sw(0x4dbd, word(g, 0x0861, m[ix + 4]));
  g.sw(0x4d95, word(g, 0x0873, m[ix + 5]));
  drawFruitRow(g);
}
