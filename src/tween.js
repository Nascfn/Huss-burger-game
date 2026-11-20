// Tiny tween system driven by the game loop's delta time.

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

const active = [];

/**
 * Run `onUpdate(easedProgress)` every frame for `duration` seconds.
 * `owner` lets you cancel a group of tweens at once (e.g. when a step is failed).
 */
export function tween(duration, onUpdate, easing = ease.outCubic, owner = null, delay = 0) {
  return new Promise((resolve) => {
    active.push({ t: 0, duration, onUpdate, easing, owner, delay, resolve });
  });
}

/** Promise that resolves after `seconds` of game time. */
export function wait(seconds) {
  return tween(seconds, () => {}, ease.linear);
}

export function cancelTweens(owner) {
  for (let i = active.length - 1; i >= 0; i--) {
    if (active[i].owner === owner) {
      const a = active[i];
      active.splice(i, 1);
      a.resolve();
    }
  }
}

export function updateTweens(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const a = active[i];
    if (a.delay > 0) {
      a.delay -= dt;
      continue;
    }
    a.t += dt;
    const k = Math.min(a.t / a.duration, 1);
    a.onUpdate(a.easing(k));
    if (k >= 1) {
      active.splice(i, 1);
      a.resolve();
    }
  }
}
