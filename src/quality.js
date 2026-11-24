// Keeps the game smooth on slower computers and phones.
// Watches how long frames take; if the game can't keep up, it renders at a lower
// resolution (a step at a time), and as a last resort turns off the glow (bloom).
// It only ever steps down, so the picture never flickers between quality levels.

const SLOW_MS = 23; // median frame slower than this (~43 fps) counts as struggling
const WINDOW = 60; // frames per measurement
const STEP = 0.8; // each step renders at 80% of the previous resolution

export class AutoQuality {
  constructor({ renderer, bloom, resize, maxRatio }) {
    Object.assign(this, { renderer, bloom, resize });
    this.ratio = maxRatio;
    this.minRatio = Math.min(1, maxRatio) * 0.6;
    this.frames = [];
    this.settle = 2; // seconds to ignore after a change or a hitch (shaders compiling, etc.)
  }

  /** Call once per frame with the real time since the last frame, in milliseconds. */
  frame(ms) {
    if (document.hidden || ms > 250) {
      this.frames.length = 0; // tab in the background or a long pause: not a real measurement
      return;
    }
    if (this.settle > 0) {
      this.settle -= ms / 1000;
      return;
    }
    this.frames.push(ms);
    if (this.frames.length < WINDOW) return;
    const sorted = this.frames.sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.frames.length = 0;
    if (median > SLOW_MS) this.stepDown();
  }

  stepDown() {
    if (this.ratio > this.minRatio + 0.01) {
      this.ratio = Math.max(this.minRatio, this.ratio * STEP);
      this.renderer.setPixelRatio(this.ratio);
      this.resize();
    } else if (this.bloom.enabled) {
      this.bloom.enabled = false;
    } else {
      return;
    }
    this.settle = 1.5;
  }

  get status() {
    return { ratio: +this.ratio.toFixed(2), bloom: this.bloom.enabled };
  }
}
