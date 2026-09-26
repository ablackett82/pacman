// Play: one tick of the actors ($1017, run twice a frame), the death
// animation, eaten ghosts' eyes going home, the frightened timer, the ghost
// house, scatter/chase, the siren and the fruit.
import { queue, timed } from './core.js';
import { setActorPositions, hideActors } from './tasks.js';
import {
  tileCollision, pixelCollision, movePacman, moveBlinky, movePinky, moveInky, moveClyde,
  blinkyMoveBody, pinkyMoveBody, inkyMoveBody, clydeMoveBody, step,
  pinkyRelease, inkyRelease, clydeRelease, releasePinky, releaseInky, releaseClyde,
  reverse,
} from './actors.js';

/** $1017: one tick of play. */
export function playStep(g) {
  const m = g.m;
  deathSequence(g);
  if (m[0x4da5]) return;
  eyesStart(g);
  blinkyHome(g);
  pinkyHome(g);
  inkyHome(g);
  clydeHome(g);
  if (m[0x4da4]) { ghostEaten(g); return; }
  tileCollision(g);
  pixelCollision(g);
  if (m[0x4da4]) return;
  movePacman(g);
  moveBlinky(g);
  movePinky(g);
  moveInky(g);
  moveClyde(g);
  if (m[0x4e04] !== 3) return;
  frightTimer(g);
  pinkyRelease(g);
  inkyRelease(g);
  clydeRelease(g);
}

/** $08F1: the once-a-frame work of play, after the two ticks. */
export function playExtras(g) {
  dotTimer(g);
  ghostHouse(g);
  ghostAnim(g);
  scatterChase(g);
  frightColours(g);
  eyesColour(g);
  energizerBlink(g);
  siren(g);
  fruitRelease(g);
}

// ---------------------------------------------------------------------------
// Death
// ---------------------------------------------------------------------------

// $12CB-$1346: the death animation's sprite codes, and the $4DC5 count each shows until
const DEATH_FRAMES = { 5: [0x34, 0xb4], 6: [0x35, 0xc3], 7: [0x36, 0xd2], 8: [0x37, 0xe1], 9: [0x38, 0xf0],
  10: [0x39, 0xff], 11: [0x3a, 0x10e], 12: [0x3b, 0x11d], 13: [0x3c, 0x12c], 14: [0x3d, 0x13b], 15: [0x3e, 0x159] };

/** $1291: $4DA5 is non-zero once Pac-Man is caught: a pause, then the shrinking animation. */
function deathSequence(g) {
  const m = g.m;
  const s = m[0x4da5];
  if (s === 0) return;
  const bump = () => { const v = (g.w(0x4dc5) + 1) & 0xffff; g.sw(0x4dc5, v); return v; };
  if (s <= 4) { if (bump() === 0x78) m[0x4da5] = 5; return; }
  if (s === 16) { // $1353
    m[0x4c0a] = 0x3f;
    if (bump() !== 0x1b8) return;
    m[0x4e14]--;
    m[0x4e15]--;
    hideActors(g);
    m[0x4e04]++;
    return;
  }
  if (s === 5) setActorPositions(g, 0);
  if (s === 6) m[0x4ebc] |= 0x10;
  if (s === 15) m[0x4ebc] = 0x20;
  const [code, until] = DEATH_FRAMES[s];
  m[0x4c0a] = code;
  if (bump() !== until) return;
  m[0x4da5]++;
}

// ---------------------------------------------------------------------------
// Eaten ghosts
// ---------------------------------------------------------------------------

