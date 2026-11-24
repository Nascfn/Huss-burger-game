// Game flow: party (level) -> orders -> steps -> 3 quick-time key presses per step.
// Each order: a guest steps up to the window, you pack it, then hand the bag out to them.
// You lose the party if you run out of hearts (one per mistake) or the party clock hits zero.
import { RECIPES, QTE_KEYS, makeOrder, normalizeKey } from './orders.js';
import { LEVELS } from './levels.js';
import { wait, cancelTweens } from './tween.js';
import { saveGame } from './save.js';

const MISS_PAUSE = 0.7; // seconds before you can retry a failed step
const ARM_DELAY = 0.1; // a new step's prompt shows this long before keys count
const BUFFER_AGE = 0.9; // early presses are remembered this long, then replayed
const BUFFER_MAX = 4;

// Party clock budget. The fixed parts cover what the player can't speed up
// (guests walking up, food flying into the bag, the hand-off); `level.pace` is
// the time allowed per key press, which shrinks at bigger parties.
const ORDER_TIME = 4.2;
const STEP_TIME = 0.45;

// Thrown inside the level script when the party ends early (lost), to unwind it.
const ABORT = Symbol('abort');

export class Game {
  constructor({ audio, rig, stations, bag, party, hud, save }) {
    Object.assign(this, { audio, rig, stations, bag, party, hud, save });
    this.state = 'title';
    this.step = null;
    this.order = null;
    this.buffer = [];
    this.runId = 0;
    this.levelIndex = Math.min(save.unlocked, LEVELS.length - 1);
  }

  get level() {
    return LEVELS[this.levelIndex];
  }

  showTitle() {
    this.state = 'title';
    this.rig.focus(0.25);
    this.rig.lookUp(true);
    this.hud.showTitle(this.save, LEVELS);
  }

  /** Enter key / main button: next party after a win, same party after a loss. */
  startNext() {
    if (this.state === 'playing') return;
    const last = LEVELS.length - 1;
    let i;
    if (this.state === 'summary') i = Math.min(this.levelIndex + 1, this.save.unlocked, last);
    else if (this.state === 'failed') i = this.levelIndex;
    else i = Math.min(this.save.unlocked, last);
    this.startLevel(i);
  }

  startLevel(i) {
    if (this.state === 'playing' || i > this.save.unlocked) return;
    this.levelIndex = i;
    const level = this.level;
    this.runId++;
    this.audio.resume();
    if (this.party.levelId !== level.id) this.party.setLevel(level);
    this.resetKitchen();
    this.audio.startMusic(level);
    this.stats = { combo: 0, bestCombo: 0, hits: 0, misses: 0, orders: 0, happy: 0, perfectSteps: 0, steps: 0 };
    this.lives = level.lives;
    this.state = 'playing';
    this.hud.showPlaying(level);
    this.hud.setCombo(0);
    this.hud.setLives(this.lives, level.lives);
    this.runLevel().catch((e) => {
      if (e !== ABORT) throw e;
    });
  }

  /** Clear any half-made food (after a lost party) so the retry starts clean. */
  resetKitchen() {
    cancelTweens('flight');
    for (const s of Object.values(this.stations)) s.reset();
    this.bag.reset();
    this.step = null;
    this.order = null;
    this.buffer = [];
    this.missPause = false;
    this.clockRunning = false;
  }

  /** Await something in the level script; stops the script if the party was lost meanwhile. */
  async guard(promise) {
    const id = this.runId;
    const value = await promise;
    if (id !== this.runId) throw ABORT;
    return value;
  }

  async runLevel() {
    const level = this.level;
    const orders = Array.from({ length: level.orders }, (_, k) => makeOrder(level, k + 1, this.levelIndex));
    this.totalSteps = orders.reduce((n, o) => n + o.items.length + 1, 0);
    this.doneSteps = 0;
    this.timeLimit = this.timeBudget(orders);
    this.timeLeft = this.timeLimit;
    this.hud.setClock(this.timeLeft);
    this.updateProgress();
    this.party.startQueue(orders);
    this.rig.focus(0.25);
    this.rig.lookUp(true);
    this.hud.showBanner(level, this.levelIndex);
    await this.guard(wait(2.0));
    this.clockRunning = true;
    for (const order of orders) await this.runOrder(order);
    this.endLevel();
  }

  /** Seconds on the party clock, rounded up to a friendly multiple of 5. */
  timeBudget(orders) {
    const pace = this.level.pace;
    const secs = orders.reduce((t, o) => {
      const steps = o.items.length + 1;
      return t + ORDER_TIME + steps * (STEP_TIME + 3 * pace);
    }, 0);
    return Math.ceil(secs / 5) * 5;
  }

