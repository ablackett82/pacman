// This project's own pictures for the game's tile and sprite codes, and the
// colour palettes. Nothing here comes from the arcade's graphics ROMs: the
// letters and fruit are drawn by hand, Pac-Man and the maze walls are drawn
// from geometry. Pixels are digits 0-3: 0 transparent, 1-3 the palette's
// three colours; what each colour is for depends on the picture (see PALETTES).
import { WALLS } from './walls.js';

// ---------------------------------------------------------------------------
// Colours and palettes (the game's colour codes 0-$1F)
// ---------------------------------------------------------------------------

const C = {
  black: '#000000', red: '#ff0000', pink: '#ffb8ff', cyan: '#00ffff', orange: '#ffb852',
  yellow: '#ffff00', blue: '#2121ff', white: '#dedeff', salmon: '#ffb8ae', green: '#00ff00',
  brown: '#de9751', lblue: '#47b8ff', peach: '#ffb8ae',
};

// colours 1-3 of each palette. Text and walls use colour 1; dots and the
// ghost-house door colour 3; ghosts are body 1, eye whites 2, pupils 3.
const P = {
  0x01: [C.red, C.white, C.blue],        // Blinky, red text
  0x03: [C.pink, C.white, C.blue],       // Pinky, pink text
  0x05: [C.cyan, C.white, C.blue],       // Inky, cyan text
  0x07: [C.orange, C.white, C.blue],     // Clyde, orange text
  0x09: [C.yellow, C.blue, C.red],       // Pac-Man, READY!, the Galaxian flagship
  0x0e: [C.salmon, C.white, C.red],
  0x0f: [C.white, C.green, C.red],       // white text; the strawberry
  0x10: [C.blue, C.blue, C.salmon],      // the maze and its dots
  0x11: [C.blue, C.salmon, C.salmon],    // frightened ghost
  0x12: [C.white, C.red, C.red],         // frightened ghost, flashing
  0x14: [C.red, C.white, C.brown],       // cherry, apple
  0x15: [C.orange, C.green, C.brown],    // orange
  0x16: [C.yellow, C.lblue, C.white],    // bell, key, the giant Pac-Man
  0x17: [C.green, C.white, C.brown],     // melon
  0x18: [C.cyan, C.cyan, C.pink],        // ghost points; the ghost-house door
  0x19: [null, C.white, C.blue],         // eyes only
  0x1a: [C.blue, C.blue, C.salmon],      // maze (no-turn-up tiles)
  0x1b: [C.blue, C.blue, C.salmon],      // maze (tunnel)
  0x1d: [C.red, C.white, C.blue],        // the snagged Blinky
  0x1e: [C.red, C.white, C.peach],       // Blinky's dragged cloak
  0x1f: [C.white, C.white, C.salmon],    // the maze flashing white; PTS
};
const hex = (h) => (h ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
export const PALETTES = [];
for (let i = 0; i < 32; i++) PALETTES[i] = (P[i] || [null, null, null]).map(hex);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A size x size grid of '0'. */
const blank = (w, h = w) => Array.from({ length: h }, () => Array(w).fill(0));
const toRows = (g) => g.map((r) => r.join(''));
/** Rows of '#'/'.' art to digits (fill with colour v). */
const ink = (rows, v = 1) => rows.map((r) => r.replace(/#/g, String(v)).replace(/[^0-9]/g, '0'));
/** Paste art (rows of digits, '0' transparent) into grid g at (x, y). */
function paste(g, art, x = 0, y = 0) {
  art.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '0' && r[i] !== '.') { const yy = y + j, xx = x + i; if (g[yy] && xx >= 0 && xx < g[yy].length) g[yy][xx] = Number(r[i]); } });
  return g;
}
/** Cut an 8x8 tile out of a larger picture. */
const cut = (rows, x, y) => rows.slice(y, y + 8).map((r) => r.slice(x, x + 8));

// ---------------------------------------------------------------------------
// Font: 7 x 7 letters in the top-left of an 8 x 8 tile
// ---------------------------------------------------------------------------