/** $1235: while a ghost's points show, Pac-Man disappears; then the ghost turns to eyes. */
function ghostEaten(g) {
  const m = g.m;
  const s = m[0x4dd1];
  if (s === 1) return;
  const hl = 0x4c00 + ((2 * m[0x4da4]) & 0xff);
  if (s === 0) {
    m[hl] = (m[0x4dd0] + 0x27) & 0xff;
    m[hl + 1] = 0x18;
    m[0x4c0b] = 0;
    timed(g, 0x4a, 3, 0);
    m[0x4dd1]++;
    return;
  }
  m[hl] = 0x20;
  m[0x4c0b] = 9;
  m[0x4dab] = m[0x4da4];
  m[0x4da4] = 0;
  m[0x4dd1] = 0;
  m[0x4eac] |= 0x40;
}

/** $1272 (timed): the points have shown long enough. */
export function deathTick(g) { g.m[0x4dd1]++; }

/** $1066: the eaten ghost ($4DAB) starts heading home as eyes. */
function eyesStart(g) {
  const m = g.m;
  const a = m[0x4dab];
  if (!a) return;
  m[0x4dab] = 0;
  if (a <= 4) m[0x4dac + a - 1] = 1;
}

/** $1101: when no eyes are left travelling, stop their sound. */
function eyesDone(g) {
  const m = g.m;
  if ((m[0x4dac] | m[0x4dad] | m[0x4dae] | m[0x4daf]) === 0) m[0x4eac] &= ~0x40;
}

/** $1094: Blinky's eyes: 1 travel to above the door, 2 drop into the house and come back out. */
function blinkyHome(g) {
  const m = g.m;
  switch (m[0x4dac]) {
    case 1: // $10C0
      blinkyMoveBody(g);
      if (g.w(0x4d00) === 0x8064) m[0x4dac]++;
      break;
    case 2: // $10D2
      g.sw(0x4d00, step(g, 0x3301, 0x4d00));
      m[0x4d28] = 1; m[0x4d2c] = 1;
      if (m[0x4d00] !== 0x80) return;
      g.sw(0x4d0a, 0x2e2f); g.sw(0x4d31, 0x2e2f);
      m[0x4da0] = 0; m[0x4dac] = 0; m[0x4da7] = 0;
      eyesDone(g);
      break;
    default: break;
  }
}

/** $109E: Pinky's eyes. */
function pinkyHome(g) {
  const m = g.m;
  switch (m[0x4dad]) {
    case 1: // $1118
      pinkyMoveBody(g);
      if (g.w(0x4d02) === 0x8064) m[0x4dad]++;
      break;
    case 2: // $112A
      g.sw(0x4d02, step(g, 0x3301, 0x4d02));
      m[0x4d29] = 1; m[0x4d2d] = 1;
      if (m[0x4d02] !== 0x80) return;
      g.sw(0x4d0c, 0x2e2f); g.sw(0x4d33, 0x2e2f);
      m[0x4da1] = 0; m[0x4dad] = 0; m[0x4da8] = 0;
      eyesDone(g);
      break;
    default: break;
  }
}

/** $10A8: Inky's eyes: home, down into the house, then across to his side of it. */
function inkyHome(g) {
  const m = g.m;
  switch (m[0x4dae]) {
    case 1: // $115C
      inkyMoveBody(g);
      if (g.w(0x4d04) === 0x8064) m[0x4dae]++;
      break;
    case 2: // $116E
      g.sw(0x4d04, step(g, 0x3301, 0x4d04));
      m[0x4d2a] = 1; m[0x4d2e] = 1;
      if (m[0x4d04] !== 0x80) return;
      m[0x4dae]++;
      break;
    case 3: // $118F
      g.sw(0x4d04, step(g, 0x3303, 0x4d04));
      m[0x4d2a] = 2; m[0x4d2e] = 2;
      if (m[0x4d05] !== 0x90) return;
      g.sw(0x4d0e, 0x302f); g.sw(0x4d35, 0x302f);
      m[0x4d2a] = 1; m[0x4d2e] = 1;
      m[0x4da2] = 0; m[0x4dae] = 0; m[0x4da9] = 0;
      eyesDone(g);
      break;
    default: break;
  }
}

