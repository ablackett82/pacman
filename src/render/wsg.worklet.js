// AudioWorklet: a three-voice wavetable synthesiser in the manner of the
// arcade's sound chip. Each voice steps a 20-bit accumulator by its frequency
// value at 96 kHz; the top 5 bits pick one of 32 steps of its waveform (4-bit
// samples), scaled by its 4-bit volume. The main thread posts the voices'
// registers once a frame, and the waveforms once at start-up.
class Wsg extends AudioWorkletProcessor {
  constructor() {
    super();
    this.waves = new Float32Array(8 * 32);
    this.voices = [0, 1, 2].map(() => ({ acc: 0, freq: 0, vol: 0, wave: 0 }));
    this.gain = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.waves) this.waves.set(d.waves);
      if (d.voices) d.voices.forEach((v, i) => Object.assign(this.voices[i], v));
      if (d.gain !== undefined) this.gain = d.gain;
    };
  }

  process(inputs, outputs) {
    const out = outputs[0][0];
    const step = 96000 / sampleRate;
    const w = this.waves, vs = this.voices, gain = this.gain / (3 * 15 * 8);
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      for (const v of vs) {
        if (!v.vol || !v.freq) continue;
        v.acc = (v.acc + v.freq * step) % 0x100000;
        s += w[v.wave * 32 + (v.acc >> 15)] * v.vol;
      }
      out[i] = s * gain;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('wsg', Wsg);
