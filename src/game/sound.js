// The sound driver ($2CC1-$2FB7): three voices, each playing either a song
// (requested in $4ECC/$4EDC/$4EEC; the start music and the intermission tune)
// or an effect (requested bit by bit in $4E9C/$4EAC/$4EBC: coin, extra life,
// siren, energizer, eyes, dots, fruit, ghost eaten, death...). A request
// byte's highest set bit wins. Each voice's state is 16 bytes at ix; its
// output (frequency nibbles, volume) goes to $4E8C-$4E9B, which the
// interrupt copies to the sound chip.

/** $2D0C: effects on the three voices. */
export function soundEffects(g) {
  const m = g.m;
  m[0x4e91] = effect(g, 0x3b30, 0x4e9c, 0x4e8c);
  m[0x4e96] = effect(g, 0x3b40, 0x4eac, 0x4e92);
  m[0x4e9b] = effect(g, 0x3b80, 0x4ebc, 0x4e97);
  m[0x4e90] = 0;
}

/** $2CC1: songs, which take over a voice's volume while they play. */
export function soundSongs(g) {
  const m = g.m;
  let a = song(g, 0x3bc8, 0x4ecc, 0x4e8c);
  if (m[0x4ecc]) m[0x4e91] = a;
  a = song(g, 0x3bcc, 0x4edc, 0x4e92);
  if (m[0x4edc]) m[0x4e96] = a;
  a = song(g, 0x3bd0, 0x4eec, 0x4e97);
  if (m[0x4eec]) m[0x4e9b] = a;
}

/** $2DF4: silence the voice (if it was playing) and return 0. */
function stop(g, ix, iy) {
  const m = g.m;
  if (!m[ix + 2]) return 0;
  m[ix + 2] = 0; m[ix + 13] = 0; m[ix + 14] = 0; m[ix + 15] = 0;
  m[iy] = 0; m[iy + 1] = 0; m[iy + 2] = 0; m[iy + 3] = 0;
  return 0;
}

/** The highest set bit of c as [mask, index]. */
function topBit(c) {
  let e = 0x80, b = 8;
  while (!(e & c)) { e >>= 1; b--; }
  return [e, b - 1];
}

const rotr4 = (v) => ((v >> 4) | (v << 4)) & 0xff;

/** $2EE4/$2EE8: shift the frequency up by `shift` octaves, write it out, and apply the volume envelope. */
function output(g, ix, iy, l, shift) {
  const m = g.m;
  let hl = l;
  for (let k = 0; k < shift; k++) hl = (hl * 2) & 0xffff;
  const lo = hl & 0xff, hi = hl >> 8;
  m[iy] = lo;
  m[iy + 1] = rotr4(lo);
  m[iy + 2] = hi;
  m[iy + 3] = rotr4(hi);
  return envelope(g, ix);
}

/**
 * $2EFE: the volume, by envelope type (ix+11): 0 steady, 1 decaying every
 * frame, 2/3/4 every 2/4/8 frames.
 */
function envelope(g, ix) {
  const m = g.m;
  const type = m[ix + 11];
  const decay = () => {
    let a = m[ix + 15] & 0x0f;
    if (!a) return 0;
    a--;
    m[ix + 15] = a;
    return a;
  };
  switch (type) {
    case 0: return m[ix + 15];
    case 1: return decay();
    case 2: case 3: case 4: {
      const mask = [1, 3, 7][type - 2];
      if (m[0x4c84] & mask) return m[ix + 15];
      return decay();
    }
    default: return (0x4a + (type & 0x0f) - 5) & 0xff; // the jump table's low byte, as the original leaves A
  }
}

/**
 * $2DEE: an effect: 8 bytes from the table at hl + 8 * bit, copied to ix+3:
 * [3] octave shift (bits 4-6), [4] start frequency, [5] step per frame, [6]
 * duration (bit 7: reverse the step each time round), [7] frequency step per
 * repeat, [8] repeats, [9] volume (and envelope in bits 4-7), [10] volume
 * step per repeat.
 */
