// Entry point: runs the engine at the arcade's 60.6 Hz and draws it. The
// title screen is the arcade's own attract mode; starting a game drops a coin
// in and presses the start button, as on the cabinet. The cheats, the saved
// high score and pausing live here, outside the engine.
import { Machine, FRAME_HZ, IN_UP, IN_LEFT, IN_RIGHT, IN_DOWN, IN0_COIN, IN1_START1, IN1_START2 } from './game/machine.js';
import { queue } from './game/core.js';
import { drawBcd } from './game/tasks.js';
import { Screen, SCREEN_W, SCREEN_H } from './render/screen.js';
import { TILES, PALETTES } from './render/art.js';
import { Sound } from './render/audio.js';
import { Keyboard } from './input/keyboard.js';
import { Gamepad } from './input/gamepad.js';
import { Touch } from './input/touch.js';

const STEP = 1 / FRAME_HZ;
// difficulty: 0 the arcade exactly, 1 easy, 2 super easy
const LEVELS = [
  { name: 'NORMAL', speed: 1, fright: 1 },
  { name: 'EASY', speed: 0.75, fright: 2 },
  { name: 'SUPER EASY', speed: 0.6, fright: 2, invincible: true },
];
const MAX_CATCHUP = 0.1;
const STORE = 'pacman.';