const GLYPHS = {
  A: ['..###..', '.##.##.', '##...##', '##...##', '#######', '##...##', '##...##'],
  B: ['######.', '##...##', '##...##', '######.', '##...##', '##...##', '######.'],
  C: ['..####.', '.##..##', '##.....', '##.....', '##.....', '.##..##', '..####.'],
  D: ['#####..', '##..##.', '##...##', '##...##', '##...##', '##..##.', '#####..'],
  E: ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '#######'],
  F: ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '##.....'],
  G: ['..#####', '.##....', '##.....', '##..###', '##...##', '.##..##', '..#####'],
  H: ['##...##', '##...##', '##...##', '#######', '##...##', '##...##', '##...##'],
  I: ['.######', '...##..', '...##..', '...##..', '...##..', '...##..', '.######'],
  J: ['.....##', '.....##', '.....##', '.....##', '##...##', '##...##', '.#####.'],
  K: ['##...##', '##..##.', '##.##..', '####...', '#####..', '##.###.', '##..###'],
  L: ['.##....', '.##....', '.##....', '.##....', '.##....', '.##....', '.######'],
  M: ['##...##', '###.###', '#######', '#######', '##.#.##', '##...##', '##...##'],
  N: ['##...##', '###..##', '####.##', '#######', '##.####', '##..###', '##...##'],
  O: ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  P: ['######.', '##...##', '##...##', '##...##', '######.', '##.....', '##.....'],
  Q: ['.#####.', '##...##', '##...##', '##...##', '##.####', '##..##.', '.####.#'],
  R: ['######.', '##...##', '##...##', '##..###', '#####..', '##.###.', '##..###'],
  S: ['.####..', '##..##.', '##.....', '.#####.', '.....##', '##...##', '.#####.'],
  T: ['######.', '..##...', '..##...', '..##...', '..##...', '..##...', '..##...'],
  U: ['##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  V: ['##...##', '##...##', '##...##', '###.###', '.#####.', '..###..', '...#...'],
  W: ['##...##', '##...##', '##.#.##', '#######', '#######', '###.###', '##...##'],
  X: ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##'],
  Y: ['.##..##', '.##..##', '.##..##', '..####.', '...##..', '...##..', '...##..'],
  Z: ['#######', '....###', '...###.', '..###..', '.###...', '###....', '#######'],
  0: ['..###..', '.#..##.', '##...##', '##...##', '##...##', '.##..#.', '..###..'],
  1: ['...##..', '..###..', '...##..', '...##..', '...##..', '...##..', '.######'],
  2: ['.#####.', '##...##', '....###', '..####.', '.####..', '###....', '#######'],
  3: ['.######', '....##.', '...##..', '..####.', '.....##', '##...##', '.#####.'],
  4: ['...###.', '..####.', '.##.##.', '##..##.', '#######', '....##.', '....##.'],
  5: ['######.', '##.....', '######.', '.....##', '.....##', '##...##', '.#####.'],
  6: ['..####.', '.##....', '##.....', '######.', '##...##', '##...##', '.#####.'],
  7: ['#######', '##...##', '....##.', '...##..', '..##...', '..##...', '..##...'],
  8: ['.#####.', '##...##', '##...##', '.#####.', '##...##', '##...##', '.#####.'],
  9: ['.#####.', '##...##', '##...##', '.######', '.....##', '....##.', '.####..'],
  '-': ['.......', '.......', '.......', '.######', '.......', '.......', '.......'],
  '.': ['.......', '.......', '.......', '.......', '.......', '##.....', '##.....'],
  '"': ['##.##..', '##.##..', '.#..#..', '.......', '.......', '.......', '.......'],
  '/': ['......#', '.....##', '....##.', '...##..', '..##...', '.##....', '##.....'],
  '!': ['..##...', '..##...', '..##...', '..##...', '..##...', '.......', '..##...'],
  '©': ['.#####.', '#.....#', '#.###.#', '#.#...#', '#.###.#', '#.....#', '.#####.'],
};
const glyph = (ch, v = 1) => ink([...GLYPHS[ch].map((r) => r + '.'), '........'], v);

