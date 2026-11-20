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

  // ---------- party music (synthesized, muffled like it's outside) ----------

  startMusic() {
    if (this.music) return;
    const ctx = this.ctx;
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 1600;
    const gain = ctx.createGain();
    gain.gain.value = 0.32;
    muffle.connect(gain).connect(this.master);
    this.noise = this.noise || this._noiseBuffer();
    this.music = { out: muffle, bpm: 124, start: ctx.currentTime + 0.1, step: 0 };
    this._musicTimer = setInterval(() => this._scheduleMusic(), 40);
  }

  /** Beats elapsed since the music started (fractional). Drives the dancing. */
  beatTime() {
    if (!this.music) return (performance.now() / 1000) * (124 / 60);
    return Math.max(0, (this.ctx.currentTime - this.music.start) * (this.music.bpm / 60));
  }

  _scheduleMusic() {
    const m = this.music;
    const eighth = 30 / m.bpm;
    const horizon = this.ctx.currentTime + 0.2;
    // A minor-ish offbeat bassline, 16 eighth notes long
    const BASS = [0, 55, 0, 55, 0, 55, 0, 65.4, 0, 43.7, 0, 43.7, 0, 49, 0, 49];
    while (m.start + m.step * eighth < horizon) {
      const t = m.start + m.step * eighth;
      const s = m.step % 16;
      if (s % 2 === 0) this._kick(t);
      else this._hat(t);
      if (s % 8 === 4) this._clap(t);
      if (BASS[s]) this._bass(t, BASS[s], eighth * 0.9);
      m.step++;
    }
  }

  _noiseBuffer() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _kick(t) {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g).connect(this.music.out);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  _noiseHit(t, type, freq, vol, decay) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f).connect(g).connect(this.music.out);
    src.start(t, Math.random() * 0.5, decay + 0.02);
  }

  _hat(t) {
    this._noiseHit(t, 'highpass', 6000, 0.25, 0.05);
  }

  _clap(t) {
    this._noiseHit(t, 'bandpass', 1500, 0.6, 0.14);
  }

  _bass(t, freq, dur) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(150, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(f).connect(g).connect(this.music.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Crowd cheer when an order is handed out. Louder for happy customers. */
  cheer(big = true) {
    const ctx = this.ctx;
    this.noise = this.noise || this._noiseBuffer();
    const t = ctx.currentTime;
    const dur = big ? 1.6 : 0.9;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(big ? 0.35 : 0.18, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
    // A few "woo!"s
    for (let i = 0; i < (big ? 4 : 1); i++) {
      const st = t + 0.05 + Math.random() * 0.4;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const base = 380 + Math.random() * 250;
      osc.frequency.setValueAtTime(base, st);
      osc.frequency.exponentialRampToValueAtTime(base * 1.9, st + 0.35);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, st);
      og.gain.linearRampToValueAtTime(0.05, st + 0.05);
      og.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
      osc.connect(og).connect(this.master);
      osc.start(st);
      osc.stop(st + 0.55);
    }
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
