// Plays the three "huss" sounds cut from huss_huss_huss.wav, plus a few synthesized effects.

// Measured start/end times (seconds) of each "huss" in the wav file.
const HUSS_SLICES = [
  [0.095, 0.32],
  [0.325, 0.505],
  [0.51, 0.70],
];

export class GameAudio {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.buffer = null;
  }

  async load(url) {
    const res = await fetch(url);
    const data = await res.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(data);
  }

  // Browsers keep audio suspended until a user gesture (click / key press).
  resume() {
    if (this.ctx.state !== 'running') return this.ctx.resume();
  }

  setVolume(v) {
    this.master.gain.value = v;
  }

  /** Play huss number `i` (0, 1 or 2). `rate` slightly raises pitch as combos grow. */
  huss(i, rate = 1) {
    if (!this.buffer) return;
    const [start, end] = HUSS_SLICES[i];
    const dur = end - start;
    const playTime = dur / rate;
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = rate;

    // Tiny fades so the cuts never click.
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.004);
    g.gain.setValueAtTime(1, t + playTime - 0.02);
    g.gain.linearRampToValueAtTime(0, t + playTime);

    src.connect(g).connect(this.master);
    src.start(t, start, dur);
  }

  /** Low "wrong" buzz. */
  buzz() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.28);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(filter).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  /** Bright two-note bell, used when an order is handed off. */
  ching() {
    this._bell(1318, 0, 0.18);
    this._bell(1760, 0.08, 0.16);
    this._bell(2637, 0.08, 0.06);
  }

  /** Soft high blip for a perfect step. */
  perfect() {
    this._bell(1046, 0, 0.08);
    this._bell(1568, 0.06, 0.08);
  }

  _bell(freq, delay, vol) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.62);
  }
}