// small 3 x 5 digits for points
const SMALL = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'], T: ['###', '.#.', '.#.', '.#.', '.#.'], S: ['###', '#..', '###', '..#', '###'],
};
/** A small-digit string drawn into grid g at (x, y), 4 pixels per character. */
function smallText(g, s, x, y, v = 1) {
  for (const ch of s) { paste(g, ink(SMALL[ch], v), x, y); x += 4; }
  return g;
}

// ---------------------------------------------------------------------------
// Pac-Man, drawn from geometry
// ---------------------------------------------------------------------------

/**
 * A disc of radius r centred at (cx, cy) in a size x size grid, less a mouth
 * wedge of total angle `mouth` (radians) facing angle `dir` (0 right, pi/2 down).
 */
function pac(size, cx, cy, r, mouth, dir = 0, v = 1) {
  const g = blank(size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r * r) continue;
    if (mouth > 0) {
      let a = Math.atan2(dy, dx) - dir;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) < mouth / 2 && dx * dx + dy * dy > 0.6) continue;
    }
    g[y][x] = v;
  }
  return g;
}
const PAC = (mouth, dir) => toRows(pac(16, 7.5, 7.5, 6.6, mouth, dir));

// ---------------------------------------------------------------------------
// Ghosts
// ---------------------------------------------------------------------------

