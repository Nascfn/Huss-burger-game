// Game flow: shift -> orders -> steps -> 3 quick-time key presses per step.
import { RECIPES, QTE_KEYS, SHIFT_LENGTH, makeOrder, normalizeKey } from './orders.js';
// Each order: a party guest steps up to the window, you pack it, then hand the bag out to them.
import { wait } from './tween.js';
import { saveGame } from './save.js';

const MISS_PAUSE = 0.7; // seconds before you can retry a failed step

export class Game {
  constructor({ audio, rig, stations, bag, party, hud, save }) {
    Object.assign(this, { audio, rig, stations, bag, party, hud, save });
    this.state = 'title';
    this.step = null;
    this.order = null;
  }

  get multiplier() {
    return 1 + Math.min(3, Math.floor(this.stats.combo / 6));
  }

  startShift() {
    this.audio.resume();
    this.audio.startMusic();
    this.stats = { score: 0, combo: 0, bestCombo: 0, hits: 0, misses: 0, orders: 0, perfectSteps: 0, steps: 0 };
    this.state = 'playing';
    this.hud.showPlaying();
    this.hud.setScore(this.stats, this.multiplier);
    this.runShift();
  }

  async runShift() {
    const orders = Array.from({ length: SHIFT_LENGTH }, (_, i) => makeOrder(i + 1));
    this.party.startQueue(orders);
    for (const order of orders) await this.runOrder(order);
    this.endShift();
  }

  async runOrder(order) {
    // The next guest steps up to the window and shouts their order.
    this.rig.focus(this.bag.x);
    this.rig.lookUp(true);
    await this.party.frontReady();
    const guest = this.party.front;
    this.hud.showTicket(order, guest.name, this.party.queue.length);
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

    const frac = Math.max(0, this.patienceLeft / order.patience);
    const bonus = Math.round(50 + 150 * frac);
    this.order = null;

    // Hand the bag out the window.
    this.rig.lookUp(true);
    await this.bag.handOffTo(guest);
    const happy = frac > 0.3;
    this.addScore(bonus);
    this.hud.flash(`${happy ? 'ORDER UP!' : 'FINALLY...'} +${bonus}`, happy ? 'good' : 'meh');
    this.audio.ching();
    this.audio.cheer(happy);
    this.party.serveFront(happy);
    this.stats.orders++;
    this.save.totalOrders++;
    saveGame(this.save); // keep lifetime stats even if the tab closes mid-shift
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
    this.addScore(10 * this.multiplier);
    this.hud.popup(`+${10 * this.multiplier}`);

    s.idx++;
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
      this.addScore(25);
      this.hud.flash('PERFECT!', 'perfect');
      this.audio.perfect();
    }
    await wait(0.22);
    await s.station.complete();
    this.hud.hidePrompt();
    this.step = null;
    s.resolve();
  }

  async miss() {
    const s = this.step;
    s.accepting = false;
    s.perfect = false;
    this.stats.combo = 0;
    this.stats.misses++;
    this.hud.setScore(this.stats, this.multiplier);
    this.audio.buzz();
    this.rig.kick(1);
    this.hud.updatePrompt(s, 'miss');
    s.station.rewind();
    await wait(MISS_PAUSE);
    s.idx = 0;
    s.accepting = true;
    s.timeLeft = this.order.window;
    this.hud.updatePrompt(s);
  }

  addScore(n) {
    this.stats.score += n;
    this.hud.setScore(this.stats, this.multiplier);
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

  endShift() {
    this.state = 'summary';
    const sv = this.save;
    const isNewBest = this.stats.score > sv.highScore;
    sv.highScore = Math.max(sv.highScore, this.stats.score);
    sv.bestCombo = Math.max(sv.bestCombo, this.stats.bestCombo);
    sv.shiftsPlayed++;
    saveGame(sv);
    this.rig.focus(0.25);
    this.rig.lookUp(true);
    this.hud.showSummary(this.stats, sv, isNewBest);
  }
}