const store = {
  get(k, d) { try { return localStorage.getItem(STORE + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(STORE + k, String(v)); } catch { /* storage blocked */ } },
};

const toBcd = (n) => { const s = String(Math.min(n, 999999)).padStart(6, '0'); return [4, 2, 0].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const fromBcd = (m, a) => Number([a + 2, a + 1, a].map((i) => m[i].toString(16).padStart(2, '0')).join(''));

async function main() {
  const r = await fetch('data/tables.json');
  if (!r.ok) throw new Error(`data/tables.json: ${r.status}`);
  const tables = await r.json();

  const canvas = document.getElementById('screen');
  canvas.width = SCREEN_W; canvas.height = SCREEN_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const image = ctx.createImageData(SCREEN_W, SCREEN_H);
  const screen = new Screen();
  const sound = new Sound();
  const keyboard = new Keyboard();
  const gamepad = new Gamepad();
  const touch = new Touch(document.getElementById('touch'));

  let level = Math.min(2, Number(store.get('level', 0)) || 0);
  let endless = store.get('endless', '0') === '1';
  let highScore = Number(store.get('highscore', 0)) || 0;
  let players = Number(store.get('players', 1)) === 2 ? 2 : 1;
  let paused = false, settingsOpen = false, assisted = false, wasPlaying = false;
  let starting = null;      // {players, t}: dropping the coins and pressing start
  let skip = 0;             // frames left holding the rack-test switch (skip level)
  let acc = 0, last = performance.now(), blink = 0;
  let g = boot();

  touch.setLevel(level);
  touch.setLives(endless);
  touch.setPlayers(players);
  touch.onPanelToggle = (open) => { settingsOpen = open; };
  touch.onPlayers = (n) => { players = n; store.set('players', n); };
  touch.onPause = (on) => { paused = on && g.m[0x4e00] === 3; };
  touch.onRestart = () => restart();
  touch.onQuit = () => quit();
  touch.onLevel = (n) => setLevel(n);
  touch.onLives = (on) => setEndless(on);
  touch.onSkip = () => skipLevel();

  /** A machine switched on and running its attract mode, with the saved high score. */
  function boot() {
    const m = new Machine(tables);
    [m.m[0x4e88], m.m[0x4e89], m.m[0x4e8a]] = toBcd(highScore);
    // the arcade only draws the high score when it changes: show the saved one
    // once the first frame has cleared the screen
    m.frame();
    if (highScore) drawBcd(m, 0x4e8a, 3, 4, 0x43f2);
    return m;
  }

  function setLevel(n) {
    level = n;
    store.set('level', n);
    touch.setLevel(n);
    if (playing()) assisted ||= n > 0;
    applyAssists();
  }

  function setEndless(on) {
    endless = on;
    store.set('endless', on ? 1 : 0);
    touch.setLives(on);
    if (on && playing()) assisted = true;
  }

  function skipLevel() {
    if (!playing()) return;
    assisted = true;
    skip = 1;
  }

  function applyAssists() {
    const L = LEVELS[level];
    g.assist.invincible = !!L.invincible;
    g.assist.frightScale = L.fright;
  }
  applyAssists();
  window.__pac = { get g() { return g; }, sound, touch }; // debug handle

  const playing = () => g.m[0x4e00] === 3 || starting;

  function startGame(players) {
    if (starting || g.m[0x4e00] === 3) return;
    starting = { players, t: 0 };
    assisted = level > 0 || endless;
    touch.release();
    sound.unlock();
  }

  // ---- input ----
  const input = { left: false, right: false, up: false, down: false };
  function readInput() {
    for (const k in input) input[k] = false;
    keyboard.read(input);
    gamepad.read(input);
    if (keyboard.any || gamepad.any) touch.notifyOtherInput();
    touch.read(input);
    let in0 = 0xff;
    if (input.up) in0 &= ~IN_UP;
    else if (input.down) in0 &= ~IN_DOWN;
    if (input.left) in0 &= ~IN_LEFT;
    else if (input.right) in0 &= ~IN_RIGHT;
    return in0;
  }

  /** The coin and start button presses for a game being started. */
  function startInputs(in0, in1) {
    const s = starting;
    if (!s) return [in0, in1];
    const t = s.t++;
    const coins = s.players;
    // each coin: four frames down, then up. The game only counts a press that
    // follows two frames up, so a machine just switched on (a restart) needs a
    // few frames of the slot up before the first coin.
    const c = t - 4;
    if (c >= 0 && Math.floor(c / 20) < coins && c % 20 < 4) in0 &= ~IN0_COIN;
    if (c >= coins * 20 && g.m[0x4e00] === 2 && g.m[0x4e03] === 1) {
      in1 &= ~(s.players === 2 ? IN1_START2 : IN1_START1);
      if (!s.pressed) s.pressed = t;
    }
    if (s.pressed && t > s.pressed + 4) starting = null;
    if (t > 600) starting = null;
    return [in0, in1];
  }

  function step(in0) {
    const m = g.m;
    let in1 = 0xff;
    [in0, in1] = startInputs(in0, in1);
    if (skip > 0 && m[0x4e00] === 3 && m[0x4e04] === 3) { in0 &= ~0x10; skip--; }
    // unlimited lives: keep a spare in hand
    if (endless && m[0x4e00] === 3 && m[0x4e04] === 3 && m[0x4e14] < 3) {
      m[0x4e14] = 3; m[0x4e15] = 2;
      queue(g, 0x1a, 0);
    }
    g.frame(in0, in1);
    const nowPlaying = m[0x4e00] === 3;
    if (wasPlaying && !nowPlaying) gameOver();
    wasPlaying = nowPlaying;
  }

  function gameOver() {
    const hs = fromBcd(g.m, 0x4e88);
    if (!assisted && hs > highScore) { highScore = hs; store.set('highscore', highScore); }
    if (assisted) {
      // a cheat game's score doesn't count: put the saved high score back
      [g.m[0x4e88], g.m[0x4e89], g.m[0x4e8a]] = toBcd(highScore);
      drawBcd(g, 0x4e8a, 3, 4, 0x43f2);
    }
    assisted = false;
    touch.release();
  }

  function quit() {
    if (g.m[0x4e00] === 3) gameOver();
    g = boot();
    applyAssists();
    starting = null;
    wasPlaying = false;
    paused = false;
    sound.stopAll();
  }

  /** Back to the title and straight into a new game with the same players. */
  function restart() {
    const n = g.m[0x4e00] === 3 ? g.m[0x4e70] + 1 : players;
    quit();
    startGame(n);
  }

  // ---- text over the attract mode ----
  function text(x, y, s, pal) {
    const colours = PALETTES[pal], out = image.data;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const code = ch === ' ' ? null : ch.charCodeAt(0);
      for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
        const p = (((y * 8 + py) * SCREEN_W) + (x + i) * 8 + px) * 4;
        const v = code !== null && TILES[code] ? TILES[code][py].charCodeAt(px) - 48 : 0;
        const c = v ? colours[v - 1] : [0, 0, 0];
        out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2];
      }
    }
  }

  function overlay() {
    const m = g.m;
    if (m[0x4e00] === 3 || starting) {
      if (level || endless) text(20, 35, (level ? LEVELS[level].name.replace('SUPER ', 'S.') : '').padEnd(4) + (endless ? ' INF' : '    '), 0x05);
      return;
    }
    if (m[0x4e00] !== 1) return;
    blink++;
    const tap = touch.active;
    text(14, 34, `${LEVELS[level].name}${endless ? ' INF' : ''}`.padStart(14), level || endless ? 0x05 : 0x0f);
    text(14, 35, (blink & 32 ? '' : tap ? (players === 2 ? 'TAP: 2 PLAYERS' : 'TAP TO START') : 'SPACE STARTS').padStart(14), 0x09);
  }

  // ---- layout ----
  function fit() {
    const stage = document.getElementById('stage');
    const vw = stage.clientWidth, vh = stage.clientHeight;
    const portrait = vh > vw;
    const pad = touch.active && touch.settings.layout === 'pad';
    const availH = portrait && pad ? vh * 0.72 : vh;
    const scale = Math.min(vw / SCREEN_W, availH / SCREEN_H);
    const s = scale >= 1 ? Math.floor(scale * 4) / 4 : scale;
    canvas.style.width = `${Math.round(SCREEN_W * s)}px`;
    canvas.style.height = `${Math.round(SCREEN_H * s)}px`;
    stage.classList.toggle('top', portrait && pad);
  }
  window.addEventListener('resize', fit);
  touch.onLayout = fit;
  fit();

  function frame(now) {
    const dt = Math.min(MAX_CATCHUP, (now - last) / 1000);
    last = now;
    const in0 = readInput();

    if (keyboard.consume('KeyF')) toggleFullscreen();
    if (keyboard.consume('KeyM')) sound.setMuted(!sound.muted);
    if (keyboard.consume('KeyC')) setLevel((level + 1) % LEVELS.length);
    if (keyboard.consume('KeyL')) setEndless(!endless);
    if (keyboard.consume('KeyN')) skipLevel();
    if (keyboard.consume('Escape')) quit();
    if (keyboard.consume('KeyP') && g.m[0x4e00] === 3) { paused = !paused; touch.notifyOtherInput(); }
    const start1 = keyboard.consume('Space', 'Enter', 'Digit1');
    const startTap = touch.consumeStart() || gamepad.startPressed; // one or two players, from the settings
    const start2 = keyboard.consume('Digit2');
    if (keyboard.consume('KeyR') && g.m[0x4e00] === 3) restart();
    if (g.m[0x4e00] !== 3 && !starting) {
      if (start2) startGame(2);
      else if (startTap) startGame(players);
      else if (start1) startGame(1);
    }

    if (g.m[0x4e00] !== 3) paused = false;
    touch.setPlayState(g.m[0x4e00] === 3, paused);
    if (!paused && !settingsOpen) {
      acc += dt;
      const stepT = STEP / (g.m[0x4e00] === 3 ? LEVELS[level].speed : 1);
      while (acc >= stepT) { step(in0); acc -= stepT; }
      sound.update(g);
    } else sound.stopAll();
    image.data.set(screen.draw(g));
    overlay();
    ctx.putImageData(image, 0, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // audio can only start from a user gesture on iOS (touchend and click are the
  // ones a home-screen app reliably counts)
  for (const ev of ['keydown', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) window.addEventListener(ev, () => sound.unlock(), { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && g.m[0x4e00] === 3) paused = true;
    if (!document.hidden) sound.unlock();
  });
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen?.();
  else document.exitFullscreen?.();
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f55;padding:1em">${err.stack || err}</pre>`);
});
