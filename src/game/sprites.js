// Sprites: turning the actors' positions and states into the sprite list the
// interrupt copies to the hardware ($4C02-$4C0D codes and colours,
// $4C12-$4C1D positions). Sprite 1-4 Blinky, Pinky, Inky, Clyde; 5 Pac-Man;
// 6 the fruit (also the giant Pac-Man's fourth quarter and the torn cloak).
// Only the upright cabinet is supported (no cocktail flip).

/** $039D: in the first intermission, sprites 2-4 and 6 follow Pac-Man as the giant Pac-Man's quarters. */
export function bigPacmanPositions(g) {
  const m = g.m;
  if (m[0x4e06] < 5) return;
  const l = m[0x4d08], h = m[0x4d09];
  m[0x4d06] = l; m[0x4dd2] = l;
  m[0x4d02] = (l - 16) & 0xff; m[0x4d04] = (l - 16) & 0xff;
  m[0x4d03] = (h + 8) & 0xff; m[0x4d07] = (h + 8) & 0xff;
  m[0x4d05] = (h - 8) & 0xff; m[0x4dd3] = (h - 8) & 0xff;
}

/**
 * $1490: sprite positions from the actors (the hardware's sprites 1 and 2 sit
 * a pixel off from the rest, hence 6 and 7), then the codes: Pac-Man's mouth
 * by direction and distance moved, the ghosts' bodies by direction (blue when
 * frightened), and the intermissions' special pictures.
 */
export function spriteCodes(g) {
  const m = g.m;
  if (m[0x4e72] & m[0x4e09]) return; // cocktail, player 2: not supported
  const pos = (src, dst, add) => {
    m[dst + 1] = ((~m[src] & 0xff) + 9) & 0xff;
    m[dst] = (m[src + 1] + add) & 0xff;
  };
  pos(0x4d00, 0x4c12, 6);
  pos(0x4d02, 0x4c14, 6);
  pos(0x4d04, 0x4c16, 7);
  pos(0x4d06, 0x4c18, 7);
  pos(0x4d08, 0x4c1a, 7);
  pos(0x4dd2, 0x4c1c, 7);
  // $14FE
  if (!m[0x4da5]) {
    if (m[0x4da4]) { intermissionSprites(g); return; }
    pacmanFrame(g);
  }
  // $154B: ghosts: blue ($1C/$1D) unless not frightened, or eyes
  const d = m[0x4dc0];
  for (let k = 0; k < 4; k++) m[0x4c02 + 2 * k] = 0x1c + d;
  for (let k = 0; k < 4; k++) {
    if (m[0x4dac + k] || !m[0x4da7 + k]) m[0x4c02 + 2 * k] = (m[0x4d2c + k] * 2 + d + 0x20) & 0xff;
  }
  intermissionSprites(g);
}

/** $168C-$171B: Pac-Man's picture from his direction and position within the tile. */
function pacmanFrame(g) {
  const m = g.m;
  let code;
  switch (m[0x4d30]) {
    case 0: { const a = m[0x4d09] & 7; code = a >= 6 ? 0x30 : a >= 4 ? 0x2e : a >= 2 ? 0x2c : 0x2e; break; }
    case 1: { const a = m[0x4d08] & 7; code = a >= 6 ? 0x2f : a >= 4 ? 0x2d : a >= 2 ? 0x2f : 0x30; break; }
    case 2: { const a = m[0x4d09] & 7; code = a >= 6 ? 0xae : a >= 4 ? 0xac : a >= 2 ? 0xae : 0xb0; break; }
    default: { const a = m[0x4d08] & 7; code = a >= 6 ? 0x30 : a >= 4 ? 0x6f : a >= 2 ? 0x6d : 0x6f; break; }
  }
  m[0x4c0a] = code;
}

/** $15E6, $162D, $1652: the intermissions' pictures. */
function intermissionSprites(g) {
  const m = g.m;
  // $15E6: the giant Pac-Man, four sprites, his mouth by position
  if (m[0x4e06] >= 5) {
    const a = m[0x4d09] & 0x0f;
    let d = a >= 12 ? 0x18 : a >= 8 ? 0x14 : a >= 4 ? 0x10 : 0x14;
    m[0x4c04] = d++; m[0x4c06] = d++; m[0x4c08] = d++; m[0x4c0c] = d;
    m[0x4c0a] = 0x3f;
    m[0x4c05] = m[0x4c07] = m[0x4c09] = m[0x4c0d] = 0x16;
  }
  // $162D: Blinky with his cloak snagged, then torn
  const i2 = m[0x4e07];
  if (i2) {
    if (m[0x4d3a] === 0x3d) m[0x4c0b] = 0;
    if (i2 >= 10) {
      m[0x4c02] = 0x32;
      m[0x4c03] = 0x1d;
      if (i2 >= 12) m[0x4c02] = 0x33;
    }
  }
  // $1652: Blinky patched, dragging his cloak
  const i3 = m[0x4e08];
  if (i3) {
    if (m[0x4d3a] === 0x3d) m[0x4c0b] = 0;
    m[0x4c02] = (m[0x4dc0] + 8) & 0xff;
    if (i3 >= 3) {
      const a = ((m[0x4d01] & 8) >> 3) + 10;
      m[0x4c0c] = a;
      m[0x4c02] = a + 2;
      m[0x4c0d] = 0x1e;
    }
  }
}
