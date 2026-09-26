// Sound: reads the game's three voices from the sound registers ($5040-$505F)
// each frame and plays them on a wavetable synthesiser (wsg.worklet.js).
//
// The eight waveforms are this project's own, built from formulas to the
// character of the arcade's: a sine, two organ-like mixes of harmonics, a
// rough one, a buzz, an interleaved saw, a triangle and a double saw.

const TAU = Math.PI * 2;
const FORMULAS = [
  (t) => Math.sin(TAU * t),
  (t) => 0.7 * Math.sin(TAU * t) + 0.3 * Math.sin(2 * TAU * t + 1) + 0.25 * Math.sin(3 * TAU * t),
  (t) => 0.65 * Math.sin(TAU * t) + 0.45 * Math.sin(3 * TAU * t + 0.4),
  (t) => 0.5 * Math.sin(TAU * t) + 0.35 * Math.sin(5 * TAU * t) + 0.3 * Math.sin(7 * TAU * t + 2),
  (t, i) => (i & 1 ? 1 : -1) * (1 - t) * 0.9 + 0.1 * Math.sin(TAU * t),
  (t, i) => (i & 1 ? -1 : 1) * (1 - 2 * Math.abs(t - 0.5)) * 0.9,
  (t) => 1 - 4 * Math.abs(t - 0.5),
  (t) => 2 * ((2 * t) % 1) - 1,
];

/** The waveforms as 32 4-bit steps, centred on zero. */
export function waveforms() {
  const w = new Float32Array(8 * 32);
  FORMULAS.forEach((f, k) => {
    const s = [];
    for (let i = 0; i < 32; i++) s.push(f(i / 32, i));
    const peak = Math.max(...s.map(Math.abs)) || 1;
    for (let i = 0; i < 32; i++) w[k * 32 + i] = Math.round((s[i] / peak) * 7.5 + 7.5) - 7.5;
  });
  return w;
}

/** The three voices from the register file: 20-bit frequency, volume, waveform. */
export function voices(s) {
  const nib = (a, n) => { let v = 0; for (let i = n - 1; i >= 0; i--) v = (v << 4) | (s[a + i] & 15); return v; };
  return [
    { freq: nib(0x10, 5), vol: s[0x15] & 15, wave: s[0x05] & 7 },
    { freq: nib(0x16, 4) << 4, vol: s[0x1a] & 15, wave: s[0x0a] & 7 },
    { freq: nib(0x1b, 4) << 4, vol: s[0x1f] & 15, wave: s[0x0f] & 7 },
  ];
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.muted = false;
    this.starting = null;
  }

  /** Start the audio context; iOS allows it only from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !AC.prototype || !('audioWorklet' in AC.prototype)) return;
    this.ctx = new AC();
    this.starting = this.ctx.audioWorklet.addModule(new URL('./wsg.worklet.js', import.meta.url)).then(() => {
      this.node = new AudioWorkletNode(this.ctx, 'wsg', { numberOfInputs: 0, outputChannelCount: [2] });
      this.node.port.postMessage({ waves: waveforms(), gain: this.muted ? 0 : 0.5 });
      this.node.connect(this.ctx.destination);
    }).catch((e) => console.warn('audio unavailable', e));
    this.ctx.resume().catch(() => {});
  }

  setMuted(on) {
    this.muted = on;
    this.node?.port.postMessage({ gain: on ? 0 : 0.5 });
  }

  /** Send this frame's voices (silence when the sound-enable latch is off). */
  update(g) {
    if (!this.node) return;
    const v = voices(g.sound);
    if (!g.latch[1]) for (const x of v) x.vol = 0;
    this.node.port.postMessage({ voices: v });
  }

  stopAll() {
    this.node?.port.postMessage({ voices: [0, 1, 2].map(() => ({ vol: 0 })) });
  }
}