  /** The bar at the top shows how much work is LEFT at this party. */
  updateProgress() {
    const partial = this.step ? Math.min(this.step.idx, 3) / 3 : 0;
    this.hud.setProgress(1 - (this.doneSteps + partial) / this.totalSteps);
  }

  async runOrder(order) {
    const g = (p) => this.guard(p);
    // The next guest steps up to the window and shouts their order.
    this.rig.focus(this.bag.x);
    this.rig.lookUp(true);
    await g(this.party.frontReady());
    const guest = this.party.front;
    this.hud.showTicket(order, guest.name);
    guest.shout();
    await g(wait(0.85));
    this.rig.lookUp(false);
    this.order = order;
    this.patienceLeft = order.patience;
    this.rig.focus(this.stations[order.items[0]].x);
    await g(wait(0.3));

    const flights = [];
    for (let i = 0; i < order.items.length; i++) {
      const type = order.items[i];
      const station = this.stations[type];
      this.hud.setActiveItem(i);
      await g(this.runStep(type, station));
      this.hud.markItemDone(i);
      flights.push(this.bag.receive(station.detachItem()));
    }

    this.hud.setActiveItem(order.items.length);
    this.rig.focus(this.bag.x);
    await g(Promise.all(flights));
    await g(this.runStep('bag', this.bag));
    this.hud.markItemDone(order.items.length);

    const happy = this.patienceLeft / order.patience > 0.3;
    this.order = null;

    // Hand the bag out the window.
    this.rig.lookUp(true);
    await g(this.bag.handOffTo(guest));
    this.hud.flash(happy ? 'ORDER UP!' : 'FINALLY...', happy ? 'good' : 'meh');
    this.audio.ching();
    this.audio.cheer(happy);
    this.party.serveFront(happy);
    this.stats.orders++;
    if (happy) this.stats.happy++;
    this.save.totalOrders++;
    saveGame(this.save); // keep lifetime stats even if the tab closes mid-party
    this.hud.hideTicket();
    await g(wait(0.5));
  }

  /** Resolves once all 3 presses of this step are done. */
  runStep(type, station) {
    return new Promise((resolve) => {
      const recipe = RECIPES[type];
      this.rig.focus(station.x);
      const s = { type, recipe, station, idx: 0, perfect: true, accepting: false, timeLeft: 0, resolve };
      this.step = s;
      this.hud.showPrompt(s);
      wait(ARM_DELAY).then(() => {
        if (this.step === s) this.arm();
      });
    });
  }

  arm() {
    const s = this.step;
    s.accepting = true;
    s.timeLeft = this.order.window;
    this.hud.updatePrompt(s);
    this.flushBuffer();
  }

  onKey(rawCode) {
    if (this.state !== 'playing') return;
    const code = normalizeKey(rawCode);
    if (!QTE_KEYS.includes(code)) return;
    this.handleKey(code, performance.now());
  }

  handleKey(code, at) {
    const s = this.step;
    if (s && s.accepting) {
      if (code === s.recipe.keys[s.idx]) this.hit();
      else this.miss();
    } else if (this.order && !this.missPause && this.buffer.length < BUFFER_MAX) {
      // Pressed while the next step was still sliding in: remember it instead of dropping it,
      // so fast players never lose a press between steps.
      this.buffer.push({ code, at });
    }
  }

  /** Replay presses that came in early, as soon as the step starts taking keys. */
  flushBuffer() {
    const now = performance.now();
    const early = this.buffer.filter((b) => now - b.at < BUFFER_AGE * 1000);
    this.buffer = [];
    for (const b of early) this.handleKey(b.code, b.at);
  }

  hit() {
    const s = this.step;
    const i = s.idx;
    const st = this.stats;
    st.combo++;
    st.hits++;
    st.bestCombo = Math.max(st.bestCombo, st.combo);
    this.save.totalHuss++;

    this.audio.huss(i, 1 + Math.min(st.combo, 24) * 0.005);
    s.station.advance(i);
    this.hud.setCombo(st.combo);
    this.hud.popup('huss!');

    s.idx++;
    this.updateProgress();
    if (s.idx >= 3) {
      s.accepting = false;
      this.hud.updatePrompt(s, 'hit');
      this.completeStep(s);
    } else {
      s.timeLeft = this.order.window;
      this.hud.updatePrompt(s, 'hit');
    }
  }

