// Game flow: party (level) -> orders -> steps -> 3 quick-time key presses per step.
// Each order: a guest steps up to the window, you pack it, then hand the bag out to them.
import { RECIPES, QTE_KEYS, makeOrder, normalizeKey } from './orders.js';
import { LEVELS } from './levels.js';
import { wait } from './tween.js';
import { saveGame } from './save.js';

const MISS_PAUSE = 0.7; // seconds before you can retry a failed step

export class Game {
  constructor({ audio, rig, stations, bag, party, hud, save }) {
    Object.assign(this, { audio, rig, stations, bag, party, hud, save });
    this.state = 'title';
    this.step = null;
    this.order = null;
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

  /** Enter key / "Next party" button: play the next party you haven't beaten. */
  startNext() {
    if (this.state === 'playing') return;
    let i = this.levelIndex;
    if (this.state === 'summary') i = Math.min(this.levelIndex + 1, this.save.unlocked, LEVELS.length - 1);
    else i = Math.min(this.save.unlocked, LEVELS.length - 1);
    this.startLevel(i);
  }

  startLevel(i) {
    if (this.state === 'playing' || i > this.save.unlocked) return;
    this.levelIndex = i;
    const level = this.level;
    this.audio.resume();
    if (this.party.levelId !== level.id) this.party.setLevel(level);
    this.audio.startMusic(level);
    this.stats = { combo: 0, bestCombo: 0, hits: 0, misses: 0, orders: 0, happy: 0, perfectSteps: 0, steps: 0 };
    this.state = 'playing';
    this.hud.showPlaying(level);
    this.hud.setCombo(0);
    this.runLevel();
  }

  async runLevel() {
    const level = this.level;
    const orders = Array.from({ length: level.orders }, (_, k) => makeOrder(level, k + 1, this.levelIndex));
    this.totalSteps = orders.reduce((n, o) => n + o.items.length + 1, 0);
    this.doneSteps = 0;
    this.updateProgress();
    this.party.startQueue(orders);
    this.rig.focus(0.25);
    this.rig.lookUp(true);
    this.hud.showBanner(level, this.levelIndex);
    await wait(2.0);
    for (const order of orders) await this.runOrder(order);
    this.endLevel();
  }

  /** The bar at the top shows how much work is LEFT at this party. */
  updateProgress() {
    const partial = this.step ? this.step.idx / 3 : 0;
    this.hud.setProgress(1 - (this.doneSteps + partial) / this.totalSteps);
  }

  async runOrder(order) {
    // The next guest steps up to the window and shouts their order.
    this.rig.focus(this.bag.x);
    this.rig.lookUp(true);
    await this.party.frontReady();
    const guest = this.party.front;
    this.hud.showTicket(order, guest.name);
    guest.shout();
    await wait(1.0);
    this.rig.lookUp(false);
    this.order = order;
    this.patienceLeft = order.patience;
    this.rig.focus(this.stations[order.items[0]].x);
    await wait(0.35);

    const flights = [];
    for (let i = 0; i < order.items.length; i++) {
      const type = order.items[i];
      const station = this.stations[type];
      this.hud.setActiveItem(i);
      await this.runStep(type, station);
      this.hud.markItemDone(i);
      flights.push(this.bag.receive(station.detachItem()));
    }

    this.hud.setActiveItem(order.items.length);
    this.rig.focus(this.bag.x);
    await Promise.all(flights);
    await this.runStep('bag', this.bag);
    this.hud.markItemDone(order.items.length);

    const happy = this.patienceLeft / order.patience > 0.3;
    this.order = null;

    // Hand the bag out the window.
    this.rig.lookUp(true);
    await this.bag.handOffTo(guest);
    this.hud.flash(happy ? 'ORDER UP!' : 'FINALLY...', happy ? 'good' : 'meh');
    this.audio.ching();
    this.audio.cheer(happy);
    this.party.serveFront(happy);
    this.stats.orders++;
    if (happy) this.stats.happy++;
    this.save.totalOrders++;
    saveGame(this.save); // keep lifetime stats even if the tab closes mid-party
    this.hud.hideTicket();
    await wait(0.7);
  }

  /** Resolves once all 3 presses of this step are done. */
  runStep(type, station) {
    return new Promise((resolve) => {
      const recipe = RECIPES[type];
      this.rig.focus(station.x);
      this.step = { type, recipe, station, idx: 0, perfect: true, accepting: false, timeLeft: 0, resolve };
      this.hud.showPrompt(this.step);
      wait(0.4).then(() => this.arm());
    });
  }

  arm() {
    const s = this.step;
    s.accepting = true;
    s.timeLeft = this.order.window;
    this.hud.updatePrompt(s);
  }

  onKey(rawCode) {
    if (this.state !== 'playing') return;
    const code = normalizeKey(rawCode);
    const s = this.step;
    if (!s || !s.accepting || !QTE_KEYS.includes(code)) return;
    if (code === s.recipe.keys[s.idx]) this.hit();
    else this.miss();
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
    await wait(0.22);
    await s.station.complete();
    this.hud.hidePrompt();
    this.step = null;
    this.doneSteps++;
    this.updateProgress();
    s.resolve();
  }

  async miss() {
    const s = this.step;
    s.accepting = false;
    s.perfect = false;
    this.stats.combo = 0;
    this.stats.misses++;
    this.hud.setCombo(0);
    this.audio.buzz();
    this.rig.kick(1);
    this.hud.updatePrompt(s, 'miss');
    s.station.rewind();
    await wait(MISS_PAUSE);
    s.idx = 0;
    this.updateProgress();
    s.accepting = true;
    s.timeLeft = this.order.window;
    this.hud.updatePrompt(s);
  }

  update(dt) {
    if (this.state !== 'playing') return;
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
      next: LEVELS[this.levelIndex + 1],
      unlockedNew,
      isLast: this.levelIndex === LEVELS.length - 1,
    });
  }
}