const GHOST_BODY = [
  '................',
  '......####......',
  '....########....',
  '...##########...',
  '..############..',
  '..############..',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
];
const SKIRTS = [
  ['.##.###..###.##.', '.#...##..##...#.'],
  ['.####.####.####.', '..##..##..##..#.'.replace(/#\.$/, '..')],
];
const EYE = ['.##.', '####', '####', '####', '.##.'];
// eye whites' top-left and the pupils' offset within them, by direction
const EYES = [
  { w: [[4, 4], [10, 4]], p: [2, 1] }, // right
  { w: [[3, 6], [9, 6]], p: [1, 3] },  // down
  { w: [[2, 4], [8, 4]], p: [0, 1] },  // left
  { w: [[3, 2], [9, 2]], p: [1, 0] },  // up
];
function ghost(dir, frame, { body = true } = {}) {
  const g = blank(16);
  if (body) paste(g, ink([...GHOST_BODY, ...SKIRTS[frame]], 1));
  for (const [x, y] of EYES[dir].w) {
    paste(g, ink(EYE, 2), x, y);
    paste(g, ink(['##', '##'], 3), x + EYES[dir].p[0], y + EYES[dir].p[1]);
  }
  return toRows(g);
}
function frightened(frame) {
  const g = blank(16);
  paste(g, ink([...GHOST_BODY, ...SKIRTS[frame]], 1));
  paste(g, ink(['##', '##'], 2), 5, 5);
  paste(g, ink(['##', '##'], 2), 9, 5);
  paste(g, ink(['..#...#...#...', '.#.#.#.#.#.#.#'], 2), 1, 9);
  return toRows(g);
}

// ---------------------------------------------------------------------------
// Fruit (16 x 16)
// ---------------------------------------------------------------------------

const FRUIT = [
  // 0 cherry: red 1, white 2, brown 3
  ['................', '..........33....', '........333.....', '.......3..3.....', '......3...3.....', '.....3....3.....',
    '..1113....3.....', '.111113...3.....', '1111111..3111...', '1121111.311111..', '1211111.1111111.', '1211111.1121111.',
    '.11111..1211111.', '..111...1211111.', '.........11111..', '..........111...'],
  // 1 strawberry: white seeds 1, green 2, red 3
  ['................', '.......2........', '....2222222.....', '...333222333....', '..333333333333..', '..313333313333..',
    '..333313333313..', '..331333133333..', '...33333333133..', '...31333313333..', '....333333333...', '....333133133...',
    '.....3333333....', '......33333.....', '.......333......', '................'],
  // 2 orange: orange 1, green 2, brown 3
  ['................', '........3.......', '.......322......', '......32222.....', '....1113111.....', '...111111111....',
    '..11111111111...', '..11111111111...', '.1111111111111..', '.1111111111111..', '.1111111111111..', '.1111111111111..',
    '..11111111111...', '..11111111111...', '...111111111....', '.....11111......'],
  // 3 bell: yellow 1, light blue 2, white 3
  ['................', '......1111......', '....11111111....', '...1111111111...', '...1311111111...', '..131111111111..',
    '..131111111111..', '..131111111111..', '.13111111111111.', '.11111111111111.', '1111111111111111', '1111111111111111',
    '.22222222222222.', '......3333......', '......3333......', '................'],
  // 4 apple: red 1, white 2, brown 3
  ['................', '........3.......', '.......3........', '...111131111....', '..111111111111..', '.11111111111111.',
    '.11111111111121.', '.11111111111121.', '.11111111111121.', '.11111111111111.', '.11111111111111.', '..111111111111..',
    '..111111111111..', '...1111111111...', '....111..111....', '................'],
  // 5 melon: green 1, white 2, brown 3
  ['........3.......', '.......33.......', '......3.........', '....11111111....', '...1211121121...', '..112111211211..',
    '..121112111211..', '.11211121112111.', '.12111211121121.', '.11211121112111.', '.12111211121121.', '..121112111211..',
    '..112111211211..', '...1211121121...', '....11111111....', '................'],
  // 6 Galaxian flagship: yellow 1, blue 2, red 3
  ['................', '.......33.......', '.......33.......', '......3333......', '.2....1111....2.', '.2...111111...2.',
    '.22.11111111.22.', '.222111111112222', '.222.311113.222.', '.22...3113...22.', '.2.....33.....2.', '.......33.......',
    '................', '................', '................', '................'],
  // 7 key: yellow 1 (unused), light blue 2, white 3
  ['................', '.....222222.....', '....22222222....', '....2......2....', '....22222222....', '.....222222.....',
    '.......33.......', '.......333......', '.......33.......', '.......333......', '.......33.......', '.......33.......',
    '.......333......', '.......33.......', '.......333......', '................'],
];

FRUIT.forEach((rows, i) => { FRUIT[i] = rows.map((r) => r.replace(/\./g, '0')); });

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

export const TILES = [];
const setTile = (code, rows) => { TILES[code] = rows; };

// letters and digits: $41-$5A, $30-$39, and the score digits $00-$09
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') setTile(ch.charCodeAt(0), glyph(ch));
for (let d = 0; d < 10; d++) { setTile(0x30 + d, glyph(String(d))); setTile(d, glyph(String(d))); }
setTile(0x3b, glyph('-'));
setTile(0x25, glyph('.'));
setTile(0x26, glyph('"'));
setTile(0x3a, glyph('/'));
setTile(0x5b, glyph('!'));
setTile(0x5c, glyph('©'));
// PTS ($5D-$5F) in small letters at the bottom
{
  const g = blank(24, 8);
  smallText(g, 'PTS', 1, 2);
  const rows = toRows(g);
  for (let i = 0; i < 3; i++) setTile(0x5d + i, rows.map((r) => r.slice(i * 8, i * 8 + 8)));
}
// the dot and the energizer (colour 3)
setTile(0x10, ink(['........', '........', '........', '...##...', '...##...', '........', '........', '........'], 3));
setTile(0x14, ink(['..####..', '.######.', '########', '########', '########', '########', '.######.', '..####..'], 3));
// the maze
for (const [code, rows] of Object.entries(WALLS)) setTile(Number(code), rows.map((r) => r.replace(/\./g, '0')));

/**
 * A 16 x 16 picture as the 2 x 2 tiles the bottom rows use: codes a..a+3 are
 * top-right, top-left, bottom-right, bottom-left (those rows run right to left).
 */
function bottomPicture(a, rows) {
  setTile(a, cut(rows, 8, 0));
  setTile(a + 1, cut(rows, 0, 0));
  setTile(a + 2, cut(rows, 8, 8));
  setTile(a + 3, cut(rows, 0, 8));
}
// spare lives ($20-$23): Pac-Man facing left
bottomPicture(0x20, PAC(Math.PI / 2, Math.PI));
// the fruit row ($90-$AF), by fruit: cherry, strawberry, orange, bell, apple, melon, Galaxian, key
[0x90, 0x94, 0x98, 0x9c, 0xa0, 0xa4, 0xa8, 0xac].forEach((a, i) => bottomPicture(a, FRUIT[[0, 1, 2, 3, 4, 5, 6, 7][i]]));
// $A0 is the apple and $9C the bell (the table at $3B08 pairs them with their colours)
bottomPicture(0x9c, FRUIT[3]);
bottomPicture(0xa0, FRUIT[4]);
bottomPicture(0xa4, FRUIT[5]);
bottomPicture(0xa8, FRUIT[6]);

// the ghost in the introductions ($B0-$B5): 2 x 3 tiles, left column b0 b2 b4, right b1 b3 b5
{
  const g = blank(16, 24);
  paste(g, ghost(0, 0), 0, 4);
  const rows = toRows(g);
  for (let k = 0; k < 3; k++) { setTile(0xb0 + 2 * k, cut(rows, 0, 8 * k)); setTile(0xb1 + 2 * k, cut(rows, 8, 8 * k)); }
}

// fruit points in the maze ($81-$8E), small pink digits: 1 3 5 7, 00, and the pieces of 1000-5000
{
  const two = (s) => { const g = blank(8); smallText(g, s, 0, 2); return toRows(g); };
  const one = (s, x) => { const g = blank(8); smallText(g, s, x, 2); return toRows(g); };
  setTile(0x81, one('1', 4)); setTile(0x82, one('3', 4)); setTile(0x83, one('5', 4)); setTile(0x84, one('7', 4));
  setTile(0x85, two('00'));
  setTile(0x86, one('1', 4));
  setTile(0x87, blank(8).map((r) => r.join(''))); setTile(0x88, one('2', 4));
  setTile(0x89, blank(8).map((r) => r.join(''))); setTile(0x8a, one('3', 4));
  setTile(0x8b, blank(8).map((r) => r.join(''))); setTile(0x8c, one('5', 4));
  setTile(0x8d, two('00'));
  setTile(0x8e, one('0', 0));
}

// the second intermission's nail and stretching cloak ($60-$6D). The right
// column (x=15) holds the nail; the cloak (red, 1) stretches into the left
// column as Blinky pulls, then tears. The nail is white (2).
{
  const E = '00000000';
  const T = (...rows) => [E, ...rows, ...Array(7 - rows.length).fill(E)];
  for (const c of [0x60, 0x62, 0x64, 0x66, 0x68, 0x6a, 0x6c]) setTile(c, T());
  setTile(0x61, T('00020000', '00222000', '00020000', '00020000'));
  setTile(0x63, T('00020000', '00222100', '00021110', '00020011'));
  setTile(0x65, T('00020000', '11222000', '11110000', '11020000'));
  setTile(0x67, T('00000000', '00000111', '00011111', '00111111'));
  setTile(0x69, T('00020000', '11222000', '11110000', '11110000'));
  setTile(0x6b, T('00000000', '00111111', '11111111', '00111111'));
  setTile(0x6d, T('00020000', '00222000', '00120000', '01100000'));
}
for (let c = 0; c < 256; c++) if (TILES[c]) TILES[c] = TILES[c].map((r) => r.replace(/\./g, '0'));

// ---------------------------------------------------------------------------
// Sprites (16 x 16)
// ---------------------------------------------------------------------------

export const SPRITES = [];
const EMPTY = blank(16).map((r) => r.join(''));
for (let c = 0; c < 64; c++) SPRITES[c] = EMPTY;

FRUIT.forEach((rows, i) => { SPRITES[i] = rows; });

// Pac-Man: $2C wide open, $2E half open, $30 closed (facing right); $2D, $2F facing down
const QUARTER = Math.PI / 2;
SPRITES[0x2c] = PAC(QUARTER * 1.25, 0);
SPRITES[0x2e] = PAC(QUARTER * 0.6, 0);
SPRITES[0x30] = PAC(0, 0);
SPRITES[0x2d] = PAC(QUARTER * 1.25, QUARTER);
SPRITES[0x2f] = PAC(QUARTER * 0.6, QUARTER);

// his death ($34-$3E): facing up, the mouth opens until he is gone, then a pop
for (let k = 0; k < 9; k++) SPRITES[0x34 + k] = PAC(QUARTER * 0.8 + (2 * Math.PI - QUARTER * 0.8) * (k + 1) / 9, -QUARTER);
SPRITES[0x3c] = ink(['................', '................', '.......#........', '...#...#...#....', '....#..#..#.....',
  '................', '.....#...#......', '..##.......##...', '.....#...#......', '................', '....#..#..#.....',
  '...#...#...#....', '.......#........', '................', '................', '................']);
SPRITES[0x3d] = ink(['................', '................', '................', '.......#........', '...#.......#....',
  '................', '................', '.##.........##..', '................', '................', '...#.......#....',
  '.......#........', '................', '................', '................', '................']);
SPRITES[0x3e] = EMPTY;
SPRITES[0x3f] = EMPTY;

// ghosts: $20 + 2 * direction + animation frame
for (let d = 0; d < 4; d++) for (let f = 0; f < 2; f++) SPRITES[0x20 + 2 * d + f] = ghost(d, f);
SPRITES[0x1c] = frightened(0);
SPRITES[0x1d] = frightened(1);

// points for ghosts ($28-$2B), cyan
['200', '400', '800', '1600'].forEach((s, i) => {
  const g = blank(16);
  smallText(g, s, s.length === 4 ? 0 : 2, 6);
  SPRITES[0x28 + i] = toRows(g);
});

// the giant Pac-Man in the first intermission ($10-$1B): three mouths, four quarters each
// (top-left, top-right, bottom-left, bottom-right)
[[0x10, 0], [0x14, QUARTER * 0.6], [0x18, QUARTER * 1.2]].forEach(([a, mouth]) => {
  const big = toRows(pac(32, 15.5, 15.5, 14.5, mouth, 0));
  const q = (x, y) => big.slice(y, y + 16).map((r) => r.slice(x, x + 16));
  SPRITES[a] = q(0, 0); SPRITES[a + 1] = q(16, 0); SPRITES[a + 2] = q(0, 16); SPRITES[a + 3] = q(16, 16);
});

// the second intermission: Blinky snagged ($32) and torn ($33, his leg showing)
{
  const snag = ghost(0, 0);
  SPRITES[0x32] = snag;
  const torn = ghost(0, 1).map((r) => r.split(''));
  for (let y = 11; y < 16; y++) for (let x = 1; x < 7; x++) torn[y][x] = '0';
  paste(torn, ink(['..##..', '..##..', '..##..', '.###..', '.##...'], 2), 1, 11);
  SPRITES[0x33] = torn.map((r) => r.join(''));
}

// the third intermission: Blinky with his patch ($08/$09), his cloak dragging
// behind ($0A/$0B), and without it ($0C/$0D)
for (let f = 0; f < 2; f++) {
  const g = ghost(2, f).map((r) => r.split(''));
  paste(g, ink(['###', '#.#', '###'], 2), 10, 9);
  SPRITES[0x08 + f] = g.map((r) => r.join(''));
  const cloak = blank(16);
  paste(cloak, ink(f ? ['..........', '#.........', '###.......', '######....', '#########.', '.#..#..#..'] : ['..........', '..........', '#.........', '####......', '########..', '#.#..#..#.'], 1), 0, 8);
  SPRITES[0x0a + f] = toRows(cloak);
  const naked = blank(16);
  paste(naked, ink(['......####......', '....########....', '...##########...', '...##########...', '...##########...', '....########....'], 1), 0, 3);
  paste(naked, ink(['.##.', '####', '####'], 2), 3, 4);
  paste(naked, ink(['.##.', '####', '####'], 2), 8, 4);
  paste(naked, ink(['##', '##'], 3), 3, 5);
  paste(naked, ink(['##', '##'], 3), 8, 5);
  paste(naked, ink(f ? ['.#...#..#...#.', '#....#..#....#'] : ['..#..#..#..#..', '..#..#..#..#..'], 1), 1, 9);
  SPRITES[0x0c + f] = toRows(naked);
}