function effect(g, hl, ix, iy) {
  const m = g.m;
  for (;;) {
    const c = m[ix];
    if (!c) return stop(g, ix, iy);
    const [e, bit] = topBit(c);
    if (!(m[ix + 2] & e)) {
      m[ix + 2] = e;
      m.copyWithin(ix + 3, hl + bit * 8, hl + bit * 8 + 8);
      m[ix + 12] = m[ix + 6] & 0x7f;
      m[ix + 14] = m[ix + 4];
      const b = m[ix + 9];
      m[ix + 11] = (b >> 4) & 0x0f;
      if (!(m[ix + 11] & 8)) { m[ix + 15] = b; m[ix + 13] = 0; }
    }
    // $2E6E
    m[ix + 12] = (m[ix + 12] - 1) & 0xff;
    if (m[ix + 12] === 0) {
      if (m[ix + 8]) {
        m[ix + 8]--;
        if (m[ix + 8] === 0) { m[ix] &= ~e & 0xff; continue; } // this effect is over: next one, or silence
      }
      m[ix + 12] = m[ix + 6] & 0x7f;
      let next = true;
      if (m[ix + 6] & 0x80) {
        m[ix + 5] = (-m[ix + 5]) & 0xff;
        const was = m[ix + 13] & 1;
        m[ix + 13] |= 1;
        if (!was) next = false;
        else m[ix + 13] &= ~1;
      }
      if (next) {
        m[ix + 4] = (m[ix + 4] + m[ix + 7]) & 0xff;
        m[ix + 14] = m[ix + 4];
        m[ix + 9] = (m[ix + 9] + m[ix + 10]) & 0xff;
        if (!(m[ix + 11] & 8)) m[ix + 15] = m[ix + 9];
      }
    }
    // $2ECD
    m[ix + 14] = (m[ix + 14] + m[ix + 5]) & 0xff;
    return output(g, ix, iy, m[ix + 14], (m[ix + 3] & 0x70) >> 4);
  }
}

/**
 * $2D44: a song: a byte stream from the pointer at ix+6. Bytes $F0-$FF are
 * commands ($F0 jump, $F1 octave, $F2 base, $F3 volume, $F4 envelope, $FF
 * end); others are notes: bits 5-7 the length (1-128 frames, table $3BB0),
 * bits 0-3 the pitch (table $3BB8; 0 a rest), bit 4 an octave up.
 */
function song(g, table, ix, iy) {
  const m = g.m;
  const c = m[ix];
  if (!c) return stop(g, ix, iy);
  const [e, bit] = topBit(c);
  let hl;
  if (!(m[ix + 2] & e)) {
    m[ix + 2] = e;
    hl = g.w(table + 2 * bit);
  } else {
    m[ix + 12] = (m[ix + 12] - 1) & 0xff;
    if (m[ix + 12] !== 0) return note(g, ix, iy);
    hl = g.w(ix + 6);
  }
  // $2D72: read bytes until a note
  for (let guard = 0; guard < 256; guard++) {
    const a = m[hl];
    hl = (hl + 1) & 0xffff;
    g.sw(ix + 6, hl);
    if (a < 0xf0) return startNote(g, ix, iy, a);
    const p = g.w(ix + 6);
    switch (a & 0x0f) {
      case 0: g.sw(ix + 6, g.w(p)); break;                           // $2F55
      case 1: m[ix + 3] = m[p]; g.sw(ix + 6, p + 1); break;          // $2F65
      case 2: m[ix + 4] = m[p]; g.sw(ix + 6, p + 1); break;          // $2F77
      case 3: m[ix + 9] = m[p]; g.sw(ix + 6, p + 1); break;          // $2F89
      case 4: m[ix + 11] = m[p]; g.sw(ix + 6, p + 1); break;         // $2F9B
      case 15: // $2FAD: end: drop the request, silence, and (as the original does) read on
        m[ix] &= ~m[ix + 2] & 0xff;
        stop(g, ix, iy);
        break;
      default: break;
    }
    hl = g.w(ix + 6);
  }
  return 0;
}

/** $2DA5: start note a. */
function startNote(g, ix, iy, a) {
  const m = g.m;
  const b = a;
  if (a & 0x1f) m[ix + 13] = b;
  m[ix + 15] = m[ix + 11] & 8 ? 0 : m[ix + 9];
  m[ix + 12] = m[0x3bb0 + ((b >> 5) & 7)];
  if (b & 0x1f) m[ix + 14] = m[0x3bb8 + (b & 0x0f)];
  return note(g, ix, iy);
}

/** $2DD7: the note's frequency: pitch shifted by the base octave, plus one for bit 4. */
function note(g, ix, iy) {
  const m = g.m;
  const a = ((m[ix + 13] & 0x10 ? 1 : 0) + m[ix + 4]) & 0xff;
  return output(g, ix, iy, m[ix + 14], a);
}
