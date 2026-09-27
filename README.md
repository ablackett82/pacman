# Pac-Man

A browser reimplementation of the 1980 arcade game (the Midway version),
built to run fullscreen on an iPad as a home-screen app. Plain HTML/JS, no
build step.

The game logic is traced routine by routine from the community's commented
disassembly ([cubeman.org/arcade-source/pacman.asm](http://cubeman.org/arcade-source/pacman.asm))
and checked frame by frame against the original program running in a Z80
emulator. Ghost targeting, the speed tables, the dot counters and house
releases, Cruise Elroy, cornering, the frightened ghosts' random walk, fruit,
the attract mode, the intermissions and the sound driver all come from the
original code, so the ghosts behave exactly as they did in the arcade (patterns
included). All graphics are drawn for this project and the sound's waveforms
are its own; the tunes and effects play from the program's note data.

## Play

Open the site, then on iPad: Share → **Add to Home Screen**. The attract mode
(the ghosts' introductions and the demo game) is the title screen.

- Keyboard: arrows / WASD to steer; Space / Enter / 1 starts a one-player game, 2 a two-player game;
  P pause, R restart, M mute, F fullscreen, Esc back to the title
- Touch: tap to start (one or two players, set under the pixel cog), swipe anywhere to steer (or
  a d-pad or floating stick, also under the cog); the pause button beside the cog opens Resume /
  Restart game / Quit to title
- Gamepad: d-pad or left stick; A or Start to start

Cheats, in the settings (the cog) or from the keyboard. Only Normal games
without cheats set the high score:

- Difficulty (C key): Normal is the arcade exactly; Easy runs at 75% speed with
  the ghosts blue for twice as long; Super easy runs at 60%, blue for twice as
  long, and the ghosts can't catch Pac-Man
- Unlimited lives (L key)
- Skip this level (N key): the arcade's own rack-test switch

## How it was checked

`tools/buildrom.mjs` rebuilds the 16K program from the listing's byte column,
fixes the listing's handful of typos (the points table was written as points
divided by ten) and checks all four chips against MAME's SHA1s. The engine in
`src/game` keeps the original's memory layout, so `npm test` can play it and
the original side by side and compare video RAM, colour RAM, work RAM and the
sprite and sound registers every frame: the attract mode, one- and two-player
games, a bot eating energizers, ghosts and fruit, all 21 levels with every
intermission, and the hard setting.

No ROM images are included. `data/tables.json` holds the program's data tables
and, because the frightened ghosts' random-number generator reads the first
8K of the program as its random numbers, those 8K as well.

## Develop

```
npm install     # the Z80 core, for the differential tests
curl -o reference/pacman.asm http://cubeman.org/arcade-source/pacman.asm
npm run rom     # rebuild the program (reference/, gitignored) and data/tables.json
npm run dev     # http://localhost:8080/
npm test
```

`node tools/icons.mjs` redraws the home-screen icons;
`node tools/walls.mjs` regenerates the maze wall tiles from the maze layout;
`node tools/shot.mjs out.png frames [coin]` renders a frame to PNG;
`node tools/emu/diff.mjs [seed] [frames] [players]` runs a long comparison
against the original; `node tools/emu/trace.mjs` maps which of the program
runs as code (for `reference/clean.asm`-style listings).