  async completeStep(s) {
    this.stats.steps++;
    if (s.perfect) {
      this.stats.perfectSteps++;
      this.hud.flash('PERFECT!', 'perfect');
      this.audio.perfect();
    }
    await wait(0.05);
    await s.station.complete();
    if (this.step !== s) return; // the party was lost meanwhile
    this.hud.hidePrompt();
    this.step = null;
    this.doneSteps++;
    // Last bag sealed: the clock stops while the final guest gets their food.
    if (this.doneSteps >= this.totalSteps) this.clockRunning = false;
    this.updateProgress();
    s.resolve();
  }

  async miss() {
    const s = this.step;
    s.accepting = false;
    s.perfect = false;
    this.missPause = true;
    this.buffer = [];
    this.stats.combo = 0;
    this.stats.misses++;
    this.hud.setCombo(0);
    this.audio.buzz();
    this.rig.kick(1);
    this.hud.updatePrompt(s, 'miss');
    s.station.rewind();
    this.loseLife();
    if (this.state !== 'playing') return;
    await wait(MISS_PAUSE);
    if (this.step !== s || this.state !== 'playing') return;
    this.missPause = false;
    s.idx = 0;
    this.updateProgress();
    s.accepting = true;
    s.timeLeft = this.order.window;
    this.hud.updatePrompt(s);
  }

  loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this.hud.setLives(this.lives, this.level.lives, true);
    if (this.lives === 0) this.fail('hearts');
  }

  update(dt) {
    if (this.state !== 'playing') return;
    if (this.clockRunning) {
      const before = this.timeLeft;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.hud.setClock(this.timeLeft);
      // Last 10 seconds: a tick every second, more urgent for the last 5.
      if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== Math.ceil(before)) this.audio.tick(this.timeLeft <= 5);
      if (this.timeLeft <= 0) return this.fail('time');
    }
    if (this.order) {
      this.patienceLeft = Math.max(0, this.patienceLeft - dt);
      const frac = this.patienceLeft / this.order.patience;
      this.hud.setPatience(frac);
      this.party.setFrontMood(frac);
    }
    const s = this.step;
    if (s && s.accepting) {
      s.timeLeft -= dt;
      this.hud.setTimer(Math.max(0, s.timeLeft / this.order.window));
      if (s.timeLeft <= 0) this.miss();
    }
  }

  /** Out of hearts or out of time: the party is lost, and you can try it again. */
  fail(reason) {
    if (this.state !== 'playing') return;
    this.state = 'failed';
    this.runId++; // stops the level script at its next step
    this.clockRunning = false;
    if (this.step) this.step.accepting = false;
    this.step = null;
    this.order = null;
    this.buffer = [];
    this.audio.stopMusic();
    this.audio.fail();
    this.rig.kick(1.6);
    this.party.angerQueue();
    this.hud.hidePrompt();
    this.hud.hideTicket();
    this.hud.flash(reason === 'time' ? "TIME'S UP!" : 'OUT OF HEARTS!', 'bad');
    this.save.shiftsPlayed++;
    saveGame(this.save);
    const level = this.level;
    const stats = this.stats;
    wait(1.6).then(() => {
      if (this.state !== 'failed') return; // already retrying
      this.rig.focus(0.25);
      this.rig.lookUp(true);
      this.hud.showFailed({ level, stats, reason, ordersTotal: level.orders });
    });
  }

  /** 3 stars: every guest happy and 90%+ accuracy. 2 stars: most guests happy. 1 star: you made it. */
  starsFor(st) {
    const total = st.hits + st.misses;
    const acc = total ? st.hits / total : 1;
    const happyFrac = st.happy / Math.max(1, st.orders);
    if (happyFrac === 1 && acc >= 0.9) return 3;
    if (happyFrac >= 0.7) return 2;
    return 1;
  }

  endLevel() {
    this.state = 'summary';
    this.clockRunning = false;
    const sv = this.save;
    const level = this.level;
    const stars = this.starsFor(this.stats);
    const prev = sv.levels[level.id]?.stars || 0;
    sv.levels[level.id] = { stars: Math.max(prev, stars) };
    const unlockedNew = this.levelIndex + 1 < LEVELS.length && sv.unlocked <= this.levelIndex;
    sv.unlocked = Math.max(sv.unlocked, Math.min(this.levelIndex + 1, LEVELS.length - 1));
    sv.bestCombo = Math.max(sv.bestCombo, this.stats.bestCombo);
    sv.shiftsPlayed++;
    saveGame(sv);
    this.rig.focus(0.25);
    this.rig.lookUp(true);
    this.hud.showSummary({
      level,
      stats: this.stats,
      stars,
      hearts: this.lives,
      timeLeft: this.timeLeft,
      next: LEVELS[this.levelIndex + 1],
      unlockedNew,
      isLast: this.levelIndex === LEVELS.length - 1,
    });
  }
}
