// Board sounds in the spirit of Chess.com's default set: a short, muffled
// wooden tap for each move (slightly different for your moves and Peter's),
// a firmer double tap for captures, and a soft marimba note for game start and
// end. Everything is synthesised once into buffers; no audio files are used.
// A low-pass filter on every sound keeps them warm rather than clicky.
const RATE = 44100;

function noise(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * RATE), RATE);
  const data = buffer.getChannelData(0);
  let seed = 11;
  for (let i = 0; i < data.length; i += 1) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return buffer;
}

// One soft wooden tap: a pitched "body" (the board) plus a little filtered
// texture (the piece), both rolled off above ~2 kHz.
function tap(ctx, out, at, { pitch = 1, gain = 1, length = 0.085 } = {}) {
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(330 * pitch, at);
  body.frequency.exponentialRampToValueAtTime(205 * pitch, at + length);
  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0, at);
  bodyEnv.gain.linearRampToValueAtTime(0.55 * gain, at + 0.004);
  bodyEnv.gain.exponentialRampToValueAtTime(0.0005, at + length);
  body.connect(bodyEnv).connect(out);
  body.start(at);
  body.stop(at + length + 0.02);

  const grain = ctx.createBufferSource();
  grain.buffer = noise(ctx, 0.05);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 900 * pitch;
  band.Q.value = 1.4;
  const grainEnv = ctx.createGain();
  grainEnv.gain.setValueAtTime(0, at);
  grainEnv.gain.linearRampToValueAtTime(0.32 * gain, at + 0.002);
  grainEnv.gain.exponentialRampToValueAtTime(0.0005, at + 0.03);
  grain.connect(band).connect(grainEnv).connect(out);
  grain.start(at);
}

// A soft marimba-like note: fundamental plus a fast-fading fourth harmonic.
function note(ctx, out, at, freq, { gain = 0.16, length = 0.6 } = {}) {
  for (const [mult, level, decay] of [[1, 1, length], [4, 0.18, length * 0.25]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain * level, at + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0004, at + decay);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }
}

const RECIPES = {
  moveSelf: [0.14, (c, o) => tap(c, o, 0.004)],
  moveOpponent: [0.14, (c, o) => tap(c, o, 0.004, { pitch: 0.88, gain: 0.9 })],
  capture: [0.18, (c, o) => { tap(c, o, 0.004, { pitch: 1.12, gain: 1.15, length: 0.07 }); tap(c, o, 0.022, { pitch: 0.82, gain: 0.6 }); }],
  castle: [0.22, (c, o) => { tap(c, o, 0.004, { gain: 0.9 }); tap(c, o, 0.1, { pitch: 1.06, gain: 0.8 }); }],
  check: [0.42, (c, o) => { tap(c, o, 0.004, { pitch: 1.05 }); note(c, o, 0.03, 659.3, { gain: 0.07, length: 0.35 }); }],
  start: [0.5, (c, o) => note(c, o, 0.005, 523.3, { gain: 0.1, length: 0.45 })],
  end: [0.9, (c, o) => { note(c, o, 0.005, 523.3, { gain: 0.12, length: 0.5 }); note(c, o, 0.17, 392, { gain: 0.12, length: 0.7 }); }],
};

export class Sounds {
  constructor() {
    this.enabled = true;
    this.volume = 0.6;
    this.ctx = null;
    this.buffers = {};
    this.ready = this.#render();
  }

  async #render() {
    if (typeof OfflineAudioContext === 'undefined') return;
    await Promise.all(Object.entries(RECIPES).map(async ([name, [seconds, build]]) => {
      const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
      const warm = ctx.createBiquadFilter();
      warm.type = 'lowpass';
      warm.frequency.value = 2200;
      warm.Q.value = 0.5;
      warm.connect(ctx.destination);
      build(ctx, warm);
      const buffer = await ctx.startRendering();
      const data = buffer.getChannelData(0);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v));
      if (peak > 0.9) for (let i = 0; i < data.length; i += 1) data[i] *= 0.9 / peak;
      this.buffers[name] = buffer;
    }));
  }

  // Browsers only allow audio after a user gesture; call this from one.
  unlock() {
    if (!this.ctx && typeof AudioContext !== 'undefined') this.ctx = new AudioContext();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  play(name) {
    if (!this.enabled || !this.volume) return;
    this.unlock();
    const buffer = this.buffers[name];
    if (!this.ctx || !buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  // The sound for a chess.js move object; `mine` is true for the player's moves.
  forMove(move, check, mine = true) {
    if (check) return 'check';
    if (move.flags.includes('k') || move.flags.includes('q')) return 'castle';
    if (move.flags.includes('c') || move.flags.includes('e')) return 'capture';
    return mine ? 'moveSelf' : 'moveOpponent';
  }
}
