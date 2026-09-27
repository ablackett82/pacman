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
    if (this.ctx) {
      // iOS leaves it 'suspended' or 'interrupted' after a call, the lock screen or a trip to the home screen
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Web Audio on iPhone is muted by the ring/silent switch unless the page
    // asks for a 'playback' session, as a game or music player would
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
    this.ctx = new AC();
    this.ctx.resume().catch(() => {});
    const worklet = 'audioWorklet' in this.ctx
      ? this.ctx.audioWorklet.addModule(new URL('./wsg.worklet.js', import.meta.url)).then(() => {
        this.node = new AudioWorkletNode(this.ctx, 'wsg', { numberOfInputs: 0, outputChannelCount: [2] });
      })
      : Promise.reject(new Error('no AudioWorklet'));
    this.starting = worklet.catch((e) => {
      console.warn('AudioWorklet unavailable, using ScriptProcessor', e);
      this.node = scriptSynth(this.ctx);
    }).then(() => {
      this.node.port.postMessage({ waves: waveforms(), gain: this.muted ? 0 : 0.5 });
      this.node.connect(this.ctx.destination);
    }).catch((e) => console.warn('audio unavailable', e));
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

/**
 * The same synthesiser as wsg.worklet.js on the main thread, for browsers
 * where the worklet won't load. Looks like the worklet node to Sound: a port
 * to post to and connect().
 */
function scriptSynth(ctx) {
  const node = ctx.createScriptProcessor(1024, 0, 2);
  const waves = new Float32Array(8 * 32);
  const vs = [0, 1, 2].map(() => ({ acc: 0, freq: 0, vol: 0, wave: 0 }));
  let gain = 0;
  node.port = {
    postMessage(d) {
      if (d.waves) waves.set(d.waves);
      if (d.voices) d.voices.forEach((v, i) => Object.assign(vs[i], v));
      if (d.gain !== undefined) gain = d.gain;
    },
  };
  node.onaudioprocess = (e) => {
    const b = e.outputBuffer, out = b.getChannelData(0);
    const step = 96000 / ctx.sampleRate, k = gain / (3 * 15 * 8);
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      for (const v of vs) {
        if (!v.vol || !v.freq) continue;
        v.acc = (v.acc + v.freq * step) % 0x100000;
        s += waves[v.wave * 32 + (v.acc >> 15)] * v.vol;
      }
      out[i] = s * k;
    }
    for (let c = 1; c < b.numberOfChannels; c++) b.getChannelData(c).set(out);
  };
  return node;
}
