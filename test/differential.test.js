// Plays the original program (rebuilt from the disassembly, run in a Z80
// core) and src/game side by side with the same input and checks that their
// video, colour and work RAM, sprite and sound registers agree every frame.
// Needs reference/program.bin (run `npm run rom`); skipped when it is absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { available } from '../tools/emu/host.mjs';

const skip = !available();
const load = () => import('../tools/emu/diff.mjs');

function check(r) {
  assert.equal(r.mismatch, null, JSON.stringify(r.mismatch, null, 1));
}

test('the attract mode (introductions, chase, demo game) matches', { skip }, async () => {
  const { runDiff } = await load();
  check(runDiff({ maxFrames: 8000 }));
});

test('one-player games with random joystick match, through to GAME OVER', { skip }, async () => {
  const { runDiff, randomInput } = await load();
  for (const seed of [1, 2]) {
    const r = runDiff({ input: randomInput(seed), start: 1, maxFrames: 20000, stopWhen: (h) => h.mem[0x4e00] === 1 });
    check(r);
    assert.ok(r.stopped, 'reached game over');
  }
});

test('a two-player game matches', { skip }, async () => {
  const { runDiff, botInput } = await load();
  check(runDiff({ input: botInput(9), start: 2, maxFrames: 20000 }));
});

test('a player eating energizers, ghosts and fruit matches', { skip }, async () => {
  const { runDiff, botInput } = await load();
  let ghosts = 0, fruit = 0;
  const r = runDiff({
    input: botInput(3), start: 1, maxFrames: 20000, dsw: 0xcd,
    poke(f, h, w) {
      if (h.mem[0x4e14] < 2 && h.mem[0x4e04] === 3) w(0x4e14, 3); // plenty of lives
      if (h.mem[0x4dd1] === 1) ghosts++;
      if (h.mem[0x4ebc] & 0x04) fruit++;
    },
  });
  check(r);
  assert.ok(ghosts > 0, 'ate a ghost');
  assert.ok(fruit > 0, 'ate a fruit');
});

test('twenty-one levels, with every intermission, match', { skip }, async () => {
  const { runDiff, botInput } = await load();
  let playing = 0;
  const r = runDiff({
    input: botInput(7), start: 1, maxFrames: 40000, dsw: 0xcd,
    poke(f, h, w) {
      const m = h.mem;
      // after a while on each level, count the dots as eaten
      if (m[0x4e00] === 3 && m[0x4e04] === 3) { if (++playing % 700 === 0) w(0x4e0e, 0xf4); } else playing = 0;
      if (m[0x4e14] < 2 && m[0x4e04] === 3) w(0x4e14, 3);
    },
    stopWhen: (h) => h.mem[0x4e13] >= 21,
  });
  check(r);
  assert.ok(r.stopped, 'reached level 22');
});

test('the hard difficulty setting matches', { skip }, async () => {
  const { runDiff, botInput } = await load();
  check(runDiff({ input: botInput(5), start: 1, maxFrames: 15000, dsw: 0x89 }));
});