/** $10B4: Clyde's eyes: home, down, then across to his side. */
function clydeHome(g) {
  const m = g.m;
  switch (m[0x4daf]) {
    case 1: // $11C9
      clydeMoveBody(g);
      if (g.w(0x4d06) === 0x8064) m[0x4daf]++;
      break;
    case 2: // $11DB
      g.sw(0x4d06, step(g, 0x3301, 0x4d06));
      m[0x4d2b] = 1; m[0x4d2f] = 1;
      if (m[0x4d06] !== 0x80) return;
      m[0x4daf]++;
      break;
    case 3: // $11FC
      g.sw(0x4d06, step(g, 0x32ff, 0x4d06));
      m[0x4d2b] = 0; m[0x4d2f] = 0;
      if (m[0x4d07] !== 0x70) return;
      g.sw(0x4d10, 0x2c2f); g.sw(0x4d37, 0x2c2f);
      m[0x4d2b] = 1; m[0x4d2f] = 1;
      m[0x4da3] = 0; m[0x4daf] = 0; m[0x4daa] = 0;
      eyesDone(g);
      break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Frightened ghosts
// ---------------------------------------------------------------------------

/** $1376: count down the frightened time; at the end (or when no blue ghost is left) everything returns to normal. */
function frightTimer(g) {
  const m = g.m;
  if (!m[0x4da6]) return;
  if (m[0x4da7] | m[0x4da8] | m[0x4da9] | m[0x4daa]) {
    const t = (g.w(0x4dcb) - 1) & 0xffff;
    g.sw(0x4dcb, t);
    if (t) return;
  }
  m[0x4c0b] = 9;
  for (let k = 0; k < 4; k++) if (!m[0x4dac + k]) m[0x4da7 + k] = 0;
  m[0x4dcb] = 0; m[0x4dcc] = 0;
  m[0x4da6] = 0; m[0x4dc8] = 0; m[0x4dd0] = 0;
  m[0x4eac] &= ~0xa0;
}

/**
 * $0AC3: every 14 frames, re-colour the ghosts: blue while frightened, and
 * flashing blue/white in the last $100 ticks; their own colours otherwise.
 */
function frightColours(g) {
  const m = g.m;
  if (m[0x4da4]) return;
  if (m[0x4dc8] !== 0) { m[0x4dc8]--; return; }
  m[0x4dc8] = 14;
  const ending = g.w(0x4dcb) < 0x100;
  if (m[0x4da6] && ending) {
    m[0x4eac] |= 0x80;
    if (m[0x4c0b] === 9) m[0x4eac] &= ~0x80;
    m[0x4c0b] = 9;
  }
  const own = [1, 3, 5, 7];
  for (let k = 0; k < 4; k++) {
    const col = 0x4c03 + 2 * k;
    if (m[0x4da7 + k]) {
      if (!ending) continue;
      m[col] = m[col] === 0x11 ? 0x12 : 0x11;
    } else m[col] = own[k];
  }
  m[0x4dc8]--;
}

/** $0BD6: eyes are drawn with colour $19 (in the attract chase, $00). */
export function eyesColour(g) {
  const m = g.m;
  const b = m[0x4e02] === 0x22 ? 0 : 0x19;
  for (let k = 0; k < 4; k++) if (m[0x4dac + k]) m[0x4c03 + 2 * k] = b;
}

// ---------------------------------------------------------------------------
// The ghost house
// ---------------------------------------------------------------------------

/** $13DD: if Pac-Man goes $4D95 ticks without eating a dot, the next ghost is let out. */
function dotTimer(g) {
  const m = g.m;
  if (m[0x4e0e] !== m[0x4d9e]) { g.sw(0x4d97, 0); return; }
  const t = (g.w(0x4d97) + 1) & 0xffff;
  g.sw(0x4d97, t);
  if (t !== g.w(0x4d95)) return;
  g.sw(0x4d97, 0);
  if (!m[0x4da1]) { releasePinky(g); return; }
  if (!m[0x4da2]) { releaseInky(g); return; }
  if (!m[0x4da3]) releaseClyde(g);
}

/**
 * $0C42: every other frame (per the pattern at $4D94), move the ghosts that
 * are inside the house: bob up and down (state 0), go to the middle (3),
 * rise out of the door (2); once out (1) they are left to the movement code.
 */
function ghostHouse(g) {
  const m = g.m;
  if (m[0x4da4]) return;
  const p = m[0x4d94];
  m[0x4d94] = ((p << 1) | (p >> 7)) & 0xff;
  if (!(p & 0x80)) return;
  // Blinky, if he is still in the house, rises out of it
  if (!m[0x4da0]) {
    g.sw(0x4d00, step(g, 0x3305, 0x4d00));
    m[0x4d28] = 3; m[0x4d2c] = 3;
    if (m[0x4d00] === 0x64) {
      g.sw(0x4d0a, 0x2e2c);
      g.sw(0x4d14, 0x0100); g.sw(0x4d1e, 0x0100);
      m[0x4d28] = 2; m[0x4d2c] = 2;
      m[0x4da0] = 1;
    }
  }
  // Pinky
  const pinky = m[0x4da1];
  if (pinky === 0) {
    let a = m[0x4d02];
    if (a === 0x78) a = reverse(g, 1);
    if (a === 0x80) reverse(g, 1);
    m[0x4d29] = m[0x4d2d];
    g.sw(0x4d02, step(g, 0x4d20, 0x4d02));
  } else if (pinky !== 1) {
    g.sw(0x4d02, step(g, 0x3305, 0x4d02));
    m[0x4d2d] = 3; m[0x4d29] = 3;
    if (m[0x4d02] === 0x64) {
      g.sw(0x4d0c, 0x2e2c);
      g.sw(0x4d16, 0x0100); g.sw(0x4d20, 0x0100);
      m[0x4d29] = 2; m[0x4d2d] = 2;
      m[0x4da1] = 1;
    }
  }
  // Inky
  const inky = m[0x4da2];
  if (inky === 0) {
    let a = m[0x4d04];
    if (a === 0x78) a = reverse(g, 2);
    if (a === 0x80) reverse(g, 2);
    m[0x4d2a] = m[0x4d2e];
    g.sw(0x4d04, step(g, 0x4d22, 0x4d04));
  } else if (inky === 3) {
    g.sw(0x4d04, step(g, 0x32ff, 0x4d04));
    m[0x4d2a] = 0; m[0x4d2e] = 0;
    if (m[0x4d05] === 0x80) m[0x4da2] = 2;
  } else if (inky !== 1) {
    g.sw(0x4d04, step(g, 0x3305, 0x4d04));
    m[0x4d2a] = 3; m[0x4d2e] = 3;
    if (m[0x4d04] === 0x64) {
      g.sw(0x4d0e, 0x2e2c);
      g.sw(0x4d18, 0x0100); g.sw(0x4d22, 0x0100);
      m[0x4d2a] = 2; m[0x4d2e] = 2;
      m[0x4da2] = 1;
    }
  }
  // Clyde
  const clyde = m[0x4da3];
  if (clyde === 1) return;
  if (clyde === 0) {
    let a = m[0x4d06];
    if (a === 0x78) a = reverse(g, 3);
    if (a === 0x80) reverse(g, 3);
    m[0x4d2b] = m[0x4d2f];
    g.sw(0x4d06, step(g, 0x4d24, 0x4d06));
    return;
  }
  if (clyde === 3) {
    g.sw(0x4d06, step(g, 0x3303, 0x4d06));
    m[0x4d2b] = 2; m[0x4d2f] = 2;
    if (m[0x4d07] === 0x80) m[0x4da3] = 2;
    return;
  }
  g.sw(0x4d06, step(g, 0x3305, 0x4d06));
  m[0x4d2b] = 3; m[0x4d2f] = 3;
  if (m[0x4d06] === 0x64) {
    g.sw(0x4d10, 0x2e2c);
    g.sw(0x4d1a, 0x0100); g.sw(0x4d24, 0x0100);
    m[0x4d2b] = 2; m[0x4d2f] = 2;
    m[0x4da3] = 1;
  }
}

// ---------------------------------------------------------------------------
// Timers and effects
// ---------------------------------------------------------------------------

/** $0E23: the ghosts' two-frame animation, every 8 frames. */
export function ghostAnim(g) {
  const m = g.m;
  m[0x4dc4]++;
  if (m[0x4dc4] !== 8) return;
  m[0x4dc4] = 0;
  m[0x4dc0] ^= 1;
}

/**
 * $0E36: scatter and chase: the level's seven phase lengths at $4D86 (in
 * ticks); each change makes every ghost turn round. Paused while frightened.
 */
function scatterChase(g) {
  const m = g.m;
  if (m[0x4da6]) return;
  const phase = m[0x4dc1];
  if (phase === 7) return;
  const t = (g.w(0x4dc2) + 1) & 0xffff;
  g.sw(0x4dc2, t);
  if (t !== g.w(0x4d86 + 2 * phase)) return;
  m[0x4dc1] = phase + 1;
  m[0x4db1] = 1; m[0x4db2] = 1; m[0x4db3] = 1; m[0x4db4] = 1;
}

/** $0C0D: blink the energizers every 10 frames (in the attract mode, the two on screen). */
export function energizerBlink(g) {
  const m = g.m;
  m[0x4dcf]++;
  if (m[0x4dcf] !== 10) return;
  m[0x4dcf] = 0;
  if (m[0x4e04] === 3) {
    const a = m[0x4464] === 0x10 ? 0 : 0x10;
    m[0x4464] = a; m[0x4478] = a; m[0x4784] = a; m[0x4798] = a;
  } else {
    const a = m[0x4732] === 0x10 ? 0 : 0x10;
    m[0x4732] = a; m[0x4678] = a;
  }
}

/** $0E6C: the siren's pitch rises as the dots go. */
function siren(g) {
  const m = g.m;
  if (m[0x4da5]) { m[0x4eac] = 0; return; }
  const dots = m[0x4e0e];
  const base = m[0x4eac] & 0xe0;
  let bit;
  if (dots >= 0xe4) bit = 0x10;
  else if (dots >= 0xd4) bit = 0x08;
  else if (dots >= 0xb4) bit = 0x04;
  else if (dots >= 0x74) bit = 0x02;
  else bit = 0x01;
  m[0x4eac] = base | bit;
}

/** $0EAD: the fruit appears after the 70th and 170th dots, for ten seconds. */
function fruitRelease(g) {
  const m = g.m;
  if (m[0x4da5] || m[0x4dd4]) return;
  const dots = m[0x4e0e];
  if (dots === 0x46) {
    if (m[0x4e0c]) return;
    m[0x4e0c]++;
  } else if (dots === 0xaa) {
    if (m[0x4e0d]) return;
    m[0x4e0d]++;
  } else return;
  g.sw(0x4dd2, 0x8094);
  const lv = Math.min(m[0x4e13], 0x14);
  const hl = 0x0efd + 3 * lv;
  m[0x4c0c] = m[hl];
  m[0x4c0d] = m[hl + 1];
  m[0x4dd4] = m[hl + 2];
  timed(g, 0x8a, 4, 0);
}

/** $1000 (timed): the fruit's time is up. */
export function clearFruit(g) {
  g.m[0x4dd4] = 0;
  g.sw(0x4dd2, 0);
}

/** $100B (timed): take the fruit's points off the screen. */
export function clearFruitScore(g) {
  queue(g, 0x1c, 0x9b);
  if (g.m[0x4e00] === 1) return;
  queue(g, 0x1c, 0xa2);
}
